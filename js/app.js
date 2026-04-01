// استيراد أدوات قاعدة البيانات من ملف firebase.js
import { db, collection, getDocs, query, where } from './firebase.js';

// تعريف عناصر الواجهة
const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');

// عناصر شاشة الفاتورة
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');

// متغيرات النظام
let productsList = []; // مصفوفة لحفظ الأصناف القادمة من فايربيس
const MAX_ROWS = 20; // الحد الأقصى للأصناف في الطلبية الواحدة

/* ==========================================
   1. وظائف التحميل الأولية (المندوبين والأصناف)
   ========================================== */

async function loadInitialData() {
    try {
        // 1. جلب المندوبين
        const repsSnapshot = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر اسم المندوب --</option>';
        repsSnapshot.forEach((doc) => {
            const rep = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = rep.name;
            repSelect.appendChild(option);
        });
        repSelect.disabled = false;

        // 2. جلب الأصناف وتخزينها في المصفوفة
        const productsSnapshot = await getDocs(collection(db, "products"));
        productsSnapshot.forEach((doc) => {
            productsList.push({ id: doc.id, ...doc.data() });
        });
        
        // ترتيب الأصناف أبجدياً لسهولة البحث
        productsList.sort((a, b) => a.name.localeCompare(b.name));
        
        console.log(`تم تحميل ${productsList.length} صنف بنجاح.`);

    } catch (error) {
        console.error("حدث خطأ في جلب البيانات: ", error);
        alert("حدث خطأ في الاتصال بقاعدة البيانات. الرجاء تحديث الصفحة.");
    }
}

// 2. وظيفة جلب الصيدليات عند اختيار مندوب
repSelect.addEventListener('change', async (e) => {
    const selectedRepId = e.target.value;
    
    if (!selectedRepId) {
        pharmacySelect.innerHTML = '<option value="">اختر المندوب أولاً...</option>';
        pharmacySelect.disabled = true;
        startOrderBtn.disabled = true;
        return;
    }

    pharmacySelect.innerHTML = '<option value="">جاري تحميل الصيدليات...</option>';
    pharmacySelect.disabled = true;
    startOrderBtn.disabled = true;

    try {
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
        
        pharmacySelect.disabled = false;
    } catch (error) {
        console.error("حدث خطأ في جلب الصيدليات: ", error);
        pharmacySelect.innerHTML = '<option value="">حدث خطأ في التحميل</option>';
    }
});

// 3. تفعيل زر (بدء الطلبية)
pharmacySelect.addEventListener('change', (e) => {
    startOrderBtn.disabled = !e.target.value;
});


/* ==========================================
   2. وظائف شاشة الفاتورة (الانتقال والعمليات)
   ========================================== */

startOrderBtn.addEventListener('click', () => {
    const repName = repSelect.options[repSelect.selectedIndex].text;
    const pharmacyName = pharmacySelect.options[pharmacySelect.selectedIndex].text;

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${repName}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacyName;

    // إضافة أول سطر تلقائياً عند فتح الفاتورة
    if (orderBody.children.length === 0) {
        addNewRow();
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if(confirm("هل أنت متأكد من الخروج؟ سيتم مسح الطلبية الحالية.")){
        repSelect.value = "";
        pharmacySelect.innerHTML = '<option value="">اختر المندوب أولاً...</option>';
        pharmacySelect.disabled = true;
        startOrderBtn.disabled = true;
        
        // تفريغ الفاتورة
        orderBody.innerHTML = '';
        updateGrandTotal();

        document.getElementById('orderScreen').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
    }
});


/* ==========================================
   3. الحسابات الديناميكية وجدول الطلبية (Live Calculation)
   ========================================== */

// دالة لإنشاء قائمة الخيارات (Dropdown) للأصناف
function getProductsOptionsHTML() {
    let options = '<option value="">-- اختر الصنف --</option>';
    productsList.forEach(prod => {
        options += `<option value="${prod.id}" data-price="${prod.price}">${prod.name} (${prod.code})</option>`;
    });
    return options;
}

// دالة تحديث الإجمالي الكلي
function updateGrandTotal() {
    let total = 0;
    const rowTotals = document.querySelectorAll('.row-total');
    rowTotals.forEach(cell => {
        total += parseFloat(cell.innerText) || 0;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

// دالة إضافة سطر جديد للفاتورة
function addNewRow() {
    // التحقق من الحد الأقصى
    if (orderBody.children.length >= MAX_ROWS) {
        alert("لا يمكن إضافة أكثر من 20 صنف في الطلبية الواحدة!");
        return;
    }

    const tr = document.createElement('tr');

    tr.innerHTML = `
        <td>
            <select class="product-select" required>
                ${getProductsOptionsHTML()}
            </select>
        </td>
        <td><input type="number" class="qty-input" min="1" value="1" required></td>
        <td><input type="number" class="bonus-input" min="0" value="0"></td>
        <td class="price-cell">0.00</td>
        <td class="row-total" style="font-weight: bold; color: var(--primary-color);">0.00</td>
        <td><button type="button" class="btn-danger delete-btn" title="حذف الصنف"><i class="ph ph-trash"></i></button></td>
    `;

    // 1. برمجة تغيير الصنف (تحديث السعر والتحقق من التكرار)
    const selectEl = tr.querySelector('.product-select');
    const priceCell = tr.querySelector('.price-cell');
    const qtyInput = tr.querySelector('.qty-input');
    const rowTotalCell = tr.querySelector('.row-total');

    selectEl.addEventListener('change', function() {
        // التحقق من عدم تكرار الصنف في سطور أخرى
        const selectedValue = this.value;
        if (selectedValue !== "") {
            const allSelects = document.querySelectorAll('.product-select');
            let count = 0;
            allSelects.forEach(sel => { if (sel.value === selectedValue) count++; });
            
            if (count > 1) {
                alert("هذا الصنف موجود مسبقاً في الطلبية!");
                this.value = ""; // إعادة تعيين القائمة
                priceCell.innerText = "0.00";
                rowTotalCell.innerText = "0.00";
                updateGrandTotal();
                return;
            }
        }

        // جلب السعر من الـ data-price
        const selectedOption = this.options[this.selectedIndex];
        const price = parseFloat(selectedOption.getAttribute('data-price')) || 0;
        
        priceCell.innerText = price.toFixed(2);
        
        // حساب المجموع للسطر
        calculateRowTotal();
    });

    // 2. برمجة تغيير الكمية (حساب المجموع فوراً)
    qtyInput.addEventListener('input', calculateRowTotal);

    function calculateRowTotal() {
        const qty = parseFloat(qtyInput.value) || 0;
        const price = parseFloat(priceCell.innerText) || 0;
        const rowTotal = qty * price;
        rowTotalCell.innerText = rowTotal.toFixed(2);
        
        // تحديث الإجمالي الكلي للفاتورة
        updateGrandTotal();
    }

    // 3. برمجة زر الحذف
    const deleteBtn = tr.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => {
        tr.remove();
        updateGrandTotal();
    });

    // إضافة السطر إلى الجدول
    orderBody.appendChild(tr);
}

// ربط زر "إضافة صنف" بالدالة
addRowBtn.addEventListener('click', addNewRow);

// تشغيل التحميل عند فتح الصفحة
loadInitialData();
