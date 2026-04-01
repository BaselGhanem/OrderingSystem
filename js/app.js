// 1. استيراد الأدوات من ملف firebase.js
import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc } from './firebase.js';

// --- تعريف العناصر الأساسية ---
const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');

// عناصر النافذة المنبثقة (Modal)
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

let productsList = []; 
const MAX_ROWS = 20; 

// --- 2. تحميل البيانات الأساسية (مناديب + أصناف) ---
async function loadInitialData() {
    try {
        const repsSnapshot = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر اسم المندوب --</option>';
        repsSnapshot.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = doc.data().name;
            repSelect.appendChild(option);
        });
        repSelect.disabled = false;

        const prodSnapshot = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnapshot.forEach(doc => productsList.push({ id: doc.id, ...doc.data() }));
        productsList.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { console.error("خطأ في التحميل:", e); }
}

// جلب صيدليات المندوب عند الاختيار
repSelect.addEventListener('change', async (e) => {
    const repId = e.target.value;
    if (!repId) return;
    pharmacySelect.innerHTML = '<option>جاري التحميل...</option>';
    const q = query(collection(db, "pharmacies"), where("rep_id", "==", repId));
    const snap = await getDocs(q);
    pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';
    snap.forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = doc.data().name;
        pharmacySelect.appendChild(opt);
    });
    pharmacySelect.disabled = false;
});

pharmacySelect.addEventListener('change', () => startOrderBtn.disabled = !pharmacySelect.value);

// --- 3. إدارة التبويبات والشاشات ---
startOrderBtn.addEventListener('click', () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<b>${repSelect.options[repSelect.selectedIndex].text}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacySelect.options[pharmacySelect.selectedIndex].text;
    if (orderBody.children.length === 0) addNewRow();
});

document.getElementById('navOrderBtn').addEventListener('click', () => {
    document.getElementById('reportsScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navOrderBtn').classList.add('active');
});

document.getElementById('navReportsBtn').addEventListener('click', () => {
    document.getElementById('orderScreen').style.display = 'none';
    document.getElementById('reportsScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navReportsBtn').classList.add('active');
    loadReports();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if(confirm("هل أنت متأكد من الخروج؟ سيتم مسح أي بيانات غير محفوظة.")) location.reload();
});

// --- 4. منطق جدول الطلبية (Live Calculation) ---
function addNewRow() {
    if (orderBody.children.length >= MAX_ROWS) return alert("الحد الأقصى 20 صنف!");
    const tr = document.createElement('tr');
    let options = '<option value="">-- اختر الصنف --</option>';
    productsList.forEach(p => options += `<option value="${p.id}" data-price="${p.price}">${p.name}</option>`);
    
    tr.innerHTML = `
        <td><select class="product-select">${options}</select></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="bonus-input" value="0" min="0"></td>
        <td class="price-cell">0.00</td>
        <td class="row-total">0.00</td>
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;

    const sel = tr.querySelector('.product-select');
    const qty = tr.querySelector('.qty-input');
    const bns = tr.querySelector('.bonus-input');
    const prc = tr.querySelector('.price-cell');
    const tot = tr.querySelector('.row-total');

    sel.onchange = () => {
        const p = parseFloat(sel.options[sel.selectedIndex].dataset.price) || 0;
        prc.innerText = p.toFixed(2);
        tot.innerText = (p * qty.value).toFixed(2);
        updateGrandTotal();
    };
    qty.oninput = () => {
        tot.innerText = (parseFloat(prc.innerText) * qty.value).toFixed(2);
        updateGrandTotal();
    };
    tr.querySelector('.del-row').onclick = () => { tr.remove(); updateGrandTotal(); };
    orderBody.appendChild(tr);
}

addRowBtn.onclick = addNewRow;

function updateGrandTotal() {
    let gTotal = 0;
    document.querySelectorAll('.row-total').forEach(td => gTotal += parseFloat(td.innerText) || 0);
    grandTotalEl.innerText = gTotal.toFixed(2);
}

// --- 5. إرسال الطلبية لـ Firebase ---
submitOrderBtn.addEventListener('click', async () => {
    const rows = document.querySelectorAll('#orderBody tr');
    const items = [];
    rows.forEach(r => {
        const s = r.querySelector('.product-select');
        if (s.value) {
            items.push({
                productName: s.options[s.selectedIndex].text,
                qty: r.querySelector('.qty-input').value,
                bonus: r.querySelector('.bonus-input').value || 0,
                price: r.querySelector('.price-cell').innerText,
                total: r.querySelector('.row-total').innerText
            });
        }
    });

    if (items.length === 0) return alert("يرجى إضافة صنف واحد على الأقل.");

    const orderData = {
        repName: repSelect.options[repSelect.selectedIndex].text,
        pharmacyName: pharmacySelect.options[pharmacySelect.selectedIndex].text,
        items: items,
        grandTotal: parseFloat(grandTotalEl.innerText),
        createdAt: new Date(),
        status: "Pending"
    };

    try {
        submitOrderBtn.disabled = true;
        await addDoc(collection(db, "orders"), orderData);
        alert("✅ تم إرسال الطلبية بنجاح!");
        location.reload();
    } catch (e) { alert("خطأ في الإرسال"); submitOrderBtn.disabled = false; }
});

// --- 6. التقارير (العرض، التفاصيل، الحذف) ---
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        body.innerHTML = '';
        let orders = [];
        snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        orders.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        orders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${order.id.substring(0,5).toUpperCase()}</b></td>
                <td>${order.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${order.repName}</td>
                <td>${order.pharmacyName}</td>
                <td>${order.grandTotal.toFixed(2)}</td>
                <td><span class="status-badge">قيد الانتظار</span></td>
                <td class="actions-cell">
                    <button class="btn-view" title="عرض الأصناف"><i class="ph ph-eye"></i></button>
                    <button class="btn-delete-report" title="حذف"><i class="ph ph-trash"></i></button>
                </td>
            `;
            // أزرار الإجراءات
            tr.querySelector('.btn-view').onclick = () => viewOrderDetails(order.items);
            tr.querySelector('.btn-delete-report').onclick = () => deleteOrder(order.id);
            body.appendChild(tr);
        });
    } catch (e) { body.innerHTML = '<tr><td colspan="7">خطأ في جلب البيانات</td></tr>'; }
}

async function deleteOrder(id) {
    if (confirm("هل أنت متأكد من حذف هذه الطلبية نهائياً؟")) {
        await deleteDoc(doc(db, "orders", id));
        loadReports();
    }
}

function viewOrderDetails(items) {
    modalItemsBody.innerHTML = '';
    items.forEach(item => {
        modalItemsBody.innerHTML += `
            <tr>
                <td>${item.productName || item.name}</td>
                <td>${item.qty}</td>
                <td>${item.bonus}</td>
                <td>${item.price}</td>
                <td>${item.total}</td>
            </tr>`;
    });
    detailsModal.style.display = 'flex';
}

// إغلاق المودال
window.closeModal = () => detailsModal.style.display = 'none';
window.onclick = (e) => { if(e.target == detailsModal) closeModal(); };

// تصدير إكسل
document.getElementById('exportExcelBtn').onclick = () => {
    XLSX.writeFile(XLSX.utils.table_to_book(document.getElementById('reportsTable')), "DAR_ALDAWAA_Orders.xlsx");
};

loadInitialData();
