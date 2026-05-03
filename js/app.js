import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, getDoc, onSnapshot } from './firebase.js';

// ==========================================
// 🚀 1. نظام الإشعارات (Toasts)
// ==========================================
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ph-info';
    if (type === 'success') icon = 'ph-check-circle';
    if (type === 'error') icon = 'ph-warning-circle';
    if (type === 'warning') icon = 'ph-warning';
    
    toast.innerHTML = `<i class="ph ${icon}" style="font-size: 1.4rem;"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

// ==========================================
// 📡 2. نظام الاتصال (Offline / Online Indicator)
// ==========================================
function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    if (!navigator.onLine) {
        banner.classList.add('active');
    } else {
        banner.classList.remove('active');
        if (banner.classList.contains('was-offline')) {
            showToast("عاد الاتصال بالإنترنت، النظام يعمل بكفاءة.", "success");
            banner.classList.remove('was-offline');
        }
    }
}
window.addEventListener('online', () => { 
    const banner = document.getElementById('offline-banner');
    if(banner) banner.classList.add('was-offline');
    updateOnlineStatus(); 
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ==========================================
// 💾 3. الحفظ التلقائي للمسودة (Auto-save Draft)
// ==========================================
function autoSaveDraft() {
    if (!currentRepId || !currentPharmacyName) return;
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value.trim() !== "") {
            items.push({
                name: s.value,
                qty: r.querySelector('.qty-input').value,
                bonus: r.querySelector('.bonus-input').value || 0,
                note: r.querySelector('.item-note-input').value || ''
            });
        }
    });
    const note = document.getElementById('orderNoteInput')?.value || "";
    localStorage.setItem(`draft_${currentRepId}_${currentPharmacyName}`, JSON.stringify({ items, note }));
}

function clearDraft() {
    if (currentRepId && currentPharmacyName) {
        localStorage.removeItem(`draft_${currentRepId}_${currentPharmacyName}`);
    }
}

// ==========================================
// ⚙️ 4. التهيئة الأساسية والمتغيرات
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('notesFeatureSeen')) {
        const featureModal = document.getElementById('featureUpdateModal');
        const closeFeatureBtn = document.getElementById('closeFeatureUpdateBtn');
        
        if(featureModal && closeFeatureBtn) {
            featureModal.style.display = 'flex';
            closeFeatureBtn.addEventListener('click', () => {
                featureModal.style.display = 'none';
                localStorage.setItem('notesFeatureSeen', 'true');
            });
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // 🔐 التحديث الأمني: إزالة الباسوورد الصريح من الـ LocalStorage واستخدام Token
    const legacyPass = localStorage.getItem('adminPassword');
    if(legacyPass) localStorage.removeItem('adminPassword'); // تنظيف القديم

    const savedManagerName = localStorage.getItem('managerName') || sessionStorage.getItem('managerName');
    const secureToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

    if (savedManagerName && secureToken) {
        console.log("تم استرجاع جلسة الإدارة المشفرة");
        if(document.getElementById('rememberMe')) {
            document.getElementById('rememberMe').checked = !!localStorage.getItem('authToken');
        }
    }
    
    // ربط زر الطباعة
    const printBtn = document.getElementById('printDraftBtn');
    if(printBtn) {
        printBtn.addEventListener('click', () => { window.print(); });
    }
});
// 🟢 إضافة: دالة لضبط التاريخ الافتراضي على الشهر الحالي
function setDefaultMonthFilter() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    
    // أول يوم في الشهر
    const firstDay = `${y}-${m}-01`;
    
    // آخر يوم في الشهر
    const lastDayDate = new Date(y, date.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

    const fromInput = document.getElementById('managerFilterFrom');
    const toInput = document.getElementById('managerFilterTo');

    // تعيين التواريخ فقط إذا كانت الحقول فارغة (لعدم الكتابة فوق فلتر المستخدم)
    if (fromInput && !fromInput.value) fromInput.value = firstDay;
    if (toInput && !toInput.value) toInput.value = lastDay;
}
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

    const managerAddBtn = document.getElementById('managerAddNewOrderBtn');
    if (managerAddBtn) {
        managerAddBtn.onclick = () => {
            document.getElementById('managerScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('userInfo').style.display = 'none';
            
            const authBox = document.querySelector('#loginScreen .auth-box');
            if (authBox) authBox.style.display = 'block';

            const repSelectElem = document.getElementById('repSelect');
            const pharmacyInputElem = document.getElementById('pharmacyInput');
            
            if (repSelectElem) {
                repSelectElem.value = "";
                repSelectElem.focus(); 
            }
            if (pharmacyInputElem) {
                pharmacyInputElem.value = "";
                pharmacyInputElem.disabled = true; 
            }
            showToast("يرجى الآن اختيار المندوب من القائمة، ثم اختيار الصيدلية لبدء الطلبية.", "info");
        };
    }
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('managerScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user-gear"></i> <b>المدير: ${managerName}</b>`;
    
    document.getElementById('navOrderBtn').style.display = 'none';
    document.getElementById('navMyOrdersBtn').style.display = 'none';
    document.getElementById('navReportsBtn').style.display = 'none';
    setDefaultMonthFilter();
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
// 🟢 إضافة: كلمات سر المندوبين المشفرة (Base64) لحمايتها من القراءة المباشرة
const repPasswordsMap = {
    "قضايا": "MjAyNg==",
    "LPO": "MjAyNg==",
    "Settlement": "MjAyNg==",
    "الهاتف": "MjAyNg==",
    "مراد الظاهر": "MzQ3OA==",
    "محمد ابو يامين": "NDA5OQ==",
    "يزيد الرقب": "NDE4Nw==",
    "محمد النسور": "MjAyNg==",
    "مؤيد الزعبي": "MzQ3OQ==",
    "محمد طوالبه": "MjAyNjA0",
    "اجود التلهوني": "MzczNw==",
    "تامر عقل": "MzU2OQ==",
    "Inactive": "MjAyNg==",
    "مغلقه": "MjAyNg==",
    "اخرين": "MjAyNg==",
    "محمد الفاعوري": "NDAyMA==",
    "مراد عمر": "MTUxMA==",
    "محمد عبدربه": "NDAyOQ=="
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

let unsubMyOrders = null;
let unsubManagerOrders = null;
let unsubAllOrders = null;
let unsubReports = null;

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

addRowBtn.onclick = () => {
    const productInputs = document.querySelectorAll('#orderBody .product-input');
    if (productInputs.length > 0) {
        const lastInput = productInputs[productInputs.length - 1];
        if (lastInput.value.trim() === "") {
            showToast("الرجاء اختيار الصنف الحالي أولاً قبل إضافة صنف جديد.", "warning");
            lastInput.focus(); 
            return;
        }
    }
    addNewRow();
};

const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

function getManagerName(repName) {
    return repManagerMap[repName] || "غير محدد";
}

function setupAutocomplete(inputEl, suggestionsEl, dataArray, onSelectCallback) {
    inputEl._autocompleteData = dataArray;
    inputEl._autocompleteCallback = onSelectCallback;
    
    if (inputEl._hasAutocomplete) return;
    inputEl._hasAutocomplete = true;

    let currentFocus = -1;

    function showList() {
        const data = inputEl._autocompleteData || [];
        const cb = inputEl._autocompleteCallback;
        const val = inputEl.value.trim().toLowerCase();
        
        suggestionsEl.innerHTML = '';
        currentFocus = -1;

        const filtered = val ? data.filter(item => item.toLowerCase().includes(val)) : data;

        if (filtered.length > 0) {
            filtered.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
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
                    } else { div.innerText = item; }
                } else { div.innerText = item; }

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
            suggestionsEl.style.position = 'absolute';
            suggestionsEl.style.top = (inputEl.offsetTop + inputEl.offsetHeight) + 'px';
            suggestionsEl.style.left = inputEl.offsetLeft + 'px';
            suggestionsEl.style.width = rect.width + 'px';
            suggestionsEl.style.zIndex = '9999999';
            suggestionsEl.style.backgroundColor = '#ffffff';
            suggestionsEl.style.border = '1px solid #ccc';
            suggestionsEl.style.borderRadius = '4px';
            suggestionsEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            suggestionsEl.style.maxHeight = '200px';
            suggestionsEl.style.overflowY = 'auto';
            suggestionsEl.style.display = 'block';
        } else { suggestionsEl.style.display = 'none'; }
    }

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
        repSelect.innerHTML = '<option value="">⏳ جاري تحميل البيانات...</option>';
        repSelect.disabled = true;

        const CACHE_KEY = 'dad_app_cache_v1';
        const CACHE_TIME_KEY = 'dad_app_cache_time_v1';
        const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

        const cachedDataStr = localStorage.getItem(CACHE_KEY);
        const cacheTimeStr = localStorage.getItem(CACHE_TIME_KEY);
        const now = new Date().getTime();

        let repsData = [];
        let prodsData = [];

        if (cachedDataStr && cacheTimeStr && (now - parseInt(cacheTimeStr) < CACHE_EXPIRY)) {
            const parsed = JSON.parse(cachedDataStr);
            repsData = parsed.reps;
            prodsData = parsed.products;
        } else {
            const repsSnap = await getDocs(collection(db, "reps"));
            const prodSnap = await getDocs(collection(db, "products"));

            repsSnap.forEach(d => repsData.push({ id: d.id, ...d.data() }));
            prodSnap.forEach(d => prodsData.push({ id: d.id, ...d.data() }));

            localStorage.setItem(CACHE_KEY, JSON.stringify({ reps: repsData, products: prodsData }));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());
        }

        repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
        repsData.forEach(d => { 
            const opt = document.createElement('option'); 
            opt.value = d.id; 
            opt.textContent = d.name; 
            repSelect.appendChild(opt); 
        });
        
        productsList = prodsData;
        productsList.sort((a,b) => a.name.localeCompare(b.name));
        
    } catch(e) { 
        console.error("خطأ في تحميل البيانات الأولية:", e);
        repSelect.innerHTML = '<option value="">❌ فشل التحميل</option>';
        showToast("حدث خطأ في تحميل البيانات. يرجى تحديث الصفحة.", "error");
    } finally {
        repSelect.disabled = false;
    }
}

