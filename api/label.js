import QRCode from "qrcode";

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export default async function handler(req,res) {
  const id=req.query?.order;
  if (!id) return res.status(400).send("اكتب رقم الطلب مثل /api/label?order=17");
  const key=process.env.EASYORDERS_API_KEY;
  if(!key) return res.status(500).send("EASYORDERS_API_KEY غير مضبوط");
  try {
    const isShort = /^\d+$/.test(String(id));
    const endpoint = isShort
      ? `https://api.easy-orders.net/api/v1/external-apps/orders/short/${encodeURIComponent(id)}`
      : `https://api.easy-orders.net/api/v1/external-apps/orders/${encodeURIComponent(id)}`;
    const r=await fetch(endpoint,{headers:{"Api-Key":key,"Accept":"application/json"}});
    const result=await r.json();
    if(!r.ok) return res.status(r.status).json(result);
    const o=result.data||result, items=o.cart_items||[];
    const total=Number(o.total_cost||0), shipping=Number(o.shipping_cost||0);
    const qr=await QRCode.toDataURL(`https://clixy-theta.vercel.app/api/label?order=${id}`,{margin:1,width:180});
    const rows=items.map(x=>`<tr><td>${esc(x.product?.name||"منتج")}<br><small>${esc((x.variant?.variation_props||[]).map(v=>v.variation+": "+v.variation_prop).join(" / "))}</small></td><td>${Number(x.quantity||1)}</td><td>${Number(x.price||0).toFixed(2)} ج</td></tr>`).join("");
    res.setHeader("Content-Type","text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>CLIXY ${esc(id)}</title>
<style>@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#eee}.label{width:100mm;min-height:150mm;background:#fff;padding:4.5mm;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:2px solid;padding-bottom:3mm}.brand{font-size:25px;font-weight:900}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:3mm}.box{border:1px solid;border-radius:2mm;padding:2.5mm}.full{grid-column:1/-1}.t{font-size:8px;color:#666}.v{font-size:11px;font-weight:bold;line-height:1.4}table{width:100%;border-collapse:collapse;margin-top:3mm;font-size:9px}th{background:#111;color:#fff;padding:2mm}td{border:1px solid #aaa;padding:2mm}.pay{border:2px solid;text-align:center;padding:3mm;margin-top:3mm;border-radius:2mm}.amt{font-size:19px;font-weight:900;margin-top:1mm}.bottom{display:flex;justify-content:space-between;align-items:center;margin-top:3mm}.qr{width:25mm}.track{font-weight:900;direction:ltr}.print{position:fixed;left:10px;top:10px;padding:10px;background:#111;color:#fff;border:0;border-radius:8px}@media print{.print{display:none}body{background:#fff}.label{margin:0}}</style>
<button class="print" onclick="print()">🖨️ طباعة</button><section class="label"><div class="head"><div class="brand">CLIXY</div><div>SHIPPING LABEL<br><small>EasyOrders</small></div></div>
<div class="grid"><div class="box"><div class="t">رقم الطلب</div><div class="v">#${esc(o.short_id||id)}</div></div><div class="box"><div class="t">الحالة</div><div class="v">${esc(o.status)}</div></div>
<div class="box full"><div class="t">العميل</div><div class="v">${esc(o.full_name)}</div><div dir="ltr">${esc(o.phone)}</div></div>
<div class="box full"><div class="t">العنوان</div><div class="v">${esc(o.government)} — ${esc(o.address)}</div></div></div>
<table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>${rows}</tbody></table>
<div class="grid"><div class="box"><div class="t">المنتجات</div><div class="v">${(total-shipping).toFixed(2)} ج</div></div><div class="box"><div class="t">الشحن</div><div class="v">${shipping.toFixed(2)} ج</div></div></div>
<div class="pay"><b>${String(o.payment_method).toLowerCase()==="cod"?"COD — الدفع عند الاستلام":"مدفوع"}</b><div class="amt">المطلوب تحصيله: ${total.toFixed(2)} ج.م</div></div>
<div class="bottom"><img class="qr" src="${qr}"><div class="track">ORDER-${esc(o.short_id||id)}<br><small>CLIXY</small></div></div></section></html>`);
  } catch(e) { return res.status(500).json({ok:false,error:"Label generation failed",details:e?.message}); }
}
