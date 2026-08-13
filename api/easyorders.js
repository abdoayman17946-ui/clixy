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
  const items = o.cart_items || [];
  const total = Number(o.total_cost || 0);
  const shipping = Number(o.shipping_cost || 0);
  const qr = await QRCode.toDataURL(`${APP_URL}/api/label?order=${encodeURIComponent(id)}`, { margin: 1, width: 180 });
  const rows = items.map(x => `<tr><td>${esc(x.product?.name || "منتج")}<br><small>${esc((x.variant?.variation_props || []).map(v => v.variation + ": " + v.variation_prop).join(" / "))}</small></td><td>${Number(x.quantity || 1)}</td><td>${Number(x.price || 0).toFixed(2)} ج</td></tr>`).join("");

  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>CLIXY ${esc(id)}</title>
<style>@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#eee}.label{width:100mm;min-height:150mm;background:#fff;padding:4.5mm;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:2px solid;padding-bottom:3mm}.brand{font-size:25px;font-weight:900}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:3mm}.box{border:1px solid;border-radius:2mm;padding:2.5mm}.full{grid-column:1/-1}.t{font-size:8px;color:#666}.v{font-size:11px;font-weight:bold;line-height:1.4}table{width:100%;border-collapse:collapse;margin-top:3mm;font-size:9px}th{background:#111;color:#fff;padding:2mm}td{border:1px solid #aaa;padding:2mm}.pay{border:2px solid;text-align:center;padding:3mm;margin-top:3mm;border-radius:2mm}.amt{font-size:19px;font-weight:900;margin-top:1mm}.bottom{display:flex;justify-content:space-between;align-items:center;margin-top:3mm}.qr{width:25mm}.track{font-weight:900;direction:ltr}.print{position:fixed;left:10px;top:10px;padding:10px;background:#111;color:#fff;border:0;border-radius:8px}@media print{.print{display:none}body{background:#fff}.label{margin:0}}</style>
<button class="print" onclick="print()">🖨️ طباعة</button><section class="label"><div class="head"><div class="brand">CLIXY</div><div>SHIPPING LABEL<br><small>EasyOrders</small></div></div>
<div class="grid"><div class="box"><div class="t">رقم الطلب</div><div class="v">#${esc(o.short_id || id)}</div></div><div class="box"><div class="t">الحالة</div><div class="v">${esc(o.status)}</div></div>
<div class="box full"><div class="t">العميل</div><div class="v">${esc(o.full_name)}</div><div dir="ltr">${esc(o.phone)}</div></div>
<div class="box full"><div class="t">العنوان</div><div class="v">${esc(o.government)} — ${esc(o.address)}</div></div></div>
<table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>${rows}</tbody></table>
<div class="grid"><div class="box"><div class="t">المنتجات</div><div class="v">${(total - shipping).toFixed(2)} ج</div></div><div class="box"><div class="t">الشحن</div><div class="v">${shipping.toFixed(2)} ج</div></div></div>
<div class="pay"><b>${String(o.payment_method).toLowerCase() === "cod" ? "COD — الدفع عند الاستلام" : "مدفوع"}</b><div class="amt">المطلوب تحصيله: ${total.toFixed(2)} ج.م</div></div>
<div class="bottom"><img class="qr" src="${qr}"><div class="track">ORDER-${esc(o.short_id || id)}<br><small>CLIXY</small></div></div></section></html>`;
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
