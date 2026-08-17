import { put, list } from "@vercel/blob";

export default async function handler(req, res) {
  const id = String(req.query?.order || req.body?.order || "").trim();
  if (!id) return res.status(400).json({ ok:false, error:"رقم الطلب مطلوب" });
  try {
    if (req.method === "GET") {
      const result = await list({ prefix: `shipping-label-overrides/order-${id}.json`, limit: 5 });
      const blob = (result.blobs || [])[0];
      if (!blob?.url) return res.status(200).json({ ok:true, override:null });
      const r = await fetch(blob.url, { cache:"no-store" });
      const data = r.ok ? await r.json() : null;
      return res.status(200).json({ ok:true, override:data });
    }
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const data = { ...body, order:id, savedAt:new Date().toISOString() };
    await put(`shipping-label-overrides/order-${id}.json`, JSON.stringify(data), { access:"public", addRandomSuffix:false, contentType:"application/json" });
    return res.status(200).json({ ok:true, override:data });
  } catch (e) {
    console.error("order-overrides", e);
    return res.status(500).json({ ok:false, error:"تعذر حفظ/قراءة تعديلات البوليصة" });
  }
}
