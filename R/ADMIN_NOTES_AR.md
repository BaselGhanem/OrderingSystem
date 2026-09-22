# ملاحظات إدارة نظام المرتجعات

## Firebase
- Project ID: `dad-returns`
- حساب Firebase Console: `basel.alghanem09@gmail.com`
- هذا البريد للتذكير الإداري فقط وليس حساب دخول إلى نظام المرتجعات.

## فصل الأنظمة
- نظام المرتجعات مستقل تماماً عن نظام الطلبيات الحالي.
- لا يقرأ Collections من Ordering System ولا يكتب إليها.
- `returns_sales_chunks` هو سجل المبيعات التاريخية الفعلية المستخدم لإثبات أهلية المرتجع فقط.

## إدارة المستخدمين
- تتم من `Admin.html`.
- Collection: `returns_users_config`.
- لا يستخدم النظام Firebase Authentication.
- لا تُحفظ كلمة السر كنص صريح؛ Firestore يحتوي Salt + PBKDF2-SHA256 Hash بعدد 150,000 دورة.
- المستخدم المعطل لا يستطيع تسجيل الدخول من الواجهة.

## P1 — سلامة الكميات
- Collection: `return_allocations`.
- لكل Sale ID وثيقة حجز تحتوي الكمية الإجمالية/المدفوعة/البونص المحجوز.
- إنشاء مرتجع أو تعديل كمياته أو حذفه يحدّث الحجز والمرتجع في Transaction واحدة.
- هذا يمنع عمليتين متزامنتين من تجاوز الكمية المباعة نفسها.

## P1 — Audit
- سجل الأحداث الجديد داخل `returns_requests/{requestId}/audit`.
- `at` يأتي من `serverTimestamp()` وليس ساعة الجهاز.
- يتم تسجيل `actor`, `actorUid`, `role`, `action`, والتغييرات.
- بسبب عدم استخدام Firebase Authentication، هوية `actorUid/role` ما تزال مبنية على جلسة التطبيق في المتصفح وليست هوية Server-authenticated. التوقيت وسلامة العملية أصبحا Server-side، لكن إثبات هوية الفاعل بالكامل يحتاج Authentication أو Backend.

## P1 — ملفات المبيعات
- بصمة الملف SHA-256 كاملة.
- نفس الملف لا يعتمد مرتين.
- Sale ID لا يعتمد على soldQty/bonusQty حتى لا يتحول نفس Invoice/Batch إلى Sale جديد لمجرد تصحيح الكمية.

## P1 — الأداء
- صفحات Review/Finance/Market/Reports/Returns Manager: 75 سجلاً لكل دفعة مع `تحميل المزيد`.
- تاريخ المندوب: آخر 100 سجل.
- سجل ملفات الرفع: آخر 50 سجل.
- `firestore.indexes.json` جزء إلزامي من النشر.

## ملاحظة أمنية
بما أن الموقع Static ولا يستخدم Firebase Authentication، لا تستطيع Firestore Rules معرفة الفرق الحقيقي بين Admin ومندوب من جهة السيرفر. القواعد تقيد الوصول إلى Data Model الخاص بالمرتجعات فقط، لكنها لا توفر Role Authorization حقيقياً. هذا قرار معماري مقصود في النسخة الحالية.
