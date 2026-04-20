import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, getDoc } from './firebase.js';

window.addEventListener('DOMContentLoaded', () => {
    const savedManagerName = localStorage.getItem('managerName');
    const savedPass = localStorage.getItem('adminPassword');

    if (savedManagerName && savedPass) {
        console.log("تم استرجاع بيانات المدير محليا (جاهزة للتعبئة)");
        if(document.getElementById('rememberMe')) {
            document.getElementById('rememberMe').checked = true;
        }
    }
});

function initializeManagerView(managerName) {
    const repsUnder = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === managerName);
    const filterSelect = document.getElementById('managerRepFilter');
    
    filterSelect.innerHTML = '<option value="">جميع مندوبي</option>';
    
    for(let rep of repsUnder) {
        const repOption = Array.from(repSelect.options).find(opt => opt.textContent === rep);
        const opt = document.createElement('option');
        opt.value = repOption ? repOption.value : rep;
        opt.textContent = rep;
        filterSelect.appendChild(opt);
    }

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('managerScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user-gear"></i> <b>المدير: ${managerName}</b>`;
    
    document.getElementById('navOrderBtn').style.display = 'none';
    document.getElementById('navMyOrdersBtn').style.display = 'none';
    document.getElementById('navReportsBtn').style.display = 'none';

    const myTeamBtn = document.getElementById('managerMyTeamBtn');
    const allOrdersBtn = document.getElementById('managerAllOrdersBtn');
    const teamSection = document.getElementById('teamOrdersSection');
    const allSection = document.getElementById('allOrdersSection');

    myTeamBtn.onclick = () => { 
        myTeamBtn.classList.add('active'); 
        allOrdersBtn.classList.remove('active'); 
        teamSection.style.display = 'block'; 
        allSection.style.display = 'none'; 
        loadManagerOrders(); 
    };

    allOrdersBtn.onclick = () => { 
        myTeamBtn.classList.remove('active'); 
        allOrdersBtn.classList.add('active'); 
        teamSection.style.display = 'none'; 
        allSection.style.display = 'block'; 
        loadAllCompanyOrders(); 
    };

    teamSection.style.display = 'block';
    allSection.style.display = 'none';
    myTeamBtn.classList.add('active');
    loadManagerOrders();
}

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

let productsList = [];
let currentRepId = null;
let currentRepName = null;
let currentPharmacyName = null;
let isAdmin = false;
let currentManagerName = null;
let editingOrderId = null;
let allOrdersData = [];
let currentPharmacyCode = null;
let currentPharmaciesData = [];

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

function getManagerName(repName) {
    return repManagerMap[repName] || "غير محدد";
}

// التعديل الآمن والوحيد: استبدال دالة القائمة لتكون ذكية وتطفو فوق كل شيء
function setupAutocomplete(inputEl, suggestionsEl, dataArray, onSelectCallback) {
    // 1. تحديث البيانات دائماً لتجنب تضارب مندوبين أو منتجات
    inputEl._autocompleteData = dataArray;
    inputEl._autocompleteCallback = onSelectCallback;
    
    // 2. منع تكرار إضافة الأحداث لنفس الحقل
    if (inputEl._hasAutocomplete) return;
    inputEl._hasAutocomplete = true;

    let currentFocus = -1;

    function showList() {
        const data = inputEl._autocompleteData || [];
        const cb = inputEl._autocompleteCallback;
        const val = inputEl.value.trim().toLowerCase();
        
        suggestionsEl.innerHTML = '';
        currentFocus = -1;

        // إذا كان الحقل فارغاً نعرض القائمة كلها، وإلا نفلتر حسب الكتابة
        const filtered = val ? data.filter(item => item.toLowerCase().includes(val)) : data;

        if (filtered.length > 0) {
            filtered.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                // تنسيقات قسرية لتظهر دائماً وبشكل واضح
                div.style.padding = '8px 12px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #eee';
                div.style.backgroundColor = '#ffffff';
                div.style.color = '#000000';
                div.style.textAlign = 'right';
                div.style.fontSize = '14px';
                
                div.onmouseover = () => div.style.backgroundColor = '#f0f8ff';
                div.onmouseout = () => { if (!div.classList.contains('autocomplete-active')) div.style.backgroundColor = '#ffffff'; };

                if (val) {
                    const matchIndex = item.toLowerCase().indexOf(val);
                    if (matchIndex >= 0) {
                        const before = item.substring(0, matchIndex);
                        const match = item.substring(matchIndex, matchIndex + val.length);
                        const after = item.substring(matchIndex + val.length);
                        div.innerHTML = before + '<strong style="color:#004a99;">' + match + '</strong>' + after;
                    } else {
                        div.innerText = item;
                    }
                } else {
                    div.innerText = item;
                }

                div.addEventListener('click', function(e) {
                    e.preventDefault();
                    inputEl.value = item;
                    suggestionsEl.style.display = 'none';
                    if (cb) cb(item);
                    inputEl.dispatchEvent(new Event('input')); 
                });
                suggestionsEl.appendChild(div);
            });

            const rect = inputEl.getBoundingClientRect();
            suggestionsEl.style.position = 'fixed';
            suggestionsEl.style.top = (rect.bottom + 2) + 'px';
            suggestionsEl.style.left = rect.left + 'px';
            suggestionsEl.style.width = rect.width + 'px';
            suggestionsEl.style.zIndex = '9999999'; // السر هنا: أعلى طبقة ليتجاوز النوافذ
            suggestionsEl.style.backgroundColor = '#ffffff';
            suggestionsEl.style.border = '1px solid #ccc';
            suggestionsEl.style.borderRadius = '4px';
            suggestionsEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            suggestionsEl.style.maxHeight = '200px';
            suggestionsEl.style.overflowY = 'auto';
            suggestionsEl.style.display = 'block';
        } else { 
            suggestionsEl.style.display = 'none'; 
        }
    }

    // عرض القائمة عند التركيز أو النقر أو الكتابة
    inputEl.addEventListener('input', showList);
    inputEl.addEventListener('click', showList);
    inputEl.addEventListener('focus', showList);

    inputEl.addEventListener('keydown', function(e) {
        if (suggestionsEl.style.display === 'none') return;
        const items = suggestionsEl.getElementsByClassName('autocomplete-item');
        if (e.key === 'ArrowDown') { currentFocus++; if (currentFocus >= items.length) currentFocus = 0; setActive(items); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { currentFocus--; if (currentFocus < 0) currentFocus = items.length - 1; setActive(items); e.preventDefault(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click(); else if (items.length === 1) items[0].click(); }
    });

    function setActive(items) { 
        for (let i=0; i<items.length; i++) {
            items[i].classList.remove('autocomplete-active'); 
            items[i].style.backgroundColor = '#ffffff';
        }
        if (items[currentFocus]) { 
            items[currentFocus].classList.add('autocomplete-active'); 
            items[currentFocus].style.backgroundColor = '#e6f2ff';
            items[currentFocus].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); 
        } 
    }

    document.addEventListener('click', function(e) { 
        if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
            suggestionsEl.style.display = 'none'; 
        }
    });

    suggestionsEl.addEventListener('mousedown', function(e) { e.preventDefault(); });
}