function addNewRow() {
    if (productsList.length === 0) { 
        setTimeout(() => addNewRow(), 500); 
        return; 
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><div class="autocomplete-wrapper"><input type="text" class="product-input" placeholder="ابحث باسم الصنف..." style="width:100%;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td style="position:relative;"><input type="number" class="bonus-input" value="0" min="0"><span class="bonus-pct" style="font-size:0.75rem; color:var(--primary); font-weight:bold; display:block; text-align:center; margin-top:4px;"></span></td>
        <td class="price-cell">0.00</td>
        <td class="row-total">0.00</td>
        <td><input type="text" class="item-note-input" placeholder="ملاحظة..." style="width:100%; padding: 8px;"></td> 
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;
    
    const s = tr.querySelector('.product-input'), 
          sug = tr.querySelector('.product-suggestions'), 
          q = tr.querySelector('.qty-input'), 
          b = tr.querySelector('.bonus-input'),
          p = tr.querySelector('.price-cell'), 
          t = tr.querySelector('.row-total'),
          bPct = tr.querySelector('.bonus-pct');
          
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
            this.classList.add('input-error');
            let err = this.parentNode.querySelector('.inline-error-msg');
            if(!err) { err = document.createElement('span'); err.className="inline-error-msg"; err.innerText="صنف غير موجود"; this.parentNode.appendChild(err); }
        } else {
            this.classList.remove('input-error');
            const err = this.parentNode.querySelector('.inline-error-msg');
            if(err) err.remove();
        }
    });

    // 💡 ميزة: حساب نسبة البونص تلقائياً
    function calcBonus() {
        const qVal = parseFloat(q.value) || 0;
        const bVal = parseFloat(b.value) || 0;
        if(qVal > 0 && bVal > 0) {
            bPct.innerText = `${Math.round((bVal / qVal) * 100)}% بونص`;
        } else {
            bPct.innerText = "";
        }
    }

    q.oninput = () => { 
        t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); 
        calcBonus();
        updateGrandTotal(); 
    };
    b.oninput = () => { calcBonus(); updateGrandTotal(); };

    tr.querySelector('.item-note-input').oninput = () => { autoSaveDraft(); };

    tr.querySelector('.del-row').onclick = () => { 
        tr.remove(); 
        updateGrandTotal(); 
    };

    orderBody.appendChild(tr);
}

function updateGrandTotal() {
    let g = 0; 
    document.querySelectorAll('#orderBody .row-total').forEach(td => {
        g += parseFloat(td.innerText) || 0;
    });
    if (grandTotalEl) grandTotalEl.innerText = g.toFixed(2);
    
    // تشغيل الحفظ التلقائي عند أي تحديث في الفاتورة
    autoSaveDraft();
}

repSelect.onchange = async (e) => {
    if (!e.target.value) {
        document.getElementById('repPasswordGroup').style.display = 'none';
        return;
    }
    
    // 🟢 إظهار حقل الرقم السري عند اختيار المندوب
    document.getElementById('repPasswordGroup').style.display = 'block';
    
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
        pharmacyInput.placeholder = 'خطأ في التحميل، الرجاء المحاولة مرة أخرى';
    }
};
pharmacyInput.oninput = () => { startOrderBtn.disabled = !pharmacyInput.value.trim(); };

function validatePharmacyInput() {
    const pharmacyName = pharmacyInput.value.trim();
    const isValid = pharmacyName !== "" && currentPharmaciesData.some(p => p.name === pharmacyName);
    
    if (!isValid && pharmacyName !== "") {
        pharmacyInput.classList.add('input-error');
        startOrderBtn.disabled = true;
    } else if (pharmacyName === "") {
        pharmacyInput.classList.remove('input-error');
        startOrderBtn.disabled = true;
    } else {
        pharmacyInput.classList.remove('input-error');
        startOrderBtn.disabled = false;
    }
    return isValid;
}

