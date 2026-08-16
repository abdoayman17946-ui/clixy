import { put } from "@vercel/blob";

const API_BASE = "https://api.easy-orders.net/api/v1/external-apps";
const APP_URL = "https://clixy-theta.vercel.app";

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

async function getOrder(id, key) {
  const path = /^\d+$/.test(String(id))
    ? `/orders/short/${encodeURIComponent(id)}`
    : `/orders/${encodeURIComponent(id)}`;
  const r = await easyFetch(path, key);
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

async function saveLabel(shortId) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${APP_URL}/api/label?order=${encodeURIComponent(shortId)}"><script>location.replace(${JSON.stringify(`${APP_URL}/api/label?order=${shortId}`)})</script><body>فتح البوليصة...</body></html>`;
  return put(`shipping-labels/order-${shortId}.html`, html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return json(res, 500, { ok: false, error: "EASYORDERS_API_KEY is not configured" });

  if (req.method === "GET") {
    const ids = String(req.query?.orders || req.query?.order || "")
      .split(",").map(x => x.trim()).filter(Boolean).slice(0, 50);

    if (!ids.length) return json(res, 400, { ok: false, error: "Missing order. Example: /api/easyorders?order=17" });

    const results = [];
    for (const id of ids) {
      try {
        const result = await getOrder(id, key);
        results.push({
          ok: result.r.ok,
          order: String(id),
          status: result.r.status,
          data: result.data?.data || result.data,
        });
      } catch (e) {
        results.push({ ok: false, order: String(id), status: 502, error: e?.message || "Could not connect to EasyOrders" });
      }
    }
    if (ids.length === 1) return json(res, results[0].status || 200, results[0]);
    return json(res, 200, { ok: results.every(x => x.ok), results });
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const configuredSecret = process.env.EASYORDERS_WEBHOOK_SECRET;
  const incomingSecret = req.headers?.secret || req.headers?.["x-easyorders-secret"] || req.headers?.["x-webhook-secret"];
  if (configuredSecret && incomingSecret !== configuredSecret) {
    return json(res, 401, { ok: false, received: true, error: "Invalid webhook secret" });
  }

  const payload = parseBody(req);
  console.log("CLIXY_WEBHOOK_RECEIVED", JSON.stringify({
    id: payload?.id, short_id: payload?.short_id, event_type: payload?.event_type
  }));

  const order = payload?.data?.id ? (payload.data.data || payload.data) : payload;
  const orderId = order?.id || payload?.order_id;
  const shortId = order?.short_id ?? payload?.short_id ?? payload?.data?.short_id ?? payload?.order?.short_id;
  if (!orderId && !shortId) {
    return json(res, 400, { ok: false, received: true, error: "Webhook received but no order id/short_id was found" });
  }

  try {
    let fullOrder = order;
    let resolvedShortId = shortId;

    if (resolvedShortId === null || resolvedShortId === undefined) {
      const r = await easyFetch(`/orders/${encodeURIComponent(orderId)}`, key);
      const d = await r.json();
      if (!r.ok) {
        return json(res, 502, {
          ok: false, received: true, error: "Webhook received but order lookup failed",
          order_id: orderId, easyorders_status: r.status, easyorders: d
        });
      }
      fullOrder = d?.data || d;
      resolvedShortId = fullOrder?.short_id;
    }

    if (resolvedShortId === null || resolvedShortId === undefined) {
      return json(res, 422, {
        ok: false, received: true, error: "Order received but short_id is missing", order_id: orderId
      });
    }

    let storedUrl = null;
    let storage = "not_configured";
    try {
      const blob = await saveLabel(resolvedShortId);
      storedUrl = blob.url;
      storage = "vercel_blob";
      console.log("CLIXY_LABEL_STORED", JSON.stringify({ short_id: resolvedShortId, url: storedUrl }));
    } catch (blobError) {
      console.error("CLIXY_BLOB_SAVE_FAILED", blobError);
      storage = "blob_error";
    }

    const dynamicLabelUrl = `${APP_URL}/api/label?order=${encodeURIComponent(resolvedShortId)}`;
    return json(res, 201, {
      ok: true,
      received: true,
      service: "Clixy EasyOrders Webhook",
      order_id: fullOrder?.id || orderId,
      short_id: resolvedShortId,
      label_generated: true,
      label_saved: Boolean(storedUrl),
      storage,
      label_url: storedUrl || dynamicLabelUrl,
      dynamic_label_url: dynamicLabelUrl,
      message: storedUrl
        ? "Shipping Label generated and saved automatically"
        : "Label generated, but Blob storage is not configured"
    });
  } catch (e) {
    console.error("CLIXY_WEBHOOK_ERROR", e);
    return json(res, 500, { ok: false, received: true, error: "Webhook processing failed", details: e?.message });
  }
}