async function loadInitialData() {
    try {
        // عرض حالة التحميل داخل القائمة
        repSelect.innerHTML = '<option value="">⏳ جاري تحميل المندوبين...</option>';
        repSelect.disabled = true; // تعطيل القائمة أثناء التحميل

        const repsSnap = await getDocs(collection(db, "reps"));
        
        // إعادة بناء القائمة
        repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
        repsSnap.forEach(d => { 
            const opt = document.createElement('option'); 
            opt.value = d.id; 
            opt.textContent = d.data().name; 
            repSelect.appendChild(opt); 
        });
        
        // تحميل المنتجات بشكل متوازٍ
        const prodSnap = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
        productsList.sort((a,b) => a.name.localeCompare(b.name));
        
        console.log(`تم تحميل ${productsList.length} منتج و ${repSelect.options.length - 1} مندوب`);
        
    } catch(e) { 
        console.error("خطأ في تحميل البيانات الأولية:", e);
        repSelect.innerHTML = '<option value="">❌ فشل التحميل، حاول تحديث الصفحة</option>';
        alert("حدث خطأ في تحميل بيانات المندوبين. يرجى تحديث الصفحة والتأكد من الاتصال بالإنترنت.");
    } finally {
        // في كل الأحوال (نجاح أو فشل) نجعل القائمة قابلة للاستخدام
        repSelect.disabled = false;
    }
}

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

    s.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val === "") return;
        const isValid = productsList.some(p => p.name === val);
        if (!isValid) {
            this.style.border = "2px solid red";
            this.style.backgroundColor = "#fff0f0";
        } else {
            this.style.border = "";
            this.style.backgroundColor = "";
        }
    });
    q.oninput = () => { t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); updateGrandTotal(); };
    tr.querySelector('.del-row').onclick = () => { tr.remove(); updateGrandTotal(); };
    orderBody.appendChild(tr);
}

function updateGrandTotal() {
    let g = 0; document.querySelectorAll('#orderBody .row-total').forEach(td => g += parseFloat(td.innerText) || 0);
    grandTotalEl.innerText = g.toFixed(2);
}

repSelect.onchange = async (e) => {
    if (!e.target.value) return;
    pharmacyInput.value = '';
    pharmacyInput.placeholder = 'جاري التحميل...';
    try {
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
        const snap = await getDocs(q);
        let pharmacyNames = [];
        currentPharmaciesData = []; 
        snap.forEach(d => {
            currentPharmaciesData.push(d.data()); 
            pharmacyNames.push(d.data().name);
        });
        setupAutocomplete(pharmacyInput, document.getElementById('pharmacySuggestions'), pharmacyNames, () => startOrderBtn.disabled = false);
        pharmacyInput.disabled = false;
        pharmacyInput.placeholder = 'ابحث او اختر الصيدلية...';
    } catch (error) {
        console.error("خطا في تحميل الصيدليات:", error);
        pharmacyInput.placeholder = 'خطا في التحميل، الرجا المحاولة مرة اخرى';
    }
};
pharmacyInput.oninput = () => { startOrderBtn.disabled = !pharmacyInput.value.trim(); };

// دالة مساعدة للتحقق من صحة اسم الصيدلية وتحديث حالة الزر
function validatePharmacyInput() {
    const pharmacyName = pharmacyInput.value.trim();
    const isValid = pharmacyName !== "" && currentPharmaciesData.some(p => p.name === pharmacyName);
    
    if (!isValid && pharmacyName !== "") {
        pharmacyInput.style.border = "2px solid red";
        pharmacyInput.style.backgroundColor = "#fff0f0";
        startOrderBtn.disabled = true;
        startOrderBtn.title = "الرجاء اختيار صيدلية صحيحة من القائمة";
    } else if (pharmacyName === "") {
        pharmacyInput.style.border = "";
        pharmacyInput.style.backgroundColor = "";
        startOrderBtn.disabled = true;
        startOrderBtn.title = "الرجاء إدخال اسم الصيدلية";
    } else {
        pharmacyInput.style.border = "";
        pharmacyInput.style.backgroundColor = "";
        startOrderBtn.disabled = false;
        startOrderBtn.title = "بدء الطلب";
    }
    return isValid;
}