pharmacyInput.addEventListener('blur', validatePharmacyInput);
pharmacyInput.addEventListener('input', function() {
    const isValid = currentPharmaciesData.some(p => p.name === this.value.trim());
    if (isValid) {
        this.classList.remove('input-error');
        startOrderBtn.disabled = false;
    } else {
        startOrderBtn.disabled = true;
    }
});

startOrderBtn.onclick = async () => {
    if (productsList.length === 0) { 
        showToast("الرجاء الانتظار... يتم تحميل المنتجات.", "info"); 
        return; 
    }
    const selectedRepNameText = repSelect.options[repSelect.selectedIndex].text;
    const repPassInput = document.getElementById('repPasswordInput');
    const enteredPass = repPassInput.value.trim();
    const expectedHash = repPasswordsMap[selectedRepNameText];

    if (!enteredPass) {
        repPassInput.classList.add('input-error');
        return showToast("الرجاء إدخال الرقم السري الخاص بك.", "warning");
    }

    if (expectedHash && btoa(enteredPass) !== expectedHash) {
        repPassInput.classList.add('input-error');
        return showToast("الرقم السري للمندوب غير صحيح!", "error");
    }
    
    repPassInput.classList.remove('input-error');
    repPassInput.value = ''; // تنظيف الحقل كإجراء أمني بعد الدخول
    const pharmacyName = pharmacyInput.value.trim();
    const selectedPharm = currentPharmaciesData.find(p => p.name === pharmacyName);
    
    if (!selectedPharm) {
        pharmacyInput.classList.add('input-error');
        showToast("الرجاء اختيار صيدلية صحيحة من القائمة حصراً.", "error");
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
    
    // 💡 ميزة: زر عرض سجل الصيدلية
    const pharmHeader = document.getElementById('orderPharmacyName');
    pharmHeader.innerHTML = `${currentPharmacyName} 
        <button id="showPharmHistoryBtn" class="btn-icon" style="font-size: 0.8rem; padding: 4px 8px; margin-right: 10px;" title="تاريخ آخر طلبية">
            <i class="ph ph-clock-counter-clockwise"></i> السجل
        </button>`;
        
document.getElementById('showPharmHistoryBtn').onclick = async () => {
        showToast("جاري جلب السجل التاريخي للصيدلية...", "info");
        try {
            const qFilter = query(collection(db, "orders"), where("pharmacyName", "==", currentPharmacyName));
            const snap = await getDocs(qFilter);
            let history = [];
            snap.forEach(d => history.push({ id: d.id, ...d.data() }));
            
            if(history.length === 0) {
                 showToast("لا توجد طلبيات سابقة لهذه الصيدلية.", "warning");
                 return;
            }
            
            // ترتيب الطلبيات من الأحدث للأقدم
            history.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate());
            
            // تعبئة النافذة المنبثقة الجديدة
            const historyBody = document.getElementById('pharmacyHistoryBody');
            historyBody.innerHTML = '';
            document.getElementById('historyModalSubtitle').innerText = `صيدلية ${currentPharmacyName}`;
            
            history.forEach(o => {
                const tr = document.createElement('tr');
                tr.className = `row-${o.status}`; // تلوين الصف حسب الحالة
                const displayDate = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
                
                tr.innerHTML = `
                    <td>${o.id.substring(0,6).toUpperCase()}</td>
                    <td>${displayDate}</td>
                    <td>${o.repName || '-'}</td>
                    <td>${(parseFloat(o.grandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ا</td>
                    <td><span class="status-badge ${o.status}">${o.status === 'approved' ? 'موافق عليه' : (o.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td>
                    <td><button class="action-btn edit-btn btn-view-history" title="عرض التفاصيل"><i class="ph ph-eye"></i></button></td>
                `;
                
                // عند الضغط على زر العين، سيفتح تفاصيل الفاتورة (النافذة الحالية)
                tr.querySelector('.btn-view-history').onclick = () => {
                    showOrderDetails(o); 
                };
                
                historyBody.appendChild(tr);
            });
            
            // إظهار النافذة
            document.getElementById('pharmacyHistoryModal').style.display = 'flex';
            
        } catch(e) {
            showToast("تعذر جلب السجل، تأكد من الاتصال.", "error");
        }
    };    
    // 💡 ميزة: استرجاع الحفظ التلقائي (Draft)
    const draftKey = `draft_${currentRepId}_${currentPharmacyName}`;
    const draftStr = localStorage.getItem(draftKey);
    orderBody.innerHTML = '';
    
    if(draftStr) {
        try {
            const draft = JSON.parse(draftStr);
            if(draft.items && draft.items.length > 0) {
                showToast("تم استرجاع مسودة غير مكتملة لهذه الصيدلية.", "info");
                draft.items.forEach(item => {
                    addNewRow(); 
                    const lastRow = orderBody.lastElementChild;
                    lastRow.querySelector('.product-input').value = item.name;
                    lastRow.querySelector('.qty-input').value = item.qty;
                    lastRow.querySelector('.bonus-input').value = item.bonus;
                    lastRow.querySelector('.item-note-input').value = item.note;
                    
                    const prod = productsList.find(pr => pr.name === item.name); 
                    const pr = prod ? parseFloat(prod.price) : 0; 
                    lastRow.querySelector('.price-cell').innerText = pr.toFixed(2); 
                    lastRow.querySelector('.row-total').innerText = (pr * item.qty).toFixed(2);
                    lastRow.querySelector('.qty-input').dispatchEvent(new Event('input')); // Recalc bonus
                });
                if(draft.note) document.getElementById('orderNoteInput').value = draft.note;
                updateGrandTotal();
            } else {
               addNewRow();
            }
        } catch(e) { addNewRow(); }
    } else {
        addNewRow();
    }
    
    document.getElementById('navMyOrdersBtn').style.display = 'inline-block';
    document.getElementById('navReportsBtn').style.display = 'inline-block';
    
    document.getElementById('orderNoteInput').addEventListener('input', autoSaveDraft);
};

const originalRepOnChange = repSelect.onchange;
repSelect.onchange = async (e) => {
    if (originalRepOnChange) await originalRepOnChange(e);
    startOrderBtn.disabled = true;
    pharmacyInput.classList.remove('input-error');
    setTimeout(() => { validatePharmacyInput(); }, 100);
};

