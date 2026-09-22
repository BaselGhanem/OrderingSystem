# حالة P1 — 2026-09-22

## 1) Race Condition للكميات — تم
- `return_allocations/{saleId}` هو دفتر الحجز المركزي.
- إنشاء المرتجع، إعادة الإرسال، تعديل تقسيم الكمية/البونص، والحذف تحدث مع تحديث الحجز داخل Transaction واحدة.
- أي Transaction ثانية على نفس Sale ID تعاد تلقائياً بواسطة Firestore ثم ترفض إذا تجاوز الإجمالي الكمية التاريخية.
- يوجد Migration Guard: إذا كانت هناك مرتجعات سابقة، يجب مزامنة دفتر الكميات من Admin مرة واحدة قبل السماح بعمليات جديدة.

## 2) Audit Trail — تم من ناحية التوقيت والذرية
- الأحداث الجديدة في `returns_requests/{requestId}/audit/{eventId}`.
- الوقت من `serverTimestamp()`.
- الحدث وتغيير المرتجع يكتبان ضمن نفس Transaction للعمليات الحساسة.
- ملاحظة: هوية المستخدم ليست Server-authenticated لأن المشروع لا يستخدم Firebase Authentication حسب القرار الحالي.

## 3) SHA-256 لملفات المبيعات — تم
- `fileHash()` يستخدم Web Crypto SHA-256 على Bytes الملف الفعلية.
- سجل الرفع يخزن `hashAlgorithm: SHA-256`.
- Upload ID مشتق من البصمة الكاملة.

## 4) Queries + Pagination — تم
- صفحات المراجعة: 75 سجل/دفعة + تحميل المزيد.
- المشرف: Query مقيدة بـ `supervisorKey` من Firestore.
- تاريخ المندوب: آخر 100 سجل مرتبة من Firestore.
- سجل الرفع: آخر 50 سجل مرتبة من Firestore.
- `firestore.indexes.json` مضاف ومربوط بـ `firebase.json`.

## المطلوب عند النشر
1. ارفع ملفات الموقع الجديدة.
2. من مجلد Returns شغّل: `firebase deploy --only firestore` لنشر Rules وIndexes.
3. افتح `Admin.html` أولاً.
4. إذا ظهر زر `مزامنة دفتر الكميات` نفذه مرة واحدة قبل إدخال مرتجعات جديدة.
5. نفّذ اختبار عملي: مرتجع ضمن الكمية، ثم محاولة ثانية تتجاوز المتبقي ويجب أن تُرفض.