// ربط حدث التحقق عند الخروج من حقل الصيدلية أو عند تغيير محتواه
pharmacyInput.addEventListener('blur', validatePharmacyInput);
pharmacyInput.addEventListener('input', function() {
    // عند الكتابة، نعيد تمكين الزر فقط إذا أصبح الاسم صحيحاً لاحقاً
    const isValid = currentPharmaciesData.some(p => p.name === this.value.trim());
    if (isValid) {
        this.style.border = "";
        this.style.backgroundColor = "";
        startOrderBtn.disabled = false;
    } else {
        startOrderBtn.disabled = true;
    }
});

// تعديل حدث بدء الطلب مع التحقق من صحة الصيدلية
startOrderBtn.onclick = () => {
    if (productsList.length === 0) { 
        alert("الرجاء الانتظار... يتم تحميل المنتجات."); 
        return; 
    }
    
    // التحقق من صحة الصيدلية قبل المتابعة (نفس منطق التحقق من الصنف)
    const pharmacyName = pharmacyInput.value.trim();
    const selectedPharm = currentPharmaciesData.find(p => p.name === pharmacyName);
    
    if (!selectedPharm) {
        pharmacyInput.style.border = "2px solid red";
        pharmacyInput.style.backgroundColor = "#fff0f0";
        alert("الصيدلية غير موجودة في قائمة الصيدليات الخاصة بك. الرجاء اختيار صيدلية صحيحة من القائمة المنسدلة حصراً.");
        return;
    }
    
    currentRepId = repSelect.value;
    currentRepName = repSelect.options[repSelect.selectedIndex].text;
    saveRepSession(currentRepId, currentRepName);
    currentPharmacyName = pharmacyName;
    currentPharmacyCode = selectedPharm.pharmacy_code || "-";
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${currentRepName}</b>`;
    document.getElementById('orderPharmacyName').innerText = currentPharmacyName;
    
    if (orderBody.children.length === 0) addNewRow();
    document.getElementById('navMyOrdersBtn').style.display = 'inline-block';
    document.getElementById('navReportsBtn').style.display = 'inline-block';
};

// عند تغيير المندوب، تأكد من إعادة تعيين حالة الزر وحقل الصيدلية
const originalRepOnChange = repSelect.onchange;
repSelect.onchange = async (e) => {
    if (originalRepOnChange) await originalRepOnChange(e);
    // إعادة تعيين حالة الزر بعد تحميل الصيدليات الجديدة
    startOrderBtn.disabled = true;
    pharmacyInput.style.border = "";
    pharmacyInput.style.backgroundColor = "";
    // بعد اكتمال تحميل الصيدليات (داخل الـ onchange الأصلي)، نعيد التحقق
    // لكن الـ setupAutocomplete لا يعطي إشارة اكتمال، لذا نستخدم setTimeout بسيط
    setTimeout(() => {
        validatePharmacyInput();
    }, 100);
};
submitOrderBtn.onclick = async () => {
    const items = [];
    let invalidItem = false; // متغير للتحقق من صحة الأصناف

    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value.trim() !== "") {
            // التحقق: هل الاسم المكتوب مطابق تماماً لأي صنف في القائمة؟
            const isValid = productsList.some(prod => prod.name === s.value.trim());
            
            if (!isValid) {
                invalidItem = true;
                s.style.border = "2px solid red"; // تمييز الخطأ بصرياً
            } else {
                s.style.border = ""; 
                items.push({
                    name: s.value,
                    qty: r.querySelector('.qty-input').value,
                    bonus: r.querySelector('.bonus-input').value || 0,
                    price: r.querySelector('.price-cell').innerText,
                    total: r.querySelector('.row-total').innerText
                });
            }
        }
    });

    if (invalidItem) {
        return alert("يوجد أصناف معدلة أو غير صحيحة، يرجى اختيار الصنف من القائمة المنسدلة حصراً.");
    }

    if (items.length === 0) return alert("الفاتورة فارغة!");
    try {
        submitOrderBtn.disabled = true;
        await addDoc(collection(db, "orders"), {
            repId: currentRepId,
            repName: currentRepName,
            managerName: getManagerName(currentRepName),
            pharmacyName: currentPharmacyName,
            pharmacyCode: currentPharmacyCode, 
            items: items,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: "pending"
        });
        alert("تم ارسال الطلبية بنجاح، في انتظار موافقة المدير.");
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        addNewRow();
        submitOrderBtn.disabled = false;
        document.getElementById('orderScreen').style.display = 'none';
        document.getElementById('myOrdersScreen').style.display = 'block';
        loadMyOrders();
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('navMyOrdersBtn').classList.add('active');
    } catch(e) { alert("خطا في الارسال"); submitOrderBtn.disabled = false; }
};

async function loadMyOrders() {
    if (!currentRepId && !loadRepSession()) { alert("الرجا تسجيل الدخول اولا"); return; }
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
        if(orders.length === 0) { tbody.innerHTML = '<tr><td colspan="6">لا توجد طلبيات معلقة او مرتجعة</td></tr>'; return; }
        orders.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${order.id.substring(0,6).toUpperCase()}</td>
                <td>${order.createdAt.toDate().toLocaleString('en-GB')}</td>
                <td>${order.pharmacyName}</td>
                <td>${parseFloat(order.grandTotal).toFixed(2)}</td>
                <td><span class="status-badge ${order.status === 'pending' ? 'pending' : 'returned'}">${order.status === 'pending' ? 'قيد الموافقة' : 'مرفوض/مرتجع'}</span></td>
                <td><button class="action-btn edit-btn" data-id="${order.id}" title="تعديل"><i class="ph ph-pencil"></i></button>
                    <button class="action-btn delete-btn" data-id="${order.id}" title="حذف"><i class="ph ph-trash"></i></button></td>
            `;
            tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'rep');
            tr.querySelector('.delete-btn').onclick = async () => { if(confirm("حذف الطلبية؟")) { await deleteDoc(doc(db, "orders", order.id)); loadMyOrders(); } };
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="6">خطا في التحميل</td></tr>'; }
}