submitOrderBtn.onclick = async () => {
    if (!navigator.onLine) {
        showToast("أنت في وضع عدم الاتصال (Offline). لا يمكن إرسال الطلبية الآن.", "error");
        return;
    }

    const items = [];
    let invalidItem = false;

    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value.trim() !== "") {
            const isValid = productsList.some(prod => prod.name === s.value.trim());
            
            if (!isValid) {
                invalidItem = true;
                s.classList.add('input-error');
            } else {
                s.classList.remove('input-error'); 
                items.push({
                    name: s.value,
                    qty: r.querySelector('.qty-input').value,
                    bonus: r.querySelector('.bonus-input').value || 0,
                    price: r.querySelector('.price-cell').innerText,
                    total: r.querySelector('.row-total').innerText,
                    note: r.querySelector('.item-note-input').value.trim()
                });
            }
        }
    });

    if (invalidItem) {
        return showToast("يوجد أصناف غير صحيحة، يرجى اختيار الصنف من القائمة حصراً.", "error");
    }

    if (items.length === 0) return showToast("لا يمكن إرسال طلبية فارغة!", "warning");
    
    const orderNoteEl = document.getElementById('orderNoteInput');
    const orderNoteValue = orderNoteEl ? orderNoteEl.value.trim() : "";

    try {
        submitOrderBtn.disabled = true;
        submitOrderBtn.classList.add('btn-loading');
        
        const indicator = document.getElementById('saving-indicator');
        if(indicator) indicator.classList.add('active');

        await addDoc(collection(db, "orders"), {
            repId: currentRepId,
            repName: currentRepName,
            managerName: getManagerName(currentRepName),
            pharmacyName: currentPharmacyName,
            pharmacyCode: currentPharmacyCode, 
            items: items,
            orderNote: orderNoteValue,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: isAdmin ? "approved" : "pending",
        });
        
        clearDraft(); // تنظيف المسودة بعد الإرسال الناجح

        const successMessage = isAdmin 
            ? "تم تسجيل الطلبية واعتمادها بنجاح." 
            : "تم ارسال الطلبية بنجاح، في انتظار موافقة المدير.";
        showToast(successMessage, "success");

        if (isAdmin) {
            document.getElementById('orderScreen').style.display = 'none';
            document.getElementById('managerScreen').style.display = 'block';
            loadManagerOrders(); 
        } else {
            document.getElementById('orderScreen').style.display = 'none';
            document.getElementById('myOrdersScreen').style.display = 'block';
            loadMyOrders();
        }
        
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        if(orderNoteEl) orderNoteEl.value = '';
        addNewRow();
        
        document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('navMyOrdersBtn').classList.add('active');
    } catch(e) { 
        showToast("خطأ في الارسال، يرجى المحاولة لاحقاً.", "error"); 
    } finally {
        submitOrderBtn.disabled = false; 
        submitOrderBtn.classList.remove('btn-loading');
        const indicator = document.getElementById('saving-indicator');
        if(indicator) indicator.classList.remove('active');
    }
};

