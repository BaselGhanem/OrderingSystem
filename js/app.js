import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, getDoc } from './firebase.js';
// remmember password
window.addEventListener('DOMContentLoaded', () => {
    const isAdminSaved = localStorage.getItem('isAdminLoggedIn');
    const savedManagerName = localStorage.getItem('managerName');

    if (isAdminSaved === 'true' && savedManagerName) {
        // تأخير بسيط لضمان تحميل البيانات الأولية (loadInitialData)
        setTimeout(() => {
            isAdmin = true;
            currentManagerName = savedManagerName;
            
            // استدعاء منطق دخول المدير تلقائياً
            initializeManagerView(savedManagerName);
            console.log("تم تسجيل الدخول تلقائيا كمدير: " + savedManagerName);
        }, 800); 
    }
});
function initializeManagerView(managerName) {
    const repsUnder = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === managerName);
    const filterSelect = document.getElementById('managerRepFilter');
    
    filterSelect.innerHTML = '<option value="">جميع مندوبي</option>';
    
    // ملاحظة: تأكد أن repSelect محملة بالبيانات قبل الوصول لهذه الخطوة
    for(let rep of repsUnder) {
        const repOption = Array.from(repSelect.options).find(opt => opt.textContent === rep);
        const opt = document.createElement('option');
        opt.value = repOption ? repOption.value : rep;
        opt.textContent = rep;
        filterSelect.appendChild(opt);
    }

    filterSelect.onchange = () => loadManagerOrders(filterSelect.value);
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('managerScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user-gear"></i> <b>المدير: ${managerName}</b>`;
    
    document.getElementById('navOrderBtn').style.display = 'none';
    document.getElementById('navMyOrdersBtn').style.display = 'none';
    document.getElementById('navReportsBtn').style.display = 'none';

    // تهيئة التبويبات
    const myTeamBtn = document.getElementById('managerMyTeamBtn');
    const allOrdersBtn = document.getElementById('managerAllOrdersBtn');
    const teamSection = document.getElementById('teamOrdersSection');
    const allSection = document.getElementById('allOrdersSection');

    myTeamBtn.onclick = () => { /* ... كود التبديل الخاص بك ... */ };
    allOrdersBtn.onclick = () => { /* ... كود التبديل الخاص بك ... */ };

    teamSection.style.display = 'block';
    allSection.style.display = 'none';
    myTeamBtn.classList.add('active');
    loadManagerOrders();
}
document.getElementById('logoutBtn').onclick = () => {
    if(confirm("تسجيل الخروج؟")) {
        clearRepSession();
        localStorage.removeItem('isAdminLoggedIn'); // مسح بيانات التذكر
        localStorage.removeItem('managerName');
        location.reload();
    }
};
// ------------------- جدول المراسلات (مندوب -> مدير) -------------------

const repManagerMap = {
    "مراد عمر": "محمد طوالبه",
    "مؤيد الزعبي": "محمد طوالبه",
    "محمد عبدربه": "محمد طوالبه",
    "محمد الفاعوري": "عبدالله الناطور",
    "اجود التلهوني": "عبدالله الناطور",
    "يزيد الرقب": "محمد طوالبه",
    "تامر عقل": "محمد طوالبه",
    "محمد ابو يامين": "عبدالله الناطور",
    "مراد الظاهر": "عبدالله الناطور"
};

// ------------------- المتغيرات العامة -------------------
let productsList = [];
let currentRepId = null;
let currentRepName = null;
let currentPharmacyName = null;
let isAdmin = false;
let currentManagerName = null;
let editingOrderId = null;
let allOrdersData = [];

// ------------------- دوال الجلسة -------------------
function saveRepSession(repId, repName) {
    sessionStorage.setItem('repId', repId);
    sessionStorage.setItem('repName', repName);
}
function loadRepSession() {
    const id = sessionStorage.getItem('repId');
    const name = sessionStorage.getItem('repName');
    if (id && name) {
        currentRepId = id;
        currentRepName = name;
        return true;
    }
    return false;
}
function clearRepSession() {
    sessionStorage.removeItem('repId');
    sessionStorage.removeItem('repName');
}

// ------------------- عناصر DOM -------------------
const repSelect = document.getElementById('repSelect');
const pharmacyInput = document.getElementById('pharmacyInput');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
addRowBtn.onclick = () => addNewRow();
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

