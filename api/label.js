import QRCode from "qrcode";

const APP_URL = "https://clixy-theta.vercel.app";
const FIXED_QR_URL = "https://linktr.ee/clixy.eg";

const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => Number(n || 0).toFixed(2);

// Code 128-B patterns (11 modules each; 0-106). Used to make a real scanner-readable barcode.
const CODE128 = [
"212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

function code128Svg(text) {
  const s = String(text || "").replace(/[^\x20-\x7E]/g, "");
  const values = [104]; // Code 128-B start
  for (let i=0;i<s.length;i++) values.push(s.charCodeAt(i)-32);
  let checksum = 104;
  for (let i=1;i<values.length;i++) checksum += values[i]*i;
  values.push(checksum % 103);
  values.push(106);
  const quiet = 10, h = 70;
  let x = quiet;
  let rects = "";
  for (const value of values) {
    const pat = CODE128[value];
    let black = true;
    for (const ch of pat) {
      const w = Number(ch);
      if (black) rects += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`;
      x += w; black = !black;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+quiet} ${h}" role="img" aria-label="${esc(text)}"><rect width="100%" height="100%" fill="white"/>${rects}</svg>`;
}

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
    const orderNo=String(o.short_id||id);
    const barcodeValue=`CLX-${new Date().getFullYear()}-${orderNo.padStart(6,"0")}`;
    const qr=await QRCode.toDataURL(FIXED_QR_URL,{margin:1,width:180});
    const barcode=code128Svg(barcodeValue);
    const rows=items.map(x=>`<tr><td>${esc(x.product?.name||"منتج")}<br><small>${esc((x.variant?.variation_props||[]).map(v=>v.variation+": "+v.variation_prop).join(" / "))}</small></td><td>${Number(x.quantity||1)}</td><td>${money(x.price)} ج.م</td></tr>`).join("");
    const initial = {
      deposit: 0,
      phone2: "",
      full_name: o.full_name || "",
      phone: o.phone || "",
      address: `${o.government||""}${o.government&&o.address?" — ":""}${o.address||""}`,
      notes: ""
    };
    const initialJson = JSON.stringify(initial).replace(/</g,"\\u003c");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLIXY #${esc(orderNo)}</title>
<style>
@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Tahoma",sans-serif;background:#eee;color:#111}.label{width:100mm;min-height:150mm;background:#fff;padding:4mm;margin:auto;position:relative}.head{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;border-bottom:1.5px solid #111;padding-bottom:2.5mm}.brand{font-size:24px;font-weight:900;letter-spacing:1px}.title{text-align:center;font-size:12px}.title small{font-size:8px}.qrbox{text-align:left}.qr{width:23mm;height:23mm;border:1px solid #c59620;border-radius:2mm;padding:1mm}.qrurl{font-size:6.5px;text-align:center;direction:ltr;margin-top:1mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1.7mm;margin-top:2.5mm}.box{border:1px solid #111;border-radius:2mm;padding:2mm}.full{grid-column:1/-1}.t{font-size:7px;color:#777}.v{font-size:10px;font-weight:bold;line-height:1.35}.phone{direction:ltr;text-align:right;font-weight:bold;font-size:10px;margin-top:1mm}table{width:100%;border-collapse:collapse;margin-top:2.5mm;font-size:8px}th{background:#111;color:#fff;padding:1.7mm}td{border:1px solid #aaa;padding:1.6mm} .totals{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5mm;margin-top:2.5mm}.sum{border:1px solid #111;border-radius:2mm;text-align:center;padding:2mm}.sum .num{font-size:11px;font-weight:900;margin-top:1mm}.cod{background:#c59620;color:#fff;border:2px solid #111;border-radius:2mm;text-align:center;padding:2.5mm;margin-top:2.5mm}.cod .big{font-size:18px;font-weight:900;margin-top:1mm}.barcode{margin-top:2.5mm;border:1px dashed #888;border-radius:2mm;padding:2mm;text-align:center}.barcode svg{width:100%;height:16mm;display:block}.barcodeText{font-size:8px;font-weight:900;direction:ltr;letter-spacing:.5px}.bottom{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:2.5mm}.note{border:1px solid #111;border-radius:2mm;padding:2mm;font-size:7.5px;min-height:17mm}.status{text-align:center;border:1px solid #111;border-radius:2mm;padding:2mm}.status b{font-size:10px}.actions{position:fixed;left:10px;top:10px;z-index:9;display:flex;gap:6px}.actions button{padding:9px 12px;background:#111;color:#fff;border:0;border-radius:8px;cursor:pointer}.actions button.edit{background:#c59620}.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:20;align-items:center;justify-content:center}.modal.open{display:flex}.panel{background:#fff;width:min(420px,92vw);padding:18px;border-radius:14px}.panel h3{margin-top:0}.field{margin:10px 0}.field label{display:block;font-size:12px;margin-bottom:4px}.field input,.field textarea{width:100%;padding:9px;border:1px solid #aaa;border-radius:7px;font-family:inherit}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.panel .buttons{display:flex;gap:8px;margin-top:12px}.panel button{padding:10px 14px;border:0;border-radius:8px;cursor:pointer}.save{background:#111;color:#fff}.cancel{background:#ddd}@media print{.actions,.modal{display:none!important}body{background:#fff}.label{margin:0}}
</style>
<div class="actions"><button class="edit" onclick="openEdit()">✏️ تعديل</button><button onclick="window.print()">🖨️ طباعة</button></div>
<section class="label"><div class="head"><div class="brand">CLIXY</div><div class="title">بوليصة شحن<br><small>SHIPPING LABEL</small></div><div class="qrbox"><img class="qr" src="${qr}"><div class="qrurl">linktr.ee/clixy.eg</div></div></div>
<div class="grid"><div class="box"><div class="t">رقم البوليصة</div><div class="v">#${esc(orderNo)}</div></div><div class="box"><div class="t">الحالة</div><div class="v">${esc(o.status||"pending")}</div></div>
<div class="box full"><div class="t">اسم العميل</div><div id="fullName" class="v"></div><div id="phone" class="phone"></div><div id="phone2" class="phone"></div></div>
<div class="box full"><div class="t">عنوان التوصيل</div><div id="address" class="v"></div></div></div>
<table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><div class="sum"><div class="t">إجمالي المنتجات</div><div class="num">${money(total-shipping)} ج.م</div></div><div class="sum"><div class="t">الشحن</div><div class="num">${money(shipping)} ج.م</div></div><div class="sum"><div class="t">إجمالي الطلب</div><div id="total" class="num">${money(total)} ج.م</div></div></div>
<div class="cod"><b id="paymentLabel">COD — الدفع عند الاستلام</b><div id="cod" class="big"></div><small id="depositText"></small></div>
<div class="barcode"><div><b>باركود الشحنة — Code 128</b></div>${barcode}<div class="barcodeText">${esc(barcodeValue)}</div></div>
<div class="bottom"><div class="note"><b>ملاحظات</b><div id="notes" style="margin-top:2mm">يرجى التعامل مع الطلب بعناية وشكرًا لتعاونكم ❤️</div></div><div class="status"><div class="t">رقم الطلب</div><b>ORDER-${esc(orderNo)}</b><div style="margin-top:2mm" class="t">QR ثابت لحسابات CLIXY</div></div></div></section>
<div id="modal" class="modal"><div class="panel"><h3>تعديل بيانات البوليصة #${esc(orderNo)}</h3><div class="field"><label>الديبوزيت المدفوع</label><input id="eDeposit" type="number" min="0" step="0.01"></div><div class="field"><label>الرقم الإضافي</label><input id="ePhone2" type="text"></div><div class="field"><label>اسم العميل</label><input id="eName" type="text"></div><div class="field"><label>العنوان</label><textarea id="eAddress" rows="2"></textarea></div><div class="field"><label>ملاحظات</label><textarea id="eNotes" rows="2"></textarea></div><div class="buttons"><button class="save" onclick="saveEdit()">حفظ</button><button class="cancel" onclick="closeEdit()">إلغاء</button></div></div></div>
<script>
const ORDER_KEY="clixy_label_${esc(orderNo)}";
const BASE=${initialJson};
const ORDER_TOTAL=${total};
function getData(){try{return {...BASE,...JSON.parse(localStorage.getItem(ORDER_KEY)||"{}")}}catch(e){return {...BASE}}}
function render(){const d=getData();const dep=Math.max(0,Number(d.deposit)||0);const cod=Math.max(0,ORDER_TOTAL-dep);document.getElementById('fullName').textContent=d.full_name||'-';document.getElementById('phone').textContent=d.phone||'-';document.getElementById('phone2').textContent=d.phone2?('+'+d.phone2.replace(/^\\+/,'')):'';document.getElementById('address').textContent=d.address||'-';document.getElementById('cod').textContent=cod.toFixed(2)+' ج.م';document.getElementById('depositText').textContent=dep>0?'تم دفع مقدم: '+dep.toFixed(2)+' ج.م':'بدون دفعة مقدمة';document.getElementById('paymentLabel').textContent=dep>0?(cod>0?'DEPOSIT + COD — دفعة مقدمة + تحصيل عند الاستلام':'PAID — مدفوع بالكامل'):'COD — الدفع عند الاستلام';document.getElementById('notes').textContent=d.notes||'يرجى التعامل مع الطلب بعناية وشكرًا لتعاونكم ❤️'}
function openEdit(){const d=getData();eDeposit.value=d.deposit||0;ePhone2.value=d.phone2||'';eName.value=d.full_name||'';eAddress.value=d.address||'';eNotes.value=d.notes||'';modal.classList.add('open')}
function closeEdit(){modal.classList.remove('open')}
function saveEdit(){const d=getData();d.deposit=Math.max(0,Number(eDeposit.value)||0);d.phone2=ePhone2.value.trim();d.full_name=eName.value.trim();d.address=eAddress.value.trim();d.notes=eNotes.value.trim();localStorage.setItem(ORDER_KEY,JSON.stringify(d));render();closeEdit()}
render();
</script></html>`);
  } catch(e) { return res.status(500).json({ok:false,error:"Label generation failed",details:e?.message}); }
}
