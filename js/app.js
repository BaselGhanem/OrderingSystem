import { db, collection, getDocs, query, where, addDoc } from './firebase.js';

// --- تعريف العناصر ---
const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');

let productsList = []; 
const MAX_ROWS = 20; 

// --- 1. تحميل البيانات الأساسية ---
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

// جلب صيدليات المندوب
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

// --- 2. إدارة الشاشات ---
startOrderBtn.addEventListener('click', () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<b>${repSelect.options[repSelect.selectedIndex].text}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacySelect.options[pharmacySelect.selectedIndex].text;
    if (orderBody.children.length === 0) addNewRow();
});

// التنقل بين التبويبات
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

// --- 3. منطق الجدول (Live Calculation) ---
function addNewRow() {
    if (orderBody.children.length >= MAX_ROWS) return;
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

// --- 4. إرسال الطلبية ---
submitOrderBtn.addEventListener('click', async () => {
    const rows = document.querySelectorAll('#orderBody tr');
    if (rows.length === 0) return alert("الفاتورة فارغة!");

    const items = [];
    rows.forEach(r => {
        const s = r.querySelector('.product-select');
        if (s.value) {
            items.push({
                name: s.options[s.selectedIndex].text,
                qty: r.querySelector('.qty-input').value,
                price: r.querySelector('.price-cell').innerText,
                total: r.querySelector('.row-total').innerText
            });
        }
    });

    const data = {
        repName: repSelect.options[repSelect.selectedIndex].text,
        pharmacyName: pharmacySelect.options[pharmacySelect.selectedIndex].text,
        items: items,
        grandTotal: parseFloat(grandTotalEl.innerText),
        createdAt: new Date(),
        status: "Pending"
    };

    try {
        submitOrderBtn.disabled = true;
        await addDoc(collection(db, "orders"), data);
        alert("✅ تم الإرسال بنجاح!");
        location.reload();
    } catch (e) { alert("خطأ في الإرسال"); submitOrderBtn.disabled = false; }
});

// --- 5. التقارير ---
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    const snap = await getDocs(collection(db, "orders"));
    body.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        body.innerHTML += `
            <tr>
                <td>${doc.id.substring(0,5)}</td>
                <td>${d.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${d.repName}</td>
                <td>${d.pharmacyName}</td>
                <td>${d.grandTotal.toFixed(2)}</td>
                <td><span class="status-badge">قيد الانتظار</span></td>
            </tr>`;
    });
}

document.getElementById('exportExcelBtn').onclick = () => {
    XLSX.writeFile(XLSX.utils.table_to_book(document.getElementById('reportsTable')), "DAR_ALDAWAA_Orders.xlsx");
};

loadInitialData();
