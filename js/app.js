// استيراد أدوات قاعدة البيانات (+ إضافة addDoc للحفظ)
import { db, collection, getDocs, query, where, addDoc } from './firebase.js';

const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');

const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');

let productsList = []; 
const MAX_ROWS = 20; 

// --- 1. التحميل المبدئي ---
async function loadInitialData() {
    try {
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

        const productsSnapshot = await getDocs(collection(db, "products"));
        productsSnapshot.forEach((doc) => {
            productsList.push({ id: doc.id, ...doc.data() });
        });
        productsList.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error("خطأ", error);
    }
}

repSelect.addEventListener('change', async (e) => {
    const selectedRepId = e.target.value;
    if (!selectedRepId) {
        pharmacySelect.innerHTML = '<option value="">اختر المندوب أولاً...</option>';
        pharmacySelect.disabled = true;
        startOrderBtn.disabled = true;
        return;
    }
    pharmacySelect.innerHTML = '<option value="">جاري التحميل...</option>';
    pharmacySelect.disabled = true;
    try {
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", selectedRepId));
        const querySnapshot = await getDocs(q);
        pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';
        querySnapshot.forEach((doc) => {
            const pharmacy = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = pharmacy.name;
            pharmacySelect.appendChild(option);
        });
        pharmacySelect.disabled = false;
    } catch (error) {
        console.error(error);
    }
});

pharmacySelect.addEventListener('change', (e) => {
    startOrderBtn.disabled = !e.target.value;
});

// --- 2. إدارة الشاشات والتبويبات ---
startOrderBtn.addEventListener('click', () => {
    const repName = repSelect.options[repSelect.selectedIndex].text;
    const pharmacyName = pharmacySelect.options[pharmacySelect.selectedIndex].text;

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${repName}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacyName;

    if (orderBody.children.length === 0) addNewRow();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if(confirm("هل أنت متأكد من الخروج؟ سيتم مسح الطلبية الحالية.")){
        location.reload(); // أسهل طريقة لتصفير كل شيء
    }
});

