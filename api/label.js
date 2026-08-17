import QRCode from "qrcode";

const APP_URL = "https://clixy-theta.vercel.app";
const FIXED_QR_URL = "https://linktr.ee/clixy.eg";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => Number(n || 0).toFixed(2);

const CODE128 = [
"212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","223112","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"
];

function code128Svg(text) {
  const s = String(text || "").replace(/[^\x20-\x7E]/g, "");
  const values = [104];
  for (let i = 0; i < s.length; i++) values.push(s.charCodeAt(i) - 32);
  let checksum = 104;
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103);
  values.push(106);
  const quiet = 10, h = 62;
  let x = quiet, rects = "";
  for (const value of values) {
    const pat = CODE128[value];
    let black = true;
    for (const ch of pat) {
      const w = Number(ch);
      if (black) rects += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`;
      x += w; black = !black;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + quiet} ${h}" role="img" aria-label="${esc(text)}"><rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
}

function parseBodyData(o) {
  const source = Array.isArray(o.items) && o.items.length ? o.items : (Array.isArray(o.cart_items) ? o.cart_items : []);
  return source.map(x => ({
    name: x.product?.name || x.name || x.product_name || "منتج",
    variant: x.variant?.variation_props
      ? x.variant.variation_props.map(v => `${v.variation || ""}: ${v.variation_prop || ""}`).filter(Boolean).join(" / ")
      : (typeof x.variant === "string" ? x.variant : ""),
    quantity: Number(x.quantity || x.qty || 1),
    price: Number(x.price ?? x.unit_price ?? 0)
  }));
}

export default async function handler(req, res) {
  const id = req.query?.order;
  if (!id) return res.status(400).send("اكتب رقم الطلب مثل /api/label?order=17");
  const key = process.env.EASYORDERS_API_KEY;
  if (!key) return res.status(500).send("EASYORDERS_API_KEY غير مضبوط");

  try {
    const endpoint = /^\d+$/.test(String(id))
      ? `https://api.easy-orders.net/api/v1/external-apps/orders/short/${encodeURIComponent(id)}`
      : `https://api.easy-orders.net/api/v1/external-apps/orders/${encodeURIComponent(id)}`;
    const r = await fetch(endpoint, { headers: { "Api-Key": key, "Accept": "application/json" } });
    const result = await r.json();
    if (!r.ok) return res.status(r.status).json(result);

    const o = result.data || result;
    const items = parseBodyData(o);
    const shipping = Number(o.shipping_cost ?? o.shipping ?? 0) || 0;
    const rawTotal = Number(o.total_cost ?? o.total ?? 0) || 0;
    // EasyOrders total_cost is the order total including shipping. Keep that value as the source of truth.
    const itemSum = items.reduce((sum, x) => sum + x.price * x.quantity, 0);
    const productSubtotal = rawTotal > 0 ? Math.max(0, rawTotal - shipping) : itemSum;
    const orderNo = String(o.short_id || id);
    const barcodeValue = `CLX-${new Date().getFullYear()}-${orderNo.padStart(6, "0")}`;
    const qr = await QRCode.toDataURL(FIXED_QR_URL, { margin: 1, width: 220 });
    const productText = items.map(x => {
      const v = x.variant ? ` | ${x.variant}` : "";
      return `${x.name || "منتج"}${v} | الكمية: ${Number(x.quantity || 1)}`;
    }).join("\n") || "لا توجد منتجات";
    let productQr;
    try {
      productQr = await QRCode.toDataURL(productText, { errorCorrectionLevel: "M", margin: 2, width: 600 });
    } catch (e) {
      const compact = items.map(x => `${x.name || "منتج"} × ${Number(x.quantity || 1)}`).join("\n") || "لا توجد منتجات";
      productQr = await QRCode.toDataURL(compact, { errorCorrectionLevel: "L", margin: 2, width: 600 });
    }

    const initial = {
      deposit: 0,
      cod: Math.max(0, rawTotal),
      codManual: false,
      phone2: "",
      full_name: o.full_name || "",
      phone: o.phone || "",
      address: [o.government, o.city, o.address].filter(Boolean).join(" - "),
      notes: o.notes || "",
      product_description: "",
      shipping,
      total: rawTotal,
      items,
      product_qr: productQr
    };
    const initialJson = JSON.stringify(initial).replace(/</g, "\\u003c");
    const rows = items.map((x, i) => `
      <tr><td>${esc(x.name)}${x.variant ? `<div class="variant">${esc(x.variant)}</div>` : ""}</td>
      <td>${x.quantity}</td><td>${money(x.price)}</td><td>${money(x.price * x.quantity)}</td></tr>`).join("");

    const logoUrl = "/assets/clixy-logo.png";
    const qrUrl = "/assets/clixy-qr.png";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLIXY #${esc(orderNo)}</title>
<style>
@page{size:100mm 150mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:Arial,"Tahoma",sans-serif;background:#eee;color:#111}
.sheet{width:100mm;height:150mm;margin:64px auto 18px;background:#fff;position:relative;overflow:hidden;padding:3.2mm 3.4mm}
.label{width:100%;height:100%;border:1px solid #111;border-radius:4mm;padding:2.7mm 2.8mm;display:flex;flex-direction:column}
.gold{color:#b98212}.goldbg{background:#bd8a1d}
.header{display:grid;grid-template-columns:1.12fr 1fr .72fr;align-items:center;gap:2mm;padding-bottom:2.1mm;border-bottom:1.4px solid #bd8a1d}
.logo{width:38mm;height:auto;display:block}.headCenter{text-align:center}.headCenter .small{font-size:8.2px;color:#b98212;margin-bottom:1mm}.orderNo{font-size:18mm;line-height:.9;font-weight:900;color:#b98212;direction:ltr}.hash{font-size:15px;margin-left:1mm}.qrbox{text-align:center}.qr{width:20mm;height:20mm;border:1px solid #b98212;border-radius:2.2mm;padding:1mm}
.barcodeWrap{margin:1.7mm 0 1.5mm;text-align:center}.barcodeTitle{font-size:7px;margin-bottom:.7mm}.barcode{width:74mm;height:12mm;display:block;margin:0 auto}.barcodeText{font-size:7px;font-weight:800;direction:ltr;letter-spacing:.5px;margin-top:.4mm}
.info{border:1px solid #888;border-radius:2.3mm;display:grid;grid-template-columns:1fr 1.45fr 1fr;min-height:30mm;overflow:hidden}.info>div{padding:1.7mm 2mm;border-left:1px dashed #aaa}.info>div:last-child{border-left:0}.info .k{font-size:7px;color:#b98212;margin-bottom:.8mm}.info .v{font-size:8.4px;font-weight:700;line-height:1.35}.phone{direction:ltr;text-align:right;font-size:8.3px;font-weight:700;margin-top:.8mm}.locationBox{margin-top:1.2mm;border-top:1px dashed #bbb;padding-top:1mm}.locationQr{width:13mm;height:13mm;display:block;margin:1mm auto 0;border:1px solid #bbb;padding:.6mm;border-radius:1.5mm}.locationText{font-size:6.5px;font-weight:700;word-break:break-all;direction:ltr;text-align:center;margin-top:.5mm}
.productsTitle{margin-top:1.8mm;background:#bd8a1d;color:#fff;text-align:center;border-radius:2mm 2mm 0 0;padding:1.1mm;font-size:8.2px;font-weight:800}.products{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px}.products th,.products td{border:1px solid #999;padding:1.1mm;text-align:center;vertical-align:middle}.products th{font-size:6.8px;background:#fafafa}.products th:nth-child(1){width:44%}.products th:nth-child(2){width:14%}.products th:nth-child(3){width:18%}.products th:nth-child(4){width:24%}.products td:first-child{text-align:right;font-weight:700}.variant{font-size:5.6px;font-weight:400;color:#555;margin-top:.5mm}
.moneyGrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5mm;margin-top:1.7mm}.moneyBox{border:1px solid #999;border-radius:2mm;text-align:center;padding:1.5mm}.moneyBox .k{font-size:6.5px;color:#555}.moneyBox .n{font-size:9.2px;font-weight:900;margin-top:.7mm}.cod{margin-top:1.7mm;border:1.2px solid #bd8a1d;border-radius:2.2mm;padding:1.7mm;text-align:center}.codLabel{font-size:7px;font-weight:800}.codValue{font-size:15px;font-weight:900;color:#bd8a1d;margin-top:.5mm}.deposit{font-size:6.5px;color:#555}
.footer{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm;margin-top:1.7mm}.footerBox{border:1px solid #aaa;border-radius:2mm;padding:1.6mm;text-align:center;min-height:15mm}.footerBox .k{font-size:6.2px;color:#bd8a1d}.footerBox .v{font-size:7.1px;font-weight:700;line-height:1.35;margin-top:.8mm}.note{margin-top:1.7mm;border:1px solid #aaa;border-radius:2mm;padding:1.7mm;font-size:6.7px;min-height:10mm}.note b{color:#bd8a1d;font-size:7px}
.actions{position:fixed;left:16px;top:14px;z-index:200;display:flex;gap:8px;direction:ltr;background:rgba(255,255,255,.92);padding:5px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);backdrop-filter:blur(8px)}.actions button{border:0;border-radius:9px;padding:9px 13px;cursor:pointer;font-family:inherit;font-weight:700}.edit{background:#bd8a1d;color:#fff}.print{background:#111;color:#fff}
.modal{display:none;position:fixed;inset:0;background:rgba(20,20,20,.62);z-index:300;align-items:center;justify-content:center;padding:16px}.modal.open{display:flex}.panel{background:#fff;width:min(760px,96vw);max-height:92vh;overflow:auto;border-radius:22px;box-shadow:0 28px 90px rgba(0,0,0,.28);padding:0}.editHead{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px 16px;background:linear-gradient(135deg,#fff9ec,#fff);border-bottom:1px solid #eee}.editHead h3{margin:2px 0 5px;font-size:20px}.editHead p{margin:0;color:#777;font-size:11px}.editClose{width:36px;height:36px;border:0;border-radius:50%;background:#f0f0f0;font-size:22px;cursor:pointer}.editBody{padding:18px 24px}.editGroup{border:1px solid #eee;border-radius:15px;padding:13px;margin-bottom:12px;background:#fff}.editGroupTitle{font-weight:900;font-size:12px;margin-bottom:10px;color:#333}.field{margin:8px 0}.field label{display:block;font-size:11px;font-weight:800;margin-bottom:5px}.field input,.field textarea{width:100%;padding:10px;border:1px solid #d2d2d2;border-radius:9px;font-family:inherit;outline:none}.field input:focus,.field textarea:focus{border-color:#bd8a1d;box-shadow:0 0 0 3px rgba(189,138,29,.1)}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.calc input{background:#fffaf0;font-weight:900;color:#9a6d08}.productsEdit{width:100%;border-collapse:collapse;font-size:11px}.productQrPanel{display:flex;direction:ltr;align-items:center;justify-content:space-between;gap:5mm;border:1px solid #aaa;border-radius:2mm;padding:2mm;min-height:24mm}.productQr{width:17.5mm;height:17.5mm;object-fit:contain;border:1px solid #bbb;padding:.5mm;border-radius:1.5mm;transform:none}.productDescBox{flex:1;text-align:right;direction:rtl;min-width:0}.productDesc{font-size:7.2px;line-height:1.35;white-space:pre-wrap;word-break:break-word;max-height:17mm;overflow:hidden}.productsEdit th,.productsEdit td{border:1px solid #ddd;padding:5px}.productsEdit input{width:100%;padding:6px;border:1px solid #ccc;border-radius:6px}.panel .buttons{display:flex;gap:8px;justify-content:flex-end;padding:14px 24px;border-top:1px solid #eee;position:sticky;bottom:0;background:#fff}.panel button{padding:10px 15px;border:0;border-radius:9px;cursor:pointer;font-weight:800}.save{background:#111;color:#fff}.cancel{background:#e9e9e9}@media(max-width:600px){.row{grid-template-columns:1fr}.editBody{padding:14px}.editHead{padding:18px}.panel .buttons{padding:12px 14px}}
@media print{body{background:#fff}.actions,.modal{display:none!important}.sheet{margin:0}.label{break-inside:avoid}}
</style></head><body>
<div class="actions"><button class="edit" onclick="openEdit()">✏️ تعديل البيانات</button><button class="print" onclick="window.print()">🖨️ طباعة</button></div>
<div class="sheet"><section class="label">
<header class="header"><div><img class="logo" src="${logoUrl}" alt="CLIXY"></div><div class="headCenter"><div class="small">رقم البوليصة</div><div class="orderNo"><span class="hash">#</span>${esc(orderNo)}</div></div><div class="qrbox"><img class="qr" src="${qrUrl}" alt="QR"></div></header>
<div class="barcodeWrap">${code128Svg(barcodeValue).replace('<svg ', '<svg class="barcode" ')}<div class="barcodeText">${esc(barcodeValue)}</div></div>
<div class="info">
<div><div class="k">اسم العميل</div><div class="v" id="fullName"></div><div class="k" style="margin-top:1.7mm">رقم الهاتف الأساسي</div><div class="phone" id="phone"></div><div class="k" style="margin-top:1.7mm">رقم إضافي (اختياري)</div><div class="phone" id="phone2"></div></div>
<div><div class="k">العنوان</div><div class="v" id="address"></div><div class="locationBox"><div class="k">اللوكيشن</div><img class="locationQr" id="locationQr" style="display:none" alt="Location QR"><div class="locationText" id="locationText">-</div></div></div>
<div><div class="k">ملاحظات</div><div class="v" id="miniNotes"></div></div>
</div>
<div class="productsTitle">المنتجات</div>
<div class="productQrPanel"><img id="productQr" class="productQr" alt="QR المنتجات"><div class="productDescBox"><div class="k">وصف المنتج</div><div class="productDesc" id="productDescription"></div></div></div>
<div class="moneyGrid"><div class="moneyBox"><div class="k">إجمالي المنتجات</div><div class="n" id="subtotal"></div></div><div class="moneyBox"><div class="k">الشحن</div><div class="n" id="shipping"></div></div><div class="moneyBox"><div class="k">إجمالي الطلب</div><div class="n" id="total"></div></div></div>
<div class="cod"><div class="codLabel" id="paymentLabel">المبلغ المطلوب تحصيله (COD)</div><div class="codValue" id="cod"></div><div class="deposit" id="depositText"></div></div>
<div class="footer"><div class="footerBox"><div class="k">ملاحظات الطلب</div><div class="v">شكراً لشرائك من CLIXY ❤️</div></div><div class="footerBox"><div class="k">خدمة العملاء</div><div class="v">01033674242</div></div></div>
</section></div>
<div class="modal" id="modal"><div class="panel"><div class="editHead"><div><div style="font-size:10px;color:#bd8a1d;font-weight:900">CLIXY • إدارة البوليصة</div><h3>تعديل البوليصة #${esc(orderNo)}</h3><p>عدّل البيانات ثم احفظها قبل الطباعة.</p></div><button class="editClose" onclick="closeEdit()">×</button></div><div class="editBody">
<div class="editGroup"><div class="editGroupTitle">💰 المبالغ</div><div class="row"><div class="field"><label>الديبوزيت المدفوع</label><input id="eDeposit" type="number" min="0" step=".01"></div><div class="field"><label>الشحن</label><input id="eShipping" type="number" min="0" step=".01"></div></div><div class="row"><div class="field calc"><label>إجمالي الطلب</label><input id="eTotal" type="number" min="0" step=".01" readonly></div><div class="field calc"><label>المبلغ المطلوب تحصيله (COD)</label><input id="eCod" type="number" min="0" step=".01" readonly></div></div></div>
<div class="editGroup"><div class="editGroupTitle">👤 بيانات العميل</div><div class="row"><div class="field"><label>اسم العميل</label><input id="eName"></div><div class="field"><label>رقم الهاتف الأساسي</label><input id="ePhone"></div><div class="field"><label>رقم إضافي</label><input id="ePhone2"></div></div><div class="field"><label>العنوان</label><textarea id="eAddress" rows="2"></textarea></div><div class="field"><label>لوكيشن العميل</label><input id="eLocation" placeholder="الصق رابط Google Maps هنا"></div></div>
<div class="editGroup"><div class="editGroupTitle">📦 المنتج</div><div class="field"><label>وصف المنتج</label><textarea id="eProductDescription" rows="3" placeholder="اكتب وصف المنتج الذي تريد ظهوره يمين QR المنتجات"></textarea></div></div>
<div class="editGroup"><div class="editGroupTitle">📝 الملاحظات</div><div class="field"><label>ملاحظات الطلب</label><textarea id="eNotes" rows="2"></textarea></div></div></div>
<div class="buttons"><button class="save" onclick="saveEdit()">✓ حفظ التعديلات</button><button class="cancel" onclick="closeEdit()">إلغاء</button></div></div></div>
<script>
const ORDER_KEY="clixy_label_v2_${esc(orderNo)}";
const BASE=${initialJson};
const $ = id => document.getElementById(id);
const els = {
  modal: $("modal"),
  eDeposit: $("eDeposit"), eTotal: $("eTotal"), eCod: $("eCod"), eShipping: $("eShipping"),
  eName: $("eName"), ePhone: $("ePhone"), ePhone2: $("ePhone2"), eAddress: $("eAddress"), eLocation: $("eLocation"),
  eNotes: $("eNotes"), eProductDescription: $("eProductDescription"),
  fullName: $("fullName"), phone: $("phone"), phone2: $("phone2"), address: $("address"),
  locationQr: $("locationQr"), locationText: $("locationText"), miniNotes: $("miniNotes"),
  subtotal: $("subtotal"), shipping: $("shipping"), total: $("total"), cod: $("cod"),
  depositText: $("depositText"), paymentLabel: $("paymentLabel"), productQr: $("productQr"), productDescription: $("productDescription")
};
function getData(){
  try { return {...BASE, ...(JSON.parse(localStorage.getItem(ORDER_KEY)||"{}"))}; }
  catch(e){ return {...BASE}; }
}
function financialBase(d){
  const sourceTotal=Number(d.total??d.total_cost??0)||0;
  const sourceShipping=Number(d.shipping??d.shipping_cost??0)||0;
  const itemSum=(Array.isArray(d.items)?d.items:[]).reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.quantity)||0),0);
  return {subtotal:sourceTotal>0?Math.max(0,sourceTotal-sourceShipping):itemSum,shipping:sourceShipping};
}
function updateCodField(){
  const total=Math.max(0, Number(els.eTotal.value)||0);
  const dep=Math.max(0, Number(els.eDeposit.value)||0);
  els.eCod.value=Math.max(0,total-dep).toFixed(2);
}
function render(){
  const d=getData();
  const items=Array.isArray(d.items)&&d.items.length?d.items:(Array.isArray(d.cart_items)?d.cart_items:[]);
  const fb=financialBase({...d,items});
  const subtotal=fb.subtotal;
  const shipping=Math.max(0,Number(d.shipping??d.shipping_cost??0)||0);
  const total=subtotal+shipping;
  const dep=Math.max(0,Number(d.deposit)||0);
  const cod=Math.max(0,total-dep);

  els.fullName.textContent=d.full_name||"-";
  els.phone.textContent=d.phone||"-";
  els.phone2.textContent=d.phone2||"-";
  els.address.textContent=d.address||"-";

  const loc=String(d.location||"").trim();
  if(loc){
    els.locationQr.src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=6&ecc=M&data="+encodeURIComponent(loc);
    els.locationQr.style.display="block";
    els.locationText.textContent="";
  }else{
    els.locationQr.removeAttribute("src");
    els.locationQr.style.display="none";
    els.locationText.textContent="";
  }

  els.miniNotes.textContent=d.notes||"-";
  els.subtotal.textContent=subtotal.toFixed(2)+" ج.م";
  els.shipping.textContent=shipping.toFixed(2)+" ج.م";
  els.total.textContent=total.toFixed(2)+" ج.م";
  els.cod.textContent=cod.toFixed(2)+" ج.م";
  els.depositText.textContent=dep>0?"تم دفع مقدم: "+dep.toFixed(2)+" ج.م":"بدون دفعة مقدمة";
  els.paymentLabel.textContent=dep>=total&&total>0?"مدفوع بالكامل":"المبلغ المطلوب تحصيله (COD)";

  // QR المنتجات يتم توليده محليًا من السيرفر، وليس عبر خدمة QR خارجية متقطعة.
  if(d.product_qr) els.productQr.src=d.product_qr;
  els.productDescription.textContent=d.product_description||"";
}
function openEdit(){
  const d=getData();
  const items=Array.isArray(d.items)&&d.items.length?d.items:(Array.isArray(d.cart_items)?d.cart_items:[]);
  const fb=financialBase({...d,items});

  els.eDeposit.value=Number(d.deposit||0);
  els.eShipping.value=Number(d.shipping??d.shipping_cost??0);
  els.eTotal.value=(fb.subtotal+Math.max(0,Number(els.eShipping.value)||0)).toFixed(2);
  els.eName.value=d.full_name||"";
  els.ePhone.value=d.phone||"";
  els.ePhone2.value=d.phone2||"";
  els.eAddress.value=d.address||"";
  els.eLocation.value=d.location||"";
  els.eNotes.value=d.notes||"";
  els.eProductDescription.value=d.product_description||"";
  updateCodField();
  els.modal.classList.add("open");
}
function closeEdit(){els.modal.classList.remove("open");}
function saveEdit(){
  try{
    const d=getData();
    const items=Array.isArray(d.items)&&d.items.length?d.items:(Array.isArray(d.cart_items)?d.cart_items:[]);
    const fb=financialBase({...d,items});
    const subtotal=fb.subtotal;
    d.deposit=Math.max(0,Number(els.eDeposit.value)||0);
    d.shipping=Math.max(0,Number(els.eShipping.value)||0);
    // إجمالي الطلب = إجمالي المنتجات الأصلي + الشحن الجديد.
    d.total=Math.max(0,subtotal+d.shipping);
    d.cod=Math.max(0,d.total-d.deposit);
    d.codManual=false;
    d.full_name=els.eName.value.trim();
    d.phone=els.ePhone.value.trim();
    d.phone2=els.ePhone2.value.trim();
    d.address=els.eAddress.value.trim();
    d.location=els.eLocation.value.trim();
    d.notes=els.eNotes.value.trim();
    d.product_description=els.eProductDescription.value.trim();
    // لا نحذف أو نعدل items هنا؛ الـQR يجب أن يظل مبنيًا على المنتجات الأصلية.
    localStorage.setItem(ORDER_KEY,JSON.stringify(d));
    render();
    closeEdit();
  }catch(e){
    console.error(e);
    alert("حصل خطأ أثناء حفظ التعديلات. حاول مرة أخرى.");
  }
}
els.eDeposit.addEventListener("input",updateCodField);
els.eTotal.addEventListener("input",updateCodField);
els.eShipping.addEventListener("input",()=>{
  const d=getData();
  const items=Array.isArray(d.items)&&d.items.length?d.items:(Array.isArray(d.cart_items)?d.cart_items:[]);
  const fb=financialBase({...d,items});
  els.eTotal.value=(fb.subtotal+Math.max(0,Number(els.eShipping.value)||0)).toFixed(2);
  updateCodField();
});
// إغلاق نافذة التعديل عند الضغط خارجها
els.modal.addEventListener("click",e=>{if(e.target===els.modal)closeEdit();});
render();
</script></body></html>