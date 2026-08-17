import QRCode from "qrcode";

function payload(items, compact = false) {
  const arr = Array.isArray(items) ? items : [];
  if (compact) return arr.map(x => `${String(x?.name || "منتج").trim()} × ${Number(x?.quantity || 1)}`).join("\n") || "لا توجد منتجات";
  return arr.map(x => {
    const n = String(x?.name || "منتج").trim();
    const v = String(x?.variant || "").trim();
    const q = Number(x?.quantity || 1);
    return v ? `${n} | ${v} | الكمية: ${q}` : `${n} | الكمية: ${q}`;
  }).join("\n") || "لا توجد منتجات";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let dataUrl;
    try {
      dataUrl = await QRCode.toDataURL(payload(body.items), { errorCorrectionLevel: "M", margin: 2, width: 600 });
    } catch (e) {
      dataUrl = await QRCode.toDataURL(payload(body.items, true), { errorCorrectionLevel: "L", margin: 2, width: 600 });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok:true, dataUrl });
  } catch (e) {
    console.error("product-qr", e);
    return res.status(400).json({ ok:false, error:"تعذر إنشاء QR المنتجات" });
  }
}
