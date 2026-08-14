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

function normalizeItems(source) {
  const raw = Array.isArray(source) ? source : [];
  return raw.map(x => {
    const props = x?.variant?.variation_props || x?.variation_props || x?.variation || [];
    const variant = Array.isArray(props)
      ? props.map(v => `${v?.variation || v?.name || ""}: ${v?.variation_prop || v?.value || ""}`).filter(Boolean).join(" / ")
      : String(x?.variant || "");
    return {
      name: x?.product?.name || x?.product_name || x?.name || x?.title || "منتج",
      variant,
      quantity: Number(x?.quantity ?? x?.qty ?? 1) || 1,
      price: Number(x?.price ?? x?.unit_price ?? x?.sale_price ?? 0) || 0
    };
  });
}

function parseBodyData(o) {
  const candidates = [o?.cart_items, o?.items, o?.products, o?.order_items, o?.data?.cart_items, o?.data?.items];
  const source = candidates.find(Array.isArray) || [];
  return normalizeItems(source);
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
    const productSubtotal = items.reduce((sum, x) => sum + x.price * x.quantity, 0) || Math.max(0, rawTotal - shipping);
    const orderNo = String(o.short_id || id);
    const barcodeValue = `CLX-${new Date().getFullYear()}-${orderNo.padStart(6, "0")}`;

    const initial = {
      deposit: 0,
      cod: Math.max(0, rawTotal),
      codManual: false,
      phone2: "",
      full_name: o.full_name || "",
      phone: o.phone || "",
      address: [o.government, o.city, o.address].filter(Boolean).join(" - "),
      notes: o.notes || "",
      shipping,
      total: rawTotal,
      items
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
.sheet{width:100mm;height:150mm;margin:0 auto;background:#fff;position:relative;overflow:hidden;padding:3.2mm 3.4mm}
.label{width:100%;height:100%;border:1px solid #111;border-radius:4mm;padding:2.7mm 2.8mm;display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto auto;overflow:hidden}
.gold{color:#b98212}.goldbg{background:#bd8a1d}
.header{display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-areas:"logo center qr";align-items:center;direction:ltr;gap:2mm;padding-bottom:2.1mm;border-bottom:1.4px solid #bd8a1d}.header>div:first-child{grid-area:logo}.header>.headCenter{grid-area:center}.header>.qrbox{grid-area:qr;justify-self:end}
.logo{width:38mm;height:auto;display:block}.headCenter{text-align:center;direction:rtl}.headCenter .small{font-size:8.2px;color:#b98212;margin-bottom:1mm}.orderNo{font-size:18mm;line-height:.9;font-weight:900;color:#b98212;direction:ltr}.hash{font-size:15px;margin-left:1mm}.qrbox{text-align:center}.qr{width:20mm;height:20mm;border:1px solid #b98212;border-radius:2.2mm;padding:1mm}
.barcodeWrap{margin:1.7mm 0 1.5mm;text-align:center}.barcodeTitle{font-size:7px;margin-bottom:.7mm}.barcode{width:74mm;height:12mm;display:block;margin:0 auto}.barcodeText{font-size:7px;font-weight:800;direction:ltr;letter-spacing:.5px;margin-top:.4mm}
.info{border:1px solid #888;border-radius:2.3mm;display:grid;grid-template-columns:1fr 1.45fr 1fr;min-height:30mm;overflow:hidden}.info>div{padding:1.7mm 2mm;border-left:1px dashed #aaa}.info>div:last-child{border-left:0}.info .k{font-size:7px;color:#b98212;margin-bottom:.8mm}.info .v{font-size:8.4px;font-weight:700;line-height:1.35}.phone{direction:ltr;text-align:right;font-size:8.3px;font-weight:700;margin-top:.8mm}.locationBox{margin-top:1.2mm;border-top:1px dashed #bbb;padding-top:1mm}.locationQr{width:13mm;height:13mm;display:block;margin:1mm auto 0;border:1px solid #bbb;padding:.6mm;border-radius:1.5mm}.locationText{font-size:6.5px;font-weight:700;word-break:break-all;direction:ltr;text-align:center;margin-top:.5mm}
.productsTitle{margin-top:1.8mm;background:#bd8a1d;color:#fff;text-align:center;border-radius:2mm 2mm 0 0;padding:1.1mm;font-size:8.2px;font-weight:800}.products{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px}.products th,.products td{border:1px solid #999;padding:1.1mm;text-align:center;vertical-align:middle}.products th{font-size:6.8px;background:#fafafa}.products th:nth-child(1){width:44%}.products th:nth-child(2){width:14%}.products th:nth-child(3){width:18%}.products th:nth-child(4){width:24%}.products td:first-child{text-align:right;font-weight:700}.variant{font-size:5.6px;font-weight:400;color:#555;margin-top:.5mm}
.productsArea{min-height:0;overflow:hidden;display:flex;flex-direction:column}.productsTableWrap{min-height:0;overflow:hidden;flex:1 1 auto}.productsTableWrap .products{transform-origin:top left;will-change:transform}
.label>.header,.label>.barcodeWrap,.label>.info,.label>.moneyGrid,.label>.cod,.label>.footer{min-height:0}

.moneyGrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5mm;margin-top:1.7mm}.moneyBox{border:1px solid #999;border-radius:2mm;text-align:center;padding:1.5mm}.moneyBox .k{font-size:6.5px;color:#555}.moneyBox .n{font-size:9.2px;font-weight:900;margin-top:.7mm}.cod{margin-top:1.7mm;border:1.2px solid #bd8a1d;border-radius:2.2mm;padding:1.7mm;text-align:center}.codLabel{font-size:7px;font-weight:800}.codValue{font-size:15px;font-weight:900;color:#bd8a1d;margin-top:.5mm}.deposit{font-size:6.5px;color:#555}
.footer{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm;margin-top:1.7mm}.footerBox{border:1px solid #aaa;border-radius:2mm;padding:1.6mm;text-align:center;min-height:15mm}.footerBox .k{font-size:6.2px;color:#bd8a1d}.footerBox .v{font-size:7.1px;font-weight:700;line-height:1.35;margin-top:.8mm}.note{margin-top:1.7mm;border:1px solid #aaa;border-radius:2mm;padding:1.7mm;font-size:6.7px;min-height:10mm}.note b{color:#bd8a1d;font-size:7px}
.actions{position:fixed;left:12px;top:12px;z-index:50;display:flex;gap:7px}.actions button{border:0;border-radius:9px;padding:9px 13px;cursor:pointer;font-family:inherit;font-weight:700}.edit{background:#bd8a1d;color:#fff}.print{background:#111;color:#fff}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;align-items:center;justify-content:center}.modal.open{display:flex}.panel{background:#fff;width:min(720px,94vw);max-height:92vh;overflow:auto;padding:18px;border-radius:16px}.panel h3{margin:0 0 14px}.field{margin:9px 0}.field label{display:block;font-size:12px;font-weight:700;margin-bottom:4px}.field input,.field textarea{width:100%;padding:9px;border:1px solid #bbb;border-radius:8px;font-family:inherit}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.productsEdit{width:100%;border-collapse:collapse;font-size:11px}.productsEdit th,.productsEdit td{border:1px solid #ddd;padding:5px}.productsEdit input{width:100%;padding:6px;border:1px solid #ccc;border-radius:6px}.panel .buttons{display:flex;gap:8px;margin-top:14px}.panel button{padding:10px 15px;border:0;border-radius:8px;cursor:pointer}.save{background:#111;color:#fff}.cancel{background:#ddd}
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
<div class="productsArea"><div class="productsTitle">المنتجات</div><div class="productsTableWrap"><table class="products" id="productTable"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody id="productRows">${rows}</tbody></table></div></div>
<div class="moneyGrid"><div class="moneyBox"><div class="k">إجمالي المنتجات</div><div class="n" id="subtotal"></div></div><div class="moneyBox"><div class="k">الشحن</div><div class="n" id="shipping"></div></div><div class="moneyBox"><div class="k">إجمالي الطلب</div><div class="n" id="total"></div></div></div>
<div class="cod"><div class="codLabel" id="paymentLabel">المبلغ المطلوب تحصيله (COD)</div><div class="codValue" id="cod"></div><div class="deposit" id="depositText"></div></div>
<div class="footer"><div class="footerBox"><div class="k">ملاحظات الطلب</div><div class="v">شكراً لشرائك من CLIXY ❤️</div></div><div class="footerBox"><div class="k">خدمة العملاء</div><div class="v">01033674242</div></div></div>
</section></div>
<div class="modal" id="modal"><div class="panel"><h3>تعديل البوليصة #${esc(orderNo)}</h3>
<div class="row"><div class="field"><label>الديبوزيت المدفوع</label><input id="eDeposit" type="number" min="0" step=".01"></div><div class="field"><label>إجمالي الطلب</label><input id="eTotal" type="number" min="0" step=".01"></div></div>
<div class="row"><div class="field"><label>المبلغ المطلوب تحصيله (يُحسب تلقائيًا)</label><input id="eCod" type="number" min="0" step=".01" readonly></div><div class="field"><label>الشحن</label><input id="eShipping" type="number" min="0" step=".01"></div></div>
<div class="row"><div class="field"><label>اسم العميل</label><input id="eName"></div><div class="field"><label>رقم إضافي</label><input id="ePhone2"></div></div>
<div class="field"><label>العنوان</label><textarea id="eAddress" rows="2"></textarea></div>
<div class="field"><label>لوكيشن العميل (رابط Google Maps أو أي رابط موقع)</label><input id="eLocation" placeholder="الصق رابط اللوكيشن هنا"></div>
<div class="field"><label>ملاحظات</label><textarea id="eNotes" rows="2"></textarea></div>
<div class="field"><label>المنتجات</label><table class="productsEdit"><thead><tr><th>المنتج</th><th>المقاس/اللون</th><th>الكمية</th><th>سعر الوحدة</th></tr></thead><tbody id="editRows"></tbody></table></div>
<div class="buttons"><button class="save" onclick="saveEdit()">حفظ التعديلات</button><button class="cancel" onclick="closeEdit()">إلغاء</button></div>
</div></div>
<script>
const ORDER_KEY="clixy_label_${esc(orderNo)}";
const BASE=${initialJson};
function getData(){try{return {...BASE,...JSON.parse(localStorage.getItem(ORDER_KEY)||"{}")}}catch(e){return {...BASE}}}
function fitProductTable(){
 const wrap=document.querySelector('.productsTableWrap'); const table=document.getElementById('productTable');
 if(!wrap||!table) return;
 table.style.transform='none'; table.style.width='100%';
 const available=Math.max(1, wrap.clientHeight);
 const natural=Math.max(1, table.getBoundingClientRect().height);
 const scale=Math.min(1, available/natural);
 table.style.transformOrigin='top left';
 table.style.transform="scale("+scale+")";
 table.style.width=(100/scale)+"%";
}
function fitEditorProductTable(){requestAnimationFrame(()=>requestAnimationFrame(fitProductTable));}
function render(){
  const d=getData();
  const items=Array.isArray(d.items)?d.items:[];
  const subtotal=items.reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.quantity)||0),0);
  const shipping=Number(d.shipping)||0;
  const total=Number(d.total)>=0?Number(d.total):subtotal+shipping;
  const dep=Math.max(0,Number(d.deposit)||0);
  const cod=Math.max(0,total-dep);
  document.getElementById("fullName").textContent=d.full_name||"-";
  document.getElementById("phone").textContent=d.phone||"-";
  document.getElementById("phone2").textContent=d.phone2||"-";
  document.getElementById("address").textContent=d.address||"-";
  const loc=String(d.location||"").trim();
  const lq=document.getElementById("locationQr"); const lt=document.getElementById("locationText");
  if(loc){lq.src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data="+encodeURIComponent(loc);lq.style.display="block";lt.textContent="افتح اللوكيشن";}else{lq.removeAttribute("src");lq.style.display="none";lt.textContent="-";}
  document.getElementById("miniNotes").textContent=d.notes||"-";
  document.getElementById("subtotal").textContent=subtotal.toFixed(2)+" ج.م";
  document.getElementById("shipping").textContent=shipping.toFixed(2)+" ج.م";
  document.getElementById("total").textContent=total.toFixed(2)+" ج.م";
  document.getElementById("cod").textContent=cod.toFixed(2)+" ج.م";
  document.getElementById("depositText").textContent=dep>0?"تم دفع مقدم: "+dep.toFixed(2)+" ج.م": "بدون دفعة مقدمة";
  document.getElementById("paymentLabel").textContent=dep>=total&&total>0?"مدفوع بالكامل":"المبلغ المطلوب تحصيله (COD)";
  document.getElementById("productRows").innerHTML=items.map(x=>'<tr><td>'+escClient(x.name)+(x.variant?'<div class="variant">'+escClient(x.variant)+'</div>':'')+'</td><td>'+Number(x.quantity||0)+'</td><td>'+Number(x.price||0).toFixed(2)+'</td><td>'+((Number(x.price)||0)*(Number(x.quantity)||0)).toFixed(2)+'</td></tr>').join("");
  fitEditorProductTable();
}
function escClient(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function openEdit(){
 const d=getData();
 eDeposit.value=d.deposit||0;eTotal.value=Number(d.total||0);eCod.value=Math.max(0,Number(d.total||0)-Number(d.deposit||0));eShipping.value=Number(d.shipping||0);updateCodField();
 eName.value=d.full_name||"";ePhone2.value=d.phone2||"";eAddress.value=d.address||"";eLocation.value=d.location||"";eNotes.value=d.notes||"";
 editRows.innerHTML=(d.items||[]).map((x,i)=>'<tr><td><input data-i="'+i+'" data-f="name" value="'+escClient(x.name)+'"></td><td><input data-i="'+i+'" data-f="variant" value="'+escClient(x.variant||"")+'"></td><td><input data-i="'+i+'" data-f="quantity" type="number" min="1" step="1" value="'+Number(x.quantity||1)+'"></td><td><input data-i="'+i+'" data-f="price" type="number" min="0" step=".01" value="'+Number(x.price||0)+'"></td></tr>').join("");
 modal.classList.add("open");
 fitEditorProductTable();
}
function updateCodField(){
 const total=Math.max(0,Number(eTotal.value)||0);
 const dep=Math.max(0,Number(eDeposit.value)||0);
 eCod.value=Math.max(0,total-dep).toFixed(2);
}
function closeEdit(){modal.classList.remove("open")}
eDeposit.addEventListener("input",updateCodField);
eTotal.addEventListener("input",updateCodField);
function saveEdit(){
 try {
  const d=getData();
  d.deposit=Math.max(0,Number(document.getElementById("eDeposit").value)||0);
  d.total=Math.max(0,Number(document.getElementById("eTotal").value)||0);
  d.shipping=Math.max(0,Number(document.getElementById("eShipping").value)||0);
  d.full_name=document.getElementById("eName").value.trim();
  d.phone2=document.getElementById("ePhone2").value.trim();
  d.address=document.getElementById("eAddress").value.trim();
  d.location=document.getElementById("eLocation").value.trim();
  d.notes=document.getElementById("eNotes").value.trim();
  d.cod=Math.max(0,d.total-d.deposit);
  d.codManual=false;
  d.items=(d.items||[]).map((x,i)=>{
    const get=f=>document.querySelector('#editRows [data-i="'+i+'"][data-f="'+f+'"]');
    if(!get("name")) return null;
    return {...x,name:get("name").value.trim(),variant:get("variant").value.trim(),quantity:Math.max(1,Number(get("quantity").value)||1),price:Math.max(0,Number(get("price").value)||0)};
  }).filter(x=>x && x.name);
  localStorage.setItem(ORDER_KEY,JSON.stringify(d));
  render();
  closeEdit();
 } catch(e) {
  alert("حصل خطأ أثناء حفظ التعديلات. حاول مرة أخرى.");
  console.error(e);
 }
}
render();
fitEditorProductTable();
</script></body></html>`);
  } catch(e) {
    return res.status(500).json({ok:false,error:"Label generation failed",details:e?.message});
  }
}
