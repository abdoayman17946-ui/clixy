CLIXY AUTO SHIPPING - EDITABLE LABEL V4

Webhook:
https://clixy-theta.vercel.app/api/easyorders
Type: Orders
Enabled: ON

The label now has:
- Fixed QR: https://linktr.ee/clixy.eg
- Code 128 barcode based on CLX-YEAR-ORDER
- Edit button for deposit, second phone, customer name, address and notes
- COD is recalculated automatically: order total - deposit
- If deposit is 0, COD is the full order total
- If deposit equals/exceeds total, label shows PAID / 0 COD

IMPORTANT:
The manual edits are stored in the browser localStorage for that order. This avoids exposing customer/payment overrides publicly in Blob storage. If you open the same order on another browser/device, its EasyOrders values will load and the manual override will need to be entered there.

Vercel Blob must remain connected to the project for automatic saved label records.
