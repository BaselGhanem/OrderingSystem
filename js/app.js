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

// ================== 1. تحميل البيانات ==================
async function loadInitialData() {
    try {
        console.log("تحميل المناديب...");

        const repsSnapshot = await getDocs(collection(db, "reps"));
        repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';

        if (repsSnapshot.empty) {
            console.warn("❌ لا يوجد مناديب");
        }

        repsSnapshot.forEach((doc) => {
            const rep = doc.data();
            console.log("REP:", doc.id, rep);

            const name = rep.name || rep.repName || rep.full_name || "بدون اسم";

            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = name;
            repSelect.appendChild(option);
        });

        repSelect.disabled = false;

        // تحميل المنتجات
        const productsSnapshot = await getDocs(collection(db, "products"));
        productsList = [];

        productsSnapshot.forEach((doc) => {
            const data = doc.data();
            productsList.push({
                id: doc.id,
                name: data.name || "بدون اسم",
                price: data.price || 0,
                code: data.code || "-"
            });
        });

        productsList.sort((a, b) => a.name.localeCompare(b.name));

        console.log("✅ تم تحميل البيانات");

    } catch (error) {
        console.error("🔥 خطأ في تحميل البيانات:", error);
        alert("في مشكلة بالاتصال مع Firebase");
    }
}

// ================== 2. تحميل الصيدليات ==================
repSelect.addEventListener('change', async (e) => {
    const selectedRepId = e.target.value;

    if (!selectedRepId) {
        pharmacySelect.innerHTML = '<option>اختر المندوب أولاً</option>';
        pharmacySelect.disabled = true;
        startOrderBtn.disabled = true;
        return;
    }

    try {
        console.log("تحميل صيدليات للمندوب:", selectedRepId);

        const q = query(
            collection(db, "pharmacies"),
            where("rep_id", "==", selectedRepId)
        );

        const snapshot = await getDocs(q);

        pharmacySelect.innerHTML = '<option value="">-- اختر الصيدلية --</option>';

        if (snapshot.empty) {
            console.warn("❌ لا يوجد صيدليات مرتبطة");
            pharmacySelect.innerHTML = '<option>لا يوجد صيدليات</option>';
        }

        snapshot.forEach((doc) => {
            const pharmacy = doc.data();
            console.log("PHARMACY:", pharmacy);

            const name = pharmacy.name || pharmacy.pharmacyName || "بدون اسم";

            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = name;
            pharmacySelect.appendChild(option);
        });

        pharmacySelect.disabled = false;

    } catch (error) {
        console.error("🔥 خطأ في تحميل الصيدليات:", error);
    }
});

// ================== 3. تفعيل زر البدء ==================
pharmacySelect.addEventListener('change', (e) => {
    startOrderBtn.disabled = !e.target.value;
});

// ================== 4. بدء الطلب ==================
startOrderBtn.addEventListener('click', () => {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('orderScreen').style.display = 'block';

    const repName = repSelect.options[repSelect.selectedIndex].text;
    const pharmacyName = pharmacySelect.options[pharmacySelect.selectedIndex].text;

    document.getElementById('currentRepName').innerHTML = `<b>${repName}</b>`;
    document.getElementById('orderPharmacyName').innerText = pharmacyName;

    if (orderBody.children.length === 0) addNewRow();
});

// ================== 5. المنتجات ==================
function getProductsOptionsHTML() {
    let options = '<option value="">-- اختر الصنف --</option>';

    productsList.forEach(p => {
        options += `<option value="${p.id}" data-price="${p.price}">
            ${p.name} (${p.code})
        </option>`;
    });

    return options;
}

// ================== 6. صف جديد ==================
function addNewRow() {
    if (orderBody.children.length >= MAX_ROWS) return alert("الحد الأقصى 20 صنف");

    const tr = document.createElement('tr');

    tr.innerHTML = `
        <td><select class="product-select">${getProductsOptionsHTML()}</select></td>
        <td><input type="number" class="qty-input" value="1"></td>
        <td class="price-cell">0</td>
        <td class="row-total">0</td>
        <td><button class="delete-btn">حذف</button></td>
    `;

    const select = tr.querySelector('.product-select');
    const qty = tr.querySelector('.qty-input');
    const priceCell = tr.querySelector('.price-cell');
    const totalCell = tr.querySelector('.row-total');

    function calc() {
        const price = parseFloat(priceCell.innerText) || 0;
        const q = parseFloat(qty.value) || 0;
        totalCell.innerText = (price * q).toFixed(2);
        updateTotal();
    }

    select.addEventListener('change', () => {
        const price = select.selectedOptions[0].dataset.price || 0;
        priceCell.innerText = price;
        calc();
    });

    qty.addEventListener('input', calc);

    tr.querySelector('.delete-btn').addEventListener('click', () => {
        tr.remove();
        updateTotal();
    });

    orderBody.appendChild(tr);
}

// ================== 7. الإجمالي ==================
function updateTotal() {
    let total = 0;
    document.querySelectorAll('.row-total').forEach(el => {
        total += parseFloat(el.innerText) || 0;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

// ================== 8. حفظ الطلب ==================
submitOrderBtn.addEventListener('click', async () => {
    try {
        await addDoc(collection(db, "orders"), {
            rep: repSelect.value,
            pharmacy: pharmacySelect.value,
            total: grandTotalEl.innerText,
            createdAt: new Date()
        });

        alert("تم الحفظ");
        location.reload();

    } catch (e) {
        console.error(e);
        alert("خطأ بالحفظ");
    }
});

// ================== تشغيل ==================
loadInitialData();
