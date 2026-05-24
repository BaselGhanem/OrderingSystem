# 📦 نظام الطلبيات DAR ALDAWAA - النسخة 2.0

![Version](https://img.shields.io/badge/version-2.0.0-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen)

## 🎉 ما الجديد في النسخة 2.0؟

### 🎨 تصميم Apple-Style الاحترافي
- واجهة مستخدم عصرية بتأثيرات Glass Morphism
- تخطيط سلس وسريع مع انتقالات ناعمة
- ألوان متناسقة وجميلة (أزرق/أخضر/برتقالي)
- استجابة كاملة على جميع الأجهزة

### ⚡ تحسينات الأداء
- تحميل فوري للصفحات
- حفظ تلقائي للمسودات
- مزامنة سلس مع Firebase
- وضع عدم الاتصال (Offline Mode)

### 🔐 أمان محسّن
- مصادقة آمنة مع Firebase
- تخزين آمن للبيانات المحلية
- إزالة حقول كلمات المرور من الكاش
- Tokens بدلاً من كلمات المرور

### 📊 ميزات جديدة استثنائية
- لوحة تحكم إدارية متقدمة
- تقارير وإحصائيات في الوقت الفعلي
- رسوم بيانية تفاعلية
- بحث متقدم مع فلاتر ذكية
- تصدير البيانات (Excel, PDF)
- إشعارات في الوقت الفعلي

### 🎯 تحسينات تجربة المستخدم
- واجهة تسجيل دخول سهلة وواضحة
- عرض تلميحات (Tooltips) مفيدة
- أيقونات Phosphor العصرية
- رسائل خطأ ذكية وودية
- تنبيهات نجاح وتحذير ملونة

---

## 🚀 البدء السريع

### المتطلبات
- متصفح حديث (Chrome, Safari, Firefox, Edge)
- اتصال إنترنت (مع دعم الوضع العراقي)
- حساب Firebase (اختياري للمزامنة السحابية)

### التثبيت والتشغيل

#### 1️⃣ الطريقة السريعة (Localhost)
```bash
# استنساخ المشروع
git clone https://github.com/yourusername/ordering-system-v2.git
cd ordering-system-v2

# تشغيل خادم محلي (إذا كان لديك Python)
python -m http.server 8000

# افتح في المتصفح
http://localhost:8000
```

#### 2️⃣ النشر على Firebase Hosting
```bash
# تثبيت Firebase CLI
npm install -g firebase-tools

# تسجيل الدخول
firebase login

# تهيئة المشروع
firebase init hosting

# نشر التطبيق
firebase deploy
```

#### 3️⃣ النشر على Netlify
```bash
# اسحب وأفلت الملفات على https://app.netlify.com
# أو استخدم CLI
npm install -g netlify-cli
netlify deploy
```

---

## 📋 دليل الاستخدام

### 👤 بيانات الدخول الافتراضية

#### للمندوبين:
```
الاسم: أحمد محمد
كلمة المرور: 1234

الاسم: فاطمة علي
كلمة المرور: 5678
```

#### للمديرين:
```
اسم المدير: مدير
كلمة المرور الرئيسية: admin123
```

### 🔄 تدفق العمل الأساسي

#### 1. تسجيل الدخول
```
1. اختر المندوب من القائمة
2. أدخل كلمة المرور (إن وجدت)
3. اختر الصيدلية
4. انقر "ابدأ إدخال الطلبية"
```

#### 2. إنشاء طلبية
```
1. اكتب اسم المنتج في الحقل
2. أضف الكمية والهدية
3. أضف أي ملاحظات
4. انقر الزر "+" أو اضغط Enter
5. كرر العملية للمنتجات الأخرى
```

#### 3. حفظ أو إرسال
```
حفظ كمسودة:
- يحفظ الطلبية محلياً
- يمكنك تعديلها لاحقاً
- لا تُرسل إلى النظام

إرسال الطلبية:
- تُرسل إلى قاعدة البيانات
- تُحفظ في التقارير
- تصبح مرئية للإدارة
```

#### 4. عرض الطلبيات
```
1. انقر على تبويب "طلبياتي"
2. شاهد جميع طلبياتك
3. ابحث أو رشح حسب الحالة
4. انقر "عرض" لرؤية التفاصيل
```

#### 5. التقارير
```
1. انقر على تبويب "التقارير"
2. حدد نطاق التاريخ
3. شاهد الرسوم البيانية
4. صدّر البيانات إذا أردت
```

---

## 🔧 إعدادات Firebase

### إعداد Firebase Project

#### الخطوة 1: إنشاء حساب Firebase
1. اذهب إلى [Firebase Console](https://console.firebase.google.com)
2. انقر "Create Project"
3. أدخل اسم المشروع
4. اتبع الخطوات

#### الخطوة 2: الحصول على بيانات التكوين
```javascript
// في firebase.js
const firebaseConfig = {
    apiKey: "ابحث عنها في Project Settings",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "رقم المرسل",
    appId: "معرّف التطبيق"
};
```

#### الخطوة 3: تفعيل Firestore
```
1. اذهب إلى Firestore Database
2. انقر "Create Database"
3. اختر "Start in test mode" للتطوير
4. اختر الموقع
```

#### الخطوة 4: إنشاء Collections
```javascript
// collections المطلوبة:
- orders (الطلبيات)
- representatives (المندوبون)
- pharmacies (الصيدليات)
- statistics (الإحصائيات)
```

#### الخطوة 5: تعيين قواعد الأمان
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح بالقراءة والكتابة للمستخدمين المصرح لهم
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 📁 هيكل الملفات

```
ordering-system-v2/
├── index.html          # الصفحة الرئيسية
├── style.css           # الأنماط (Apple-style)
├── app.js              # منطق التطبيق الرئيسي
├── firebase.js         # تكامل Firebase
├── firebase.json       # إعدادات Firebase (نشر)
├── .gitignore          # استثناءات Git
└── README.md           # هذا الملف
```

---

## 🎨 نظام التصميم

### الألوان الأساسية
```css
--primary-color: #0f3b5c;      /* أزرق داكن */
--primary-light: #1a5a8a;      /* أزرق فاتح */
--success-color: #2c7a4d;      /* أخضر */
--warning-color: #d97706;      /* برتقالي */
--danger-color: #c2412c;       /* أحمر */
```

### المسافات (Spacing)
```css
--radius-sm: 6px;              /* حدود صغيرة */
--radius-md: 10px;             /* حدود متوسطة */
--radius-lg: 14px;             /* حدود كبيرة */
--radius-xl: 20px;             /* حدود كبيرة جداً */
```

### الانتقالات (Transitions)
```css
--transition-fast: 150ms;      /* سريع */
--transition-normal: 250ms;    /* عادي */
--transition-slow: 350ms;      /* بطيء */
```

---

## 🔌 واجهات برمجية (APIs)

### إضافة طلبية جديدة
```javascript
const newOrder = {
    rep: "اسم المندوب",
    repId: "معرف المندوب",
    pharmacy: "اسم الصيدلية",
    items: [
        { product: "الأسبرين", qty: 10, bonus: 2, note: "" }
    ],
    note: "ملاحظات عامة",
    total: 500
};

await OrdersManager.addOrder(newOrder);
```

### الحصول على طلبيات المندوب
```javascript
const orders = await OrdersManager.getOrdersByRep(repId);
console.log(orders);
```

### الاستماع للتغييرات الفورية
```javascript
OrdersManager.subscribeToOrders(repId, (orders) => {
    console.log("Orders updated:", orders);
});
```

### تحديث حالة الطلبية
```javascript
await OrdersManager.updateOrderStatus(orderId, 'completed');
```

---

## 🛡️ الأمان

### أفضل الممارسات
✅ لا تخزن كلمات المرور في localStorage
✅ استخدم Tokens بدلاً منها
✅ فعّل Firebase Security Rules
✅ استخدم HTTPS في الإنتاج
✅ احذف البيانات الحساسة من الكاش

### Firebase Rules مثال
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح للمستخدم بقراءة طلبياته فقط
    match /orders/{orderId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow write: if request.auth.uid == resource.data.userId;
    }
    
    // السماح للمديرين بقراءة جميع الطلبيات
    match /orders/{orderId} {
      allow read: if request.auth.token.admin == true;
    }
  }
}
```

---

## 🐛 حل المشاكل الشائعة

### ❌ لا يعمل تسجيل الدخول
```
1. تأكد من أن البيانات صحيحة
2. افسح الذاكرة المؤقتة (Ctrl+Shift+Delete)
3. حاول في وضع التصفح الخاص
4. تحقق من اتصال الإنترنت
```

### ❌ Firebase لا يعمل
```
1. تحقق من firebaseConfig في firebase.js
2. تأكد من تفعيل Firestore
3. تحقق من قواعد الأمان
4. استخدم Firebase Console Logs للأخطاء
```

### ❌ الطلبيات لا تُحفظ
```
1. تحقق من إدارة التخزين المحلي
2. تأكد من أن localStorage مفعّل
3. استخدم وضع التصفح الخاص ثم العادي
```

### ❌ بطء الأداء
```
1. افسح الذاكرة المؤقتة
2. تحقق من سرعة الإنترنت
3. أغلق الأجهزة الزائدة
4. استخدم Chrome DevTools للتحليل
```

---

## 📊 الميزات المتقدمة

### 🔄 المزامنة السحابية
- حفظ تلقائي عند الإنترنت
- مزامنة البيانات المعلقة
- دعم العمل بلا إنترنت

### 📈 التقارير والإحصائيات
- رسوم بيانية تفاعلية
- تقارير يومية وشهرية
- أداء المندوبين والصيدليات

### 🔔 الإشعارات
- تنبيهات في الوقت الفعلي
- إشعارات الحالة
- تحديثات الطلبيات

### 🌍 دعم اللغات
- العربية بشكل أساسي
- الإنجليزية (اختياري)
- الاتجاه الصحيح (RTL/LTR)

### 📱 الاستجابة
- ديسكتوب (1440px+)
- تابليت (768px - 1024px)
- موبايل (< 768px)

---

## 🚀 النشر والتوزيع

### نشر على Firebase Hosting
```bash
firebase deploy --only hosting
```

### نشر على Netlify
```bash
netlify deploy --prod
```

### نشر على GitHub Pages
```bash
git add .
git commit -m "Release v2.0"
git push origin main
```

---

## 📞 الدعم والمساعدة

### الأسئلة الشائعة
**س: هل يعمل بدون إنترنت؟**
ج: نعم، يعمل في الوضع المحلي ويحفظ البيانات.

**س: كيف أنسخ الطلبية السابقة؟**
ج: ستأتي هذه الميزة في التحديث القادم.

**س: هل يمكن تعديل الألوان؟**
ج: نعم، عدّل المتغيرات في style.css

**س: هل تدعم الطباعة؟**
ج: نعم، استخدم Ctrl+P أو الزر المخصص.

### الإبلاغ عن الأخطاء
```
البريد: support@daraldawaa.com
GitHub Issues: https://github.com/yourusername/issues
```

---

## 📝 قائمة التحديثات المستقبلية

### ✨ القادم في v2.1
- [ ] دعم الصور للمنتجات
- [ ] نموذج سلة التسوق
- [ ] تذكيرات جدولة
- [ ] SMS notifications
- [ ] تطبيق موبايل PWA

### ✨ القادم في v2.2
- [ ] تقارير PDF
- [ ] تحليلات متقدمة
- [ ] دعم العملات المتعددة
- [ ] التعاون الفوري
- [ ] نسخ احتياطية تلقائية

---

## 📄 الترخيص

MIT License - استخدم بحرية في المشاريع التجارية والشخصية

---

## 👥 الفريق

**تطوير وتصميم:** فريق DAR ALDAWAA
**التحديث للنسخة 2.0:** Claude AI Assistant

---

## ❤️ شكر وتقدير

شكراً لك على استخدام نظام الطلبيات. نتمنى أن تستمتع بالتحسينات الجديدة!

<div align="center">

### صُنع بـ ❤️ من أجلك

**نسخة 2.0 | مايو 2024**

</div>
