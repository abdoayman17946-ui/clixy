const APP_NAME = "CLIXY";
const API_BASE = "https://api.easy-orders.net/api/v1/external-apps/orders/short/";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function parseItems(o) {
  const source = Array.isArray(o.items) && o.items.length ? o.items :
    (Array.isArray(o.cart_items) ? o.cart_items : []);
  return source.map(x => ({
    name: x.product?.name || x.name || x.product_name || "منتج",
    variant: x.variant?.variation_props
      ? x.variant.variation_props.map(v => `${v.variation || ""}: ${v.variation_prop || ""}`).filter(Boolean).join(" / ")
      : (typeof x.variant === "string" ? x.variant : ""),
    quantity: Number(x.quantity || x.qty || 1),
    price: Number(x.price ?? x.unit_price ?? 0)
  }));
}

const money = n => Number(n || 0).toFixed(2);

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
    if (!r.ok) return res.status(r.status).send("تعذر تحميل منتجات البوليصة");

    const o = result.data || result;
    const items = parseItems(o);
    const orderNo = String(o.short_id || id);

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

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>رؤية المنتجات - CLIXY #${esc(orderNo)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f4f4f4;color:#111;font-family:Arial,"Tahoma",sans-serif}
.wrap{width:min(720px,94vw);margin:24px auto}
.card{background:#fff;border-radius:22px;box-shadow:0 8px 30px #0001;overflow:hidden;border:1px solid #e5e5e5}
.head{padding:22px 24px;background:#fff;display:flex;align-items:center;gap:16px;border-bottom:3px solid #bd8a1d}
.logo{width:120px;height:auto;object-fit:contain}
.title{flex:1}
.eyebrow{font-size:12px;color:#bd8a1d;font-weight:800;margin-bottom:5px}
h1{font-size:25px;margin:0}
.sub{margin-top:5px;color:#777;font-size:13px}
.items{padding:16px}
.item{display:grid;grid-template-columns:34px 1fr auto auto;gap:12px;align-items:center;border:1px solid #e5e5e5;border-radius:14px;padding:13px 12px;margin-bottom:9px}
.num{width:30px;height:30px;border-radius:50%;background:#bd8a1d;color:#fff;display:grid;place-items:center;font-weight:800}
.name{font-weight:800;font-size:15px}
.variant{font-size:12px;color:#777;margin-top:4px}
.qty{font-weight:800;direction:ltr}
.price{font-weight:800;white-space:nowrap;color:#9a6d08}
.empty{text-align:center;padding:40px;color:#777}
.foot{text-align:center;padding:16px;color:#888;font-size:12px;border-top:1px solid #eee}
@media(max-width:520px){.head{padding:18px}.logo{width:92px}.item{grid-template-columns:30px 1fr auto}.price{display:none}h1{font-size:21px}}
</style>
</head>
<body>
<div class="wrap">
 <div class="card">
  <header class="head">
   <img class="logo" src="/assets/clixy-logo.png" alt="CLIXY">
   <div class="title">
    <div class="eyebrow">رؤية المنتجات</div>
    <h1>منتجات البوليصة #${esc(orderNo)}</h1>
    <div class="sub">عدد المنتجات: ${items.length}</div>
   </div>
  </header>
  <main class="items">${rows}</main>
  <footer class="foot">CLIXY • Shop Smarter</footer>
 </div>
</div>
</body>
</html>`);
  } catch (e) {
    console.error("products page", e);
    return res.status(500).send("حدث خطأ أثناء تحميل المنتجات");
  }
}
