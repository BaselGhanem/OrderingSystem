import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc } from './firebase.js';

// --- تعريف العناصر ---
const repSelect = document.getElementById('repSelect');
const pharmacyInput = document.getElementById('pharmacyInput');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');
const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

let productsList = []; 
const MAX_ROWS = 20; 
let isAdmin = false; 

// --- دالة الإكمال التلقائي المخصصة (محسنة للموبايل واللابتوب) ---
function setupAutocomplete(inputEl, suggestionsEl, dataArray, onSelectCallback) {
    let currentFocus = -1;

    inputEl.addEventListener('input', function() {
        const val = this.value.trim().toLowerCase();
        suggestionsEl.innerHTML = '';
        currentFocus = -1;
        
        if (!val) {
            suggestionsEl.style.display = 'none';
            return;
        }

        const filtered = dataArray.filter(item => item.toLowerCase().includes(val));
        
        if (filtered.length > 0) {
            filtered.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                
                const matchIndex = item.toLowerCase().indexOf(val);
                if (matchIndex >= 0) {
                    div.innerHTML = item.substring(0, matchIndex) + 
                                    "<strong>" + item.substring(matchIndex, matchIndex + val.length) + "</strong>" + 
                                    item.substring(matchIndex + val.length);
                } else {
                    div.innerText = item;
                }

                div.addEventListener('mousedown', function(e) {
                    e.preventDefault(); 
                    inputEl.value = item;
                    suggestionsEl.style.display = 'none';
                    if (onSelectCallback) onSelectCallback(item);
                });
                suggestionsEl.appendChild(div);
            });
            suggestionsEl.style.display = 'block';
        } else {
            suggestionsEl.style.display = 'none';
        }
    });

    inputEl.addEventListener('keydown', function(e) {
        let x = suggestionsEl.getElementsByClassName('autocomplete-item');
        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(x);
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(x);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1 && x.length > 0) {
                x[currentFocus].dispatchEvent(new Event('mousedown'));
            } else if (x.length === 1) { 
                x[0].dispatchEvent(new Event('mousedown'));
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add('autocomplete-active');
        x[currentFocus].scrollIntoView({ block: "nearest" });
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove('autocomplete-active');
        }
    }

    inputEl.addEventListener('blur', function() {
        setTimeout(() => { suggestionsEl.style.display = 'none'; }, 150);
    });
}

// --- 1. تحميل المناديب والأصناف عند البداية ---
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

        const dl = document.createElement('datalist');
        dl.id = 'productsDatalist';
        productsList.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            dl.appendChild(opt);
        });
        document.body.appendChild(dl);

    } catch (e) { console.error("Error loading data:", e); }
}

// --- زر دخول المدير ---
document.getElementById('adminModeBtn').onclick = () => {
    const pass = prompt("الرجاء إدخال كلمة مرور المدير:");
    if (pass === "202604") {
        isAdmin = true;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('reportsScreen').style.display = 'block';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user-gear"></i> <b>المدير العام</b>`;
        document.getElementById('navReportsBtn').classList.add('active');
        document.getElementById('navOrderBtn').style.display = 'none'; 
        loadReports();
    } else if (pass !== null) {
        alert("كلمة المرور خاطئة!");
    }
};

// --- 2. جلب صيدليات المندوب المختار ---
repSelect.onchange = async (e) => {
    if (!e.target.value) return;
    pharmacyInput.value = '';
    pharmacyInput.placeholder = 'جاري التحميل...';
    
    const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
    const snap = await getDocs(q);
    
    let pharmacyNames = [];
    snap.forEach(d => pharmacyNames.push(d.data().name));
    
    setupAutocomplete(
        pharmacyInput, 
        document.getElementById('pharmacySuggestions'), 
        pharmacyNames,
        () => startOrderBtn.disabled = false
    );
    
    pharmacyInput.disabled = false;
    pharmacyInput.placeholder = 'ابحث أو اختر الصيدلية...';
};

pharmacyInput.oninput = () => {
    startOrderBtn.disabled = !pharmacyInput.value.trim();
};

// --- 3. إدارة التنقل والشاشات ---
startOrderBtn.onclick = () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${repSelect.options[repSelect.selectedIndex].text}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacyInput.value;
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

document.getElementById('logoutBtn').onclick = () => { if(confirm("هل تريد تسجيل الخروج؟")) location.reload(); };

