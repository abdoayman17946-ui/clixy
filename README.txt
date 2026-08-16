# CLIXY AUTO SHIPPING — V5

## What changed
- Shipping label fixed at **10 × 15 cm**.
- Reworked label to match the supplied CLIXY design: gold/black frame, CLIXY logo, policy number, fixed QR, Code 128 barcode, customer block, products, totals, COD, notes and footer.
- Fixed QR points to `https://linktr.ee/clixy.eg`.
- Code 128 is generated from `CLX-YEAR-ORDER`.
- `/` is now a multi-order dashboard:
  - load automatically saved order IDs from Vercel Blob
  - manually add several EasyOrders IDs at once (comma, spaces or Arabic comma)
  - select/unselect many orders
  - preview selected labels together
  - print selected labels in one print job, one 10×15 cm page per order
  - open any label and edit customer/payment/products before printing
- Manual edits stay in browser `localStorage` per order, so the EasyOrders source data is not overwritten.
- Edit fields include customer name, second phone, address, notes, deposit, order total, shipping, COD and product name/variant/quantity/unit price.
- COD recalculates from total minus deposit unless the user explicitly changes COD to a different value.
- Webhook behavior is preserved: new EasyOrders orders still generate/save their label automatically to Vercel Blob.

## Environment variables
- `EASYORDERS_API_KEY` — required.
- `EASYORDERS_WEBHOOK_SECRET` — optional; if configured, the webhook request must include the same secret.

## Webhook
`https://clixy-theta.vercel.app/api/easyorders`

EasyOrders webhook type: Orders.

## Important
Vercel Blob should remain connected to the project. The dashboard uses Blob to discover the saved order-label records. If Blob is unavailable, manual order-number loading still works.


V5.7 Product QR update:
- Added Product Description field in edit modal.
- Replaced product table on the 10x15 label with a compact QR containing the product description.
- Falls back to encoding the original product names/variants/quantities when description is empty.
- Location QR has no caption text.
- Header logo is forced left and main QR right.
