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
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
}

async function getOrderByShortId(shortId, key) {
  const r = await easyFetch(`/orders/short/${encodeURIComponent(shortId)}`, key);
  const data = await r.json();
  return { r, data };
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) {}
  }
  return {};
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
  if (!key) {
    return json(res, 500, { ok: false, error: "EASYORDERS_API_KEY is not configured" });
  }

  // Manual test: /api/easyorders?order=22
  if (req.method === "GET") {
    const id = req.query?.order;
    if (!id) return json(res, 400, {
      ok: false,
      error: "Missing order. Example: /api/easyorders?order=17"
    });

    try {
      const result = /^\d+$/.test(String(id))
        ? await getOrderByShortId(id, key)
        : await (async () => {
            const r = await easyFetch(`/orders/${encodeURIComponent(id)}`, key);
            const data = await r.json();
            return { r, data };
          })();

      return json(res, result.r.status, {
        ok: result.r.ok,
        source: "EasyOrders",
        order: String(id),
        data: result.data,
      });
    } catch (e) {
      return json(res, 502, {
        ok: false,
        error: "Could not connect to EasyOrders",
        details: e?.message
      });
    }
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  // EasyOrders sends the webhook secret in the `secret` header.
  // Security is optional: only checked if EASYORDERS_WEBHOOK_SECRET exists.
  const configuredSecret = process.env.EASYORDERS_WEBHOOK_SECRET;
  const incomingSecret =
    req.headers?.secret ||
    req.headers?.["x-easyorders-secret"] ||
    req.headers?.["x-webhook-secret"];

  if (configuredSecret && incomingSecret !== configuredSecret) {
    return json(res, 401, {
      ok: false,
      received: true,
      error: "Invalid webhook secret"
    });
  }

  const payload = parseBody(req);
  console.log("CLIXY_WEBHOOK_RECEIVED", JSON.stringify({
    id: payload?.id,
    short_id: payload?.short_id,
    event_type: payload?.event_type
  }));

  /*
   * IMPORTANT:
   * EasyOrders' Order Created webhook already contains the complete order.
   * We therefore use the webhook payload directly instead of first calling
   * GET /orders/:uuid. This avoids the permission-denied problem seen before.
   */
  const order = payload?.data?.id ? (payload.data.data || payload.data) : payload;
  const orderId = order?.id || payload?.order_id;
  const shortId =
    order?.short_id ??
    payload?.short_id ??
    payload?.data?.short_id ??
    payload?.order?.short_id;

  if (!orderId && !shortId) {
    return json(res, 400, {
      ok: false,
      received: true,
      error: "Webhook received but no order id/short_id was found"
    });
  }

  try {
    // If EasyOrders supplied short_id (as in your real webhook), use it.
    // If not, try to resolve the UUID to a full order and obtain short_id.
    let fullOrder = order;
    let resolvedShortId = shortId;

    if (resolvedShortId === null || resolvedShortId === undefined) {
      const r = await easyFetch(`/orders/${encodeURIComponent(orderId)}`, key);
      const d = await r.json();

      if (!r.ok) {
        return json(res, 502, {
          ok: false,
          received: true,
          error: "Webhook received but order lookup failed",
          order_id: orderId,
          easyorders_status: r.status,
          easyorders: d
        });
      }

      fullOrder = d?.data || d;
      resolvedShortId = fullOrder?.short_id;
    }

    if (resolvedShortId === null || resolvedShortId === undefined) {
      return json(res, 422, {
        ok: false,
        received: true,
        error: "Order received but short_id is missing",
        order_id: orderId
      });
    }

    const baseUrl = getHost(req);
    const labelUrl =
      `${baseUrl}/api/label?order=${encodeURIComponent(resolvedShortId)}`;

    /*
     * This is the automatic step:
     * call the label endpoint from the server immediately after the webhook
     * arrives. The label endpoint fetches the order and renders the label.
     */
    const labelResponse = await fetch(labelUrl, {
      method: "GET",
      headers: { "Accept": "text/html,application/json" },
      cache: "no-store"
    });

    const labelText = await labelResponse.text();

    if (!labelResponse.ok) {
      console.error("CLIXY_LABEL_FAILED", {
        short_id: resolvedShortId,
        status: labelResponse.status,
        response: labelText.slice(0, 1000)
      });

      return json(res, 502, {
        ok: false,
        received: true,
        error: "Order received but Shipping Label generation failed",
        order_id: fullOrder?.id || orderId,
        short_id: resolvedShortId,
        label_url: labelUrl,
        label_status: labelResponse.status,
        label_response: labelText.slice(0, 1000)
      });
    }

    /*
     * No database is required. The label is generated on demand and the
     * stable URL is always available. We return it so EasyOrders/logs can
     * confirm exactly what was generated.
     */
    return json(res, 201, {
      ok: true,
      received: true,
      service: "Clixy EasyOrders Webhook",
      order_id: fullOrder?.id || orderId,
      short_id: resolvedShortId,
      label_generated: true,
      label_status: labelResponse.status,
      label_url: labelUrl
    });
  } catch (e) {
    console.error("CLIXY_WEBHOOK_ERROR", e);
    return json(res, 500, {
      ok: false,
      received: true,
      error: "Webhook processing failed",
      details: e?.message
    });
  }
}