// ------------------- دوال مساعدة -------------------
function getManagerName(repName) {
    return repManagerMap[repName] || "غير محدد";
}

// دالة الإكمال التلقائي المحسنة
function setupAutocomplete(inputEl, suggestionsEl, dataArray, onSelectCallback) {
    let currentFocus = -1;
    inputEl.addEventListener('input', function(e) {
        const val = this.value.trim().toLowerCase();
        suggestionsEl.innerHTML = '';
        currentFocus = -1;
        if (!val) { suggestionsEl.style.display = 'none'; return; }
        const filtered = dataArray.filter(item => item.toLowerCase().includes(val));
        if (filtered.length > 0) {
            filtered.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                const matchIndex = item.toLowerCase().indexOf(val);
                if (matchIndex >= 0) {
                    const before = item.substring(0, matchIndex);
                    const match = item.substring(matchIndex, matchIndex + val.length);
                    const after = item.substring(matchIndex + val.length);
                    div.innerHTML = before + '<strong>' + match + '</strong>' + after;
                } else { div.innerText = item; }
                div.addEventListener('click', function(e) {
                    e.preventDefault();
                    inputEl.value = item;
                    suggestionsEl.style.display = 'none';
                    if (onSelectCallback) onSelectCallback(item);
                });
                suggestionsEl.appendChild(div);
            });
            // تحديد موضع القائمة
            const rect = inputEl.getBoundingClientRect();
            suggestionsEl.style.position = 'fixed';
            suggestionsEl.style.top = (rect.bottom + 5) + 'px';
            suggestionsEl.style.left = rect.left + 'px';
            suggestionsEl.style.width = rect.width + 'px';
            suggestionsEl.style.display = 'block';
        } else { suggestionsEl.style.display = 'none'; }
    });
    // التنقل بالأسهم و Enter
    inputEl.addEventListener('keydown', function(e) {
        const items = suggestionsEl.getElementsByClassName('autocomplete-item');
        if (e.key === 'ArrowDown') { currentFocus++; if (currentFocus >= items.length) currentFocus = 0; setActive(items); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { currentFocus--; if (currentFocus < 0) currentFocus = items.length - 1; setActive(items); e.preventDefault(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click(); else if (items.length === 1) items[0].click(); }
    });
    function setActive(items) { for (let i=0; i<items.length; i++) items[i].classList.remove('autocomplete-active'); if (items[currentFocus]) { items[currentFocus].classList.add('autocomplete-active'); items[currentFocus].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
    document.addEventListener('click', function(e) { if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) suggestionsEl.style.display = 'none'; });
    suggestionsEl.addEventListener('mousedown', function(e) { e.preventDefault(); });
}

// تحميل المناديب والأصناف
async function loadInitialData() {
    try {
        const repsSnap = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
        repsSnap.forEach(d => { const opt = document.createElement('option'); opt.value = d.id; opt.textContent = d.data().name; repSelect.appendChild(opt); });
        repSelect.disabled = false;
        const prodSnap = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
        productsList.sort((a,b) => a.name.localeCompare(b.name));
        console.log(`تم تحميل ${productsList.length} منتج`);
    } catch(e) { console.error(e); }
}

// إضافة صف جديد (مع انتظار المنتجات)
function addNewRow() {
    if (productsList.length === 0) { setTimeout(() => addNewRow(), 500); return; }
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><div class="autocomplete-wrapper"><input type="text" class="product-input" placeholder="ابحث باسم الصنف..." style="width:100%;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="bonus-input" value="0" min="0"></td>
        <td class="price-cell">0.00</td><td class="row-total">0.00</td>
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;
    const s = tr.querySelector('.product-input'), sug = tr.querySelector('.product-suggestions'), q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
    const productNames = productsList.map(prod => prod.name);
    setupAutocomplete(s, sug, productNames, (selectedName) => {
        const selectedProd = productsList.find(prod => prod.name === selectedName);
        const pr = selectedProd ? parseFloat(selectedProd.price) : 0;
        p.innerText = pr.toFixed(2);
        t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    });
    q.oninput = () => { t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); updateGrandTotal(); };
    tr.querySelector('.del-row').onclick = () => { tr.remove(); updateGrandTotal(); };
    orderBody.appendChild(tr);
}
function updateGrandTotal() {
    let g = 0; document.querySelectorAll('#orderBody .row-total').forEach(td => g += parseFloat(td.innerText) || 0);
    grandTotalEl.innerText = g.toFixed(2);
}

// تحميل صيدليات المندوب
repSelect.onchange = async (e) => {
    if (!e.target.value) return;
    pharmacyInput.value = '';
    pharmacyInput.placeholder = 'جاري التحميل...';
    const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
    const snap = await getDocs(q);
    let pharmacyNames = [];
    snap.forEach(d => pharmacyNames.push(d.data().name));
    setupAutocomplete(pharmacyInput, document.getElementById('pharmacySuggestions'), pharmacyNames, () => startOrderBtn.disabled = false);
    pharmacyInput.disabled = false;
    pharmacyInput.placeholder = 'ابحث أو اختر الصيدلية...';
};
pharmacyInput.oninput = () => { startOrderBtn.disabled = !pharmacyInput.value.trim(); };

// بدء طلبية جديدة
startOrderBtn.onclick = () => {
    if (productsList.length === 0) { alert("الرجاء الانتظار... يتم تحميل المنتجات."); return; }
    currentRepId = repSelect.value;
    currentRepName = repSelect.options[repSelect.selectedIndex].text;
    saveRepSession(currentRepId, currentRepName);
    currentPharmacyName = pharmacyInput.value;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${currentRepName}</b>`;
    document.getElementById('orderPharmacyName').innerText = currentPharmacyName;
    if (orderBody.children.length === 0) addNewRow();
    document.getElementById('navMyOrdersBtn').style.display = 'inline-block';
    document.getElementById('navReportsBtn').style.display = 'inline-block';
};

// إرسال الطلبية الجديدة
submitOrderBtn.onclick = async () => {
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value) items.push({
            name: s.value,
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
            repId: currentRepId,
            repName: currentRepName,
            managerName: getManagerName(currentRepName),
            pharmacyName: currentPharmacyName,
            items: items,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: "pending"
        });
        alert("✅ تم إرسال الطلبية بنجاح، في انتظار موافقة المدير.");
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        addNewRow();
        submitOrderBtn.disabled = false;
        document.getElementById('orderScreen').style.display = 'none';
        document.getElementById('myOrdersScreen').style.display = 'block';
        loadMyOrders();
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('navMyOrdersBtn').classList.add('active');
    } catch(e) { alert("خطأ في الإرسال"); submitOrderBtn.disabled = false; }
};

// ------------------- شاشة طلبياتي (للمندوب) -------------------
async function loadMyOrders() {
    if (!currentRepId && !loadRepSession()) { alert("الرجاء تسجيل الدخول أولاً"); return; }
    const tbody = document.getElementById('myOrdersBody');
    tbody.innerHTML = '<tr><td colspan="6">جاري التحميل...</td></tr>';
    try {
        const q = query(collection(db, "orders"), where("repId", "==", currentRepId));
        const snap = await getDocs(q);
        let orders = [];
        snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
        orders.sort((a,b) => b.updatedAt.toDate() - a.updatedAt.toDate());
        orders = orders.filter(o => o.status === 'pending' || o.status === 'returned');
        tbody.innerHTML = '';
        if(orders.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد طلبيات معلقة أو مرتجعة</td></tr>'; return; }
        orders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.id.substring(0,6).toUpperCase()}</td>
                <td>${order.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${order.pharmacyName}</td>
                <td>${order.grandTotal.toFixed(2)}</td>
                <td><span class="status-badge ${order.status === 'pending' ? 'pending' : 'returned'}">${order.status === 'pending' ? 'قيد الموافقة' : 'مرفوض/مرتجع'}</span></td>
                <td><button class="action-btn edit-btn" data-id="${order.id}" title="تعديل"><i class="ph ph-pencil"></i></button>
                    <button class="action-btn delete-btn" data-id="${order.id}" title="حذف"><i class="ph ph-trash"></i></button></td>
            `;
            tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'rep');
            tr.querySelector('.delete-btn').onclick = async () => { if(confirm("حذف الطلبية؟")) { await deleteDoc(doc(db, "orders", order.id)); loadMyOrders(); } };
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="6">خطأ في التحميل</td></tr>'; }
}