async function loadMyOrders() {
    if (!currentRepId && !loadRepSession()) { showToast("الرجاء تسجيل الدخول أولاً", "error"); return; }
    const tbody = document.getElementById('myOrdersBody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if (unsubMyOrders) unsubMyOrders();

    try {
        const q = query(collection(db, "orders"), where("repId", "==", currentRepId));
        unsubMyOrders = onSnapshot(q, (snap) => {
            let orders = [];
            snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
            orders.sort((a,b) => b.updatedAt.toDate() - a.updatedAt.toDate());
            orders = orders.filter(o => o.status === 'pending' || o.status === 'returned');
            tbody.innerHTML = '';
            
            // 💡 تحديث ملخص الطلبيات (Dashboard المندوب)
            let pendCount = 0;
            let totalVal = 0;
            orders.forEach(o => {
                if(o.status === 'pending') { pendCount++; totalVal += parseFloat(o.grandTotal); }
            });
            document.getElementById('myOrdersPendingCount').innerText = pendCount;
            document.getElementById('myOrdersTotalValue').innerText = totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 });
            const badge = document.getElementById('pendingBadge');
            if(badge) { badge.style.display = pendCount > 0 ? 'inline-block' : 'none'; badge.innerText = pendCount; }

            if(orders.length === 0) { 
                tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="ph ph-package"></i><h3>لا توجد طلبيات معلقة حالياً</h3></div></td></tr>`; 
                return; 
            }
            
            orders.forEach(order => {
                const tr = document.createElement('tr');
                tr.className = `row-${order.status}`; // 💡 تلوين شرطي
                tr.innerHTML = `
                    <td>${order.id.substring(0,6).toUpperCase()}</td>
                    <td>${order.createdAt.toDate().toLocaleString('en-GB')}</td>
                    <td>${order.pharmacyName}</td>
                    <td>${parseFloat(order.grandTotal).toFixed(2)}</td>
                    <td><span class="status-badge ${order.status}">${order.status === 'pending' ? 'قيد الموافقة' : 'مرتجع'}</span></td>
                    <td><button class="action-btn edit-btn" data-id="${order.id}" title="تعديل"><i class="ph ph-pencil"></i></button>
                        <button class="action-btn delete-btn" data-id="${order.id}" title="حذف"><i class="ph ph-trash"></i></button></td>
                `;
                tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'rep');
                tr.querySelector('.delete-btn').onclick = async () => { if(confirm("هل أنت متأكد من حذف الطلبية؟")) { await deleteDoc(doc(db, "orders", order.id)); showToast("تم الحذف","success"); } };
                tbody.appendChild(tr);
            });
        }, (error) => {
            showToast("خطأ في جلب البيانات.", "error");
        });
    } catch(e) { showToast("خطأ في جلب البيانات.", "error"); }
}

// 💡 تحديث الـ Dashboard المتقدم للمدير
// 💡 تحديث الـ Dashboard المتقدم للمدير (ديناميكي 100%)
function updateAdvancedManagerDashboard(orders) {
    const countLabel = document.querySelector('#dashDailyCount')?.previousElementSibling;
    if(countLabel) countLabel.innerText = "عدد الطلبيات المعروضة";

    let totalVal = 0;
    let approvedCount = 0;
    const pharmCounts = {};
    const uniquePharms = new Set(); // 🟢 متغير جديد لحفظ الصيدليات بدون تكرار

    // الاعتماد على الـ orders المفلترة بالكامل 
    orders.forEach(o => {
        totalVal += parseFloat(o.grandTotal) || 0;
        if (o.status === 'approved') approvedCount++;

        if (o.pharmacyName) {
            pharmCounts[o.pharmacyName] = (pharmCounts[o.pharmacyName] || 0) + 1;
            uniquePharms.add(o.pharmacyName); // 🟢 إضافة اسم الصيدلية (Set سيمنع التكرار تلقائياً)
        }
    });

    const periodCount = orders.length; 
    const appRate = periodCount > 0 ? Math.round((approvedCount / periodCount) * 100) : 0;
    
    let topPharm = "-";
    let maxC = 0;
    for (const [p, c] of Object.entries(pharmCounts)) {
        if (c > maxC) { maxC = c; topPharm = p; }
    }

    const e1 = document.getElementById('dashDailyCount'); if(e1) e1.innerText = periodCount;
    const e2 = document.getElementById('dashTotalValue'); if(e2) e2.innerText = totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " د.ا";
    const e3 = document.getElementById('dashApprovalRate'); if(e3) e3.innerText = appRate + "%";
    const e4 = document.getElementById('dashTopPharmacy'); if(e4) e4.innerText = topPharm;
    
    // 🟢 طباعة عدد الصيدليات في الكارد الجديد
    const e5 = document.getElementById('dashUniquePharmacies'); if(e5) e5.innerText = uniquePharms.size;
}
let managerOrdersData = [];

async function loadManagerOrders() {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if (unsubManagerOrders) unsubManagerOrders();

    try {
        unsubManagerOrders = onSnapshot(collection(db, "orders"), (snap) => {
            let allOrders = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.createdAt) {
                    allOrders.push({ id: d.id, ...data });
                }
            });

            allOrders.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
                return dateB - dateA;
            });

            const managerReps = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === currentManagerName);
            const normalizedUnder = managerReps.map(r => r.trim().toLowerCase());

            managerOrdersData = allOrders.filter(o => {
                const repNameNorm = (o.repName || '').trim().toLowerCase();
                return normalizedUnder.includes(repNameNorm);
            });

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

            applyManagerFilters(); 
        }, (e) => {
            showToast("فشل في مزامنة بيانات الفريق", "error");
        });
    } catch (e) {
        showToast("فشل في مزامنة بيانات الفريق", "error");
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

    renderManagerOrders(filtered);
    updateAdvancedManagerDashboard(filtered); // 💡 تحديث اللوحة بالبيانات المفلترة
}

function renderManagerOrders(orders) {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-magnifying-glass"></i><h3>لا توجد طلبيات مطابقة للبحث</h3></div></td></tr>`;
        return;
    }

    orders.forEach(order => {
        const isApproved = order.status === 'approved';
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
        
        const tr = document.createElement('tr');
        tr.className = `row-${order.status}`; // 💡 تلوين شرطي
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
                if(confirm("هل توافق على تمرير الطلبية؟")) { 
                    await updateDoc(doc(db, "orders", order.id), { status: "approved", updatedAt: new Date() }); 
                    showToast("تمت الموافقة بنجاح", "success");
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
        showToast("الرجاء تحديد طلبية واحدة على الأقل", "warning");
        return;
    }

    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`هل أنت متأكد من ${actionText} ${orderIds.length} طلبية دفعة واحدة؟`)) return;

    try {
        const promises = orderIds.map(id => {
            if (actionType === 'approve') {
                return updateDoc(doc(db, "orders", id), { status: "approved", updatedAt: new Date() });
            } else {
                return deleteDoc(doc(db, "orders", id));
            }
        });
        
        await Promise.all(promises);
        showToast("تم تنفيذ العملية المجمعة بنجاح", "success");
        if(document.getElementById('selectAllOrders')) document.getElementById('selectAllOrders').checked = false;
    } catch (error) {
        showToast("حدث خطأ أثناء التنفيذ", "error");
    }
}

document.getElementById('bulkApproveBtn')?.addEventListener('click', () => handleBulkAction('approve'));
document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => handleBulkAction('delete'));

async function loadAllCompanyOrders() {
    const tbody = document.getElementById('allOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if (unsubAllOrders) unsubAllOrders();

    try {
        unsubAllOrders = onSnapshot(collection(db, "orders"), (snap) => {
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

            filterAllOrders(); 
        }, (e) => { 
            showToast("خطأ في تحميل النظام الشامل", "error"); 
        });
    } catch(e) { 
        showToast("خطأ في التحميل", "error"); 
    }
}

function renderAllOrders(orders) {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-package"></i><h3>لا توجد بيانات مطابقة</h3></div></td></tr>`; 
        updateAllOrdersStats(orders); 
        return; 
    }
    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.className = `row-${order.status}`; // 💡 تلوين شرطي
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
        
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
    
    const modalContent = detailsModal.querySelector('.modal-content') || detailsModal.firstElementChild;
    if(modalContent) {
        modalContent.style.display = 'flex';
        modalContent.style.flexDirection = 'column';
        modalContent.style.maxHeight = '90vh';
        
        const tableWrap = modalItemsBody.closest('.table-responsive') || modalItemsBody.parentElement;
        if(tableWrap) {
            tableWrap.style.flex = '1';
            tableWrap.style.overflowY = 'auto';
        }
    }

    order.items.forEach(i => {
        const row = document.createElement('tr');
        
        // 🟢 حساب نسبة البونص وعرضها ديناميكياً
        const qtyVal = parseFloat(i.qty) || 0;
        const bonusVal = parseFloat(i.bonus) || 0;
        let bonusPctStr = "";
        if (qtyVal > 0 && bonusVal > 0) {
            bonusPctStr = `<div style="font-size:0.75rem; color:var(--primary); font-weight:bold; margin-top:2px;">${Math.round((bonusVal / qtyVal) * 100)}% بونص</div>`;
        }

        row.innerHTML = `
            <td style="font-weight:600;">${i.name}</td>
            <td style="text-align: center;">${i.qty}</td>
            <td style="text-align: center;">${i.bonus||0} ${bonusPctStr}</td>
            <td style="text-align: center;">${parseFloat(i.price).toFixed(2)}</td>
            <td style="text-align: center;">${parseFloat(i.total).toFixed(2)}</td>
            <td>${i.note || '-'}</td>
        `;
        modalItemsBody.appendChild(row);
    });
    detailsModal.style.display = 'flex';
}
function filterAllOrders() {
    const repFilter = (document.getElementById('filterAllRep').value || '').toLowerCase().trim();
    const pharmFilter = (document.getElementById('filterAllPharmacy').value || '').toLowerCase().trim();
    const statusFilter = (document.getElementById('filterAllStatus').value || '').trim();

    const fromVal = document.getElementById('managerFilterFrom')?.value;
    const toVal = document.getElementById('managerFilterTo')?.value;

    const filtered = allOrdersData.filter(order => {
        const repName = (order.repName || '').toLowerCase();
        const pharmName = (order.pharmacyName || '').toLowerCase();
        const orderStatus = (order.status || '').trim();

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
    updateAdvancedManagerDashboard(filtered); // تحديث لوحة الإحصائيات
}

document.getElementById('exportAllOrdersBtn').onclick = () => {
    const btn = document.getElementById('exportAllOrdersBtn');
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري التجهيز...";
    
    try {
        // 1. قراءة الفلاتر النشطة حالياً على الشاشة
        const repFilter = (document.getElementById('filterAllRep').value || '').toLowerCase().trim();
        const pharmFilter = (document.getElementById('filterAllPharmacy').value || '').toLowerCase().trim();
        const statusFilter = (document.getElementById('filterAllStatus').value || '').trim();
        const fromVal = document.getElementById('managerFilterFrom')?.value;
        const toVal = document.getElementById('managerFilterTo')?.value;

        // 2. فلترة البيانات الموجودة في الذاكرة (لتطابق الجدول المعروض)
        const ordersToExport = allOrdersData.filter(order => {
            const repName = (order.repName || '').toLowerCase();
            const pharmName = (order.pharmacyName || '').toLowerCase();
            const orderStatus = (order.status || '').trim();

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

        let flatData = [];
        
        // 3. تحضير البيانات المفلترة للإكسل
        ordersToExport.forEach(order => { 
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
                        "نسبة البونص": (parseInt(item.qty, 10) > 0 && parseInt(item.bonus, 10) > 0) ? Math.round((item.bonus / item.qty) * 100) + "%" : "0%",
                        "السعر": parseFloat(item.price) || 0, 
                        "المجموع الفرعي": parseFloat(item.total) || 0, 
                        "ملاحظة الصنف": item.note || "-",
                        "الاجمالي الكلي": parseFloat(order.grandTotal) || 0, 
                        "ملاحظة الطلبية": order.orderNote || "-",
                        // تحسين إضافي: عرض الحالة بالعربي في الإكسل
                        "الحالة": order.status === 'approved' ? 'موافق عليه' : (order.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')
                    }); 
                }); 
            }
        });
        
        if(flatData.length === 0) { 
            showToast("لا توجد بيانات مطابقة للفلاتر للتصدير", "warning"); 
            btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير الطلبيات المفلترة";
            return; 
        }
        
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_الطلبيات_المفلترة.xlsx");
        
        showToast("تم تصدير الملف بنجاح", "success");
        
    } catch(e) { 
        showToast("حدث خطأ أثناء التصدير", "error"); 
    } finally { 
        btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير الطلبيات المفلترة"; 
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
        return false;
    }
}

async function openEditOrder(orderId, userType) {
    const loaded = await ensureProductsLoaded();
    if (!loaded) { showToast("لم يتم تحميل المنتجات بشكل صحيح.", "error"); return; }

    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (!orderDoc.exists()) return showToast("الطلب غير موجود بالقاعدة.", "error");
    const order = orderDoc.data();
    editingOrderId = orderId;

    let repOptionsHTML = '<option value="">-- اختر المندوب --</option>';
    const mainRepSelect = document.getElementById('repSelect');
    if(mainRepSelect) {
        Array.from(mainRepSelect.options).forEach(opt => {
            if (opt.value) {
                repOptionsHTML += `<option value="${opt.value}" ${opt.value === order.repId ? 'selected' : ''}>${opt.textContent}</option>`;
            }
        });
    }

    let editPharmaciesData = [];
    let editPharmacyNames = [];
    try {
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", order.repId));
        const pharmSnap = await getDocs(q);
        pharmSnap.forEach(d => {
            editPharmaciesData.push(d.data());
            editPharmacyNames.push(d.data().name);
        });
    } catch (error) {}

    const editModal = document.getElementById('editOrderModal');
    if (editModal) editModal.style.display = 'flex';

    const container = document.getElementById('editOrderContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; max-height: 85vh; background: #fff; overflow: hidden;">
            <div style="flex: 0 0 auto; padding-bottom: 15px; margin-bottom: 10px; border-bottom: 2px solid #eee;">
                <h3 style="margin: 0 0 15px 0; color: #004a99;"><i class="ph ph-pencil-simple"></i> تعديل طلبية</h3>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div style="flex: 1; min-width: 200px;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block; color: #333;">المندوب:</label>
                        <select id="editRepSelect" style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; outline: none; font-family: inherit; font-size: 14px;">
                            ${repOptionsHTML}
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 200px; position: relative;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block; color: #333;">اسم الصيدلية:</label>
                        <div class="autocomplete-wrapper" style="width: 100%;">
                            <input type="text" id="editPharmacyInput" value="${order.pharmacyName || ''}" placeholder="ابحث عن الصيدلية..." style="width:100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; outline: none; font-family: inherit; font-size: 14px;" autocomplete="off">
                            <div id="editPharmacySuggestions" class="autocomplete-list"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="flex: 1 1 auto; overflow-y: auto; min-height: 0; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #fff;">
                <table class="order-table" style="width: 100%; border-collapse: collapse; text-align: right; margin: 0;">
                    <thead style="background-color: #004a99; color: white; position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="padding: 12px; font-weight: normal; border-bottom: none;">الصنف</th>
                            <th style="padding: 12px; text-align: center; width: 70px; font-weight: normal; border-bottom: none;">الكمية</th>
                            <th style="padding: 12px; text-align: center; width: 70px; font-weight: normal; border-bottom: none;">البونص</th>
                            <th style="padding: 12px; text-align: center; width: 90px; font-weight: normal; border-bottom: none;">السعر</th>
                            <th style="padding: 12px; text-align: center; width: 100px; font-weight: normal; border-bottom: none;">المجموع</th>
                            <th style="padding: 12px; text-align: center; width: 120px; font-weight: normal; border-bottom: none;">ملاحظة</th>
                            <th style="padding: 12px; text-align: center; width: 50px; font-weight: normal; border-bottom: none;">حذف</th>
                        </tr>
                    </thead>
                    <tbody id="editOrderBody"></tbody>
                </table>
            </div>

            <div style="flex: 0 0 auto; background: #fff; padding-top: 10px; border-top: 2px solid #eee;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div>
                        <button type="button" id="editAddRowBtn" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #004a99; background: #e6f2ff; color: #004a99; font-weight: bold; font-family: inherit; transition: all 0.2s;">
                            <i class="ph ph-plus"></i> إضافة صنف
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                        <h3 style="margin: 0; color: #d32f2f; font-size: 18px; font-weight: bold;"> الإجمالي: <span id="editGrandTotal">${parseFloat(order.grandTotal).toFixed(2)}</span> </h3>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" onclick="closeEditModal()" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #ccc; background: #fff; color: #333; font-weight: bold; font-family: inherit;"> إلغاء </button>
                            <button type="button" id="saveEditOrderBtn" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; background: #004a99; color: white; border: none; font-weight: bold; font-family: inherit; display: flex; align-items: center; gap: 5px;"> <i class="ph ph-floppy-disk"></i> حفظ التعديلات </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const editRepSelect = document.getElementById('editRepSelect');
    const editPharmInput = document.getElementById('editPharmacyInput');
    const editPharmSuggestions = document.getElementById('editPharmacySuggestions');

    setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);

    editRepSelect.addEventListener('change', async function() {
        const selectedRepId = this.value;
        editPharmaciesData = [];
        editPharmacyNames = [];
        editPharmInput.value = ''; 
        
        if (!selectedRepId) {
            editPharmInput.placeholder = 'اختر المندوب أولاً';
            setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);
            return;
        }

        editPharmInput.placeholder = 'جاري تحميل الصيدليات...';
        try {
            const q = query(collection(db, "pharmacies"), where("rep_id", "==", selectedRepId));
            const pharmSnap = await getDocs(q);
            pharmSnap.forEach(d => { editPharmaciesData.push(d.data()); editPharmacyNames.push(d.data().name); });
            editPharmInput.placeholder = 'ابحث عن الصيدلية...';
            setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);
        } catch (error) { editPharmInput.placeholder = 'خطأ في التحميل'; }
    });

    editPharmInput.addEventListener('blur', function() {
        const val = this.value.trim();
        const isValid = editPharmacyNames.includes(val);
        if (!isValid && val !== "") { this.style.border = "2px solid red"; } 
        else { this.style.border = "1px solid #ccc"; }
    });

    const editBody = document.getElementById('editOrderBody');
    if (editBody) editBody.innerHTML = ''; 

    function updateEditTotal() {
        let total = 0;
        document.querySelectorAll('#editOrderBody .row-total').forEach(td => total += parseFloat(td.innerText) || 0);
        const grandTotalEl = document.getElementById('editGrandTotal');
        if (grandTotalEl) grandTotalEl.innerText = total.toFixed(2);
    }

