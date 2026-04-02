import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc } from './firebase.js';

// --- عناصر ---
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

// --- Toast احترافي ---
function showToast(msg, type = "success") {
    const t = document.createElement('div');
    t.innerText = msg;
    t.style.cssText = `
        position:fixed; bottom:20px; left:20px;
        background:${type === "error" ? "#d32f2f" : "#2e7d32"};
        color:#fff; padding:12px 20px;
        border-radius:10px; z-index:9999;
        font-weight:bold; opacity:0;
        transition:0.3s;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = "1", 50);
    setTimeout(() => {
        t.style.opacity = "0";
        setTimeout(() => t.remove(), 300);
    }, 2500);
}

// --- تحميل البيانات ---
async function loadInitialData() {
    const repsSnap = await getDocs(collection(db, "reps"));
    repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
    repsSnap.forEach(d => {
        repSelect.innerHTML += `<option value="${d.id}">${d.data().name}</option>`;
    });

    const prodSnap = await getDocs(collection(db, "products"));
    productsList = [];
    prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
    productsList.sort((a, b) => a.name.localeCompare(b.name));
}

// --- صيدليات ---
repSelect.onchange = async (e) => {
    if (!e.target.value) return;
    const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
    const snap = await getDocs(q);

    pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';
    snap.forEach(d => {
        pharmacySelect.innerHTML += `<option value="${d.id}">${d.data().name}</option>`;
    });

    pharmacySelect.disabled = false;
};

pharmacySelect.onchange = () => startOrderBtn.disabled = !pharmacySelect.value;

// --- بدء الطلب ---
startOrderBtn.onclick = () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';

    if (orderBody.children.length === 0) addNewRow();
};

// --- صف جديد ---
function addNewRow() {
    const tr = document.createElement('tr');

    let opts = '<option value="">-- اختر الصنف --</option>';
    productsList.forEach(p => {
        opts += `<option value="${p.id}" data-price="${p.price}">${p.name}</option>`;
    });

    tr.innerHTML = `
        <td><select class="product-select">${opts}</select></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="bonus-input" value="0"></td>
        <td class="price-cell">0.00</td>
        <td class="row-total">0.00</td>
        <td><button class="del-row">❌</button></td>
    `;

    const s = tr.querySelector('.product-select');
    const q = tr.querySelector('.qty-input');
    const p = tr.querySelector('.price-cell');
    const t = tr.querySelector('.row-total');

    s.onchange = () => {
        const pr = parseFloat(s.selectedOptions[0].dataset.price || 0);
        p.innerText = pr.toFixed(2);
        t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    };

    q.oninput = () => {
        t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2);
        updateGrandTotal();
    };

    tr.querySelector('.del-row').onclick = () => {
        tr.remove();
        updateGrandTotal();
    };

    orderBody.appendChild(tr);
}

addRowBtn.onclick = addNewRow;

// --- الإجمالي ---
function updateGrandTotal() {
    let total = 0;
    document.querySelectorAll('.row-total').forEach(td => {
        total += parseFloat(td.innerText) || 0;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

// --- إرسال ---
submitOrderBtn.onclick = async () => {

    if (submitOrderBtn.disabled) return;

    const items = [];

    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-select');
        if (s.value) {
            items.push({
                name: s.selectedOptions[0].text,
                qty: r.querySelector('.qty-input').value,
                bonus: r.querySelector('.bonus-input').value || 0,
                price: r.querySelector('.price-cell').innerText,
                total: r.querySelector('.row-total').innerText
            });
        }
    });

    if (items.length === 0) return showToast("الفاتورة فارغة", "error");

    try {
        submitOrderBtn.disabled = true;

        await addDoc(collection(db, "orders"), {
            repName: repSelect.selectedOptions[0].text,
            pharmacyName: pharmacySelect.selectedOptions[0].text,
            items,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(),
            status: "Pending"
        });

        showToast("تم الإرسال بنجاح");

        // Reset
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        addNewRow();
        submitOrderBtn.disabled = false;

        // Focus
        setTimeout(() => {
            orderBody.querySelector('.product-select')?.focus();
        }, 100);

        // تحديث التقارير مباشرة
        loadReports();

    } catch (e) {
        showToast("خطأ في الإرسال", "error");
        submitOrderBtn.disabled = false;
    }
};

// --- التقارير ---
async function loadReports() {
    const body = document.getElementById('reportsBody');
    const snap = await getDocs(collection(db, "orders"));

    body.innerHTML = '';

    let orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));

    orders.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

    orders.forEach(o => {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${o.id.substring(0,5)}</td>
            <td>${o.createdAt.toDate().toLocaleString()}</td>
            <td>${o.repName}</td>
            <td>${o.pharmacyName}</td>
            <td>${o.grandTotal}</td>
            <td>
                <button class="view">👁</button>
                <button class="del">🗑</button>
            </td>
        `;

        tr.querySelector('.view').onclick = () => {
            modalItemsBody.innerHTML = '';
            o.items.forEach(i => {
                modalItemsBody.innerHTML += `
                    <tr>
                        <td>${i.name}</td>
                        <td>${i.qty}</td>
                        <td>${i.bonus}</td>
                        <td>${i.price}</td>
                        <td>${i.total}</td>
                    </tr>`;
            });
            detailsModal.style.display = 'flex';
        };

        tr.querySelector('.del').onclick = async () => {
            if (!confirm("حذف؟")) return;
            await deleteDoc(doc(db, "orders", o.id));
            showToast("تم الحذف");
            loadReports();
        };

        body.appendChild(tr);
    });
}

// --- Modal ---
window.closeModal = () => detailsModal.style.display = 'none';

// --- Start ---
loadInitialData();
