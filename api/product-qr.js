import QRCode from "qrcode";

const DEFAULT_APP_URL = "https://clixy-theta.vercel.app";

function getOrigin(req) {
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  return host ? `${proto}://${host}` : DEFAULT_APP_URL;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const order = String(body.order || "").trim();

    // The QR carries only a short URL, not the full product list.
    // This keeps the QR simple and much easier for phone cameras to scan.
    if (!order) {
      return res.status(400).json({ ok:false, error:"رقم البوليصة مطلوب لإنشاء QR المنتجات" });
    }

    const url = `${getOrigin(req)}/api/products?order=${encodeURIComponent(order)}`;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 800,
      color: { dark: "#000000", light: "#ffffff" }
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok:true, dataUrl, url });
  } catch (e) {
    console.error("product-qr", e);
    return res.status(400).json({ ok:false, error:"تعذر إنشاء QR المنتجات" });
  }
}
