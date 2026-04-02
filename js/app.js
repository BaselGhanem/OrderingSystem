import { db, collection, getDocs, query, where, addDoc, deleteDoc, doc } from './firebase.js';

// --- تعريف العناصر ---
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
const MAX_ROWS = 20; 

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
    } catch (e) { console.error("Error loading data:", e); }
}

// --- 2. جلب صيدليات المندوب المختار ---
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

// --- 3. إدارة التنقل والشاشات ---
startOrderBtn.onclick = () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${repSelect.options[repSelect.selectedIndex].text}</b>`;
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

document.getElementById('logoutBtn').onclick = () => { if(confirm("هل تريد تسجيل الخروج؟")) location.reload(); };

// --- 4. منطق جدول الفاتورة ---
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

    const s = tr.querySelector('.product-select'), 
          q = tr.querySelector('.qty-input'), 
          p = tr.querySelector('.price-cell'), 
          t = tr.querySelector('.row-total');

    s.onchange = () => {
        const pr = parseFloat(s.options[s.selectedIndex].dataset.price) || 0;
        p.innerText = pr.toFixed(2); 
        t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    };

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
            createdAt: new Date(), 
            status: "Pending"
        });
        
        alert("✅ تم الإرسال بنجاح!");
        
        // إعادة تعيين الواجهة بدون Reload
        orderBody.innerHTML = '';
        grandTotalEl.innerText = '0.00';
        addNewRow();
        submitOrderBtn.disabled = false;

    } catch (e) { 
        alert("خطأ في الإرسال"); 
        submitOrderBtn.disabled = false; 
    }
};

// --- 6. التقارير، عرض التفاصيل، والحذف بباسوورد ---
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري جلب البيانات...</td></tr>';
    try {
        const snap = await getDocs(collection(db, "orders"));
        body.innerHTML = '';
        let os = []; 
        snap.forEach(d => os.push({ id: d.id, ...d.data() }));
        os.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        os.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${o.id.substring(0,5).toUpperCase()}</b></td>
                <td>${o.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${o.repName}</td><td>${o.pharmacyName}</td>
                <td>${o.grandTotal.toFixed(2)}</td><td><span class="status-badge">قيد الانتظار</span></td>
                <td class="actions-cell">
                    <button class="btn-view" style="color:#004a99; background:none; border:none; cursor:pointer; font-size:1.2rem;"><i class="ph ph-eye"></i></button>
                    <button class="btn-delete" style="color:#d32f2f; background:none; border:none; cursor:pointer; font-size:1.2rem; margin-right:10px;"><i class="ph ph-trash"></i></button>
                </td>
            `;

            // عرض تفاصيل الطلبية (المنطق المطور)
            tr.querySelector('.btn-view').onclick = () => {
                modalItemsBody.innerHTML = '';
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
            
            // حذف الطلبية بباسوورد 5050
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
    } catch (e) { console.error("Error loading reports:", e); }
}

// --- 7. تصدير البيانات إلى Excel ---
document.getElementById('exportExcelBtn').onclick = async () => {
    const btn = document.getElementById('exportExcelBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري التحميل...";
    
    try {
        const snap = await getDocs(collection(db, "orders"));
        let flatData = [];

        snap.forEach(docSnap => {
            const order = docSnap.data();
            const orderId = docSnap.id.substring(0, 5).toUpperCase();
            const dateStr = order.createdAt.toDate().toLocaleString('ar-JO');

            order.items.forEach(item => {
                flatData.push({
                    "رقم المرجع": orderId,
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
        XLSX.writeFile(wb, "تقرير_طلبيات_دار_الدواء_المفصل.xlsx");

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
