import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc } from './firebase.js';

const repSelect = document.getElementById('repSelect');
const pharmacySelect = document.getElementById('pharmacySelect');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

let productsList = []; 

// 1. تحميل المناديب والأصناف
async function loadInitialData() {
    try {
        const repsSnap = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
        repsSnap.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id; opt.textContent = d.data().name;
            repSelect.appendChild(opt);
        });
        repSelect.disabled = false;

        const prodSnap = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
        productsList.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { console.error("Error Loading:", e); }
}

// 2. جلب صيدليات المندوب
repSelect.onchange = async (e) => {
    if (!e.target.value) return;
    pharmacySelect.innerHTML = '<option>جاري التحميل...</option>';
    const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
    const snap = await getDocs(q);
    pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';
    snap.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; opt.textContent = d.data().name;
        pharmacySelect.appendChild(opt);
    });
    pharmacySelect.disabled = false;
};

pharmacySelect.onchange = () => startOrderBtn.disabled = !pharmacySelect.value;

// 3. إدارة التبويبات
startOrderBtn.onclick = () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<b>${repSelect.options[repSelect.selectedIndex].text}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacySelect.options[pharmacySelect.selectedIndex].text;
    if (orderBody.children.length === 0) addNewRow();
};

document.getElementById('navOrderBtn').onclick = () => {
    document.getElementById('reportsScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navOrderBtn').classList.add('active');
};

document.getElementById('navReportsBtn').onclick = () => {
    document.getElementById('orderScreen').style.display = 'none';
    document.getElementById('reportsScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navReportsBtn').classList.add('active');
    loadReports();
};

document.getElementById('logoutBtn').onclick = () => location.reload();

// 4. منطق الجدول (الفاتورة)
function addNewRow() {
    const tr = document.createElement('tr');
    let opts = '<option value="">-- اختر الصنف --</option>';
    productsList.forEach(p => opts += `<option value="${p.id}" data-price="${p.price}">${p.name}</option>`);
    tr.innerHTML = `
        <td><select class="product-select">${opts}</select></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="bonus-input" value="0" min="0"></td>
        <td class="price-cell">0.00</td><td class="row-total">0.00</td>
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;
    const s = tr.querySelector('.product-select'), q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
    s.onchange = () => {
        const pr = parseFloat(s.options[s.selectedIndex].dataset.price) || 0;
        p.innerText = pr.toFixed(2); t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    };
    q.oninput = () => { t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); updateGrandTotal(); };
    tr.querySelector('.del-row').onclick = () => { tr.remove(); updateGrandTotal(); };
    orderBody.appendChild(tr);
}
addRowBtn.onclick = addNewRow;

function updateGrandTotal() {
    let g = 0; document.querySelectorAll('.row-total').forEach(td => g += parseFloat(td.innerText) || 0);
    grandTotalEl.innerText = g.toFixed(2);
}

// 5. إرسال الطلبية
submitOrderBtn.onclick = async () => {
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-select');
        if (s.value) items.push({
            name: s.options[s.selectedIndex].text,
            qty: r.querySelector('.qty-input').value,
            bonus: r.querySelector('.bonus-input').value || 0,
            price: r.querySelector('.price-cell').innerText,
            total: r.querySelector('.row-total').innerText
        });
    });
    if (items.length === 0) return alert("الفاتورة فارغة!");
    try {
        submitOrderBtn.disabled = true;
        await addDoc(collection(db, "orders"), {
            repName: repSelect.options[repSelect.selectedIndex].text,
            pharmacyName: pharmacySelect.options[pharmacySelect.selectedIndex].text,
            items: items,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(), status: "Pending"
        });
        alert("✅ تم الإرسال!"); location.reload();
    } catch (e) { alert("خطأ!"); submitOrderBtn.disabled = false; }
};

// 6. التقارير
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري التحميل...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        body.innerHTML = '';
        let os = []; snap.forEach(d => os.push({ id: d.id, ...d.data() }));
        os.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
        os.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${o.id.substring(0,5)}</b></td>
                <td>${o.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${o.repName}</td><td>${o.pharmacyName}</td>
                <td>${o.grandTotal.toFixed(2)}</td><td><span class="status-badge">قيد الانتظار</span></td>
                <td class="actions-cell">
                    <button class="btn-view" style="color:#004a99; background:none; border:none; cursor:pointer;"><i class="ph ph-eye"></i></button>
                    <button class="btn-delete" style="color:#d32f2f; background:none; border:none; cursor:pointer; margin-right:10px;"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tr.querySelector('.btn-view').onclick = () => {
                modalItemsBody.innerHTML = '';
                o.items.forEach(i => modalItemsBody.innerHTML += `<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.bonus}</td><td>${i.price}</td><td>${i.total}</td></tr>`);
                detailsModal.style.display = 'flex';
            };
            tr.querySelector('.btn-delete').onclick = async () => {
                if(confirm("حذف الطلبية؟")) { await deleteDoc(doc(db, "orders", o.id)); loadReports(); }
            };
            body.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

window.closeModal = () => detailsModal.style.display = 'none';
document.getElementById('exportExcelBtn').onclick = () => XLSX.writeFile(XLSX.utils.table_to_book(document.getElementById('reportsTable')), "Orders.xlsx");

// بدء التشغيل
loadInitialData();
