function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

export async function GET(request) {
  const u = new URL(request.url);
  const p = u.searchParams;

  const order = {
    number: p.get("order") || "CLX-10025",
    date: p.get("date") || new Date().toLocaleDateString("en-GB"),
    name: p.get("name") || "أحمد محمد",
    phone: p.get("phone") || "01XXXXXXXXX",
    governorate: p.get("gov") || "المنوفية",
    address: p.get("address") || "العنوان بالتفصيل",
    courier: p.get("courier") || "لم يتم التحديد",
    product: p.get("product") || "اسم المنتج",
    qty: p.get("qty") || "1",
    total: p.get("total") || "750",
    paid: p.get("paid") || "100",
    remaining: p.get("remaining") || "650",
    tracking: p.get("tracking") || "CLX10025-TEST"
  };

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>Clixy - Shipping Label</title>
<style>
@page{size:100mm 150mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#eee;font-family:Arial,Tahoma,sans-serif}
.label{width:100mm;height:150mm;margin:10px auto;padding:5mm;background:#fff;color:#111;overflow:hidden}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:3mm}
.brand{font-size:25px;font-weight:900;letter-spacing:1px}
.tag{font-size:8px;text-align:left;direction:ltr}
.row{display:flex;gap:2mm;margin-top:3mm}
.box{border:1px solid #222;border-radius:2mm;padding:2.5mm;flex:1}
.title{font-size:9px;font-weight:bold;color:#555;margin-bottom:1mm}
.value{font-size:12px;font-weight:bold;line-height:1.35;word-break:break-word}
.address{margin-top:3mm;min-height:20mm}
.items{margin-top:3mm;border:1px solid #222}
.items .head,.items .line{display:grid;grid-template-columns:1fr 12mm 22mm}
.items .head{background:#111;color:#fff;font-size:9px;font-weight:bold;padding:2mm}
.items .line{font-size:10px;padding:2mm;border-top:1px solid #ccc}
.payment{margin-top:3mm;border:2px solid #111;border-radius:2mm;padding:3mm;text-align:center}
.payment .method{font-size:12px;font-weight:bold}
.payment .amount{font-size:20px;font-weight:900;margin-top:1mm}
.track{margin-top:4mm;text-align:center;font-weight:900;letter-spacing:1px;direction:ltr}
.barcode{height:13mm;margin-top:1mm;display:flex;justify-content:center;align-items:stretch;gap:1px}
.barcode i{display:block;background:#111}
.footer{margin-top:3mm;text-align:center;font-size:8px;color:#555}
@media print{html,body{background:#fff}.label{margin:0}}
</style>
</head>
<body>
<section class="label">
<div class="header"><div class="brand">CLIXY</div><div class="tag">TRENDING PRODUCTS<br>DELIVERED TO YOU</div></div>
<div class="row">
<div class="box"><div class="title">رقم الطلب</div><div class="value">${esc(order.number)}</div></div>
<div class="box"><div class="title">التاريخ</div><div class="value">${esc(order.date)}</div></div>
</div>
<div class="box address">
<div class="title">العميل</div><div class="value">${esc(order.name)}</div>
<div style="font-size:11px;margin-top:1mm;direction:ltr;text-align:right">${esc(order.phone)}</div>
<div style="font-size:11px;margin-top:1.5mm">${esc(order.governorate)} — ${esc(order.address)}</div>
</div>
<div class="box" style="margin-top:3mm"><div class="title">شركة الشحن</div><div class="value">${esc(order.courier)}</div></div>
<div class="items">
<div class="head"><span>المنتج</span><span>الكمية</span><span>السعر</span></div>
<div class="line"><span>${esc(order.product)}</span><span>${esc(order.qty)}</span><span>${esc(order.total)} ج.م</span></div>
</div>
<div class="payment">
<div class="method">${Number(order.remaining) > 0 ? "COD — الدفع عند الاستلام" : "PAID — مدفوع بالكامل"}</div>
<div style="font-size:10px;margin-top:1mm">مدفوع مقدمًا: ${esc(order.paid)} ج.م</div>
<div class="amount">المطلوب تحصيله: ${esc(order.remaining)} ج.م</div>
</div>
<div class="track">${esc(order.tracking)}</div>
<div class="barcode">
<i style="width:2px"></i><i style="width:4px"></i><i style="width:1px"></i><i style="width:3px"></i><i style="width:6px"></i>
<i style="width:2px"></i><i style="width:1px"></i><i style="width:5px"></i><i style="width:3px"></i><i style="width:1px"></i>
<i style="width:6px"></i><i style="width:2px"></i><i style="width:4px"></i><i style="width:1px"></i><i style="width:5px"></i>
<i style="width:2px"></i><i style="width:6px"></i><i style="width:1px"></i><i style="width:3px"></i>
</div>
<div class="footer">شكراً لاختيارك CLIXY</div>
</section>
</body>
</html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }});
}
