// Clixy + EasyOrders API
// Vercel Serverless Function: /api/easyorders
//
// Required Environment Variable in Vercel:
// EASYORDERS_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiKey = process.env.EASYORDERS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "EASYORDERS_API_KEY is not configured in Vercel"
    });
  }

  // GET /api/easyorders?order=17
  // Gets one EasyOrders order by its numeric Short ID.
  if (req.method === "GET") {
    const shortId =
      req.query?.order ||
      req.query?.short_id ||
      req.query?.shortId;

    if (!shortId) {
      return res.status(400).json({
        ok: false,
        error: "Missing order number. Example: /api/easyorders?order=17"
      });
    }

    const cleanId = String(shortId).trim();

    if (!/^\d+$/.test(cleanId)) {
      return res.status(400).json({
        ok: false,
        error: "Order Short ID must be numeric"
      });
    }

    const url =
      `https://api.easy-orders.net/api/v1/external-apps/orders/short/${encodeURIComponent(cleanId)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
          "Accept": "application/json"
        }
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      return res.status(response.status).json({
        ok: response.ok,
        source: "EasyOrders",
        short_id: cleanId,
        data
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error: "Could not connect to EasyOrders",
        details: error?.message || String(error)
      });
    }
  }

  // Keep the endpoint available for the existing EasyOrders Webhook.
  if (req.method === "POST") {
    return res.status(200).json({
      ok: true,
      service: "Clixy EasyOrders Webhook",
      message: "Webhook received",
      received: req.body ?? null
    });
  }

  return res.status(405).json({
    ok: false,
    error: "Method not allowed"
  });
}
