const TOKEN = process.env.WEBHOOK_TOKEN || "clixy-dhPCjNq2wKWptUY9F7OLfc";
module.exports = async function handler(req, res) {
  const path = req.url.split("?")[0];
  if (path !== "/api/easyorders/" + TOKEN) return res.status(404).json({ok:false,error:"Not found"});
  if (req.method === "GET") return res.status(200).json({ok:true,service:"Clixy EasyOrders Webhook",message:"Webhook is ready"});
  if (req.method !== "POST") return res.status(405).json({ok:false,error:"Method not allowed"});
  try {
    const b=req.body||{}, o=b.data||b.order||b.payload||b;
    const c=o.customer||o.shipping_address||o.address||{};
    const items=o.items||o.order_items||o.products||o.line_items||[];
    const total=Number(o.total??o.total_price??o.amount??o.grand_total??0)||0;
    const paid=Number(o.paid??o.paid_amount??o.advance_payment??o.prepaid_amount??0)||0;
    const order={orderNumber:String(o.order_number??o.orderNumber??o.id??""),status:o.status??o.order_status??"",
      customer:{name:c.name??o.customer_name??o.name??"",phone:c.phone??o.phone??o.customer_phone??"",
      governorate:c.governorate??c.state??o.governorate??"",address:c.address??o.address??o.customer_address??""},
      items:Array.isArray(items)?items.map(x=>({name:x.name??x.product_name??x.title??"Product",quantity:Number(x.quantity??x.qty??1)||1,price:Number(x.price??x.unit_price??0)||0})):[],
      payment:{total,paid,remaining:Math.max(0,total-paid),method:total-paid>0?"COD":"PAID"},
      trackingNumber:String(o.tracking_number??o.trackingNumber??""),courier:String(o.courier??o.shipping_company??"")};
    console.log("CLIXY_EASYORDERS_ORDER",JSON.stringify(b));
    return res.status(200).json({ok:true,received:true,order});
  } catch(e) { console.error(e); return res.status(400).json({ok:false,error:"Invalid request body"}); }
};