let managerOrdersData = [];

async function loadManagerOrders() {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8">جاري التحميل...</td></tr>';
    
    try {
        // جلب جميع الطلبيات مرة واحدة
        const snap = await getDocs(collection(db, "orders"));
        let allOrders = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.createdAt) {
                allOrders.push({ id: d.id, ...data });
            }
        });

        // ترتيب تنازلي
        allOrders.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
            return dateB - dateA;
        });

        // تصفية طلبيات فريق المدير الحالي
        const managerReps = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === currentManagerName);
        const normalizedUnder = managerReps.map(r => r.trim().toLowerCase());

        managerOrdersData = allOrders.filter(o => {
            const repNameNorm = (o.repName || '').trim().toLowerCase();
            // تطابق تام مع الأسماء في الخريطة
            return normalizedUnder.includes(repNameNorm);
        });

        // تحديث الفلاتر (مثل قائمة مندوبي الفريق)
        const repDropdown = document.getElementById('managerRepFilter');
        if (repDropdown && repDropdown.options.length <= 1) {
            repDropdown.innerHTML = '<option value="">جميع مندوبي</option>';
            managerReps.forEach(rep => {
                const opt = document.createElement('option');
                opt.value = rep;
                opt.textContent = rep;
                repDropdown.appendChild(opt);
            });
        }

        applyManagerFilters(); // تطبيق الفلاتر وعرض البيانات
    } catch (e) {
        console.error("خطأ في تحميل طلبيات المدير:", e);
        tbody.innerHTML = '<tr><td colspan="8" style="color:red;">فشل التحميل، راجع الكونسول</td></tr>';
    }
}
function applyManagerFilters() {
    const repDropdown = document.getElementById('managerRepFilter');
    let repFilterText = '';
    if (repDropdown && repDropdown.selectedIndex > 0) {
        repFilterText = repDropdown.options[repDropdown.selectedIndex].text.trim().toLowerCase();
    }

    const pharmFilter = document.getElementById('managerPharmacyFilter')?.value.trim().toLowerCase() || '';
    const statusFilter = document.getElementById('managerStatusFilter')?.value || '';

    const fromVal = document.getElementById('managerFilterFrom')?.value;
    const toVal = document.getElementById('managerFilterTo')?.value;

    let filtered = managerOrdersData.filter(o => {
        const repNameClean = (o.repName || '').toLowerCase();
        const matchRep = repFilterText === '' || repNameClean.includes(repFilterText);
        
        const matchPharm = pharmFilter === '' || (o.pharmacyName && o.pharmacyName.toLowerCase().includes(pharmFilter));
        const matchStatus = statusFilter === '' || o.status === statusFilter;
        
        let matchDate = true;
        if (o.createdAt && o.createdAt.toDate) {
            let oDate = o.createdAt.toDate();
            oDate.setHours(0,0,0,0);
            if (fromVal) { let dFrom = new Date(fromVal); dFrom.setHours(0,0,0,0); if (oDate < dFrom) matchDate = false; }
            if (toVal) { let dTo = new Date(toVal); dTo.setHours(0,0,0,0); if (oDate > dTo) matchDate = false; }
        }
        return matchRep && matchPharm && matchStatus && matchDate;
    });

    const count = filtered.length;
    const total = filtered.reduce((sum, o) => sum + (parseFloat(o.grandTotal) || 0), 0);
    
    const countEl = document.getElementById('managerOrdersCount');
    const totalEl = document.getElementById('managerOrdersTotal');
    if(countEl) countEl.innerText = count;
    if(totalEl) totalEl.innerText = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    renderManagerOrders(filtered);
}