// ------------------- شاشة المدير (طلبيات فريقي) -------------------
// ------------------- شاشة المدير (طلبيات فريقي) -------------------
async function loadManagerOrders(selectedRep = '') {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) {
        console.error("الجدول managerOrdersBody غير موجود في DOM");
        return;
    }
    tbody.innerHTML = '<tr><td colspan="7">جاري التحميل...</td></tr>';
    try {
        let ordersQuery = collection(db, "orders");
        let orders = [];

        if (selectedRep && selectedRep !== '') {
            // إذا تم اختيار مندوب معين من القائمة
            const q = query(ordersQuery, where("repName", "==", selectedRep));
            const snap = await getDocs(q);
            snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
        } else {
            // جلب جميع الطلبيات ثم تصفية مندوبي هذا المدير فقط
            const repsUnderManager = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === currentManagerName);
            console.log("مندوبي هذا المدير:", repsUnderManager);
            
            if (repsUnderManager.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7">لا يوجد مناديب تابعين لك</td></tr>';
                return;
            }
            
            const allOrdersSnap = await getDocs(ordersQuery);
            const allOrders = [];
            allOrdersSnap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
            
            // تصفية: تطبيع الأسماء (إزالة المسافات الزائد ومقارنة نصية غير حساسة لحالة الأحرف)
            const normalizedUnder = repsUnderManager.map(r => r.trim().toLowerCase());
            orders = allOrders.filter(o => {
                const repNameNorm = o.repName?.trim().toLowerCase();
                return repNameNorm && normalizedUnder.includes(repNameNorm);
            });
            console.log(`تم العثور على ${orders.length} طلبية للمناديب التابعين`);
        }
        
        orders.sort((a, b) => b.updatedAt.toDate() - a.updatedAt.toDate());
        renderManagerOrders(orders);
    } catch (e) {
        console.error("خطأ في loadManagerOrders:", e);
        tbody.innerHTML = `<td><td colspan="7">خطأ: ${e.message}</td></tr>`;
    }
}
function renderManagerOrders(orders) {
    const tbody = document.getElementById('managerOrdersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) { tbody.innerHTML = '<tr><td colspan="7">لا توجد طلبيات</td></tr>'; return; }
    orders.forEach(order => {
        const isApproved = order.status === 'approved';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${order.id.substring(0,6).toUpperCase()}</td>
            <td>${order.createdAt.toDate().toLocaleString('ar-JO')}</td>
            <td>${order.repName}</td><td>${order.pharmacyName}</td>
            <td>${order.grandTotal.toFixed(2)}</td>
            <td><span class="status-badge ${order.status === 'pending' ? 'pending' : (order.status === 'returned' ? 'returned' : 'approved')}">${order.status === 'pending' ? 'قيد الموافقة' : (order.status === 'returned' ? 'مرتجع' : 'موافق عليه')}</span></td>
            <td><button class="action-btn edit-btn" data-id="${order.id}" title="تعديل"><i class="ph ph-pencil"></i></button>
                ${!isApproved ? `<button class="action-btn approve-btn" data-id="${order.id}" title="موافقة وترحيل"><i class="ph ph-check-circle"></i></button>` : ''}
                ${!isApproved ? `<button class="action-btn reject-btn" data-id="${order.id}" title="رفض وإرجاع"><i class="ph ph-x-circle"></i></button>` : ''}
            </td>
        `;
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'manager');
        if (!isApproved) {
            tr.querySelector('.approve-btn').onclick = async () => { if(confirm("الموافقة على الطلبية؟")) { await updateDoc(doc(db, "orders", order.id), { status: "approved", updatedAt: new Date() }); loadManagerOrders(document.getElementById('managerRepFilter').value); } };
            tr.querySelector('.reject-btn').onclick = async () => { if(confirm("رفض الطلبية وإرجاعها؟")) { await updateDoc(doc(db, "orders", order.id), { status: "returned", updatedAt: new Date() }); loadManagerOrders(document.getElementById('managerRepFilter').value); } };
        }
        tbody.appendChild(tr);
    });
}

// ------------------- جميع طلبيات الشركة -------------------
async function loadAllCompanyOrders() {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '<tr><td colspan="7">جاري تحميل جميع الطلبيات...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        allOrdersData = [];
        snap.forEach(d => allOrdersData.push({ id: d.id, ...d.data() }));
        allOrdersData.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate());
        renderAllOrders(allOrdersData);
    } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="7">خطأ في التحميل</td></tr>'; }
}
function renderAllOrders(orders) {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) { tbody.innerHTML = '<tr><td colspan="7">لا توجد طلبيات</td></tr>'; updateAllOrdersStats(orders); return; }
    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${order.id.substring(0,6).toUpperCase()}</td>
            <td>${order.createdAt.toDate().toLocaleString('ar-JO')}</td>
            <td class="all-rep-col">${order.repName}</td>
            <td class="all-pharm-col">${order.pharmacyName}</td>
            <td>${order.grandTotal.toFixed(2)}</td>
            <td><span class="status-badge ${order.status === 'approved' ? 'approved' : (order.status === 'pending' ? 'pending' : 'returned')}">${order.status === 'approved' ? 'موافق عليه' : (order.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td>
            <td><button class="action-btn edit-btn" data-id="${order.id}" title="تعديل"><i class="ph ph-pencil"></i></button>
                <button class="btn-view" data-id="${order.id}" title="عرض التفاصيل"><i class="ph ph-eye"></i></button></td>
        `;
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'all');
        tr.querySelector('.btn-view').onclick = () => showOrderDetails(order);
        tbody.appendChild(tr);
    });
    updateAllOrdersStats(orders);
}
function updateAllOrdersStats(orders) {
    const count = orders.length;
    const total = orders.reduce((sum, order) => sum + order.grandTotal, 0);
    const countElem = document.getElementById('totalOrdersCount');
    const sumElem = document.getElementById('totalOrdersSum');
    if (countElem) countElem.innerText = count;
    if (sumElem) sumElem.innerText = total.toFixed(2);
}
function showOrderDetails(order) {
    modalItemsBody.innerHTML = '';
    document.getElementById('modalPharmacySubtitle').innerText = `الصيدلية: ${order.pharmacyName} - المندوب: ${order.repName}`;
    order.items.forEach(i => {
        const row = document.createElement('tr');
        row.innerHTML = `<td style="font-weight:600;">${i.name}</td><td>${i.qty}</td><td>${i.bonus||0}</td><td>${parseFloat(i.price).toFixed(2)}</td><td>${parseFloat(i.total).toFixed(2)}</td>`;
        modalItemsBody.appendChild(row);
    });
    detailsModal.style.display = 'flex';
}
function filterAllOrders() {
    const repFilter = document.getElementById('filterAllRep').value.toLowerCase();
    const pharmFilter = document.getElementById('filterAllPharmacy').value.toLowerCase();
    const statusFilter = document.getElementById('filterAllStatus').value;
    const filtered = allOrdersData.filter(order => {
        return order.repName.toLowerCase().includes(repFilter) &&
               order.pharmacyName.toLowerCase().includes(pharmFilter) &&
               (statusFilter === '' || order.status === statusFilter);
    });
    renderAllOrders(filtered);
}
document.getElementById('filterAllRep').oninput = filterAllOrders;
document.getElementById('filterAllPharmacy').oninput = filterAllOrders;
document.getElementById('filterAllStatus').onchange = filterAllOrders;
document.getElementById('exportAllOrdersBtn').onclick = async () => {
    const btn = document.getElementById('exportAllOrdersBtn');
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري...";
    try {
        const snap = await getDocs(collection(db, "orders"));
        let flatData = [];
        snap.forEach(d => { const order = d.data(); order.items.forEach(item => { flatData.push({ "التاريخ": order.createdAt.toDate().toLocaleString('ar-JO'), "المندوب": order.repName, "الصيدلية": order.pharmacyName, "الصنف": item.name, "الكمية": item.qty, "البونص": item.bonus, "السعر": item.price, "المجموع الفرعي": item.total, "الإجمالي الكلي": order.grandTotal, "الحالة": order.status }); }); });
        if(flatData.length===0) { alert("لا توجد بيانات"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "جميع_الطلبيات");
        XLSX.writeFile(wb, "جميع_طلبيات_الشركة.xlsx");
    } catch(e) { alert("خطأ"); } finally { btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير جميع الطلبيات"; }
};

// ------------------- تعديل الطلبية (مودال مشترك) -------------------
async function openEditOrder(orderId, userType) {
    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if(!orderDoc.exists()) return alert("الطلب غير موجود");
    const order = orderDoc.data();
    editingOrderId = orderId;
    const container = document.getElementById('editOrderContainer');
    container.innerHTML = `
        <h4>تعديل طلبية: ${order.pharmacyName}</h4>
        <div class="table-responsive"><table class="order-table" id="editOrderTable"><thead><tr><th>الصنف</th><th>الكمية</th><th>البونص</th><th>السعر</th><th>المجموع</th><th>حذف</th></tr></thead><tbody id="editOrderBody"></tbody></table></div>
        <div style="margin-top:10px;"><button id="editAddRowBtn" class="btn-secondary">➕ إضافة صنف</button></div>
        <div class="total-box">الإجمالي: <strong id="editGrandTotal">0.00</strong> د.أ</div>
    `;
    const editBody = document.getElementById('editOrderBody');
    function updateEditTotal() { let total=0; document.querySelectorAll('#editOrderBody .row-total').forEach(td=>total+=parseFloat(td.innerText)||0); document.getElementById('editGrandTotal').innerText=total.toFixed(2); }
    function addEditRow(productName='', qty=1, bonus=0, price=0, rowTotal=0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><div class="autocomplete-wrapper"><input type="text" class="product-input" value="${productName.replace(/"/g, '&quot;')}" style="width:100%"><div class="autocomplete-list product-suggestions"></div></div></td>
                        <td><input type="number" class="qty-input" value="${qty}" min="1"></td>
                        <td><input type="number" class="bonus-input" value="${bonus}" min="0"></td>
                        <td class="price-cell">${parseFloat(price).toFixed(2)}</td>
                        <td class="row-total">${parseFloat(rowTotal).toFixed(2)}</td>
                        <td><button class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>`;
        const s = tr.querySelector('.product-input'), sug = tr.querySelector('.product-suggestions'), q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
        const productNames = productsList.map(prod => prod.name);
        setupAutocomplete(s, sug, productNames, (selectedName) => { const prod = productsList.find(p => p.name === selectedName); const pr = prod ? parseFloat(prod.price) : 0; p.innerText = pr.toFixed(2); t.innerText = (pr * q.value).toFixed(2); updateEditTotal(); });
        q.oninput = () => { t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); updateEditTotal(); };
        tr.querySelector('.del-row').onclick = () => { tr.remove(); updateEditTotal(); };
        editBody.appendChild(tr);
        updateEditTotal();
    }
    order.items.forEach(item => { addEditRow(item.name, item.qty, item.bonus, item.price, item.total); });
    document.getElementById('editAddRowBtn').onclick = () => addEditRow();
    const saveBtn = document.getElementById('saveEditOrderBtn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.onclick = async () => {
        const items = [];
        document.querySelectorAll('#editOrderBody tr').forEach(r => {
            const inp = r.querySelector('.product-input');
            if(inp && inp.value) items.push({ name: inp.value, qty: r.querySelector('.qty-input').value, bonus: r.querySelector('.bonus-input').value || 0, price: r.querySelector('.price-cell').innerText, total: r.querySelector('.row-total').innerText });
        });
        const newGrandTotal = parseFloat(document.getElementById('editGrandTotal').innerText);
        await updateDoc(doc(db, "orders", editingOrderId), { items: items, grandTotal: newGrandTotal, status: "pending", updatedAt: new Date() });
        alert("تم تحديث الطلبية وإعادة إرسالها للموافقة.");
        closeEditModal();
        if(userType === 'rep') loadMyOrders();
        else if(userType === 'manager') loadManagerOrders(document.getElementById('managerRepFilter').value);
        else if(userType === 'all') loadAllCompanyOrders();
    };
    document.getElementById('editOrderModal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('editOrderModal').style.display = 'none'; editingOrderId = null; }
window.closeEditModal = closeEditModal;

// ------------------- التقارير -------------------
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري جلب البيانات...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        let os = [];
        snap.forEach(d => os.push({ id: d.id, ...d.data() }));
        os.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate());
        if (!isAdmin && currentRepName) os = os.filter(o => o.repName === currentRepName);
        body.innerHTML = '';
        os.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><b>${o.id.substring(0,5).toUpperCase()}</b></td><td>${o.createdAt.toDate().toLocaleString('ar-JO')}</td><td class="rep-col">${o.repName}</td><td class="pharm-col">${o.pharmacyName}</td><td>${o.grandTotal.toFixed(2)}</td><td><span class="status-badge ${o.status === 'approved' ? 'approved' : (o.status === 'pending' ? 'pending' : 'returned')}">${o.status === 'approved' ? 'موافق عليه' : (o.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td><td><button class="btn-view" style="color:#004a99;"><i class="ph ph-eye"></i></button></td>`;
            tr.querySelector('.btn-view').onclick = () => {
                modalItemsBody.innerHTML = '';
                document.getElementById('modalPharmacySubtitle').innerText = `الصيدلية: ${o.pharmacyName}`;
                o.items.forEach(i => { const row = document.createElement('tr'); row.innerHTML = `<td style="font-weight:600;">${i.name}</td><td>${i.qty}</td><td>${i.bonus||0}</td><td>${parseFloat(i.price).toFixed(2)}</td><td>${parseFloat(i.total).toFixed(2)}</td>`; modalItemsBody.appendChild(row); });
                detailsModal.style.display = 'flex';
            };
            body.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}
function filterReportsTable() {
    const repFilter = document.getElementById('filterRep').value.toLowerCase();
    const pharmFilter = document.getElementById('filterPharmacy').value.toLowerCase();
    document.querySelectorAll('#reportsBody tr').forEach(row => {
        if(row.children.length > 1) {
            const rep = row.querySelector('.rep-col')?.innerText.toLowerCase() || '';
            const pharm = row.querySelector('.pharm-col')?.innerText.toLowerCase() || '';
            row.style.display = (rep.includes(repFilter) && pharm.includes(pharmFilter)) ? '' : 'none';
        }
    });
}
document.getElementById('filterRep').oninput = filterReportsTable;
document.getElementById('filterPharmacy').oninput = filterReportsTable;
document.getElementById('exportExcelBtn').onclick = async () => {
    const btn = document.getElementById('exportExcelBtn');
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري...";
    try {
        const snap = await getDocs(collection(db, "orders"));
        let flatData = [];
        let allOrders = [];
        snap.forEach(d => allOrders.push(d.data()));
        if(!isAdmin && currentRepName) allOrders = allOrders.filter(o => o.repName === currentRepName);
        allOrders.forEach(order => {
            const dateStr = order.createdAt.toDate().toLocaleString('ar-JO');
            order.items.forEach(item => { flatData.push({ "التاريخ": dateStr, "المندوب": order.repName, "الصيدلية": order.pharmacyName, "الصنف": item.name, "الكمية": item.qty, "البونص": item.bonus, "السعر": item.price, "المجموع الفرعي": item.total, "الإجمالي الكلي": order.grandTotal, "الحالة": order.status }); });
        });
        if(flatData.length===0) { alert("لا توجد بيانات"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_طلبيات.xlsx");
    } catch(e) { alert("خطأ"); } finally { btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير للإكسل"; }
};

// ------------------- إدارة التنقل والأزرار -------------------
document.getElementById('navOrderBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('orderScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navOrderBtn').classList.add('active'); };
document.getElementById('navMyOrdersBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('myOrdersScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navMyOrdersBtn').classList.add('active'); loadMyOrders(); };
document.getElementById('navReportsBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('reportsScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navReportsBtn').classList.add('active'); loadReports(); };
document.getElementById('logoutBtn').onclick = () => { clearRepSession(); if(confirm("تسجيل الخروج؟")) location.reload(); };

// دخول المدير
document.getElementById('adminModeBtn').onclick = () => {
    const pass = prompt("كلمة مرور المدير:");
    if(pass === "202604") {
        const managerName = prompt("أدخل اسمك كمدير (مثال: محمد طوالبه أو عبدالله الناطور):");
        if(!managerName || (managerName !== "محمد طوالبه" && managerName !== "عبدالله الناطور")) { 
            alert("اسم المدير غير معروف"); 
            return; 
        }

        // --- إضافة أسطر التذكر هنا ---
        const rememberMe = document.getElementById('rememberMe').checked;
        if (rememberMe) {
            localStorage.setItem('isAdminLoggedIn', 'true');
            localStorage.setItem('managerName', managerName);
        }
        // ---------------------------

        isAdmin = true;
        currentManagerName = managerName;
        initializeManagerView(managerName); // استدعاء الوظيفة التي أنشأتها
        
    } else if(pass !== null) alert("كلمة المرور خاطئة!");
};
window.closeModal = () => detailsModal.style.display = 'none';
loadInitialData();