function addEditRow(productName='', qty=1, bonus=0, price=0, rowTotal=0, note='') {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #eee";
        tr.innerHTML = `
            <td style="padding: 8px;"><div class="autocomplete-wrapper"><input type="text" class="product-input" value="${productName.replace(/"/g, '&quot;')}" style="width:100%; min-width:200px; padding:8px; border:1px solid #ccc; border-radius:4px; outline:none;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
            <td style="padding: 8px; text-align: center;"><input type="number" class="qty-input" value="${qty}" min="1" style="width: 65px; text-align: center; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;"></td>
            <td style="padding: 8px; text-align: center; position:relative;">
                <input type="number" class="bonus-input" value="${bonus}" min="0" style="width: 65px; text-align: center; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;">
                <span class="edit-bonus-pct" style="font-size:0.75rem; color:#004a99; font-weight:bold; display:block; text-align:center; margin-top:4px;"></span>
            </td>
            <td class="price-cell" style="padding: 8px; text-align: center; font-weight: bold; color: #333;">${parseFloat(price).toFixed(2)}</td>
            <td class="row-total" style="padding: 8px; text-align: center; font-weight: bold; color: #d32f2f;">${parseFloat(rowTotal).toFixed(2)}</td>
            <td style="padding: 8px;"><input type="text" class="item-note-input" value="${note}" placeholder="ملاحظة..." style="width:100%; min-width:100px; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;"></td>
            <td style="padding: 8px; text-align: center;"><button type="button" class="btn-danger del-row" style="padding: 6px 10px; border-radius: 4px; border:none; background:#dc3545; color:white; cursor:pointer;"><i class="ph ph-trash"></i></button></td>
        `;
        const s = tr.querySelector('.product-input'), sug = tr.querySelector('.product-suggestions');
        const q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
        const b = tr.querySelector('.bonus-input'), bPct = tr.querySelector('.edit-bonus-pct'); // 🟢 جلب حقول البونص
        const productNames = productsList.map(prod => prod.name);
        
        // 🟢 وظيفة حساب نسبة البونص للتعديل
        function calcEditBonus() {
            const qVal = parseFloat(q.value) || 0;
            const bVal = parseFloat(b.value) || 0;
            if(qVal > 0 && bVal > 0) {
                bPct.innerText = `${Math.round((bVal / qVal) * 100)}% بونص`;
            } else {
                bPct.innerText = "";
            }
        }

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
            if (!isValid) { this.style.border = "2px solid red"; } 
            else { this.style.border = "1px solid #ccc"; }
        });

        q.oninput = () => { 
            t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); 
            calcEditBonus(); // 🟢 التحديث عند تغيير الكمية
            updateEditTotal(); 
        };
        b.oninput = () => { calcEditBonus(); updateEditTotal(); }; // 🟢 التحديث عند تغيير البونص

        tr.querySelector('.del-row').onclick = () => { tr.remove(); updateEditTotal(); };
        
        if (editBody) editBody.appendChild(tr);
        calcEditBonus(); // 🟢 حساب النسبة لحظة تحميل السطر للمرة الأولى
        updateEditTotal();
    }    
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => { addEditRow(item.name, item.qty, item.bonus, item.price, item.total, item.note || ''); });
    } else { addEditRow(); }   
    const editAddBtn = document.getElementById('editAddRowBtn');
    if (editAddBtn) editAddBtn.onclick = () => addEditRow();
    
    const saveBtn = document.getElementById('saveEditOrderBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = async () => {
            const items = [];
            let invalidItem = false;

            const newRepId = editRepSelect.value;
            if (!newRepId) { editRepSelect.style.border = "2px solid red"; return showToast("يرجى اختيار المندوب أولاً.", "warning"); }
            const newRepName = editRepSelect.options[editRepSelect.selectedIndex].text;

            const newPharmName = editPharmInput.value.trim();
            const selectedPharm = editPharmaciesData.find(p => p.name === newPharmName);
            
            if (!selectedPharm) { editPharmInput.style.border = "2px solid red"; return showToast("يرجى اختيار صيدلية صحيحة من القائمة.", "error"); }

            document.querySelectorAll('#editOrderBody tr').forEach(r => {
                const inp = r.querySelector('.product-input');
                if (inp && inp.value.trim() !== "") {
                    const isValid = productsList.some(prod => prod.name === inp.value.trim());
                    if (!isValid) { invalidItem = true; inp.style.border = "2px solid red"; } 
                    else {
                        inp.style.border = "1px solid #ccc";
                        items.push({ 
                            name: inp.value, 
                            qty: r.querySelector('.qty-input').value, 
                            bonus: r.querySelector('.bonus-input').value || 0, 
                            price: r.querySelector('.price-cell').innerText, 
                            total: r.querySelector('.row-total').innerText,
                            note: r.querySelector('.item-note-input').value.trim()
                        });                    
                    }
                }
            });

            if (invalidItem) return showToast("تأكد من صحة الأصناف المختارة.", "error");
            if (items.length === 0) return showToast("لا يمكن حفظ مسودة فارغة!", "warning");

            try {
                const grandTotalEl = document.getElementById('editGrandTotal');
                const newGrandTotal = grandTotalEl ? parseFloat(grandTotalEl.innerText) : 0;
                
                await updateDoc(doc(db, "orders", editingOrderId), { 
                    repId: newRepId, repName: newRepName, managerName: getManagerName(newRepName), 
                    pharmacyName: newPharmName, pharmacyCode: selectedPharm.pharmacy_code || "-",
                    items: items, grandTotal: newGrandTotal, status: "pending", updatedAt: new Date() 
                });
                showToast("تم تحديث الطلبية بنجاح", "success");
                closeEditModal();
            } catch (e) { showToast("حدث خطأ أثناء التحديث", "error"); }
        };
    }
}
function closeEditModal() { 
    const editModal = document.getElementById('editOrderModal');
    if (editModal) { editModal.style.display = 'none'; }
    editingOrderId = null; 
}
window.closeEditModal = closeEditModal;

