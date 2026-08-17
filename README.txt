# CLIXY AUTO SHIPPING – V7.3

Product QR reliability fix:
- Product QR is generated locally through /api/product-qr using the installed qrcode package.
- No dependency on api.qrserver.com for the product QR.
- QR payload is compacted and falls back to an even smaller payload for large orders.
- Preview waits for QR generation before printing.
- The direct /api/label page also generates its product QR server-side.
- All V7.2 behavior is preserved.