// التنقل بين شاشة الطلبية والتقارير
document.getElementById('navOrderBtn').addEventListener('click', () => {
    document.getElementById('reportsScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('navReportsBtn').classList.remove('active');
    document.getElementById('navOrderBtn').classList.add('active');
});

document.getElementById('navReportsBtn').addEventListener('click', () => {
    document.getElementById('orderScreen').style.display = 'none';
    document.getElementById('reportsScreen').style.display = 'block';
    document.getElementById('navOrderBtn').classList.remove('active');
    document.getElementById('navReportsBtn').classList.add('active');
    
    // جلب التقارير من فايربيس
    loadReports();
});

// --- 3. ديناميكية الفاتورة ---
function getProductsOptionsHTML() {
    let options = '<option value="">-- اختر الصنف --</option>';
    productsList.forEach(prod => {
        options += `<option value="${prod.id}" data-price="${prod.price}">${prod.name} (${prod.code})</option>`;
    });
    return options;
}

function updateGrandTotal() {
    let total = 0;
    document.querySelectorAll('.row-total').forEach(cell => {
        total += parseFloat(cell.innerText) || 0;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

function addNewRow() {
    if (orderBody.children.length >= MAX_ROWS) return alert("الحد الأقصى 20 صنف!");
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><select class="product-select" required>${getProductsOptionsHTML()}</select></td>
        <td><input type="number" class="qty-input" min="1" value="1" required></td>
        <td><input type="number" class="bonus-input" min="0" value="0"></td>
        <td class="price-cell">0.00</td>
        <td class="row-total" style="font-weight: bold; color: var(--primary-color);">0.00</td>
        <td><button type="button" class="btn-danger delete-btn"><i class="ph ph-trash"></i></button></td>
    `;
    
    const selectEl = tr.querySelector('.product-select');
    const priceCell = tr.querySelector('.price-cell');
    const qtyInput = tr.querySelector('.qty-input');
    const rowTotalCell = tr.querySelector('.row-total');

    selectEl.addEventListener('change', function() {
        if (this.value !== "") {
            let count = 0;
            document.querySelectorAll('.product-select').forEach(sel => { if (sel.value === this.value) count++; });
            if (count > 1) {
                alert("هذا الصنف موجود مسبقاً في الفاتورة!");
                this.value = ""; priceCell.innerText = "0.00"; rowTotalCell.innerText = "0.00";
                updateGrandTotal(); return;
            }
        }
        const selectedOption = this.options[this.selectedIndex];
        priceCell.innerText = (parseFloat(selectedOption.getAttribute('data-price')) || 0).toFixed(2);
        calculateRowTotal();
    });

    qtyInput.addEventListener('input', calculateRowTotal);

    function calculateRowTotal() {
        const rowTotal = (parseFloat(qtyInput.value) || 0) * (parseFloat(priceCell.innerText) || 0);
        rowTotalCell.innerText = rowTotal.toFixed(2);
        updateGrandTotal();
    }

    tr.querySelector('.delete-btn').addEventListener('click', () => { tr.remove(); updateGrandTotal(); });
    orderBody.appendChild(tr);
}
addRowBtn.addEventListener('click', addNewRow);

// --- 4. إرسال الطلبية لـ Firebase ---
submitOrderBtn.addEventListener('click', async () => {
    const rows = document.querySelectorAll('#orderBody tr');
    if (rows.length === 0) return alert("الفاتورة فارغة!");

    let items = [], isValid = true;
    rows.forEach(row => {
        const productSelect = row.querySelector('.product-select');
        if (!productSelect.value) { isValid = false; return; }
        
        items.push({
            productId: productSelect.value,
            productName: productSelect.options[productSelect.selectedIndex].text.split(' (')[0],
            quantity: parseInt(row.querySelector('.qty-input').value) || 0,
            bonus: parseInt(row.querySelector('.bonus-input').value) || 0,
            price: parseFloat(row.querySelector('.price-cell').innerText),
            total: parseFloat(row.querySelector('.row-total').innerText)
        });
    });

    if (!isValid) return alert("يرجى اختيار صنف لجميع الأسطر.");

    const orderData = {
        repName: repSelect.options[repSelect.selectedIndex].text,
        pharmacyName: pharmacySelect.options[pharmacySelect.selectedIndex].text,
        items: items,
        grandTotal: parseFloat(grandTotalEl.innerText),
        createdAt: new Date(), // تاريخ الوقت الحالي
        status: "Pending" // حالة الطلبية
    };

    try {
        submitOrderBtn.disabled = true;
        submitOrderBtn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري الإرسال...";
        
        await addDoc(collection(db, "orders"), orderData); // حفظ الطلبية
        
        alert("✅ تم إرسال الطلبية بنجاح واعتمادها في النظام!");
        location.reload(); // تحديث الصفحة لطلب جديد
    } catch (error) {
        console.error("خطأ:", error);
        alert("حدث خطأ أثناء الإرسال!");
        submitOrderBtn.disabled = false;
        submitOrderBtn.innerHTML = "<i class='ph ph-paper-plane-tilt'></i> إعتماد وإرسال الطلبية";
    }
});

// --- 5. جلب وعرض التقارير وتصديرها ---
async function loadReports() {
    const reportsBody = document.getElementById('reportsBody');
    reportsBody.innerHTML = '<tr><td colspan="6">جاري جلب الطلبيات...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "orders"));
        reportsBody.innerHTML = '';
        
        if (querySnapshot.empty) {
            reportsBody.innerHTML = '<tr><td colspan="6">لا توجد طلبيات مسجلة حتى الآن.</td></tr>';
            return;
        }

        // ترتيب الطلبيات من الأحدث للأقدم
        let ordersArray = [];
        querySnapshot.forEach(doc => ordersArray.push({ id: doc.id, ...doc.data() }));
        ordersArray.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        ordersArray.forEach(order => {
            const dateStr = order.createdAt.toDate().toLocaleString('ar-JO');
            const statusText = order.status === 'Pending' ? 'قيد الانتظار' : order.status;
            
            reportsBody.innerHTML += `
                <tr>
                    <td><b>${order.id.substring(0,6).toUpperCase()}</b></td>
                    <td dir="ltr">${dateStr}</td>
                    <td>${order.repName}</td>
                    <td>${order.pharmacyName}</td>
                    <td style="color: var(--primary-color); font-weight: bold;">${order.grandTotal.toFixed(2)}</td>
                    <td><span class="status-badge">${statusText}</span></td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("خطأ:", error);
        reportsBody.innerHTML = '<tr><td colspan="6">حدث خطأ في جلب التقارير!</td></tr>';
    }
}

// تصدير الإكسل
document.getElementById('exportExcelBtn').addEventListener('click', () => {
    const table = document.getElementById('reportsTable');
    const wb = XLSX.utils.table_to_book(table, {sheet: "الطلبيات"});
    XLSX.writeFile(wb, "تقرير_طلبيات_دار_الدواء.xlsx");
});

// التشغيل الأولي
loadInitialData();