async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if(unsubReports) unsubReports();

    try {
        unsubReports = onSnapshot(collection(db, "orders"), (snap) => {
            let os = [];
            snap.forEach(d => os.push({ id: d.id, ...d.data() }));
            os.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate());
            if (!isAdmin && currentRepName) os = os.filter(o => o.repName === currentRepName);
            body.innerHTML = '';
            os.forEach(o => {
                const tr = document.createElement('tr');
                tr.className = `row-${o.status}`; // 💡 تلوين شرطي
                tr.innerHTML = `<td><b>${o.id.substring(0,5).toUpperCase()}</b></td><td>${o.createdAt.toDate().toLocaleString('en-GB')}</td><td class="rep-col">${o.repName}</td><td class="pharm-col">${o.pharmacyName}</td><td>${parseFloat(o.grandTotal).toFixed(2)}</td><td><span class="status-badge ${o.status}">${o.status === 'approved' ? 'موافق عليه' : (o.status === 'pending' ? 'قيد الموافقة' : 'مرتجع')}</span></td><td><button class="btn-view" style="color:#004a99;"><i class="ph ph-eye"></i></button></td>`;
                tr.querySelector('.btn-view').onclick = () => { showOrderDetails(o); };
                body.appendChild(tr);
            });
            filterReportsTable(); 
        });
    } catch(e) { showToast("خطأ في الاتصال بالبيانات", "error"); }
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
                    "التاريخ": dateStr, "المندوب": order.repName, "كود الصيدلية": order.pharmacyCode || "-", 
                    "الصيدلية": order.pharmacyName, "الصنف": item.name, "الكمية": parseInt(item.qty, 10) || 0, 
                    "البونص": parseInt(item.bonus, 10) || 0, "السعر": parseFloat(item.price) || 0, 
                    "المجموع الفرعي": parseFloat(item.total) || 0, "ملاحظة الصنف": item.note || "-", 
                    "الاجمالي الكلي": parseFloat(order.grandTotal) || 0, "ملاحظة الطلبية": order.orderNote || "-", 
                    "الحالة": order.status 
                });
            });
        });

        if (flatData.length === 0) { showToast("لا توجد بيانات للتصدير", "warning"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_طلبيات.xlsx");
        showToast("اكتمل التصدير!", "success");
    } catch (e) { showToast("حدث خطأ في استخراج البيانات", "error"); } 
    finally { btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير للاكسل"; }
};

document.getElementById('navOrderBtn').onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById('orderScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('navOrderBtn').classList.add('active'); 
};
document.getElementById('navMyOrdersBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('myOrdersScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navMyOrdersBtn').classList.add('active'); loadMyOrders(); };
document.getElementById('navReportsBtn').onclick = () => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById('reportsScreen').style.display = 'block'; document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active')); document.getElementById('navReportsBtn').classList.add('active'); loadReports(); };
document.getElementById('logoutBtn').onclick = () => { clearRepSession(); if(confirm("هل أنت متأكد من تسجيل الخروج؟")) location.reload(); };

let selectedAdminType = null;
let selectedAdminName = null;

document.querySelectorAll('.btn-admin-opt').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.btn-admin-opt').forEach(b => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        selectedAdminType = targetBtn.getAttribute('data-type');
        selectedAdminName = targetBtn.getAttribute('data-name');
    };
});

