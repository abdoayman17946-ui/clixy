const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "clixy-dhPCjNq2wKWptUY9F7OLfc";

function normalizeOrder(input) {
  const o = input?.data || input?.order || input?.payload || input || {};
  const customer = o.customer || o.shipping_address || o.address || {};
  const items = o.items || o.order_items || o.products || o.line_items || [];

  const total = Number(
    o.total ?? o.total_price ?? o.amount ?? o.grand_total ?? 0
  ) || 0;

  const paid = Number(
    o.paid ?? o.paid_amount ?? o.advance_payment ?? o.prepaid_amount ?? 0
  ) || 0;

  const remaining = Math.max(0, total - paid);

  return {
    receivedAt: new Date().toISOString(),
    id: String(o.id ?? o.order_id ?? o.order_number ?? ""),
    orderNumber: String(o.order_number ?? o.orderNumber ?? o.id ?? ""),
    status: o.status ?? o.order_status ?? "",
    customer: {
      name: customer.name ?? o.customer_name ?? o.name ?? "",
      phone: customer.phone ?? o.phone ?? o.customer_phone ?? "",
      governorate: customer.governorate ?? customer.state ?? o.governorate ?? "",
      address: customer.address ?? o.address ?? o.customer_address ?? ""
    },
    items: Array.isArray(items) ? items.map((item) => ({
      name: item.name ?? item.product_name ?? item.title ?? "Product",
      quantity: Number(item.quantity ?? item.qty ?? 1) || 1,
      price: Number(item.price ?? item.unit_price ?? 0) || 0
    })) : [],
    payment: {
      total,
      paid,
      remaining,
      method: remaining > 0 ? "COD" : "PAID"
    },
    trackingNumber: String(o.tracking_number ?? o.trackingNumber ?? ""),
    courier: String(o.courier ?? o.shipping_company ?? ""),
    raw: input
  };
}

export async function GET() {
  return Response.json({
    ok: true,
    service: "Clixy EasyOrders Webhook",
    endpoint: "POST /api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc",
    message: "Webhook is ready. Configure this URL in EasyOrders after deployment."
  });
}

export async function POST(request) {
  const url = new URL(request.url);
  if (url.pathname !== `/api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc`) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const order = normalizeOrder(body);

    // Vercel Functions are stateless. This first version intentionally
    // logs the normalized order so you can verify the EasyOrders payload.
    console.log("CLIXY_EASYORDERS_ORDER", JSON.stringify(order));

    return Response.json({
      ok: true,
      received: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        payment: order.payment
      }
    });
  } catch (error) {
    console.error("CLIXY_WEBHOOK_ERROR", error);
    return Response.json(
      { ok: false, error: "Invalid JSON payload" },
      { status: 400 }
    );
  }
}
