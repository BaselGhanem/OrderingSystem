import { templateRows, parseBonusRows } from './regular-bonus-import.js?v=20261001_bonus_template1';
import { db, collection, getDocs, doc, setDoc } from './firebase.js';
import { loadBonusConfiguration, getBonusPolicy, productBonusKey, validatePolicy } from './regular-bonus.js?v=20261001_bonus1';

const host = document.getElementById(`regularBonusPanel`);
host.innerHTML = `<h2>إدارة البونص المنتظم</h2><p>حدد الصنف ونوع البونص وشرائحه. الحساب فوق أعلى شريحة يعتمد على نسبة البونص فيها مع حذف الكسور.</p><label>بحث عن الصنف<input id="bonusSearch" type="search" placeholder="الاسم أو الكود" style="width:100%;padding:12px;margin:8px 0"></label><select id="bonusProduct" aria-label="الصنف" style="width:100%;padding:12px;margin:8px 0"></select><label>طريقة البونص<select id="bonusMode" style="width:100%;padding:12px;margin:8px 0"><option value="tiers">شرائح وبونص تلقائي</option><option value="none">بدون بونص — الكمية يدوية</option><option value="manual">الكمية والبونص يدويان</option></select></label><div id="bonusTiers"></div><button type="button" id="bonusAddTier" class="btn-local">إضافة شريحة</button><button type="button" id="bonusSave" class="btn-local">حفظ شرائح الصنف</button><p id="bonusStatus" role="status"></p>`;
const transfer = document.createElement(`div`);
transfer.style.cssText = `padding:16px;background:#eef8f8;border-radius:12px;margin:16px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center;`;
transfer.innerHTML = `<button type="button" id="bonusDownload" class="btn-local" disabled>تنزيل قالب الشرائح الحالي</button><label>رفع القالب المعدل <input id="bonusUpload" type="file" accept=".xlsx,.xls" disabled></label><button type="button" id="bonusImportSave" class="btn-local" hidden>حفظ التغييرات المرفوعة</button><p style="width:100%;margin:0">عدل الكميات والبونص ونوع البونص، وأبق كود الصنف كما هو. اترك أزواج الشرائح غير المستخدمة فارغة. حذف صف من الملف لا يحذف شرائح الصنف من النظام.</p><div id="bonusImportPreview" style="width:100%" role="status"></div>`;
host.querySelector(`p`).after(transfer);
const download = document.getElementById(`bonusDownload`);
const upload = document.getElementById(`bonusUpload`);
const importSave = document.getElementById(`bonusImportSave`);
const preview = document.getElementById(`bonusImportPreview`);
let pendingImport = null;
const policyFor = product => saved.get(productBonusKey(product)) || getBonusPolicy(product);
download.onclick = () => {
    if (busy || !products.length) return;
    const rows = templateRows(products, policyFor);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet[`!cols`] = rows[0].map((name, index) => ({ wch: index === 1 ? 45 : index === 0 ? 23 : 15 }));
    XLSX.utils.book_append_sheet(workbook, sheet, `Regular Bonus`);
    XLSX.writeFile(workbook, `Regular_Bonus_Template.xlsx`);
};
upload.onchange = async () => {
    pendingImport = null; importSave.hidden = true; preview.textContent = ``;
    if (!upload.files[0] || busy) return;
    try {
        const workbook = XLSX.read(await upload.files[0].arrayBuffer(), { type: `array` });
        const sheet = workbook.Sheets[`Regular Bonus`];
        if (!sheet) throw new Error(`استخدم ورقة Regular Bonus الموجودة في القالب`);
        const policies = parseBonusRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: ``, raw: true }), products);
        const changed = Object.entries(policies).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(policyFor(products.find(product => productBonusKey(product) === key))));
        pendingImport = Object.fromEntries(changed);
        preview.textContent = `تم فحص ${Object.keys(policies).length} صنفا. عدد الأصناف التي ستتغير: ${changed.length}.`;
        const list = document.createElement(`ul`);
        for (const [key, policy] of changed) {
            const item = document.createElement(`li`);
            item.textContent = `${products.find(product => productBonusKey(product) === key).name}: ${policy.mode === `none` ? `بدون بونص` : policy.mode === `manual` ? `يدوي` : policy.tiers.map(tier => `${tier.qty} + ${tier.bonus}`).join(`، `)}`;
            list.append(item);
        }
        preview.append(list); importSave.hidden = !changed.length;
    } catch (error) { preview.textContent = `لم يتم استيراد أي تغيير: ${error.message}`; }
};
importSave.onclick = async () => {
    if (busy || !pendingImport || !Object.keys(pendingImport).length) return;
    const policies = pendingImport;
    busy = true; importSave.disabled = true; save.disabled = true; upload.disabled = true; productSelect.disabled = true;
    try {
        await setDoc(doc(db, `settings`, `regularBonus`), { policies, updatedAt: new Date().toISOString() }, { merge: true });
        for (const [key, policy] of Object.entries(policies)) saved.set(key, policy);
        pendingImport = null; importSave.hidden = true; upload.value = ``;
        selectProduct(); preview.textContent = `تم حفظ شرائح ${Object.keys(policies).length} صنفا بنجاح. تطبق عند إعادة فتح صفحة الطلبية.`;
    } catch (error) { preview.textContent = `تعذر حفظ الملف؛ لم يكتمل الاستيراد: ${error.message}`; }
    finally { busy = false; importSave.disabled = false; upload.disabled = false; productSelect.disabled = false; save.disabled = !active; }
};
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
        busy = true; save.disabled = true; productSelect.disabled = true; upload.disabled = true;
        status.textContent = `جاري حفظ الشرائح…`;
        await setDoc(doc(db, `settings`, `regularBonus`), { policies: { [key]: policy }, updatedAt: new Date().toISOString() }, { merge: true });
        saved.set(key, policy);
        pendingImport = null; importSave.hidden = true; upload.value = ``; preview.textContent = ``;
        status.textContent = `تم الحفظ. تطبق الشرائح عند فتح صفحة الطلبية مجددا؛ الطلبات المحفوظة لا تتغير.`;
    } catch (error) { status.textContent = `لم يتم الحفظ: ${error.message}`; }
    finally { busy = false; save.disabled = !active; productSelect.disabled = false; upload.disabled = false; }
};
save.disabled = true;
status.textContent = `جاري تحميل الأصناف والشرائح…`;
try {
    await loadBonusConfiguration();
    const snapshot = await getDocs(collection(db, `products`));
    products = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(product => productBonusKey(product)).sort((a, b) => a.name.localeCompare(b.name));
    filterProducts();
    download.disabled = false; upload.disabled = false;
} catch (error) { status.textContent = `تعذر تحميل الشرائح. أعد تحميل الصفحة: ${error.message}`; }
