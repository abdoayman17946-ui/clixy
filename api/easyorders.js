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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return json(res, 500, { ok: false, error: "EASYORDERS_API_KEY is not configured" });

  // GET: manual test /api/easyorders?order=17 or UUID
  if (req.method === "GET") {
    const id = req.query?.order;
    if (!id) return json(res, 400, { ok: false, error: "Missing order. Example: /api/easyorders?order=17" });

    try {
      const isShort = /^\d+$/.test(String(id));
      const result = isShort
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

  // POST: EasyOrders webhook. On order-created, fetch the complete order,
  // build the label URL and add it automatically to the EasyOrders order notes.
  if (req.method === "POST") {
    const webhookSecret = process.env.EASYORDERS_WEBHOOK_SECRET;
    const incomingSecret = req.headers?.secret || req.headers?.["x-easyorders-secret"];

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
      });
    }

    try {
      // Get the complete order using the UUID supplied by the webhook.
      const orderResult = await getOrderById(orderId, key);
      if (!orderResult.r.ok) {
        return json(res, 502, {
          ok: false,
          received: true,
          error: "Webhook received but EasyOrders order could not be fetched",
          order_id: orderId,
          easyorders: orderResult.data,
        });
      }

      const order = orderResult.data?.data || orderResult.data;
      const shortId = order?.short_id || payload?.short_id || payload?.order?.short_id || null;
      const baseUrl = `https://${req.headers.host}`;
      const labelUrl = `${baseUrl}/api/label?order=${encodeURIComponent(shortId || orderId)}`;

      // Add the generated label URL to the order itself so it is available
      // from EasyOrders without needing to manually type the order number.
      const notePayload = {
        order_id: order?.id || orderId,
        note: `CLIXY Shipping Label جاهز: ${labelUrl}`,
        store_id: order?.store_id || payload?.store_id || payload?.order?.store_id,
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

      return json(res, 200, {
        ok: true,
        received: true,
        service: "Clixy EasyOrders Webhook",
        order_id: order?.id || orderId,
        short_id: shortId,
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

  return json(res, 405, { ok: false, error: "Method not allowed" });
}
