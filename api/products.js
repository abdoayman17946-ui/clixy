const APP_NAME = "CLIXY";
import { list } from "@vercel/blob";

async function loadOverride(id) {
  try {
    const result = await list({ prefix: `shipping-label-overrides/order-${id}.json`, limit: 5 });
    const blob = (result.blobs || [])[0];
    if (!blob?.url) return null;
    const r = await fetch(blob.url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const API_BASE = "https://api.easy-orders.net/api/v1/external-apps/orders/short/";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"
}[c]));

function parseItems(o) {
  const source = Array.isArray(o.items) && o.items.length ? o.items :
    (Array.isArray(o.cart_items) ? o.cart_items : []);
  return source.map(x => ({
    name: x.product?.name || x.name || x.product_name || "منتج",
    variant: x.variant?.variation_props
      ? x.variant.variation_props.map(v => `${v.variation || ""}: ${v.variation_prop || ""}`).filter(Boolean).join(" / ")
      : (typeof x.variant === "string" ? x.variant : (x.options || "")),
    quantity: Number(x.quantity || x.qty || 1),
    price: Number(x.price ?? x.unit_price ?? 0)
  }));
}

const money = n => Number(n || 0).toFixed(2);
function first(o, keys, fallback = "-") {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}
function num(o, keys) {
  for (const k of keys) {
    const v = Number(o?.[k]);
    if (Number.isFinite(v)) return v;
  }
  return 0;
}
function customerName(o) {
  return first(o, ["name", "customer_name", "full_name", "customerName"]);
}
function addressOf(o) {
  const parts = [o.address, o.address1, o.address2, o.city, o.state, o.country]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== "")
    .map(String);
  return parts.length ? [...new Set(parts)].join("، ") : first(o, ["shipping_address", "full_address", "address_text"]);
}

