import { db, collection, getDocs, doc, setDoc } from './firebase.js';
import { loadBonusConfiguration, getBonusPolicy, productBonusKey, validatePolicy } from './regular-bonus.js?v=20261001_bonus1';

const host = document.getElementById(`regularBonusPanel`);
host.innerHTML = `<h2>إدارة البونص المنتظم</h2><p>حدد الصنف ونوع البونص وشرائحه. الحساب فوق أعلى شريحة يعتمد على نسبة البونص فيها مع حذف الكسور.</p><label>بحث عن الصنف<input id="bonusSearch" type="search" placeholder="الاسم أو الكود" style="width:100%;padding:12px;margin:8px 0"></label><select id="bonusProduct" aria-label="الصنف" style="width:100%;padding:12px;margin:8px 0"></select><label>طريقة البونص<select id="bonusMode" style="width:100%;padding:12px;margin:8px 0"><option value="tiers">شرائح وبونص تلقائي</option><option value="none">بدون بونص — الكمية يدوية</option><option value="manual">الكمية والبونص يدويان</option></select></label><div id="bonusTiers"></div><button type="button" id="bonusAddTier" class="btn-local">إضافة شريحة</button><button type="button" id="bonusSave" class="btn-local">حفظ شرائح الصنف</button><p id="bonusStatus" role="status"></p>`;
const productSelect = document.getElementById(`bonusProduct`);
const mode = document.getElementById(`bonusMode`);
const tiers = document.getElementById(`bonusTiers`);
const status = document.getElementById(`bonusStatus`);
const save = document.getElementById(`bonusSave`);
let products = [];
const saved = new Map();
let active;
let busy = false;
function addTier(qty = ``, bonus = ``) {
    const row = document.createElement(`div`);
    row.style.cssText = `display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;align-items:center;`;
    row.innerHTML = `<label>الكمية <input class="tier-qty" type="number" min="1" step="1" style="width:100px;padding:10px"></label><label>البونص <input class="tier-bonus" type="number" min="0" step="1" style="width:100px;padding:10px"></label><button type="button" class="btn-local">حذف</button>`;
    row.querySelector(`.tier-qty`).value = qty;
    row.querySelector(`.tier-bonus`).value = bonus;
    row.querySelector(`button`).onclick = () => row.remove();
    tiers.append(row);
}
function toggle() {
    tiers.hidden = mode.value !== `tiers`;
    document.getElementById(`bonusAddTier`).hidden = tiers.hidden;
}
function selectProduct() {
    active = products.find(product => productBonusKey(product) === productSelect.value);
    tiers.replaceChildren();
    if (!active) { save.disabled = true; return; }
    const policy = saved.get(productSelect.value) || getBonusPolicy(active);
    mode.value = policy.mode;
    policy.tiers.forEach(tier => addTier(tier.qty, tier.bonus));
    status.textContent = ``;
    toggle(); save.disabled = false;
}
function filterProducts() {
    if (busy) return;
    const previous = productSelect.value;
    const search = document.getElementById(`bonusSearch`).value.trim().toLowerCase();
    productSelect.replaceChildren();
    for (const product of products.filter(product => `${product.name} ${productBonusKey(product)}`.toLowerCase().includes(search))) {
        productSelect.add(new Option(`${product.name} — ${productBonusKey(product)}`, productBonusKey(product)));
    }
    if ([...productSelect.options].some(option => option.value === previous)) productSelect.value = previous;
    selectProduct();
}
productSelect.onchange = selectProduct;
mode.onchange = toggle;
document.getElementById(`bonusSearch`).oninput = filterProducts;
document.getElementById(`bonusAddTier`).onclick = () => addTier();
save.onclick = async () => {
    if (!active || busy) return;
    try {
        const values = [...tiers.children].map(row => {
            const q = row.querySelector(`.tier-qty`).value;
            const b = row.querySelector(`.tier-bonus`).value;
            if (mode.value === `tiers` && (!q || !b)) throw new Error(`أكمل الكمية والبونص لكل شريحة`);
            return { qty: Number(q), bonus: Number(b) };
        });
        const policy = validatePolicy({ mode: mode.value, tiers: values });
        const key = productBonusKey(active);
        busy = true; save.disabled = true; productSelect.disabled = true;
        status.textContent = `جاري حفظ الشرائح…`;
        await setDoc(doc(db, `settings`, `regularBonus`), { policies: { [key]: policy }, updatedAt: new Date().toISOString() }, { merge: true });
        saved.set(key, policy);
        status.textContent = `تم الحفظ. تطبق الشرائح عند فتح صفحة الطلبية مجددا؛ الطلبات المحفوظة لا تتغير.`;
    } catch (error) { status.textContent = `لم يتم الحفظ: ${error.message}`; }
    finally { busy = false; save.disabled = !active; productSelect.disabled = false; }
};
save.disabled = true;
status.textContent = `جاري تحميل الأصناف والشرائح…`;
try {
    await loadBonusConfiguration();
    const snapshot = await getDocs(collection(db, `products`));
    products = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(product => productBonusKey(product)).sort((a, b) => a.name.localeCompare(b.name));
    filterProducts();
} catch (error) { status.textContent = `تعذر تحميل الشرائح. أعد تحميل الصفحة: ${error.message}`; }