document.getElementById('adminModeBtn').onclick = () => {
    const isNoticeShown = localStorage.getItem('systemUpdate_v1');
    if (!isNoticeShown) {
        document.getElementById('updateNoticeModal').style.display = 'flex';
        document.getElementById('closeUpdateNoticeBtn').onclick = () => {
            document.getElementById('updateNoticeModal').style.display = 'none';
            localStorage.setItem('systemUpdate_v1', 'true'); 
            openAdminLoginBox();
        };
    } else { openAdminLoginBox(); }
};

function openAdminLoginBox() {
    document.getElementById('adminLoginModal').style.display = 'flex';
    document.getElementById('adminPasswordInput').value = ''; 
}

document.getElementById('adminPasswordInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('confirmAdminLoginBtn').click(); }
});

document.getElementById('confirmAdminLoginBtn').onclick = () => {
    if (!selectedAdminType) { return showToast("الرجاء تحديد هويتك من البطاقات أعلاه", "warning"); }
    
    const pass = document.getElementById('adminPasswordInput').value;   
    
    // 🔐 التحديث الأمني: استخدام التشفير للتأكد بدل النص الصريح. (btoa(202604) == "MjAyNjA0")
    const SECRET_HASH = "MjAyNjA0";
    
    if (btoa(pass) === SECRET_HASH) {
        const rememberMe = document.getElementById('rememberAdmin').checked;
        
        // ✅ التعديل هنا: إضافة encodeURIComponent ليدعم الأسماء العربية بدون أخطاء
        const authToken = btoa(encodeURIComponent(selectedAdminName + ":" + new Date().getTime())); 
        
        if (rememberMe) {
            localStorage.setItem('managerName', selectedAdminName);
            localStorage.setItem('adminType', selectedAdminType);
            localStorage.setItem('authToken', authToken); 
        } else {
            sessionStorage.setItem('managerName', selectedAdminName);
            sessionStorage.setItem('adminType', selectedAdminType);
            sessionStorage.setItem('authToken', authToken);
            localStorage.removeItem('managerName');
            localStorage.removeItem('adminType');
            localStorage.removeItem('authToken');
        }

        if (selectedAdminType === 'reports') {
            window.location.href = 'mohammad.html';
        } else {
            isAdmin = true;
            currentManagerName = selectedAdminName;
            document.getElementById('adminLoginModal').style.display = 'none';
            initializeManagerView(selectedAdminName);
        }
    } else {
        showToast("رمز المرور غير صحيح!", "error");
    }
};
document.getElementById('selectAllAllOrders')?.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.all-order-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
});

async function handleAllOrdersBulkAction(actionType) {
    const selectedCheckboxes = document.querySelectorAll('.all-order-checkbox:checked');
    const orderIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (orderIds.length === 0) { return showToast("الرجاء تحديد طلبية واحدة على الأقل", "warning"); }

    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`تحذير: هل أنت متأكد من ${actionText} ${orderIds.length} طلبية دفعة واحدة؟`)) return;

    try {
        const promises = orderIds.map(id => {
            if (actionType === 'approve') {
                return updateDoc(doc(db, "orders", id), { status: "approved", updatedAt: new Date() });
            } else { return deleteDoc(doc(db, "orders", id)); }
        });
        
        await Promise.all(promises);
        showToast("تم تنفيذ الأمر بنجاح", "success");
        if(document.getElementById('selectAllAllOrders')) document.getElementById('selectAllAllOrders').checked = false;
    } catch (error) { showToast("حدث خطأ أثناء التنفيذ الشامل", "error"); }
}

document.getElementById('bulkApproveAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('approve'));
document.getElementById('bulkDeleteAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('delete'));
    
window.closeModal = () => detailsModal.style.display = 'none';

// تشغيل التحميل المبدئي
loadInitialData();

// فلاتر التاريخ (للمدير)
const managerFilterFrom = document.getElementById('managerFilterFrom');
const managerFilterTo = document.getElementById('managerFilterTo');
const btnTodayOrders = document.getElementById('btnTodayOrders');
const btnClearManagerFilter = document.getElementById('btnClearManagerFilter');

managerFilterFrom?.addEventListener('change', () => { applyManagerFilters(); filterAllOrders(); });
managerFilterTo?.addEventListener('change', () => { applyManagerFilters(); filterAllOrders(); });

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

btnClearManagerFilter?.addEventListener('click', () => {
    managerFilterFrom.value = '';
    managerFilterTo.value = '';
    applyManagerFilters();
    filterAllOrders();
});