export default async function handler(req, res) {
  const id = String(req.query?.order || "").trim();
  if (!id) return res.status(400).send("رقم البوليصة غير موجود");

  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return res.status(500).send("EASYORDERS_API_KEY غير مضبوط");

  try {
    const endpoint = /^\d+$/.test(id)
      ? `${API_BASE}${encodeURIComponent(id)}`
      : `https://api.easy-orders.net/api/v1/external-apps/orders/${encodeURIComponent(id)}`;

    const r = await fetch(endpoint, {
      headers: { "Api-Key": key, "Accept": "application/json" }
    });
    const result = await r.json();
    if (!r.ok) return res.status(r.status).send("تعذر تحميل تفاصيل البوليصة");

    let o = result.data || result;
    const override = await loadOverride(id);
    if (override) o = { ...o, ...override, items: Array.isArray(override.items) ? override.items : o.items, cart_items: Array.isArray(override.cart_items) ? override.cart_items : o.cart_items };
    const items = parseItems(o);
    const orderNo = String(o.short_id || id);
    const phone = first(o, ["phone", "customer_phone", "mobile", "phone_number"]);
    const phone2 = first(o, ["phone2", "phone_2", "secondary_phone", "additional_phone"], "-");
    const address = addressOf(o);
    const notes = first(o, ["notes", "order_notes", "customer_notes"], "-");
    const location = first(o, ["location", "map_link", "google_maps", "google_map_url"], "");

    const shipping = num(o, ["shipping_cost", "shipping", "delivery_cost", "delivery_fee"]);
    const discount = num(o, ["discount", "discount_amount", "coupon_discount", "coupon_value", "promo_discount"]);
    const totalRaw = num(o, ["total_cost", "total", "order_total", "grand_total"]);
    const deposit = num(o, ["deposit", "paid_amount", "amount_paid", "prepaid"]);
    const subtotal = num(o, ["subtotal", "sub_total", "products_total"]) || Math.max(0, totalRaw - shipping + discount);
    const total = totalRaw || Math.max(0, subtotal + shipping - discount);
    const cod = Math.max(0, total - deposit);

    const rows = items.length ? items.map((x, i) => `
      <article class="item">
        <div class="num">${i + 1}</div>
        <div class="body">
          <div class="name">${esc(x.name)}</div>
          ${x.variant ? `<div class="variant">${esc(x.variant)}</div>` : ""}
        </div>
        <div class="qty">× ${esc(x.quantity)}</div>
        <div class="price">${money(x.price)} ج.م</div>
      </article>
    `).join("") : `<div class="empty">لا توجد منتجات في هذه البوليصة.</div>`;

    const mapButton = location ? `<a class="map" href="${esc(location)}" target="_blank" rel="noopener">📍 فتح اللوكيشن</a>` : "";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>تفاصيل الطلب - CLIXY #${esc(orderNo)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f3f3f3;color:#111;font-family:Arial,"Tahoma",sans-serif}
.wrap{width:min(760px,94vw);margin:20px auto 32px}
.card{background:#fff;border-radius:22px;box-shadow:0 8px 30px #0001;overflow:hidden;border:1px solid #e3e3e3}
.head{padding:20px 22px;background:#fff;display:flex;align-items:center;gap:16px;border-bottom:3px solid #bd8a1d}
.logo{width:112px;height:auto;object-fit:contain}.title{flex:1}.eyebrow{font-size:12px;color:#bd8a1d;font-weight:800;margin-bottom:5px}h1{font-size:24px;margin:0}.sub{margin-top:5px;color:#777;font-size:13px}
.section{padding:16px 18px;border-bottom:1px solid #eee}.sectionTitle{font-size:15px;font-weight:800;color:#9a6d08;margin-bottom:10px}
.info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.box{border:1px solid #e6e6e6;border-radius:13px;padding:11px;background:#fff}.label{font-size:11px;color:#9a6d08;font-weight:700;margin-bottom:4px}.value{font-size:14px;font-weight:700;word-break:break-word}.ltr{direction:ltr;text-align:right}
.item{display:grid;grid-template-columns:34px 1fr auto auto;gap:12px;align-items:center;border:1px solid #e5e5e5;border-radius:14px;padding:12px;margin-bottom:9px}.num{width:30px;height:30px;border-radius:50%;background:#bd8a1d;color:#fff;display:grid;place-items:center;font-weight:800}.name{font-weight:800;font-size:15px}.variant{font-size:12px;color:#777;margin-top:4px}.qty{font-weight:800;direction:ltr}.price{font-weight:800;white-space:nowrap;color:#9a6d08}.empty{text-align:center;padding:35px;color:#777}
.totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.totalBox{border:1px solid #ddd;border-radius:12px;padding:10px;text-align:center}.totalBox .label{font-size:10px}.totalBox .value{font-size:15px}
.cod{margin-top:10px;border:2px solid #bd8a1d;border-radius:14px;padding:13px;text-align:center}.cod .label{font-size:12px}.cod .value{font-size:24px;color:#bd8a1d;font-weight:900}
.invoiceBtn{display:block;text-align:center;background:#bd8a1d;color:#fff;font-weight:900;text-decoration:none;border-radius:12px;padding:12px;margin-top:4px}.map{display:inline-block;margin-top:8px;color:#9a6d08;font-weight:800;text-decoration:none;border:1px solid #bd8a1d;border-radius:10px;padding:8px 12px}.foot{text-align:center;padding:15px;color:#888;font-size:12px}
@media(max-width:600px){.info,.totals{grid-template-columns:1fr 1fr}.head{padding:17px}.logo{width:88px}h1{font-size:20px}.item{grid-template-columns:30px 1fr auto}.price{display:none}}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<header class="head"><img class="logo" src="/assets/clixy-logo.png" alt="CLIXY"><div class="title"><div class="eyebrow">رؤية المنتجات</div><h1>تفاصيل الطلب #${esc(orderNo)}</h1><div class="sub">${items.length} منتج • CLIXY Shop Smarter</div></div></header>
<section class="section"><div class="sectionTitle">👤 بيانات العميل</div><div class="info">
<div class="box"><div class="label">اسم العميل</div><div class="value">${esc(customerName(o))}</div></div>
<div class="box"><div class="label">رقم الهاتف الأساسي</div><div class="value ltr">${esc(phone)}</div></div>
<div class="box"><div class="label">رقم إضافي</div><div class="value ltr">${esc(phone2)}</div></div>
<div class="box"><div class="label">العنوان</div><div class="value">${esc(address)}</div>${mapButton}</div>
</div></section>
<section class="section"><div class="sectionTitle">📦 المنتجات</div><div>${rows}</div></section>
<section class="section"><div class="sectionTitle">💰 ملخص الطلب</div><div class="totals">
<div class="totalBox"><div class="label">إجمالي المنتجات</div><div class="value">${money(subtotal)} ج.م</div></div>
<div class="totalBox"><div class="label">الشحن</div><div class="value">${money(shipping)} ج.م</div></div>
<div class="totalBox"><div class="label">كوبون الخصم</div><div class="value">${money(discount)} ج.م</div></div>
<div class="totalBox"><div class="label">المدفوع</div><div class="value">${money(deposit)} ج.م</div></div>
</div><div class="cod"><div class="label">المبلغ المطلوب تحصيله (COD)</div><div class="value">${money(cod)} ج.م</div></div></section>
<section class="section"><div class="sectionTitle">📝 ملاحظات الطلب</div><div class="box"><div class="value">${esc(notes)}</div></div></section>
<section class="section actionSection"><a class="invoiceBtn" href="/api/label?order=${encodeURIComponent(orderNo)}">🧾 فتح الفاتورة</a></section><footer class="foot">CLIXY • Shop Smarter</footer>
</div></div></body></html>`);
  } catch (e) {
    console.error("products page", e);
    return res.status(500).send("حدث خطأ أثناء تحميل تفاصيل الطلب");
  }
}