// --- 4. منطق جدول الفاتورة ---
function addNewRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <div class="autocomplete-wrapper">
                <input type="text" class="product-input" placeholder="ابحث باسم الصنف..." style="width: 100%;" autocomplete="off">
                <div class="autocomplete-list product-suggestions"></div>
            </div>
        </td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td><input type="number" class="bonus-input" value="0" min="0"></td>
        <td class="price-cell">0.00</td><td class="row-total">0.00</td>
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;

    const s = tr.querySelector('.product-input'), 
          sug = tr.querySelector('.product-suggestions'),
          q = tr.querySelector('.qty-input'), 
          p = tr.querySelector('.price-cell'), 
          t = tr.querySelector('.row-total');

    const productNames = productsList.map(prod => prod.name);

    setupAutocomplete(s, sug, productNames, (selectedName) => {
        const selectedProd = productsList.find(prod => prod.name === selectedName);
        const pr = selectedProd ? parseFloat(selectedProd.price) : 0;
        p.innerText = pr.toFixed(2); 
        t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    });

    q.oninput = () => { 
        t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); 
        updateGrandTotal(); 
    };

    tr.querySelector('.del-row').onclick = () => { tr.remove(); updateGrandTotal(); };
    orderBody.appendChild(tr);
}

addRowBtn.onclick = addNewRow;

function updateGrandTotal() {
    let g = 0; 
    document.querySelectorAll('.row-total').forEach(td => g += parseFloat(td.innerText) || 0);
    grandTotalEl.innerText = g.toFixed(2);
}

// --- 5. إرسال الطلبية وتصفير الواجهة ---
submitOrderBtn.onclick = async () => {
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s.value) items.push({
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
            repName: repSelect.options[repSelect.selectedIndex].text,
            pharmacyName: pharmacyInput.value,
            items: items,
            grandTotal: parseFloat(grandTotalEl.innerText),
            createdAt: new Date(), 
            status: "Pending"
        });
        
        alert("✅ تم الإرسال بنجاح!");
        
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        addNewRow();
        submitOrderBtn.disabled = false;

    } catch (e) { 
        alert("خطأ في الإرسال"); 
        submitOrderBtn.disabled = false; 
    }
};

// --- 6. التقارير والفلترة وعرض التفاصيل ---
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري جلب البيانات...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        body.innerHTML = '';
        let os = []; 
        snap.forEach(d => os.push({ id: d.id, ...d.data() }));
        os.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        if (!isAdmin) {
            const currentRepName = repSelect.options[repSelect.selectedIndex].text;
            os = os.filter(o => o.repName === currentRepName);
        }

        os.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${o.id.substring(0,5).toUpperCase()}</b></td>
                <td>${o.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td class="rep-col">${o.repName}</td><td class="pharm-col">${o.pharmacyName}</td>
                <td>${o.grandTotal.toFixed(2)}</td><td><span class="status-badge">قيد الانتظار</span></td>
                <td class="actions-cell">
                    <button class="btn-view" style="color:#004a99; background:none; border:none; cursor:pointer; font-size:1.2rem;"><i class="ph ph-eye"></i></button>
                    <button class="btn-delete" style="color:#d32f2f; background:none; border:none; cursor:pointer; font-size:1.2rem; margin-right:10px;"><i class="ph ph-trash"></i></button>
                </td>
            `;

            tr.querySelector('.btn-view').onclick = () => {
                modalItemsBody.innerHTML = '';
                document.getElementById('modalPharmacySubtitle').innerText = `الصيدلية: ${o.pharmacyName}`;
                o.items.forEach(i => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-weight:600; color:#004a99;">${i.name}</td>
                        <td style="text-align:center;">${i.qty}</td>
                        <td style="text-align:center;">${i.bonus || 0}</td>
                        <td style="text-align:center;">${parseFloat(i.price).toFixed(2)}</td>
                        <td style="text-align:center; font-weight:bold;">${parseFloat(i.total).toFixed(2)}</td>
                    `;
                    modalItemsBody.appendChild(row);
                });

                const footerRow = document.createElement('tr');
                footerRow.style.background = "#f8fafc";
                footerRow.innerHTML = `
                    <td colspan="4" style="text-align:left; font-weight:800;">الإجمالي الكلي للطلبية:</td>
                    <td style="text-align:center; font-weight:800; color:#004a99; font-size:1.1rem;">${o.grandTotal.toFixed(2)} د.أ</td>
                `;
                modalItemsBody.appendChild(footerRow);
                detailsModal.style.display = 'flex';
            };
            
            tr.querySelector('.btn-delete').onclick = async () => {
                const password = prompt("الرجاء إدخال كلمة المرور لحذف الطلبية:");
                if (password === "5050") {
                    if(confirm("هل أنت متأكد من حذف هذه الطلبية نهائياً؟")) {
                        await deleteDoc(doc(db, "orders", o.id));
                        loadReports();
                        alert("تم الحذف بنجاح");
                    }
                } else if (password !== null) {
                    alert("كلمة المرور خاطئة!");
                }
            };
            
            body.appendChild(tr);
        });

        // تحديث الإجمالي بعد جلب البيانات لأول مرة
        updateFilteredTotal();

    } catch (e) { console.error("Error loading reports:", e); }
}

