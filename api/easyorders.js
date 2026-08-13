import { put } from "@vercel/blob";
import QRCode from "qrcode";

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

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function buildLabelHtml(o, id) {
  // Save the same interactive label page used for manual viewing.
  // It fetches the order again when opened, so edits remain local to the browser.
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${APP_URL}/api/label?order=${encodeURIComponent(id)}"><script>location.replace(${JSON.stringify(`${APP_URL}/api/label?order=${id}`)})</script><body>فتح البوليصة...</body></html>`;
}

async function saveLabel(html, shortId) {
  // Requires a Vercel Blob store connected to this project.
  // With OIDC, Vercel supplies the credentials automatically for connected stores.
  const blob = await put(`shipping-labels/order-${shortId}.html`, html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return json(res, 500, { ok: false, error: "EASYORDERS_API_KEY is not configured" });

  if (req.method === "GET") {
    const id = req.query?.order;
    if (!id) return json(res, 400, { ok: false, error: "Missing order. Example: /api/easyorders?order=17" });
    try {
      const result = /^\d+$/.test(String(id))
        ? await getOrderByShortId(id, key)
        : await (async () => { const r = await easyFetch(`/orders/${encodeURIComponent(id)}`, key); const data = await r.json(); return { r, data }; })();
      return json(res, result.r.status, { ok: result.r.ok, source: "EasyOrders", order: String(id), data: result.data });
    } catch (e) {
      return json(res, 502, { ok: false, error: "Could not connect to EasyOrders", details: e?.message });
    }
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const configuredSecret = process.env.EASYORDERS_WEBHOOK_SECRET;
  const incomingSecret = req.headers?.secret || req.headers?.["x-easyorders-secret"] || req.headers?.["x-webhook-secret"];
  if (configuredSecret && incomingSecret !== configuredSecret) return json(res, 401, { ok: false, received: true, error: "Invalid webhook secret" });

  const payload = parseBody(req);
  console.log("CLIXY_WEBHOOK_RECEIVED", JSON.stringify({ id: payload?.id, short_id: payload?.short_id, event_type: payload?.event_type }));

  const order = payload?.data?.id ? (payload.data.data || payload.data) : payload;
  const orderId = order?.id || payload?.order_id;
  const shortId = order?.short_id ?? payload?.short_id ?? payload?.data?.short_id ?? payload?.order?.short_id;
  if (!orderId && !shortId) return json(res, 400, { ok: false, received: true, error: "Webhook received but no order id/short_id was found" });

  try {
    let fullOrder = order;
    let resolvedShortId = shortId;
    if (resolvedShortId === null || resolvedShortId === undefined) {
      const r = await easyFetch(`/orders/${encodeURIComponent(orderId)}`, key);
      const d = await r.json();
      if (!r.ok) return json(res, 502, { ok: false, received: true, error: "Webhook received but order lookup failed", order_id: orderId, easyorders_status: r.status, easyorders: d });
      fullOrder = d?.data || d;
      resolvedShortId = fullOrder?.short_id;
    }
    if (resolvedShortId === null || resolvedShortId === undefined) return json(res, 422, { ok: false, received: true, error: "Order received but short_id is missing", order_id: orderId });

    const html = await buildLabelHtml(fullOrder, resolvedShortId);
    let storedUrl = null;
    let storage = "not_configured";
    try {
      storedUrl = await saveLabel(html, resolvedShortId);
      storage = "vercel_blob";
      console.log("CLIXY_LABEL_STORED", JSON.stringify({ short_id: resolvedShortId, url: storedUrl }));
    } catch (blobError) {
      console.error("CLIXY_BLOB_SAVE_FAILED", blobError);
      storage = "blob_error";
    }

    // Always keep the dynamic URL as a fallback/manual view.
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
      message: storedUrl ? "Shipping Label generated and saved automatically" : "Label generated, but Blob storage is not configured"
    });
  } catch (e) {
    console.error("CLIXY_WEBHOOK_ERROR", e);
    return json(res, 500, { ok: false, received: true, error: "Webhook processing failed", details: e?.message });
  }
}
