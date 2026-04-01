// استيراد أدوات قاعدة البيانات من ملف firebase.js
import { db, collection, getDocs, query, where } from './firebase.js';

// تعريف عناصر الواجهة
const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');

// 1. وظيفة جلب المندوبين عند فتح الصفحة
async function loadReps() {
    try {
        const querySnapshot = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر اسم المندوب --</option>'; // تفريغ القائمة
        
        querySnapshot.forEach((doc) => {
            const rep = doc.data();
            const option = document.createElement('option');
            option.value = doc.id; // نحفظ الـ ID لكي نبحث به عن الصيدليات لاحقاً
            option.textContent = rep.name;
            repSelect.appendChild(option);
        });
        
        repSelect.disabled = false; // تفعيل القائمة بعد انتهاء التحميل
    } catch (error) {
        console.error("حدث خطأ في جلب المندوبين: ", error);
        repSelect.innerHTML = '<option value="">حدث خطأ في التحميل</option>';
    }
}

// 2. وظيفة جلب الصيدليات عند اختيار مندوب
repSelect.addEventListener('change', async (e) => {
    const selectedRepId = e.target.value;
    
    // إذا اختار "-- اختر اسم المندوب --" (قيمة فارغة)
    if (!selectedRepId) {
        pharmacySelect.innerHTML = '<option value="">اختر المندوب أولاً...</option>';
        pharmacySelect.disabled = true;
        startOrderBtn.disabled = true;
        return;
    }

    // إظهار حالة التحميل للصيدليات
    pharmacySelect.innerHTML = '<option value="">جاري تحميل الصيدليات...</option>';
    pharmacySelect.disabled = true;
    startOrderBtn.disabled = true;

    try {
        // استعلام ذكي: اجلب الصيدليات التي يكون حقل rep_id فيها يساوي ID المندوب المختار
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", selectedRepId));
        const querySnapshot = await getDocs(q);
        
        pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';
        
        if (querySnapshot.empty) {
            pharmacySelect.innerHTML = '<option value="">لا يوجد صيدليات مرتبطة بهذا المندوب</option>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const pharmacy = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = pharmacy.name;
            pharmacySelect.appendChild(option);
        });
        
        pharmacySelect.disabled = false; // تفعيل قائمة الصيدليات
    } catch (error) {
        console.error("حدث خطأ في جلب الصيدليات: ", error);
        pharmacySelect.innerHTML = '<option value="">حدث خطأ في التحميل</option>';
    }
});

// 3. تفعيل زر (بدء الطلبية) فقط عند اختيار صيدلية
pharmacySelect.addEventListener('change', (e) => {
    if (e.target.value) {
        startOrderBtn.disabled = false;
    } else {
        startOrderBtn.disabled = true;
    }
});

// تشغيل وظيفة جلب المندوبين فوراً
loadReps();

/* ==========================================
   الأكواد الجديدة: الانتقال بين الشاشات
   ========================================== */

// 4. الانتقال إلى شاشة الفاتورة عند الضغط على (بدء إدخال الطلبية)
startOrderBtn.addEventListener('click', () => {
    // جلب أسماء المندوب والصيدلية من القوائم
    const repName = repSelect.options[repSelect.selectedIndex].text;
    const pharmacyName = pharmacySelect.options[pharmacySelect.selectedIndex].text;

    // إخفاء شاشة تسجيل الدخول
    document.getElementById('loginScreen').style.display = 'none';
    
    // إظهار شاشة الفاتورة
    document.getElementById('orderScreen').style.display = 'block';
    
    // إظهار الشريط العلوي (اسم المندوب وزر الخروج)
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${repName}</b>`;
    
    // وضع اسم الصيدلية في ترويسة الفاتورة
    document.getElementById('orderPharmacyName').innerText = pharmacyName;
});

// 5. برمجة زر تسجيل الخروج (العودة للشاشة الأولى)
document.getElementById('logoutBtn').addEventListener('click', () => {
    // إعادة تعيين القوائم كما كانت
    repSelect.value = "";
    pharmacySelect.innerHTML = '<option value="">اختر المندوب أولاً...</option>';
    pharmacySelect.disabled = true;
    startOrderBtn.disabled = true;

    // إخفاء شاشة الطلبية والهيدر، وإظهار شاشة الدخول
    document.getElementById('orderScreen').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
});
