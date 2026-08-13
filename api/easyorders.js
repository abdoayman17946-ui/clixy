const API_BASE = "https://api.easy-orders.net/api/v1/external-apps";

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

async function easyFetch(path, key, options = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Api-Key": key,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function getOrderByShortId(shortId, key) {
  const r = await easyFetch(`/orders/short/${encodeURIComponent(shortId)}`, key);
  const data = await r.json();
  return { r, data };
}

async function getOrderById(orderId, key) {
  const r = await easyFetch(`/orders/${encodeURIComponent(orderId)}`, key);
  const data = await r.json();
  return { r, data };
}

function extractOrderId(payload) {
  return (
    payload?.id ||
    payload?.order_id ||
    payload?.data?.id ||
    payload?.data?.order_id ||
    payload?.order?.id ||
    payload?.order?.order_id ||
    null
  );
}

function getHost(req) {
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const host = forwardedHost || req.headers?.host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return json(res, 500, { ok: false, error: "EASYORDERS_API_KEY is not configured" });

  // GET keeps the existing manual API test working.
  if (req.method === "GET") {
    const id = req.query?.order;
    if (!id) return json(res, 400, { ok: false, error: "Missing order. Example: /api/easyorders?order=17" });
    try {
      const result = /^\d+$/.test(String(id))
        ? await getOrderByShortId(id, key)
        : await getOrderById(id, key);
      return json(res, result.r.status, {
        ok: result.r.ok,
        source: "EasyOrders",
        order: String(id),
        data: result.data,
      });
    } catch (e) {
      return json(res, 502, { ok: false, error: "Could not connect to EasyOrders", details: e?.message });
    }
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  // Optional webhook security. Leave the env variable unset unless you also
  // configure the exact same secret in EasyOrders.
  const webhookSecret = process.env.EASYORDERS_WEBHOOK_SECRET;
  const incomingSecret = req.headers?.secret || req.headers?.["x-easyorders-secret"] || req.headers?.["x-webhook-secret"];
  if (webhookSecret && incomingSecret !== webhookSecret) {
    return json(res, 401, { ok: false, error: "Invalid webhook secret" });
  }

  const payload = req.body || {};
  console.log("CLIXY_EASYORDERS_WEBHOOK", JSON.stringify(payload));

  const orderId = extractOrderId(payload);
  if (!orderId) {
    return json(res, 400, {
      ok: false,
      received: true,
      error: "Webhook received but no order id was found",
      example: "EasyOrders should send an order id in the webhook body",
    });
  }

  try {
    // Fetch the complete order. This also confirms the API key has permission.
    const orderResult = await getOrderById(orderId, key);
    if (!orderResult.r.ok) {
      return json(res, 502, {
        ok: false,
        received: true,
        error: "Webhook received but EasyOrders order could not be fetched",
        order_id: orderId,
        easyorders_status: orderResult.r.status,
        easyorders: orderResult.data,
      });
    }

    const order = orderResult.data?.data || orderResult.data;
    let shortId = order?.short_id ?? payload?.short_id ?? payload?.order?.short_id ?? payload?.data?.short_id ?? null;

    // Some webhook payloads may contain only the short id. If so, fetch it here.
    let fullOrder = order;
    if (shortId === null || shortId === undefined) {
      const fromPayload = payload?.short_id ?? payload?.order?.short_id ?? payload?.data?.short_id;
      if (fromPayload !== undefined && fromPayload !== null) {
        const byShort = await getOrderByShortId(fromPayload, key);
        if (byShort.r.ok) {
          fullOrder = byShort.data?.data || byShort.data;
          shortId = fullOrder?.short_id ?? fromPayload;
        }
      }
    }

    if (shortId === null || shortId === undefined) {
      return json(res, 422, {
        ok: false,
        received: true,
        error: "Order was fetched but short_id is missing",
        order_id: orderId,
      });
    }

    const baseUrl = getHost(req);
    const labelUrl = `${baseUrl}/api/label?order=${encodeURIComponent(shortId)}`;

    // IMPORTANT: actually call the label endpoint. The previous version only
    // added the URL as a note, so no label was generated automatically.
    const labelResponse = await fetch(labelUrl, {
      method: "GET",
      headers: { "Accept": "text/html,application/json" },
      cache: "no-store",
    });
    const labelText = await labelResponse.text();

    if (!labelResponse.ok) {
      return json(res, 502, {
        ok: false,
        received: true,
        error: "Order received but Shipping Label generation failed",
        order_id: fullOrder?.id || orderId,
        short_id: shortId,
        label_url: labelUrl,
        label_status: labelResponse.status,
        label_response: labelText.slice(0, 1000),
      });
    }

    // Add the label URL to the EasyOrders order as a note.
    const notePayload = {
      order_id: fullOrder?.id || orderId,
      note: `CLIXY Shipping Label جاهز: ${labelUrl}`,
      store_id: fullOrder?.store_id || payload?.store_id || payload?.order?.store_id || payload?.data?.store_id,
      type: "private",
    };

    let noteResult = null;
    if (notePayload.store_id) {
      const noteResponse = await easyFetch("/order-notes", key, {
        method: "POST",
        body: JSON.stringify(notePayload),
      });
      let noteData = null;
      try { noteData = await noteResponse.json(); } catch (_) {}
      noteResult = { ok: noteResponse.ok, status: noteResponse.status, data: noteData };
    }

    return json(res, 201, {
      ok: true,
      received: true,
      service: "Clixy EasyOrders Webhook",
      order_id: fullOrder?.id || orderId,
      short_id: shortId,
      label_generated: true,
      label_url: labelUrl,
      note: noteResult,
    });
  } catch (e) {
    console.error("CLIXY_WEBHOOK_ERROR", e);
    return json(res, 500, {
      ok: false,
      received: true,
      error: "Webhook processing failed",
      details: e?.message,
    });
  }
}
