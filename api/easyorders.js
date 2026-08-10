export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "GET") {
    const id = req.query?.order;
    if (!id) return res.status(400).json({ok:false,error:"Missing order. Example: /api/easyorders?order=1"});
    const key = process.env.EASYORDERS_API_KEY;
    if (!key) return res.status(500).json({ok:false,error:"EASYORDERS_API_KEY is not configured"});
    try {
      const r = await fetch(`https://api.easy-orders.net/api/v1/external-apps/orders/short/${encodeURIComponent(id)}`, {
        headers: {"Api-Key": key, "Accept":"application/json"}
      });
      const data = await r.json();
      return res.status(r.status).json({ok:r.ok,source:"EasyOrders",short_id:String(id),data});
    } catch(e) {
      return res.status(502).json({ok:false,error:"Could not connect to EasyOrders",details:e?.message});
    }
  }
  if (req.method === "POST") {
    console.log("CLIXY_EASYORDERS_WEBHOOK", JSON.stringify(req.body || {}));
    return res.status(200).json({ok:true,received:true,service:"Clixy EasyOrders Webhook"});
  }
  return res.status(405).json({ok:false,error:"Method not allowed"});
}
