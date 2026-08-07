# Clixy EasyOrders Webhook

هذا المشروع هو نقطة استقبال Webhook لمتجر Clixy على EasyOrders، مع قالب بوليصة شحن 10×15 سم.

## 1) النشر على Vercel

ارفع المجلد إلى GitHub ثم استورده في Vercel، أو استخدم Vercel CLI.

بعد النشر سيكون لديك دومين مثل:
https://YOUR-PROJECT.vercel.app

## 2) رابط Webhook في EasyOrders

استخدم:

https://YOUR-PROJECT.vercel.app/api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc

في EasyOrders:
- URL = الرابط أعلاه
- Description = Clixy Shipping Labels
- Type = Orders
- Active = ON

## 3) اختبار سريع

افتح:
https://YOUR-PROJECT.vercel.app/api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc

يجب أن تظهر رسالة JSON تفيد أن الـWebhook جاهز.

## 4) اختبار استقبال POST

يمكنك إرسال JSON تجريبي إلى نفس الرابط. النظام يقبل أكثر من شكل شائع للطلب ويطبع نسخة normalized في Vercel Logs.

## ملاحظة مهمة

هذه النسخة الأولى لا تستخدم قاعدة بيانات؛ Vercel Functions ليست مكانًا مناسبًا لحفظ الطلبات بشكل دائم داخل ذاكرة الوظيفة.
بعد التأكد من شكل Payload الذي يرسله EasyOrders، الخطوة التالية هي إضافة قاعدة بيانات (مثل Neon/Supabase) ولوحة تحكم للطلبات، ثم جعل زر "طباعة" ينشئ البوليصة تلقائيًا لكل طلب.

## API
- GET /api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc = فحص جاهزية الـWebhook
- POST /api/easyorders/clixy-dhPCjNq2wKWptUY9F7OLfc = استقبال الطلبات
- GET /api/label = نموذج بوليصة 10×15

## رابط البوليصة التجريبي

يمكن تمرير بيانات تجريبية عبر query string إلى /api/label، مثل order وname وphone وtotal وpaid وremaining وtracking.
