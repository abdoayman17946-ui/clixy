import { list } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const out = [];
    let cursor = undefined;
    for (let page = 0; page < 5; page++) {
      const result = await list({ prefix: "shipping-labels/order-", limit: 1000, cursor });
      for (const blob of result.blobs || []) {
        const match = String(blob.pathname || "").match(/^shipping-labels\/order-(.+)\.html$/);
        if (match) out.push({ id: match[1], updatedAt: blob.uploadedAt || null, url: blob.url || null });
      }
      if (!result.hasMore) break;
      cursor = result.cursor;
    }
    const unique = [...new Map(out.map(x => [x.id, x])).values()]
      .sort((a,b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return res.status(200).json({ ok: true, orders: unique.slice(0, 200) });
  } catch (e) {
    return res.status(200).json({ ok: false, orders: [], error: "Blob storage is not available" });
  }
}