// --- دالة لحساب وعرض الإجمالي للتقارير المفلترة ---
function updateFilteredTotal() {
    const rows = document.querySelectorAll('#reportsBody tr');
    let total = 0;

    rows.forEach(row => {
        if (row.style.display !== 'none' && row.children.length > 1) {
            const totalCell = row.querySelectorAll('td')[4];
            if (totalCell) {
                total += parseFloat(totalCell.innerText) || 0;
            }
        }
    });

    let totalDisplay = document.getElementById('reportsTotalDisplay');
    if (!totalDisplay) {
        const tableContainer = document.querySelector('#reportsBody').closest('.table-responsive');
        totalDisplay = document.createElement('div');
        totalDisplay.id = 'reportsTotalDisplay';
        totalDisplay.style.cssText = 'background: var(--glass); border: 1px solid var(--primary); color: var(--primary); padding: 15px; border-radius: 12px; margin-bottom: 15px; font-size: 1.2rem; font-weight: bold; text-align: left; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow);';
        tableContainer.parentNode.insertBefore(totalDisplay, tableContainer);
    }
    
    totalDisplay.innerHTML = `<span>إجمالي الطلبيات المعروضة:</span> <span style="font-size:1.4rem;">${total.toFixed(2)} د.أ</span>`;
}

// --- فلترة التقارير (مع تحديث الإجمالي) ---
function filterReportsTable() {
    const repFilter = document.getElementById('filterRep').value.toLowerCase();
    const pharmFilter = document.getElementById('filterPharmacy').value.toLowerCase();
    const rows = document.querySelectorAll('#reportsBody tr');

    rows.forEach(row => {
        if (row.children.length > 1) { 
            const repName = row.querySelector('.rep-col').innerText.toLowerCase();
            const pharmName = row.querySelector('.pharm-col').innerText.toLowerCase();
            
            if (repName.includes(repFilter) && pharmName.includes(pharmFilter)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });

    updateFilteredTotal();
}

document.getElementById('filterRep').oninput = filterReportsTable;
document.getElementById('filterPharmacy').oninput = filterReportsTable;

// --- 7. تصدير البيانات إلى Excel ---
document.getElementById('exportExcelBtn').onclick = async () => {
    const btn = document.getElementById('exportExcelBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري التحميل...";
    
    try {
        const snap = await getDocs(collection(db, "orders"));
        let flatData = [];
        let allOrders = [];
        snap.forEach(d => allOrders.push(d.data()));

        if (!isAdmin) {
            const currentRepName = repSelect.options[repSelect.selectedIndex].text;
            allOrders = allOrders.filter(o => o.repName === currentRepName);
        }

        allOrders.forEach((order, index) => {
            const dateStr = order.createdAt.toDate().toLocaleString('ar-JO');

            order.items.forEach(item => {
                flatData.push({
                    "التاريخ والوقت": dateStr,
                    "المندوب": order.repName,
                    "الصيدلية": order.pharmacyName,
                    "الصنف": item.name,
                    "الكمية": item.qty,
                    "البونص": item.bonus,
                    "السعر": item.price,
                    "المجموع الفرعي": item.total,
                    "الإجمالي الكلي للطلبية": order.grandTotal
                });
            });
        });

        if (flatData.length === 0) { alert("لا توجد طلبيات لتصديرها"); return; }

        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تفاصيل الطلبيات");
        XLSX.writeFile(wb, "تقرير_طلبيات_دار_الدواء.xlsx");

    } catch (e) {
        console.error("Excel Export Error:", e);
        alert("حدث خطأ أثناء تصدير الإكسل");
    } finally {
        btn.innerHTML = originalText;
    }
};

window.closeModal = () => detailsModal.style.display = 'none';

// تشغيل جلب البيانات الأولية
loadInitialData();
