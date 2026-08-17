# CLIXY AUTO SHIPPING – V7.3

Product QR reliability fix:
- Product QR is generated locally through /api/product-qr using the installed qrcode package.
- No dependency on api.qrserver.com for the product QR.
- QR payload is compacted and falls back to an even smaller payload for large orders.
- Preview waits for QR generation before printing.
- The direct /api/label page also generates its product QR server-side.
- All V7.2 behavior is preserved.

V7.4: Product QR now contains a short per-order URL (/api/products?order=...), so the QR remains clean and scan-friendly even with many products. The URL opens a product list for that specific order.