function renderManagerOrders(orders) {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">لا توجد طلبيات مطابقة</td></tr>';
        return;
    }

    orders.forEach(order => {
        const isApproved = order.status === 'approved';
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="order-checkbox" value="${order.id}" style="width: 18px; height: 18px; cursor: pointer; margin: 0;"></td>
            <td>${order.id.substring(0, 6).toUpperCase()}</td>
            <td>${displayDate}</td>
            <td>${order.repName || '-'}</td>
            <td>${order.pharmacyName || '-'}</td>
            <td>${(parseFloat(order.grandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="status-badge ${order.status}">${order.status === 'pending' ? 'قيد الموافقة' : (order.status === 'returned' ? 'مرتجع' : 'موافق عليه')}</span></td>
            <td>
                <button class="action-btn edit-btn" title="تعديل"><i class="ph ph-pencil"></i></button>
                ${!isApproved ? `<button class="action-btn approve-btn" title="موافقة"><i class="ph ph-check-circle"></i></button>` : ''}
            </td>
        `;
        
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'manager');
        if (!isApproved) {
            tr.querySelector('.approve-btn').onclick = async () => { 
                if(confirm("الموافقة على الطلبية؟")) { 
                    await updateDoc(doc(db, "orders", order.id), { status: "approved", updatedAt: new Date() }); 
                    loadManagerOrders(); 
                } 
            };
        }
        tbody.appendChild(tr);
    });
}
document.getElementById('managerRepFilter')?.addEventListener('change', applyManagerFilters);
document.getElementById('managerPharmacyFilter')?.addEventListener('input', applyManagerFilters);
document.getElementById('managerStatusFilter')?.addEventListener('change', applyManagerFilters);


document.getElementById('selectAllOrders')?.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
});

async function handleBulkAction(actionType) {
    const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
    const orderIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (orderIds.length === 0) {
        alert("الرجا تحديد طلبية واحدة على الاقل");
        return;
    }

    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`هل انت متاكد من ${actionText} ${orderIds.length} طلبية؟`)) return;

    try {
        const promises = orderIds.map(id => {
            if (actionType === 'approve') {
                return updateDoc(doc(db, "orders", id), { status: "approved", updatedAt: new Date() });
            } else {
                return deleteDoc(doc(db, "orders", id));
            }
        });
        
        await Promise.all(promises);
        alert(`تم العملية بنجاح`);
        if(document.getElementById('selectAllOrders')) document.getElementById('selectAllOrders').checked = false;
        loadManagerOrders();
    } catch (error) {
        console.error(error);
        alert("حدث خطا اثنا التنفيذ");
    }
}

document.getElementById('bulkApproveBtn')?.addEventListener('click', () => handleBulkAction('approve'));
document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => handleBulkAction('delete'));

async function loadAllCompanyOrders() {
    const tbody = document.getElementById('allOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">جاري تحميل جميع الطلبيات...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        allOrdersData = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.createdAt) {
                allOrdersData.push({ id: d.id, ...data });
            }
        });

        allOrdersData.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
            return dateB - dateA;
        });

        renderAllOrders(allOrdersData);
    } catch(e) { 
        console.error("خطا في تحميل كل الطلبيات:", e); 
        tbody.innerHTML = '<tr><td colspan="7">خطا في التحميل</td></tr>'; 
    }
}

function renderAllOrders(orders) {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="8">لا توجد طلبيات</td></tr>'; 
        updateAllOrdersStats(orders); 
        return; 
    }
    orders.forEach(order => {
        const tr = document.createElement('tr');
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "تاريخ غير متوفر";
        
        tr.innerHTML = `
            <td><input type="checkbox" class="all-order-checkbox" value="${order.id}" style="width: 18px; height: 18px; cursor: pointer; margin: 0;"></td>
            <td>${order.id.substring(0,6).toUpperCase()}</td>
            <td>${displayDate}</td>
            <td class="all-rep-col">${order.repName || '-'}</td>
            <td class="all-pharm-col">${order.pharmacyName || '-'}</td>
            <td>${(parseFloat(order.grandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="status-badge ${order.status}">${order.status === 'approved' ? 'موافق عليه' : (order.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td>
            <td><button class="action-btn edit-btn" title="تعديل"><i class="ph ph-pencil"></i></button>
                <button class="btn-view" title="عرض التفاصيل"><i class="ph ph-eye"></i></button></td>
        `;
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'all');
        tr.querySelector('.btn-view').onclick = () => showOrderDetails(order);
        tbody.appendChild(tr);
    });
    updateAllOrdersStats(orders);
}
function updateAllOrdersStats(orders) {
    const count = orders.length;
    const total = orders.reduce((sum, order) => sum + (parseFloat(order.grandTotal) || 0), 0);
    const countElem = document.getElementById('totalOrdersCount');
    const sumElem = document.getElementById('totalOrdersSum');
    if (countElem) countElem.innerText = count;
    if (sumElem) sumElem.innerText = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    const repFilter = (document.getElementById('filterAllRep').value || '').toLowerCase().trim();
    const pharmFilter = (document.getElementById('filterAllPharmacy').value || '').toLowerCase().trim();
    const statusFilter = (document.getElementById('filterAllStatus').value || '').trim();

    // قراءة قيم التاريخ
    const fromVal = document.getElementById('managerFilterFrom')?.value;
    const toVal = document.getElementById('managerFilterTo')?.value;

    const filtered = allOrdersData.filter(order => {
        const repName = (order.repName || '').toLowerCase();
        const pharmName = (order.pharmacyName || '').toLowerCase();
        const orderStatus = (order.status || '').trim();

        // التحقق من التاريخ
        let matchDate = true;
        if (order.createdAt && order.createdAt.toDate) {
            let oDate = order.createdAt.toDate();
            oDate.setHours(0,0,0,0);
            
            if (fromVal) { let dFrom = new Date(fromVal); dFrom.setHours(0,0,0,0); if (oDate < dFrom) matchDate = false; }
            if (toVal) { let dTo = new Date(toVal); dTo.setHours(0,0,0,0); if (oDate > dTo) matchDate = false; }
        }

        return repName.includes(repFilter) &&
               pharmName.includes(pharmFilter) &&
               (statusFilter === '' || orderStatus === statusFilter) &&
               matchDate;
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
        
        snap.forEach(d => { 
            const order = d.data(); 
            const dateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
            
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => { 
                    flatData.push({ 
                        "التاريخ": dateStr, 
                        "المندوب": order.repName || "غير معروف", 
                        "كود الصيدلية": order.pharmacyCode || "-", 
                        "الصيدلية": order.pharmacyName || "غير معروف", 
                        "الصنف": item.name || "-", 
                        "الكمية": parseInt(item.qty, 10) || 0, 
                        "البونص": parseInt(item.bonus, 10) || 0, 
                        "السعر": parseFloat(item.price) || 0, 
                        "المجموع الفرعي": parseFloat(item.total) || 0, 
                        "الاجمالي الكلي": parseFloat(order.grandTotal) || 0, 
                        "الحالة": order.status || "pending" 
                    }); 
                }); 
            }
        });
        
        if(flatData.length === 0) { alert("لا توجد بيانات"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "جميع_الطلبيات");
        XLSX.writeFile(wb, "جميع_طلبيات_الشركة.xlsx");
    } catch(e) { 
        console.error(e);
        alert("خطا في التصدير"); 
    } finally { 
        btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير جميع الطلبيات"; 
    }
};

async function ensureProductsLoaded() {
    if (productsList.length > 0) return true;
    try {
        const prodSnap = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
        productsList.sort((a,b) => a.name.localeCompare(b.name));
        return true;
    } catch(e) {
        console.error("فشل تحميل المنتجات:", e);
        return false;
    }
}

async function openEditOrder(orderId, userType) {
    const loaded = await ensureProductsLoaded();
    if (!loaded) { alert("لم يتم تحميل المنتجات"); return; }

    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (!orderDoc.exists()) return alert("الطلب غير موجود");
    const order = orderDoc.data();
    editingOrderId = orderId;

    // 1. إظهار نافذة التعديل
    const editModal = document.getElementById('editOrderModal');
    if (editModal) editModal.style.display = 'flex';

    // 2. بناء محتوى النافذة (الذي كان مفقوداً بسبب الاختصار ...)
    const container = document.getElementById('editOrderContainer');
    if (!container) {
        console.error("حاوية editOrderContainer غير موجودة");
        return;
    }

    container.innerHTML = `
        <div style="margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 15px;">
            <h3 style="margin: 0 0 10px 0; color: #004a99;"><i class="ph ph-pencil-simple"></i> تعديل طلبية</h3>
            <p style="margin: 0; font-size: 15px;">الصيدلية: <strong style="color:#d32f2f;">${order.pharmacyName || '-'}</strong> | المندوب: <strong>${order.repName || '-'}</strong></p>
        </div>
        
<div class="table-responsive" style="max-height: 350px; overflow-y: auto;">
            <table class="order-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align: right; padding: 10px;">الصنف</th>
                        <th style="text-align: center; width: 80px;">الكمية</th>
                        <th style="text-align: center; width: 80px;">البونص</th>
                        <th style="text-align: center; width: 100px;">السعر</th>
                        <th style="text-align: center; width: 100px;">المجموع</th>
                        <th style="text-align: center; width: 50px;">حذف</th>
                    </tr>
                </thead>
                <tbody id="editOrderBody"></tbody>
            </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <button type="button" id="editAddRowBtn" class="btn-secondary" style="padding: 8px 15px;"><i class="ph ph-plus"></i> إضافة صنف</button>
            <h3 style="margin: 0; color: #d32f2f;">الإجمالي: <span id="editGrandTotal">${parseFloat(order.grandTotal).toFixed(2)}</span></h3>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button type="button" class="btn-secondary" onclick="closeEditModal()">إلغاء</button>
            <button type="button" id="saveEditOrderBtn" class="btn-primary"><i class="ph ph-floppy-disk"></i> حفظ التعديلات</button>
        </div>
    `;

    const editBody = document.getElementById('editOrderBody');
    if (editBody) editBody.innerHTML = ''; 

    function updateEditTotal() {
        let total = 0;
        document.querySelectorAll('#editOrderBody .row-total').forEach(td => total += parseFloat(td.innerText) || 0);
        const grandTotalEl = document.getElementById('editGrandTotal');
        if (grandTotalEl) grandTotalEl.innerText = total.toFixed(2);
    }

    function addEditRow(productName='', qty=1, bonus=0, price=0, rowTotal=0) {
const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="autocomplete-wrapper"><input type="text" class="product-input" value="${productName.replace(/"/g, '&quot;')}" style="width:100%; min-width:220px;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
            <td style="text-align: center;"><input type="number" class="qty-input" value="${qty}" min="1" style="width: 80px; text-align: center; padding: 8px;"></td>
            <td style="text-align: center;"><input type="number" class="bonus-input" value="${bonus}" min="0" style="width: 80px; text-align: center; padding: 8px;"></td>
            <td class="price-cell" style="text-align: center; font-weight: bold;">${parseFloat(price).toFixed(2)}</td>
            <td class="row-total" style="text-align: center; font-weight: bold;">${parseFloat(rowTotal).toFixed(2)}</td>
            <td style="text-align: center;"><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
        `;
        const s = tr.querySelector('.product-input'), sug = tr.querySelector('.product-suggestions');
        const q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
        const productNames = productsList.map(prod => prod.name);
        
        setupAutocomplete(s, sug, productNames, (selectedName) => { 
            const prod = productsList.find(pr => pr.name === selectedName); 
            const pr = prod ? parseFloat(prod.price) : 0; 
            p.innerText = pr.toFixed(2); 
            t.innerText = (pr * q.value).toFixed(2); 
            updateEditTotal(); 
        });

        s.addEventListener('blur', function() {
            const val = this.value.trim();
            if (val === "") return;
            const isValid = productsList.some(pr => pr.name === val);
            if (!isValid) {
                this.style.border = "2px solid red";
                this.style.backgroundColor = "#fff0f0";
            } else {
                this.style.border = "";
                this.style.backgroundColor = "";
            }
        });

        q.oninput = () => { t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); updateEditTotal(); };
        tr.querySelector('.del-row').onclick = () => { tr.remove(); updateEditTotal(); };
        
        if (editBody) editBody.appendChild(tr);
        updateEditTotal();
    }
    
    // تعبئة الأصناف المحفوظة
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => { addEditRow(item.name, item.qty, item.bonus, item.price, item.total); });
    } else {
        addEditRow();
    }
    
    const addRowBtn = document.getElementById('editAddRowBtn');
    if (addRowBtn) addRowBtn.onclick = () => addEditRow();
    
    const saveBtn = document.getElementById('saveEditOrderBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = async () => {
            const items = [];
            let invalidItem = false;

            document.querySelectorAll('#editOrderBody tr').forEach(r => {
                const inp = r.querySelector('.product-input');
                if (inp && inp.value.trim() !== "") {
                    const isValid = productsList.some(prod => prod.name === inp.value.trim());
                    
                    if (!isValid) {
                        invalidItem = true;
                        inp.style.border = "2px solid red";
                    } else {
                        inp.style.border = "";
                        items.push({ 
                            name: inp.value, 
                            qty: r.querySelector('.qty-input').value, 
                            bonus: r.querySelector('.bonus-input').value || 0, 
                            price: r.querySelector('.price-cell').innerText, 
                            total: r.querySelector('.row-total').innerText 
                        });
                    }
                }
            });

            if (invalidItem) {
                return alert("يرجى التأكد من اختيار الأصناف الصحيحة من القائمة قبل الحفظ.");
            }

            if (items.length === 0) return alert("لا يمكن حفظ طلبية فارغة!");

            try {
                const grandTotalEl = document.getElementById('editGrandTotal');
                const newGrandTotal = grandTotalEl ? parseFloat(grandTotalEl.innerText) : 0;
                
                await updateDoc(doc(db, "orders", editingOrderId), { 
                    items: items, 
                    grandTotal: newGrandTotal, 
                    status: "pending", 
                    updatedAt: new Date() 
                });
                alert("تم تحديث الطلبية بنجاح.");
                closeEditModal();
                
                if(userType === 'rep') loadMyOrders();
                else if(userType === 'manager') loadManagerOrders();
                else if(userType === 'all') loadAllCompanyOrders();
                
            } catch (e) {
                console.error(e);
                alert("حدث خطأ أثناء التحديث");
            }
        };
    }
}
function closeEditModal() { document.getElementById('editOrderModal').style.display = 'none'; editingOrderId = null; }
window.closeEditModal = closeEditModal;

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
            tr.innerHTML = `<td><b>${o.id.substring(0,5).toUpperCase()}</b></td><td>${o.createdAt.toDate().toLocaleString('en-GB')}</td><td class="rep-col">${o.repName}</td><td class="pharm-col">${o.pharmacyName}</td><td>${parseFloat(o.grandTotal).toFixed(2)}</td><td><span class="status-badge ${o.status === 'approved' ? 'approved' : (o.status === 'pending' ? 'pending' : 'returned')}">${o.status === 'approved' ? 'موافق عليه' : (o.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td><td><button class="btn-view" style="color:#004a99;"><i class="ph ph-eye"></i></button></td>`;
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
        
        if (!isAdmin && currentRepName) {
            allOrders = allOrders.filter(o => o.repName === currentRepName);
        }

        allOrders.forEach(order => {
            const dateStr = order.createdAt.toDate().toLocaleDateString('en-GB'); 

            order.items.forEach(item => { 
                flatData.push({ 
                    "التاريخ": dateStr, 
                    "المندوب": order.repName, 
                    "كود الصيدلية": order.pharmacyCode || "-", 
                    "الصيدلية": order.pharmacyName, 
                    "الصنف": item.name, 
                    "الكمية": parseInt(item.qty, 10) || 0, 
                    "البونص": parseInt(item.bonus, 10) || 0, 
                    "السعر": parseFloat(item.price) || 0, 
                    "المجموع الفرعي": parseFloat(item.total) || 0, 
                    "الاجمالي الكلي": parseFloat(order.grandTotal) || 0, 
                    "الحالة": order.status 
                }); 
            });
        });

        if (flatData.length === 0) { alert("لا توجد بيانات"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_طلبيات.xlsx");
        
    } catch (e) {
        console.error(e);
        alert("خطأ في التصدير");
    } finally {
        btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير للاكسل";
    }
};

document.getElementById('navOrderBtn').onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('orderScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navOrderBtn').classList.add('active'); 
};
document.getElementById('navMyOrdersBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('myOrdersScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navMyOrdersBtn').classList.add('active'); loadMyOrders(); };
document.getElementById('navReportsBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('reportsScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navReportsBtn').classList.add('active'); loadReports(); };
document.getElementById('logoutBtn').onclick = () => { clearRepSession(); if(confirm("تسجيل الخروج؟")) location.reload(); };

// المتغيرات لحفظ اختيار المدير
let selectedAdminType = null;
let selectedAdminName = null;

// تفعيل اختيار أحد الأزرار الثلاثة
document.querySelectorAll('.btn-admin-opt').forEach(btn => {
    btn.onclick = (e) => {
        // إزالة التحديد عن كل الأزرار
        document.querySelectorAll('.btn-admin-opt').forEach(b => b.classList.remove('active'));
        // إضافة التحديد للزر المختار
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        
        selectedAdminType = targetBtn.getAttribute('data-type');
        selectedAdminName = targetBtn.getAttribute('data-name');
    };
});

// عند الضغط على الدخول كمدير من الشاشة الرئيسية، افتح النافذة
// عند الضغط على الدخول كمدير من الشاشة الرئيسية، افتح النافذة مع الرسالة الترحيبية
document.getElementById('adminModeBtn').onclick = () => {
    // التحقق من التخزين المحلي لضمان ظهور الرسالة مرة واحدة فقط
    const isNoticeShown = localStorage.getItem('systemUpdate_v1');
    
    if (!isNoticeShown) {
        // إظهار رسالة التحديثات أولاً
        document.getElementById('updateNoticeModal').style.display = 'flex';
        
        // عند الضغط على زر المتابعة
        document.getElementById('closeUpdateNoticeBtn').onclick = () => {
            document.getElementById('updateNoticeModal').style.display = 'none';
            localStorage.setItem('systemUpdate_v1', 'true'); // تسجيل أنه شاهدها
            openAdminLoginBox();
        };
    } else {
        // إذا كان قد شاهدها مسبقاً، افتح نافذة الدخول مباشرة
        openAdminLoginBox();
    }
};

// دالة مساعدة لفتح نافذة تسجيل الدخول
function openAdminLoginBox() {
    document.getElementById('adminLoginModal').style.display = 'flex';
    document.getElementById('adminPasswordInput').value = ''; 
}
// عند الضغط على زر "دخول" داخل النافذة
// تفعيل الدخول باستخدام زر Enter في حقل الباسوورد
document.getElementById('adminPasswordInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('confirmAdminLoginBtn').click();
    }
});

// عند الضغط على زر "دخول" داخل النافذة
document.getElementById('confirmAdminLoginBtn').onclick = () => {
    if (!selectedAdminType) {
        return alert("الرجاء اختيار الحساب أولاً (محمد، عبدالله، أو لوحة التقارير)");
    }
    
    const pass = document.getElementById('adminPasswordInput').value;    
    if (pass === "202604") {
        const rememberMe = document.getElementById('rememberAdmin').checked;
        
        // حفظ الدخول إذا طلب المستخدم
        if (rememberMe) {
            localStorage.setItem('isAdminLoggedIn', 'true');
            localStorage.setItem('managerName', selectedAdminName);
            localStorage.setItem('adminPassword', pass);
            localStorage.setItem('adminType', selectedAdminType);
        } else {
            localStorage.removeItem('isAdminLoggedIn');
            localStorage.removeItem('managerName');
            localStorage.removeItem('adminPassword');
            localStorage.removeItem('adminType');
        }

        // توجيه حسب الاختيار
        if (selectedAdminType === 'reports') {
            // تحويل إلى صفحة التقارير المنفصلة
            window.location.href = 'mohammad.html';
        } else {
            // الدخول كمدير مبيعات لاعتماد الطلبيات (محمد أو عبدالله)
            isAdmin = true;
            currentManagerName = selectedAdminName;
            document.getElementById('adminLoginModal').style.display = 'none';
            initializeManagerView(selectedAdminName);
        }
        
    } else {
        alert("كلمة المرور خاطئة!");
    }
};

document.getElementById('selectAllAllOrders')?.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.all-order-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
});

async function handleAllOrdersBulkAction(actionType) {
    const selectedCheckboxes = document.querySelectorAll('.all-order-checkbox:checked');
    const orderIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (orderIds.length === 0) {
        alert("الرجاء تحديد طلبية واحدة على الأقل");
        return;
    }

    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`هل أنت متأكد من ${actionText} ${orderIds.length} طلبية؟`)) return;

    try {
        const promises = orderIds.map(id => {
            if (actionType === 'approve') {
                return updateDoc(doc(db, "orders", id), { status: "approved", updatedAt: new Date() });
            } else {
                return deleteDoc(doc(db, "orders", id));
            }
        });
        
        await Promise.all(promises);
        alert(`تمت العملية بنجاح`);
        if(document.getElementById('selectAllAllOrders')) document.getElementById('selectAllAllOrders').checked = false;
        loadAllCompanyOrders(); 
    } catch (error) {
        console.error(error);
        alert("حدث خطأ أثناء التنفيذ");
    }
}

