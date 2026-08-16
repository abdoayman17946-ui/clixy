
const state={orders:new Map(),selected:new Set(),loading:false};
const STORAGE_ORDERS="clixy_dashboard_orders";
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2500)}
function keyFor(id){return "clixy_label_v2_"+id}
function getOverride(id){try{return JSON.parse(localStorage.getItem(keyFor(id))||"null")}catch(e){return null}}
function mergeOrder(o){const id=String(o.short_id||o.id||o.order||"");if(!id)return null;const override=getOverride(id);if(!override)return o;const sourceItems=Array.isArray(o.items)&&o.items.length?o.items:(Array.isArray(o.cart_items)?o.cart_items:[]);const savedItems=Array.isArray(override.items)&&override.items.length?override.items:sourceItems;return {...o,...override,items:savedItems,cart_items:Array.isArray(o.cart_items)?o.cart_items:savedItems};}
function orderItems(o){if(Array.isArray(o.items))return o.items.map(x=>({name:x.name||x.product?.name||"منتج",variant:x.variant||((x.variant?.variation_props||[]).map(v=>v.variation+": "+v.variation_prop).join(" / ")),quantity:Number(x.quantity||1),price:Number(x.price||0)}));return (o.cart_items||[]).map(x=>({name:x.product?.name||x.name||"منتج",variant:(x.variant?.variation_props||[]).map(v=>v.variation+": "+v.variation_prop).join(" / "),quantity:Number(x.quantity||1),price:Number(x.price||0)}))}
function totalOf(o){return Number(o.total??o.total_cost??0)||0}
function shippingOf(o){return Number(o.shipping??o.shipping_cost??0)||0}
function customerOf(o){return o.full_name||o.name||"بدون اسم"}
function renderList(){
 const el=document.getElementById("orders");document.getElementById("count").textContent="("+state.orders.size+")";
 if(!state.orders.size){el.innerHTML='<div class="empty">لا توجد طلبات ظاهرة حاليًا.<br>أضف أرقام الطلبات من الخانة بالأعلى أو تأكد من اتصال Vercel Blob بالـ Webhook.</div>';return}
 el.innerHTML=[...state.orders.values()].map(o=>{const id=String(o.short_id||o.id||o.order);const sel=state.selected.has(id);return `<article class="order ${sel?"selected":""}">
 <div class="rowTop"><label><input class="check" type="checkbox" ${sel?"checked":""} onchange="toggle('${esc(id)}',this.checked)"></label><div class="num">#${esc(id)}</div><div class="date">${esc(o.status||"")}</div></div>
 <div class="customer">${esc(customerOf(o))}</div>
 <div class="meta"><div>📞 ${esc(o.phone||"-")}</div><div>💰 ${totalOf(o).toFixed(2)} ج.م</div></div>
 <div class="actions"><button class="btn light" onclick="openDashboardEdit('${esc(id)}')">✏️ تعديل</button><button class="btn dark" onclick="singlePreview('${esc(id)}')">👁 معاينة</button></div>
 </article>`}).join("");
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toggle(id,on){on?state.selected.add(id):state.selected.delete(id);renderList()}
function selectAll(on){[...state.orders.keys()].forEach(id=>on?state.selected.add(id):state.selected.delete(id));renderList()}
async function addIds(){
 const raw=document.getElementById("ids").value.trim();if(!raw)return;
 const ids=[...new Set(raw.split(/[,\s،]+/).map(x=>x.trim()).filter(Boolean))];
 await loadIds(ids);document.getElementById("ids").value="";
}
document.getElementById("ids").addEventListener("keydown",e=>{
 if(e.key==="Enter"){e.preventDefault();addIds();}
});
async function loadIds(ids){
 if(!ids.length)return; state.loading=true;document.body.classList.add("loading");
 try{
   for(let i=0;i<ids.length;i+=40){
     const batch=ids.slice(i,i+40);
     const r=await fetch("/api/easyorders?orders="+encodeURIComponent(batch.join(",")));
     const data=await r.json();
     const arr=data.results||[data];
     for(const x of arr){if(x.ok&&x.data){const o=x.data;const id=String(o.short_id||x.order);state.orders.set(id,o);state.selected.add(id)}else toast("تعذر تحميل الطلب #"+(x.order||""))}
   }
   persistIds();renderList();
 }catch(e){toast("حصل خطأ أثناء تحميل الطلبات")}finally{state.loading=false;document.body.classList.remove("loading")}
}
async function loadSaved(){
 try{
  const r=await fetch("/api/orders");const d=await r.json();
  const ids=(d.orders||[]).map(x=>String(x.id));
  if(ids.length) await loadIds(ids.slice(0,100)); else {const saved=JSON.parse(localStorage.getItem(STORAGE_ORDERS)||"[]");if(saved.length)await loadIds(saved)}
 }catch(e){const saved=JSON.parse(localStorage.getItem(STORAGE_ORDERS)||"[]");if(saved.length)await loadIds(saved);else renderList()}
}
function persistIds(){localStorage.setItem(STORAGE_ORDERS,JSON.stringify([...state.orders.keys()].slice(0,200)))}
let editingId=null;
const editEls={
 modal:document.getElementById("editModal"),title:document.getElementById("editTitle"),deposit:document.getElementById("dDeposit"),shipping:document.getElementById("dShipping"),coupon:document.getElementById("dCoupon"),total:document.getElementById("dTotal"),cod:document.getElementById("dCod"),name:document.getElementById("dName"),phone2:document.getElementById("dPhone2"),address:document.getElementById("dAddress"),location:document.getElementById("dLocation"),notes:document.getElementById("dNotes"),description:document.getElementById("dProductDescription")
};
function dashboardEditData(id){const raw=state.orders.get(String(id))||{};return mergeOrder(raw);}
function discountOf(o){
 const direct=Number(o.coupon_discount??o.coupon_amount??o.discount_amount??o.discount??o.coupon_value??0)||0;
 if(direct>0)return direct;
 const c=o.coupon||o.applied_coupon||o.coupon_data;
 if(c&&typeof c==='object'){return Number(c.discount_amount??c.amount??c.value??c.discount??0)||0;}
 return 0;
}
function financialBase(o){
 const sourceTotal=Number(o.total??o.total_cost??0)||0;
 const sourceShipping=Number(o.shipping??o.shipping_cost??0)||0;
 const itemSum=(Array.isArray(o.items)?o.items:[]).reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.quantity)||0),0);
 const sourceCoupon=discountOf(o);
 const subtotal=sourceTotal>0?Math.max(0,sourceTotal-sourceShipping+sourceCoupon):itemSum;
 return {subtotal,sourceTotal,sourceShipping,sourceCoupon};
}
function updateDashboardTotals(){
 const d=dashboardEditData(editingId);
 const base=financialBase(d);
 const shipping=Math.max(0,Number(editEls.shipping.value)||0);
 const coupon=Math.max(0,Number(editEls.coupon.value)||0);
 const total=Math.max(0,base.subtotal+shipping-coupon);
 const dep=Math.max(0,Number(editEls.deposit.value)||0);
 editEls.total.value=total.toFixed(2); editEls.cod.value=Math.max(0,total-dep).toFixed(2);
}
function openDashboardEdit(id){
 editingId=String(id);
 const d=dashboardEditData(editingId);
 const base=financialBase(d);
 editEls.title.textContent="تعديل البوليصة #"+editingId;
 editEls.deposit.value=Number(d.deposit||0);
 editEls.shipping.value=Number(d.shipping??d.shipping_cost??0);
 editEls.coupon.value=Number(d.coupon_discount??d.coupon_amount??d.discount_amount??d.discount??d.coupon_value??discountOf(d)??0)||0;
 editEls.total.value=(base.subtotal+Number(editEls.shipping.value||0)-Number(editEls.coupon.value||0)).toFixed(2);
 editEls.name.value=d.full_name||d.name||""; editEls.phone2.value=d.phone2||""; editEls.address.value=d.address||""; editEls.location.value=d.location||""; editEls.notes.value=d.notes||""; editEls.description.value=d.product_description||"";
 updateDashboardTotals();
 editEls.modal.classList.add("open");
}
function closeDashboardEdit(){editEls.modal.classList.remove("open");editingId=null}
function saveDashboardEdit(){
 if(!editingId)return;
 const base=dashboardEditData(editingId); const baseFinancial=financialBase(base); const items=Array.isArray(base.items)&&base.items.length?base.items:(Array.isArray(base.cart_items)?base.cart_items:[]);
 const subtotal=baseFinancial.subtotal;
 const shipping=Math.max(0,Number(editEls.shipping.value)||0); const coupon=Math.max(0,Number(editEls.coupon.value)||0); const total=Math.max(0,subtotal+shipping-coupon); const deposit=Math.max(0,Number(editEls.deposit.value)||0);
 const override={...base,deposit,shipping,coupon_discount:coupon,total,cod:Math.max(0,total-deposit),codManual:false,full_name:editEls.name.value.trim(),phone2:editEls.phone2.value.trim(),address:editEls.address.value.trim(),location:editEls.location.value.trim(),notes:editEls.notes.value.trim(),product_description:editEls.description.value.trim(),items};
 localStorage.setItem(keyFor(editingId),JSON.stringify(override)); state.orders.set(editingId,{...state.orders.get(editingId),...override,items}); renderList(); closeDashboardEdit(); singlePreview(editingId); toast("تم حفظ التعديلات");
}
editEls.deposit.addEventListener("input",updateDashboardTotals);
editEls.shipping.addEventListener("input",updateDashboardTotals);
editEls.coupon.addEventListener("input",updateDashboardTotals);
function printSelected(){if(!state.selected.size){toast("حدد طلبًا واحدًا على الأقل");return}previewSelected(true)}
async function waitForPrintReady(root){
  const imgs=[...root.querySelectorAll("img")];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true})})));
  if(document.fonts&&document.fonts.ready) try{await document.fonts.ready}catch(e){}
}
function singlePreview(id){state.selected=new Set([id]);renderList();previewSelected()}
async function previewSelected(autoPrint=false){
 const ids=[...state.selected];if(!ids.length){toast("حدد طلبًا واحدًا على الأقل");return}
 const area=document.getElementById("previewArea");area.innerHTML='<div style="padding:25px">جاري تجهيز المعاينة...</div>';document.getElementById("previewModal").classList.add("open");
 const fresh=[];
 for(const id of ids){const existing=state.orders.get(id);fresh.push(mergeOrder(existing||{}))}
 area.innerHTML=fresh.map(renderLabel).join("");
 if(autoPrint){await waitForPrintReady(area);requestAnimationFrame(()=>setTimeout(()=>window.print(),200));}
}
function closePreview(){document.getElementById("previewModal").classList.remove("open")}
function renderLabel(o){
 const id=String(o.short_id||o.id||o.order);const items=orderItems(o);const denseClass=items.length>=70?"dense10":items.length>=60?"dense9":items.length>=50?"dense8":items.length>=40?"dense7":items.length>=35?"dense6":items.length>=25?"dense5":items.length>=20?"dense4":items.length>=15?"dense3":items.length>=10?"dense2":items.length>=7?"dense1":"";const shipping=shippingOf(o);const sourceTotal=totalOf(o);const coupon=discountOf(o);const subtotal=sourceTotal>0?Math.max(0,sourceTotal-shipping+coupon):items.reduce((s,x)=>s+x.price*x.quantity,0);const total=Math.max(0,subtotal+shipping-coupon);const dep=Math.max(0,Number(o.deposit)||0);const cod=Math.max(0,total-dep);const phone2=o.phone2||"";const location=o.location||"";const address=o.address||[o.government,o.city,o.address].filter(Boolean).join(" - ")||"-";const barcode=`CLX-${new Date().getFullYear()}-${id.padStart(6,"0")}`;
 return `<div class="previewSheet ${denseClass}"><div class="printLabel"><div class="inside">
 <div class="ph"><div><img src="/assets/clixy-logo.png"></div><div class="pc"><div class="small">رقم البوليصة</div><div class="on"><span style="font-size:15px">#</span>${esc(id)}</div></div><div class="qrbox"><img src="/assets/clixy-qr.png"></div></div>
 <div class="bc">${barcodeSvg(barcode)}<div class="bcText">${esc(barcode)}</div></div>
 <div class="inf"><div><div class="k">اسم العميل</div><div class="v">${esc(customerOf(o))}</div><div class="k" style="margin-top:1.7mm">رقم الهاتف الأساسي</div><div class="ltr">${esc(o.phone||"-")}</div><div class="k" style="margin-top:1.7mm">رقم إضافي (اختياري)</div><div class="ltr">${esc(phone2||"-")}</div></div><div><div class="k">العنوان</div><div class="v">${esc(address)}</div><div class="locationBox"><div class="k">اللوكيشن</div>${o.location?`<img class="locationQr" src="${locationQrUrl(o.location)}" alt="Location QR">`:``}</div></div><div><div class="k">ملاحظات</div><div class="v">${esc(o.notes||"-")}</div></div></div>
 <div class="productsArea productQrArea"><div class="pt">المنتجات</div><div class="productQrRow"><div class="productQrWrap"><div class="qrCaption">رؤية المنتجات</div><img class="productQr" src="${productQrUrl(items)}" alt="QR المنتجات"></div><div class="productDescription"><div class="k">وصف المنتج</div><div class="v">${esc(o.product_description||"-")}</div></div></div></div>
 <div class="mg"><div class="mb"><div class="k">إجمالي المنتجات</div><div class="n">${subtotal.toFixed(2)} ج.م</div></div><div class="mb"><div class="k">الشحن</div><div class="n">${shipping.toFixed(2)} ج.م</div></div><div class="mb"><div class="k">كوبون الخصم</div><div class="n">${coupon>0?"- "+coupon.toFixed(2):"0.00"} ج.م</div></div><div class="mb"><div class="k">إجمالي الطلب</div><div class="n">${total.toFixed(2)} ج.م</div></div></div>
 <div class="cod"><div class="cl">${dep>=total&&total>0?"مدفوع بالكامل":"المبلغ المطلوب تحصيله (COD)"}</div><div class="cv">${cod.toFixed(2)} ج.م</div><div class="dep">${dep>0?"تم دفع مقدم: "+dep.toFixed(2)+" ج.م":"بدون دفعة مقدمة"}</div></div>
 <div class="ft"><div class="fb"><div class="k">ملاحظات الطلب</div><div class="v">شكراً لشرائك من CLIXY ❤️</div></div><div class="fb"><div class="k">خدمة العملاء</div><div class="v">01033674242</div></div></div>
 </div></div></div>`;
}
function locationQrUrl(value){return "https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data="+encodeURIComponent(String(value||""));}
function productQrUrl(items){
 const text=(items||[]).map(x=>{
   const v=x.variant?` | ${x.variant}`:"";
   return `${x.name||"منتج"}${v} | الكمية: ${Number(x.quantity||1)}`;
 }).join("\n") || "لا توجد منتجات";
 return "https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=3&data="+encodeURIComponent(text);
}
function barcodeSvg(text){
 const p=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","223112","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];const s=String(text).replace(/[^\x20-\x7E]/g,"");const v=[104];for(let i=0;i<s.length;i++)v.push(s.charCodeAt(i)-32);let c=104;for(let i=1;i<v.length;i++)c+=v[i]*i;v.push(c%103,106);let x=10,r="";for(const n of v){let black=true;for(const ch of p[n]){const w=+ch;if(black)r+=`<rect x="${x}" y="0" width="${w}" height="62"/>`;x+=w;black=!black}}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+10} 62"><rect width="100%" height="100%" fill="#fff"/>${r}</svg>`;
}
renderList();loadSaved();