document.getElementById('bulkApproveAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('approve'));
document.getElementById('bulkDeleteAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('delete'));
    
window.closeModal = () => detailsModal.style.display = 'none';
loadInitialData();

// ==========================================
// برمجة فلاتر التاريخ (للمدير)
// ==========================================
const managerFilterFrom = document.getElementById('managerFilterFrom');
const managerFilterTo = document.getElementById('managerFilterTo');
const btnTodayOrders = document.getElementById('btnTodayOrders');
const btnClearManagerFilter = document.getElementById('btnClearManagerFilter');

// تحديث الفلاتر عند تغيير التاريخ يدوياً
managerFilterFrom?.addEventListener('change', () => { 
    applyManagerFilters(); 
    filterAllOrders(); 
});
managerFilterTo?.addEventListener('change', () => { 
    applyManagerFilters(); 
    filterAllOrders(); 
});

// زر طلبيات اليوم
btnTodayOrders?.addEventListener('click', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    
    managerFilterFrom.value = todayStr;
    managerFilterTo.value = todayStr;
    
    applyManagerFilters();
    filterAllOrders();
});

// زر التصفير
btnClearManagerFilter?.addEventListener('click', () => {
    managerFilterFrom.value = '';
    managerFilterTo.value = '';
    
    applyManagerFilters();
    filterAllOrders();
});
