import { db, collection, getDocs, query, where, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc } from '../js/firebase.js';

const SALES = `returns_sales`;
const PHARMACIES = `returns_pharmacies`;
const RETURNS = `returns_requests`;
const IMPORTS = `returns_imports`;
const ACCESS_SESSION = `returns_access_context`;
const DEFAULT_REP_SUPERVISOR_MAP = { [`مراد عمر`]: `محمد طوالبه`, [`مؤيد الزعبي`]: `محمد طوالبه`, [`محمد عبدربه`]: `محمد طوالبه`, [`محمد الفاعوري`]: `عبدالله الناطور`, [`اجود التلهوني`]: `عبدالله الناطور`, [`يزيد الرقب`]: `محمد طوالبه`, [`تامر عقل`]: `محمد طوالبه`, [`محمد ابو يامين`]: `عبدالله الناطور`, [`مراد الظاهر`]: `عبدالله الناطور` };
let repSupervisorMap = { ...DEFAULT_REP_SUPERVISOR_MAP };
const REP_PASSWORDS = { [`مراد الظاهر`]: `MzQ3OA==`, [`محمد ابو يامين`]: `NDA5OQ==`, [`يزيد الرقب`]: `NDE4Nw==`, [`مؤيد الزعبي`]: `MzQ3OQ==`, [`اجود التلهوني`]: `MzczNw==`, [`تامر عقل`]: `MzU2OQ==`, [`محمد الفاعوري`]: `NDAyMA==`, [`مراد عمر`]: `MTUxMA==`, [`محمد عبدربه`]: `NDAyOQ==` };
const STATUS_LABELS = {
    pending_returns_manager: `بانتظار رئيس قسم المرتجعات`, returned_to_rep: `معاد للمندوب`, pending_supervisor: `بانتظار المشرف`,
    pending_market_manager: `بانتظار مدير السوق`, returned_to_returns_manager: `معاد لرئيس قسم المرتجعات`,
    approved_for_export: `جاهز للسحب`, exported: `تم السحب`
};
const $ = id => document.getElementById(id);
const text = value => String(value ?? ``).trim();
const normalize = value => text(value).toLocaleLowerCase(`ar`).replace(/\s+/g, ` `);
const number = value => { const parsed = Number(text(value).replace(/,/g, ``).replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit)))); return Number.isFinite(parsed) ? parsed : 0; };
const money = value => number(value).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = value => text(value).replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/"/g, `&quot;`).replace(/'/g, `&#039;`);
const hash = value => { let a = 2166136261, b = 2246822519; for (const char of String(value)) { const code = char.charCodeAt(0); a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 3266489917); } return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`; };
const now = () => new Date();
const dateText = value => { const date = value?.toDate ? value.toDate() : new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? `-` : date.toLocaleString(`en-GB`); };
const isoDate = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const raw = text(value); if (!raw) return ``;
    const ymd = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, `0`)}-${ymd[3].padStart(2, `0`)}`;
    const dmy = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, `0`)}-${dmy[1].padStart(2, `0`)}`;
    const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? `` : parsed.toISOString().slice(0, 10);
};
const params = new URLSearchParams(location.search);
const actorName = () => text(readAccessSession()?.name || readAccessSession()?.repName || params.get(`name`) || params.get(`rep`) || document.body.dataset.role || `النظام`);
function readAccessSession() { try { return JSON.parse(sessionStorage.getItem(ACCESS_SESSION) || `null`); } catch (_) { return null; } }
function writeAccessSession(value) { sessionStorage.setItem(ACCESS_SESSION, JSON.stringify(value)); }

function showBanner(message, type = `info`) { const banner = $(`banner`); if (!banner) return; banner.className = `banner show ${type}`; banner.textContent = message; window.scrollTo({ top: 0, behavior: `smooth` }); }
function enhanceCombobox(select, config = {}) {
    if (!select || select._searchCombobox) { select?._searchCombobox?.sync(); return select?._searchCombobox; }
    const host = document.createElement(`div`); host.className = `search-combobox`; host.innerHTML = `<div class="combobox-control"><input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off"><button type="button" tabindex="-1" aria-label="فتح القائمة"><i class="ph ph-caret-down"></i></button></div><div class="combobox-menu" role="listbox"></div>`;
    select.insertAdjacentElement(`afterend`, host); select.classList.add(`native-combobox-select`);
    const input = host.querySelector(`input`), toggle = host.querySelector(`button`), menu = host.querySelector(`.combobox-menu`); let activeIndex = -1, openState = false;
    const options = () => [...select.options].filter(option => option.value !== `` && !option.disabled);
    const selectedText = () => select.selectedOptions[0]?.textContent?.trim() || ``;
    const close = () => { openState = false; activeIndex = -1; host.classList.remove(`open`); input.setAttribute(`aria-expanded`, `false`); };
    const choose = option => { select.value = option.value; input.value = option.textContent.trim(); input.dataset.selectedText = input.value; select.dispatchEvent(new Event(`change`, { bubbles: true })); close(); };
    const render = (queryText = ``, showAll = false) => {
        const queryValue = normalize(showAll ? `` : queryText); const matches = options().filter(option => !queryValue || normalize(option.textContent).includes(queryValue)); activeIndex = Math.min(activeIndex, matches.length - 1);
        menu.innerHTML = matches.length ? matches.map((option, index) => `<button type="button" role="option" data-value="${escapeHtml(option.value)}" class="combobox-option ${index === activeIndex ? `active` : ``}"><span>${escapeHtml(option.textContent.trim())}</span><i class="ph ph-check"></i></button>`).join(``) : `<div class="combobox-empty"><i class="ph ph-magnifying-glass"></i><span>لا توجد نتائج مطابقة</span></div>`;
        menu.querySelectorAll(`.combobox-option`).forEach(button => button.onmousedown = event => { event.preventDefault(); const option = options().find(item => item.value === button.dataset.value); if (option) choose(option); });
        openState = true; host.classList.add(`open`); input.setAttribute(`aria-expanded`, `true`);
    };
    const sync = () => { input.disabled = select.disabled; host.classList.toggle(`disabled`, select.disabled); input.placeholder = config.placeholder || select.options[0]?.textContent?.trim() || `اكتب للبحث...`; if (select.value) { input.value = selectedText(); input.dataset.selectedText = input.value; } else if (document.activeElement !== input) { input.value = ``; input.dataset.selectedText = ``; } if (openState) render(input.value, false); };
    input.onfocus = () => { if (!input.disabled) render(``, true); };
    input.oninput = () => { if (input.value !== input.dataset.selectedText) select.value = ``; render(input.value, false); };
    input.onkeydown = event => {
        const buttons = [...menu.querySelectorAll(`.combobox-option`)];
        if (event.key === `ArrowDown`) { event.preventDefault(); if (!openState) render(``, true); activeIndex = Math.min(activeIndex + 1, buttons.length - 1); }
        else if (event.key === `ArrowUp`) { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); }
        else if (event.key === `Enter` && openState && activeIndex >= 0) { event.preventDefault(); buttons[activeIndex]?.dispatchEvent(new MouseEvent(`mousedown`, { bubbles: true })); return; }
        else if (event.key === `Escape`) { close(); return; } else return;
        buttons.forEach((button, index) => button.classList.toggle(`active`, index === activeIndex)); buttons[activeIndex]?.scrollIntoView({ block: `nearest` });
    };
    toggle.onclick = () => { if (!input.disabled) { const wasOpen = openState; input.focus(); wasOpen ? close() : render(``, true); } };
    input.onblur = () => setTimeout(() => { if (!host.matches(`:hover`)) { if (!select.value) input.value = ``; close(); } }, 120);
    const observer = new MutationObserver(sync); observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: [`disabled`, `selected`] });
    select._searchCombobox = { sync, close, host }; sync(); return select._searchCombobox;
}
function closeAllComboboxes(event) { document.querySelectorAll(`.search-combobox.open`).forEach(host => { if (!host.contains(event.target)) host.previousElementSibling?._searchCombobox?.close(); }); }
document.addEventListener(`mousedown`, closeAllComboboxes);
function audit(action, role, details = ``) { return { action, role, actor: actorName(), details: text(details), at: now() }; }
function auditLabel(entry = {}) {
    const labels = { created: `إنشاء المرتجع`, resubmitted: `إعادة إرسال من المندوب`, returned_to_rep: `إعادة للمندوب`, split_completed: `فصل الكمية والبونص`, supervisor_edited: `تعديل المشرف`, supervisor_approved: `موافقة المشرف`, supervisor_returned: `إعادة من المشرف`, market_edited: `تعديل مدير السوق`, market_approved: `اعتماد مدير السوق`, market_returned: `رفض/إعادة من مدير السوق`, returns_manager_reworked: `إعادة تدقيق رئيس المرتجعات`, exported: `تم سحب المرتجع` }; return labels[entry.action] || entry.action;
}
function appendAudit(row, entry) { return [...(Array.isArray(row.auditTrail) ? row.auditTrail : []), entry]; }
function lineKey(row) { return `${normalize(row.invoiceNumber)}__${normalize(row.pharmacyCode)}__${normalize(row.productCode)}__${normalize(row.batch)}__${number(row.unitPrice)}__${isoDate(row.saleDate)}`; }

let repName = ``;
let selectedPharmacy = null;
let pharmacySales = [];
let salesById = new Map();
let editingId = ``;

async function loadRepPharmacies() {
    const snap = await getDocs(query(collection(db, PHARMACIES), where(`repKey`, `==`, normalize(repName))));
    const rows = []; snap.forEach(item => rows.push({ id: item.id, ...item.data() })); rows.sort((a, b) => text(a.pharmacyName).localeCompare(text(b.pharmacyName), `ar`));
    $(`pharmacySelect`).innerHTML = `<option value="">اختر الصيدلية</option>${rows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.pharmacyCode)} — ${escapeHtml(row.pharmacyName)}</option>`).join(``)}`;
    $(`pharmacySelect`)._rows = rows;
}

async function loadPharmacySales() {
    pharmacySales = []; salesById = new Map();
    if (!selectedPharmacy) return;
    const snap = await getDocs(query(collection(db, SALES), where(`repPharmacyKey`, `==`, selectedPharmacy.repPharmacyKey)));
    snap.forEach(item => { const row = { id: item.id, ...item.data() }; pharmacySales.push(row); salesById.set(item.id, row); });
    const returnsSnap = await getDocs(query(collection(db, RETURNS), where(`repPharmacyKey`, `==`, selectedPharmacy.repPharmacyKey)));
    const used = new Map();
    returnsSnap.forEach(item => {
        const request = item.data(); if (request.deletedAt) return;
        if (request.status === `returned_to_rep` && item.id === editingId) return;
        (request.items || []).forEach(line => used.set(line.saleId, (used.get(line.saleId) || 0) + number(line.totalReturnQty)));
    });
    pharmacySales.forEach(sale => { sale.totalPurchasedQty = number(sale.soldQty) + number(sale.bonusQty); sale.availableReturnQty = Math.max(0, sale.totalPurchasedQty - (used.get(sale.id) || 0)); });
}

function productOptions() {
    const map = new Map(); pharmacySales.filter(row => row.availableReturnQty > 0).forEach(row => map.set(normalize(row.productCode || row.productName), { code: row.productCode, name: row.productName }));
    return [...map.values()].sort((a, b) => text(a.name).localeCompare(text(b.name), `ar`));
}
function salesForProduct(key) { return pharmacySales.filter(row => normalize(row.productCode || row.productName) === key && row.availableReturnQty > 0); }
function updateTotal() { let total = 0; document.querySelectorAll(`.line`).forEach(line => { const sale = salesById.get(line.querySelector(`.batch`)?.value); total += number(line.querySelector(`.qty`)?.value) * number(sale?.unitPrice); }); $(`returnTotal`).textContent = money(total); }

function addLine(prefill = null) {
    if (!selectedPharmacy) return showBanner(`اختر الصيدلية أولًا.`, `error`);
    const products = productOptions();
    const line = document.createElement(`div`); line.className = `line`;
    line.innerHTML = `<div><label>الصنف</label><select class="product"><option value="">اختر الصنف</option>${products.map(row => `<option value="${escapeHtml(normalize(row.code || row.name))}">${escapeHtml(row.code)} — ${escapeHtml(row.name)}</option>`).join(``)}</select></div><div><label>Batch / رقم الفاتورة</label><select class="batch" disabled><option value="">اختر</option></select></div><div><label>تاريخ الانتهاء</label><div class="readonly expiry">-</div></div><div><label>المتاح</label><div class="readonly available">0</div></div><div><label>إجمالي المرتجع</label><input class="qty" type="number" min="1" step="1" value="1"></div><div><label>السبب</label><select class="reason"><option value="good">بضاعة جيدة</option><option value="expired">Expired</option></select></div><div><label>&nbsp;</label><button class="btn danger remove"><i class="ph ph-trash"></i></button></div>`;
    const product = line.querySelector(`.product`), batch = line.querySelector(`.batch`), expiry = line.querySelector(`.expiry`), available = line.querySelector(`.available`), qty = line.querySelector(`.qty`);
    const populate = () => { const rows = salesForProduct(product.value); batch.innerHTML = `<option value="">اختر</option>${rows.map(row => `<option value="${row.id}">${escapeHtml(row.batch)} — فاتورة ${escapeHtml(row.invoiceNumber)} — متاح ${row.availableReturnQty}</option>`).join(``)}`; batch.disabled = rows.length === 0; };
    const sync = () => { const sale = salesById.get(batch.value); expiry.textContent = sale?.expiryDate || `-`; available.textContent = sale?.availableReturnQty ?? `0`; qty.max = sale?.availableReturnQty || 0; updateTotal(); };
    product.onchange = () => { populate(); batch.value = ``; sync(); }; batch.onchange = sync; qty.oninput = updateTotal; line.querySelector(`.remove`).onclick = () => { line.remove(); updateTotal(); };
    $(`returnLines`).appendChild(line);
    enhanceCombobox(product, { placeholder: `اكتب اسم الصنف أو الكود...` }); enhanceCombobox(batch, { placeholder: `ابحث بالـBatch أو الفاتورة...` }); enhanceCombobox(line.querySelector(`.reason`), { placeholder: `اختر السبب...` });
    if (prefill) { product.value = normalize(prefill.productCode || prefill.productName); populate(); batch.value = prefill.saleId; qty.value = number(prefill.totalReturnQty); line.querySelector(`.reason`).value = prefill.reason || `good`; sync(); product._searchCombobox.sync(); batch._searchCombobox.sync(); line.querySelector(`.reason`)._searchCombobox.sync(); }
    updateTotal();
}

function collectRepLines() {
    const items = [], totals = new Map();
    document.querySelectorAll(`.line`).forEach((line, index) => {
        const sale = salesById.get(line.querySelector(`.batch`).value), qty = number(line.querySelector(`.qty`).value);
        if (!sale || qty <= 0) throw new Error(`أكمل بيانات السطر ${index + 1}.`);
        totals.set(sale.id, (totals.get(sale.id) || 0) + qty);
        items.push({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, saleDate: sale.saleDate || ``, productCode: sale.productCode, productName: sale.productName, batch: sale.batch, expiryDate: sale.expiryDate, totalReturnQty: qty, paidReturnQty: null, bonusReturnQty: null, originalSoldQty: number(sale.soldQty), originalBonusQty: number(sale.bonusQty), unitPrice: number(sale.unitPrice), reason: line.querySelector(`.reason`).value, lineValue: qty * number(sale.unitPrice) });
    });
    totals.forEach((qty, id) => { const sale = salesById.get(id); if (qty > sale.availableReturnQty) throw new Error(`مرتجع ${sale.productName} / ${sale.batch} هو ${qty} بينما المتاح ${sale.availableReturnQty}.`); });
    if (!items.length) throw new Error(`أضف صنفًا واحدًا على الأقل.`); return items;
}

async function submitRepReturn() {
    const button = $(`submitReturn`); button.disabled = true;
    try {
        await loadPharmacySales(); const items = collectRepLines(); const timestamp = now();
        const payload = { repName, repKey: normalize(repName), supervisorName: text(selectedPharmacy.supervisorName), supervisorKey: normalize(selectedPharmacy.supervisorName), pharmacyCode: selectedPharmacy.pharmacyCode, pharmacyName: selectedPharmacy.pharmacyName, repPharmacyKey: selectedPharmacy.repPharmacyKey, items, totalReturnQty: items.reduce((s, x) => s + x.totalReturnQty, 0), totalValue: items.reduce((s, x) => s + x.lineValue, 0), note: text($(`returnNote`).value), status: `pending_returns_manager`, updatedAt: timestamp };
        if (editingId) { const old = await getDoc(doc(db, RETURNS, editingId)); if (!old.exists() || old.data().status !== `returned_to_rep`) throw new Error(`لم يعد المرتجع متاحًا للتعديل.`); payload.auditTrail = appendAudit(old.data(), audit(`resubmitted`, `representative`)); await updateDoc(old.ref, payload); }
        else { payload.createdAt = timestamp; payload.auditTrail = [audit(`created`, `representative`)]; await addDoc(collection(db, RETURNS), payload); }
        editingId = ``; $(`returnLines`).innerHTML = ``; $(`returnNote`).value = ``; await loadPharmacySales(); addLine(); showBanner(`تم إرسال المرتجع لرئيس قسم المرتجعات.`, `success`);
    } catch (error) { console.error(error); showBanner(error.message || `تعذر إرسال المرتجع.`, `error`); } finally { button.disabled = false; }
}

async function loadRepHistory() {
    const body = $(`rowsBody`); body.innerHTML = `<tr><td colspan="7"><div class="empty">جاري التحميل...</div></td></tr>`;
    try {
        const snap = await getDocs(query(collection(db, RETURNS), where(`repKey`, `==`, normalize(repName)))); const rows = []; snap.forEach(item => { if (!item.data().deletedAt) rows.push({ id: item.id, ...item.data() }); }); rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        body.innerHTML = rows.length ? rows.map(row => `<tr><td>${dateText(row.createdAt)}</td><td>${escapeHtml(row.pharmacyCode)}<br><strong>${escapeHtml(row.pharmacyName)}</strong></td><td>${row.items.map(item => `${escapeHtml(item.productName)} — ${escapeHtml(item.batch)} — فاتورة ${escapeHtml(item.invoiceNumber)} × ${item.totalReturnQty}`).join(`<br>`)}</td><td>${money(row.totalValue)}</td><td><span class="status ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td><td>${escapeHtml(row.returnReason || row.rejectionReason || `-`)}</td><td>${row.status === `returned_to_rep` ? `<button class="btn warning edit" data-id="${row.id}">تعديل</button>` : `مشاهدة`}</td></tr>`).join(``) : `<tr><td colspan="7"><div class="empty">لا توجد مرتجعات.</div></td></tr>`;
        body.querySelectorAll(`.edit`).forEach(button => button.onclick = () => editRepReturn(rows.find(row => row.id === button.dataset.id)));
    } catch (error) { body.innerHTML = `<tr><td colspan="7"><div class="empty">تعذر تحميل البيانات.</div></td></tr>`; }
}
async function editRepReturn(row) {
    editingId = row.id; if (!selectedPharmacy || selectedPharmacy.repPharmacyKey !== row.repPharmacyKey) return showBanner(`هذا المرتجع يعود لصيدلية أخرى. ادخل من الصيدلية الصحيحة لتعديله.`, `error`);
    $(`pharmacySelect`).value = selectedPharmacy.id; $(`pharmacySelect`)._searchCombobox?.sync(); $(`pharmacyCode`).value = selectedPharmacy.pharmacyCode; await loadPharmacySales(); $(`returnLines`).innerHTML = ``; row.items.forEach(addLine); $(`returnNote`).value = row.note || ``; switchRepTab(`new`); showBanner(`تم فتح المرتجع للتعديل وإعادة الإرسال.`, `info`);
}
function switchRepTab(tab) { $(`newPanel`).classList.toggle(`hidden`, tab !== `new`); $(`historyPanel`).classList.toggle(`hidden`, tab !== `history`); document.querySelectorAll(`[data-tab]`).forEach(button => button.classList.toggle(`active`, button.dataset.tab === tab)); if (tab === `history`) loadRepHistory(); }
async function initRep() {
    const access = readAccessSession(); if (access?.role !== `rep` || !access.repName || !access.pharmacyCode) { location.replace(`login.html`); return; }
    repName = text(access.repName); selectedPharmacy = { id: access.pharmacyId, repName, repKey: normalize(repName), supervisorName: access.supervisorName, supervisorKey: normalize(access.supervisorName), pharmacyCode: access.pharmacyCode, pharmacyName: access.pharmacyName, repPharmacyKey: `${normalize(repName)}__${normalize(access.pharmacyCode)}` };
    $(`pageIdentity`).textContent = `${repName} — ${selectedPharmacy.pharmacyName}`; $(`pharmacySelect`).innerHTML = `<option value="${escapeHtml(selectedPharmacy.id)}" selected>${escapeHtml(selectedPharmacy.pharmacyCode)} — ${escapeHtml(selectedPharmacy.pharmacyName)}</option>`; $(`pharmacySelect`).disabled = true; enhanceCombobox($(`pharmacySelect`)); $(`pharmacyCode`).value = selectedPharmacy.pharmacyCode; await loadPharmacySales(); addLine();
    $(`addLine`).onclick = () => addLine(); $(`submitReturn`).onclick = submitRepReturn; document.querySelectorAll(`[data-tab]`).forEach(button => button.onclick = () => switchRepTab(button.dataset.tab));
}

let reviewRows = [];
function roleStatus() { return Object.keys(STATUS_LABELS); }
function renderReviewShell() {
    $(`reviewRoot`).innerHTML = `<section class="card"><div class="summary"><div class="stat"><span>عدد المرتجعات</span><strong id="countStat">0</strong></div><div class="stat"><span>إجمالي الكمية</span><strong id="qtyStat">0</strong></div><div class="stat"><span>الكمية المدفوعة</span><strong id="paidStat">0</strong></div><div class="stat"><span>القيمة</span><strong id="valueStat">0.00</strong></div></div><div class="grid"><div class="field"><label>بحث</label><input id="searchFilter" placeholder="الصيدلية، المندوب، الفاتورة"></div><div class="field"><label>الحالة</label><select id="statusFilter"><option value="">جميع الحالات</option>${Object.entries(STATUS_LABELS).map(([key,value]) => `<option value="${key}">${value}</option>`).join(``)}</select></div><div class="field"><label>من تاريخ</label><input id="fromFilter" type="date"></div><div class="field"><label>إلى تاريخ</label><input id="toFilter" type="date"></div></div></section><section class="card"><div class="table-wrap"><table class="table"><thead><tr><th><input id="selectAll" class="check" type="checkbox"></th><th>التاريخ</th><th>المندوب / المشرف</th><th>الصيدلية</th><th>الأصناف</th><th>الكمية / البونص</th><th>القيمة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="reviewBody"></tbody></table></div></section>`;
    [`searchFilter`,`statusFilter`,`fromFilter`,`toFilter`].forEach(id => $(id).oninput = renderReviewRows); enhanceCombobox($(`statusFilter`), { placeholder: `ابحث عن الحالة...` }); $(`selectAll`).onchange = event => document.querySelectorAll(`.row-check`).forEach(box => box.checked = event.target.checked);
}
function filteredReviewRows() {
    const needle = normalize($(`searchFilter`)?.value), status = text($(`statusFilter`)?.value), from = text($(`fromFilter`)?.value), to = text($(`toFilter`)?.value);
    return reviewRows.filter(row => { const haystack = normalize(`${row.repName} ${row.supervisorName} ${row.pharmacyCode} ${row.pharmacyName} ${(row.items || []).map(x => `${x.invoiceNumber} ${x.productName} ${x.batch}`).join(` `)}`); const created = row.createdAt?.toDate ? row.createdAt.toDate().toISOString().slice(0,10) : isoDate(row.createdAt); return (!needle || haystack.includes(needle)) && (!status || row.status === status) && (!from || created >= from) && (!to || created <= to); });
}
function renderReviewRows() {
    const rows = filteredReviewRows(), body = $(`reviewBody`); $(`countStat`).textContent = rows.length; $(`qtyStat`).textContent = rows.reduce((s,r)=>s+number(r.totalReturnQty),0); $(`paidStat`).textContent = rows.reduce((s,r)=>s+(r.items||[]).reduce((a,x)=>a+number(x.paidReturnQty),0),0); $(`valueStat`).textContent = money(rows.reduce((s,r)=>s+number(r.totalValue),0));
    body.innerHTML = rows.length ? rows.map(row => `<tr><td><input class="check row-check" type="checkbox" value="${row.id}"></td><td>${dateText(row.createdAt)}</td><td><strong>${escapeHtml(row.repName)}</strong><br>${escapeHtml(row.supervisorName || `-`)}</td><td>${escapeHtml(row.pharmacyCode)}<br><strong>${escapeHtml(row.pharmacyName)}</strong></td><td>${(row.items||[]).map(x=>`${escapeHtml(x.productName)}<br><small>${escapeHtml(x.batch)} | ${escapeHtml(x.invoiceNumber)}</small>`).join(`<hr>`)}</td><td>${(row.items||[]).map(x=>`${x.totalReturnQty} / Bonus ${x.bonusReturnQty ?? `-`}`).join(`<br>`)}</td><td>${money(row.totalValue)}</td><td><span class="status ${row.status}">${STATUS_LABELS[row.status]||row.status}</span></td><td><button class="btn secondary open-row" data-id="${row.id}"><i class="ph ph-eye"></i> فتح</button></td></tr>`).join(``) : `<tr><td colspan="9"><div class="empty">لا توجد مرتجعات مطابقة.</div></td></tr>`;
    body.querySelectorAll(`.open-row`).forEach(button => button.onclick = () => openDrawer(reviewRows.find(row => row.id === button.dataset.id)));
}
async function loadReviewRows(role) {
    const statuses = roleStatus(); let snap;
    if (role === `supervisor`) { const access = readAccessSession(); if (access?.role !== `supervisor` || !access.name) { location.replace(`login.html`); return; } const name = text(access.name); $(`pageIdentity`).textContent = name; snap = await getDocs(query(collection(db, RETURNS), where(`supervisorKey`, `==`, normalize(name)))); }
    else snap = await getDocs(collection(db, RETURNS));
    reviewRows = []; snap.forEach(item => { const row = item.data(); if (!row.deletedAt && statuses.includes(row.status)) reviewRows.push({ id:item.id,...row }); }); reviewRows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)); renderReviewRows();
}
function invoiceHistoryHtml(item) {
    return `<div class="audit-row"><strong>الفاتورة ${escapeHtml(item.invoiceNumber)}</strong><br>${escapeHtml(item.productName)} — Batch ${escapeHtml(item.batch)} — انتهاء ${escapeHtml(item.expiryDate || `-`)}<br><small>تاريخ الفاتورة: ${escapeHtml(item.saleDate || `-`)} | المسحوبات الأصلية: كمية ${number(item.originalSoldQty ?? item.soldQty)} + بونص ${number(item.originalBonusQty ?? item.bonusQty)} | سعر الوحدة ${money(item.unitPrice)}</small></div>`;
}
async function loadInvoiceHistory(row) {
    const target = $(`invoiceHistory`); target.classList.remove(`hidden`); target.innerHTML = `<div class="empty">جاري تحميل المبيعات القديمة...</div>`;
    try {
        const snap = await getDocs(query(collection(db, SALES), where(`repPharmacyKey`, `==`, row.repPharmacyKey)));
        const productKeys = new Set((row.items || []).map(item => normalize(item.productCode || item.productName)));
        const sales = []; snap.forEach(item => { const sale = item.data(); if (productKeys.has(normalize(sale.productCode || sale.productName))) sales.push(sale); });
        sales.sort((a, b) => text(b.saleDate).localeCompare(text(a.saleDate)));
        target.innerHTML = sales.length ? sales.map(invoiceHistoryHtml).join(``) : `<div class="empty">لا توجد فواتير أخرى مطابقة.</div>`;
    } catch (error) { target.innerHTML = `<div class="empty">تعذر تحميل الفواتير القديمة.</div>`; }
}
function openDrawer(row) {
    const role = document.body.dataset.role; $(`drawer`).classList.add(`show`); $(`drawerTitle`).textContent = `مرتجع ${row.pharmacyName}`;
    const canEdit = (role === `returns_manager` && [`pending_returns_manager`,`returned_to_returns_manager`].includes(row.status)) || (role === `supervisor` && row.status === `pending_supervisor`) || (role === `market_manager` && row.status === `pending_market_manager`);
    const splitRows = (row.items||[]).map((item,index) => `<tr data-index="${index}"><td>${escapeHtml(item.productName)}<br><small>${escapeHtml(item.productCode)}</small></td><td>${escapeHtml(item.batch)}<br><small>${escapeHtml(item.expiryDate||`-`)}</small></td><td>${escapeHtml(item.invoiceNumber)}</td><td>${item.totalReturnQty}</td><td><input class="paid-input" type="number" min="0" max="${item.totalReturnQty}" step="1" value="${item.paidReturnQty ?? ``}" ${canEdit?``:`disabled`}></td><td>${role === `supervisor` || role === `market_manager` ? `<input class="bonus-input" type="number" min="0" max="${item.totalReturnQty}" step="1" value="${item.bonusReturnQty ?? 0}" ${canEdit?``:`disabled`}>` : `<span class="bonus-output">${item.bonusReturnQty ?? `-`}</span>`}</td><td>${money(item.unitPrice)}</td><td class="line-value">${money(item.lineValue)}</td></tr>`).join(``);
    const actionButtons = role === `returns_manager` && [`pending_returns_manager`,`returned_to_returns_manager`].includes(row.status) ? `<button class="btn primary save-split">حفظ وإرسال للمشرف</button><button class="btn warning return-rep">إعادة للمندوب</button><button class="btn danger delete-request">حذف</button>` : role === `supervisor` ? `<button class="btn primary approve-supervisor">موافقة وإرسال لمدير السوق</button><button class="btn warning return-manager">إعادة لرئيس المرتجعات</button>` : role === `market_manager` ? `<button class="btn primary approve-market">اعتماد نهائي</button><button class="btn danger return-manager">رفض وإعادة لرئيس المرتجعات</button>` : ``;
    $(`drawerContent`).innerHTML = `<div class="grid"><div class="field"><label>المندوب</label><div class="readonly">${escapeHtml(row.repName)}</div></div><div class="field"><label>المشرف</label><div class="readonly">${escapeHtml(row.supervisorName||`-`)}</div></div><div class="field"><label>الصيدلية</label><div class="readonly">${escapeHtml(row.pharmacyCode)} — ${escapeHtml(row.pharmacyName)}</div></div></div><h3>تفاصيل الأصناف</h3><div class="table-wrap"><table class="table split-table"><thead><tr><th>الصنف</th><th>Batch / الانتهاء</th><th>الفاتورة</th><th>الإجمالي</th><th>الكمية</th><th>البونص</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${splitRows}</tbody></table></div><div class="toolbar" style="margin-top:12px"><button class="btn secondary invoice-history"><i class="ph ph-receipt"></i> الطلبيات القديمة لهذا الصنف والصيدلية</button></div><div id="invoiceHistory" class="hidden" style="margin-top:10px">${(row.items||[]).map(invoiceHistoryHtml).join(``)}</div><h3>سجل التعديلات</h3><div class="audit">${(row.auditTrail||[]).slice().reverse().map(entry=>`<div class="audit-row"><strong>${escapeHtml(auditLabel(entry))}</strong> — ${escapeHtml(entry.actor)}<br><small>${dateText(entry.at)}${entry.details?` — ${escapeHtml(entry.details)}`:``}</small></div>`).join(``)||`<div class="empty">لا يوجد سجل.</div>`}</div><div class="split-actions" style="margin-top:16px">${actionButtons}</div>`;
    const syncPaid = tr => { const index=number(tr.dataset.index), total=number(row.items[index].totalReturnQty), paid=Math.min(total,Math.max(0,number(tr.querySelector(`.paid-input`).value))), bonus=total-paid; const bonusInput=tr.querySelector(`.bonus-input`),bonusOutput=tr.querySelector(`.bonus-output`); if(bonusInput)bonusInput.value=bonus;if(bonusOutput)bonusOutput.textContent=bonus;tr.querySelector(`.line-value`).textContent=money(paid*number(row.items[index].unitPrice)); };
    const syncBonus = tr => { const index=number(tr.dataset.index), total=number(row.items[index].totalReturnQty), bonus=Math.min(total,Math.max(0,number(tr.querySelector(`.bonus-input`).value))), paid=total-bonus;tr.querySelector(`.paid-input`).value=paid;tr.querySelector(`.line-value`).textContent=money(paid*number(row.items[index].unitPrice)); };
    $(`drawerContent`).querySelectorAll(`tbody tr`).forEach(tr=>{tr.querySelector(`.paid-input`).oninput=()=>syncPaid(tr);const bonus=tr.querySelector(`.bonus-input`);if(bonus)bonus.oninput=()=>syncBonus(tr);if(tr.querySelector(`.paid-input`).value!==``)syncPaid(tr);}); $(`drawerContent`).querySelector(`.invoice-history`).onclick=()=>loadInvoiceHistory(row);
    $(`drawerContent`).querySelector(`.save-split`)?.addEventListener(`click`,()=>saveSplit(row,role)); $(`drawerContent`).querySelector(`.approve-supervisor`)?.addEventListener(`click`,()=>saveSplit(row,role)); $(`drawerContent`).querySelector(`.approve-market`)?.addEventListener(`click`,()=>saveSplit(row,role));
    $(`drawerContent`).querySelector(`.return-rep`)?.addEventListener(`click`,()=>returnRequest(row,`rep`)); $(`drawerContent`).querySelector(`.return-manager`)?.addEventListener(`click`,()=>returnRequest(row,`manager`)); $(`drawerContent`).querySelector(`.delete-request`)?.addEventListener(`click`,()=>deleteRequest(row));
}
function drawerItems(row) {
    return (row.items||[]).map((item,index)=>{ const tr=$(`drawerContent`).querySelector(`tr[data-index="${index}"]`),input=tr?.querySelector(`.paid-input`), paid=number(input?.value), bonusInput=tr?.querySelector(`.bonus-input`),bonus=bonusInput?number(bonusInput.value):number(item.totalReturnQty)-paid; if (!input || input.value === ``) throw new Error(`أدخل الكمية المدفوعة لكل صنف.`); if (paid<0 || bonus<0 || paid+bonus!==number(item.totalReturnQty)) throw new Error(`مجموع الكمية والبونص يجب أن يساوي إجمالي المرتجع.`); if (paid>number(item.originalSoldQty)) throw new Error(`كمية ${item.productName} المدفوعة تتجاوز كمية الفاتورة الأصلية.`); if (bonus>number(item.originalBonusQty)) throw new Error(`بونص ${item.productName} يتجاوز بونص الفاتورة الأصلية.`); return {...item,paidReturnQty:paid,bonusReturnQty:bonus,lineValue:paid*number(item.unitPrice)}; });
}
async function validateHistoricalAllocation(row, items) {
    const snap = await getDocs(query(collection(db, RETURNS), where(`repPharmacyKey`, `==`, row.repPharmacyKey)));
    const used = new Map();
    snap.forEach(document => {
        if (document.id === row.id || document.data().deletedAt) return;
        (document.data().items || []).forEach(item => {
            const current = used.get(item.saleId) || { paid: 0, bonus: 0 };
            current.paid += number(item.paidReturnQty); current.bonus += number(item.bonusReturnQty); used.set(item.saleId, current);
        });
    });
    items.forEach(item => {
        const previous = used.get(item.saleId) || { paid: 0, bonus: 0 };
        const paidAvailable = Math.max(0, number(item.originalSoldQty) - previous.paid), bonusAvailable = Math.max(0, number(item.originalBonusQty) - previous.bonus);
        if (number(item.paidReturnQty) > paidAvailable) throw new Error(`الكمية المدفوعة المتاحة من فاتورة ${item.invoiceNumber} هي ${paidAvailable} فقط.`);
        if (number(item.bonusReturnQty) > bonusAvailable) throw new Error(`البونص المتاح من فاتورة ${item.invoiceNumber} هو ${bonusAvailable} فقط.`);
    });
}
async function saveSplit(row,role) {
    try { const items=drawerItems(row); await validateHistoricalAllocation(row,items); const status=role===`returns_manager`?`pending_supervisor`:role===`supervisor`?`pending_market_manager`:`approved_for_export`, action=role===`returns_manager`?(row.status===`returned_to_returns_manager`?`returns_manager_reworked`:`split_completed`):role===`supervisor`?`supervisor_approved`:`market_approved`,changes=items.map((item,index)=>`${item.productName}: كمية ${row.items[index].paidReturnQty??`-`}→${item.paidReturnQty}، بونص ${row.items[index].bonusReturnQty??`-`}→${item.bonusReturnQty}`).join(` | `); await updateDoc(doc(db,RETURNS,row.id),{items,status,totalValue:items.reduce((s,x)=>s+x.lineValue,0),updatedAt:now(),auditTrail:appendAudit(row,audit(action,role,changes))}); closeDrawer(); await loadReviewRows(role); showBanner(`تم حفظ الإجراء بنجاح.`,`success`); } catch(error){showBanner(error.message,`error`);}
}
async function returnRequest(row,target) { const reason=prompt(`سبب الإعادة إجباري:`); if(reason===null)return;if(!text(reason))return showBanner(`سبب الإعادة إجباري.`,`error`); const role=document.body.dataset.role,status=target===`rep`?`returned_to_rep`:`returned_to_returns_manager`,action=target===`rep`?`returned_to_rep`:role===`supervisor`?`supervisor_returned`:`market_returned`; await updateDoc(doc(db,RETURNS,row.id),{status,returnReason:text(reason),updatedAt:now(),auditTrail:appendAudit(row,audit(action,role,reason))}); closeDrawer(); await loadReviewRows(role); showBanner(`تمت إعادة المرتجع.`,`success`); }
async function deleteRequest(row) { const reason=prompt(`سبب الحذف إجباري:`);if(reason===null)return;if(!text(reason))return showBanner(`سبب الحذف إجباري.`,`error`);await updateDoc(doc(db,RETURNS,row.id),{deletedAt:now(),deletedBy:actorName(),deleteReason:text(reason),updatedAt:now(),auditTrail:appendAudit(row,audit(`deleted`,`returns_manager`,reason))});closeDrawer();await loadReviewRows(`returns_manager`);showBanner(`تم حذف المرتجع من القوائم النشطة.`,`success`); }
function closeDrawer(){ $(`drawer`)?.classList.remove(`show`); }
function selectedRows(){ const ids=[...document.querySelectorAll(`.row-check:checked`)].map(x=>x.value); return filteredReviewRows().filter(row=>ids.includes(row.id)); }
function exportRows(rows){ if(typeof XLSX===`undefined`)return showBanner(`مكتبة Excel غير محملة.`,`error`);if(!rows.length)return showBanner(`حدد مرتجعًا واحدًا على الأقل.`,`error`);const data=rows.flatMap(row=>(row.items||[]).map(item=>({[`تاريخ المرتجع`]:dateText(row.createdAt),[`المندوب`]:row.repName,[`المشرف`]:row.supervisorName,[`كود الصيدلية`]:row.pharmacyCode,[`اسم الصيدلية`]:row.pharmacyName,[`رقم الفاتورة`]:item.invoiceNumber,[`تاريخ الفاتورة`]:item.saleDate,[`كود الصنف`]:item.productCode,[`اسم الصنف`]:item.productName,[`Batch`]:item.batch,[`تاريخ الانتهاء`]:item.expiryDate,[`إجمالي المرتجع`]:item.totalReturnQty,[`الكمية`]:item.paidReturnQty,[`البونص`]:item.bonusReturnQty,[`السبب`]:item.reason===`expired`?`Expired`:`بضاعة جيدة`,[`سعر الوحدة`]:item.unitPrice,[`المجموع الفرعي`]:item.lineValue,[`الحالة`]:STATUS_LABELS[row.status]||row.status})));const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,`Returns`);XLSX.writeFile(wb,`Returns_${new Date().toISOString().slice(0,10)}.xlsx`);}
async function markExported(){const rows=selectedRows().filter(row=>row.status===`approved_for_export`);if(!rows.length)return showBanner(`حدد مرتجعات جاهزة للسحب فقط.`,`error`);if(!confirm(`تأكيد أن ${rows.length} مرتجع تم سحبها؟`))return;for(const row of rows)await updateDoc(doc(db,RETURNS,row.id),{status:`exported`,exportedAt:now(),exportedBy:actorName(),updatedAt:now(),auditTrail:appendAudit(row,audit(`exported`,`returns_manager`))});await loadReviewRows(`returns_manager`);showBanner(`تم نقل المرتجعات المحددة إلى الأرشيف.`,`success`);}
async function initReview(){const role=document.body.dataset.role;renderReviewShell();$(`closeDrawer`).onclick=closeDrawer;$(`drawer`).onclick=event=>{if(event.target===$(`drawer`))closeDrawer();};$(`exportSelected`)?.addEventListener(`click`,()=>{const base=selectedRows().length?selectedRows():filteredReviewRows();exportRows(role===`returns_manager`?base.filter(row=>row.status===`approved_for_export`):base);});$(`markExported`)?.addEventListener(`click`,markExported);try{await loadReviewRows(role);}catch(error){showBanner(error.message||`تعذر تحميل البيانات.`,`error`);}}

let uploadRows=[],uploadMeta=null;
let adminFileRows = [], activeAdminUpload = null;
async function fileHash(file){const bytes=new Uint8Array(await file.arrayBuffer());let value=2166136261;bytes.forEach(byte=>value=Math.imul(value^byte,16777619));return `${file.size}_${(value>>>0).toString(36)}`;}
function downloadTemplate(){const sample=[{[`تاريخ البيع`]:`2026-08-01`,[`رقم الفاتورة`]:`INV-10001`,[`اسم المندوب`]:`اجود التلهوني`,[`اسم المشرف`]:`عبدالله الناطور`,[`كود الصيدلية`]:`PH-001`,[`اسم الصيدلية`]:`صيدلية المثال`,[`كود الصنف`]:`P-100`,[`اسم الصنف`]:`Example Product`,[`Batch`]:`B24001`,[`تاريخ الانتهاء`]:`2027-12-31`,[`الكمية المباعة`]:10,[`البونص`]:2,[`سعر الوحدة`]:5.25}];const ws=XLSX.utils.json_to_sheet(sample),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,`Sales`);XLSX.writeFile(wb,`Returns_Sales_Template.xlsx`);}
async function parseSales(file){const workbook=XLSX.read(await file.arrayBuffer(),{type:`array`,cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]],source=XLSX.utils.sheet_to_json(sheet,{defval:``,raw:false}),errors=[],map=new Map();source.forEach((raw,index)=>{const row={saleDate:isoDate(raw[`تاريخ البيع`]),invoiceNumber:text(raw[`رقم الفاتورة`]),repName:text(raw[`اسم المندوب`]),supervisorName:text(raw[`اسم المشرف`]),pharmacyCode:text(raw[`كود الصيدلية`]),pharmacyName:text(raw[`اسم الصيدلية`]),productCode:text(raw[`كود الصنف`]),productName:text(raw[`اسم الصنف`]),batch:text(raw[`Batch`]||raw[`الباتش`]),expiryDate:isoDate(raw[`تاريخ الانتهاء`]),soldQty:number(raw[`الكمية المباعة`]),bonusQty:number(raw[`البونص`]||raw[`الكمية المجانية`]),unitPrice:number(raw[`سعر الوحدة`])};if(!row.saleDate||!row.invoiceNumber||!row.repName||!row.supervisorName||!row.pharmacyCode||!row.pharmacyName||!row.productCode||!row.productName||!row.batch||!row.expiryDate||row.soldQty<0||row.bonusQty<0||row.soldQty+row.bonusQty<=0||row.unitPrice<0){errors.push(`السطر ${index+2}: بيانات إلزامية ناقصة أو كمية غير صحيحة.`);return;}row.repKey=normalize(row.repName);row.supervisorKey=normalize(row.supervisorName);row.repPharmacyKey=`${row.repKey}__${normalize(row.pharmacyCode)}`;const key=lineKey(row);const current=map.get(key)||{...row,soldQty:0,bonusQty:0};current.soldQty+=row.soldQty;current.bonusQty+=row.bonusQty;map.set(key,current);});uploadRows=[...map.values()];uploadMeta={name:file.name,size:file.size,hash:await fileHash(file),errors};const sample=uploadRows.slice(0,8);$(`preview`).innerHTML=`<div class="pills"><span class="pill">السجلات الصالحة: ${uploadRows.length}</span><span class="pill">الأخطاء: ${errors.length}</span></div>${errors.length?`<div class="banner show error">${errors.slice(0,8).join(` — `)}</div>`:``}<div class="table-wrap"><table class="table"><thead><tr>${sample[0]?Object.keys(sample[0]).slice(0,10).map(key=>`<th>${escapeHtml(key)}</th>`).join(``):`<th>لا توجد بيانات</th>`}</tr></thead><tbody>${sample.map(row=>`<tr>${Object.values(row).slice(0,10).map(value=>`<td>${escapeHtml(value)}</td>`).join(``)}</tr>`).join(``)}</tbody></table></div>`;$(`commitSales`).disabled=!uploadRows.length||errors.length>0;}
async function commitSales(){const button=$(`commitSales`);button.disabled=true;try{const duplicate=await getDocs(query(collection(db,IMPORTS),where(`fileHash`,`==`,uploadMeta.hash)));if(!duplicate.empty)throw new Error(`هذا الملف مرفوع مسبقًا.`);const uploadId=`upload_${Date.now()}_${hash(uploadMeta.hash)}`;for(let index=0;index<uploadRows.length;index+=60){await Promise.all(uploadRows.slice(index,index+60).map(row=>{const identity=`${lineKey(row)}__${row.soldQty}__${row.bonusQty}__${row.expiryDate}`;return setDoc(doc(db,SALES,`sale_${hash(identity)}`),{...row,totalPurchasedQty:row.soldQty+row.bonusQty,sourceUploadId:uploadId,createdAt:now()});}));}const pharmacies=new Map();uploadRows.forEach(row=>pharmacies.set(row.repPharmacyKey,row));for(const row of pharmacies.values())await setDoc(doc(db,PHARMACIES,`pharmacy_${hash(row.repPharmacyKey)}`),{repName:row.repName,repKey:row.repKey,supervisorName:row.supervisorName,supervisorKey:row.supervisorKey,pharmacyCode:row.pharmacyCode,pharmacyName:row.pharmacyName,repPharmacyKey:row.repPharmacyKey,updatedAt:now()},{merge:true});await setDoc(doc(db,IMPORTS,uploadId),{fileName:uploadMeta.name,fileHash:uploadMeta.hash,records:uploadRows.length,pharmacies:pharmacies.size,createdAt:now()});showBanner(`تمت إضافة ${uploadRows.length} سجل مبيعات دون إلغاء البيانات السابقة.`,`success`);uploadRows=[];uploadMeta=null;$(`salesFile`).value=``;$(`preview`).innerHTML=``;await loadUploadLogs();}catch(error){console.error(error);showBanner(error.message||`تعذر رفع الملف.`,`error`);button.disabled=false;}}
function storedSalesExcelRows(rows) { return rows.map(row => ({ [`تاريخ البيع`]: row.saleDate || ``, [`رقم الفاتورة`]: row.invoiceNumber || ``, [`اسم المندوب`]: row.repName || ``, [`اسم المشرف`]: row.supervisorName || ``, [`كود الصيدلية`]: row.pharmacyCode || ``, [`اسم الصيدلية`]: row.pharmacyName || ``, [`كود الصنف`]: row.productCode || ``, [`اسم الصنف`]: row.productName || ``, [`Batch`]: row.batch || ``, [`تاريخ الانتهاء`]: row.expiryDate || ``, [`الكمية المباعة`]: number(row.soldQty), [`البونص`]: number(row.bonusQty), [`سعر الوحدة`]: number(row.unitPrice) })); }
function ensureAdminFileDrawer() {
    if ($(`adminFileDrawer`)) return;
    const drawer = document.createElement(`div`); drawer.id = `adminFileDrawer`; drawer.className = `drawer`; drawer.innerHTML = `<div class="drawer-panel admin-file-panel"><div class="title-row"><div><h2 id="adminFileTitle">تفاصيل الملف</h2><p id="adminFileMeta"></p></div><button id="closeAdminFile" class="btn secondary"><i class="ph ph-x"></i> إغلاق</button></div><div class="toolbar admin-file-toolbar"><div class="field"><label>بحث داخل الملف</label><input id="adminFileSearch" type="search" placeholder="الفاتورة، المندوب، الصيدلية، الصنف، Batch"></div><button id="downloadAdminFile" class="btn primary"><i class="ph ph-download-simple"></i> تنزيل Excel</button><button id="deleteAdminFile" class="btn danger"><i class="ph ph-trash"></i> حذف الملف</button></div><div id="adminFileContent"></div></div>`; document.body.appendChild(drawer);
    $(`closeAdminFile`).onclick = () => drawer.classList.remove(`show`); drawer.onclick = event => { if (event.target === drawer) drawer.classList.remove(`show`); }; $(`adminFileSearch`).oninput = renderAdminFileRows; $(`downloadAdminFile`).onclick = () => downloadStoredUpload(activeAdminUpload, adminFileRows); $(`deleteAdminFile`).onclick = () => deleteStoredUpload(activeAdminUpload);
}
async function getUploadSales(uploadId) { const snap = await getDocs(query(collection(db, SALES), where(`sourceUploadId`, `==`, uploadId))), rows = []; snap.forEach(item => rows.push({ id: item.id, ...item.data() })); rows.sort((a,b)=>text(a.saleDate).localeCompare(text(b.saleDate)) || text(a.invoiceNumber).localeCompare(text(b.invoiceNumber),`en`)); return rows; }
function renderAdminFileRows() {
    const target = $(`adminFileContent`); if (!target) return; const needle = normalize($(`adminFileSearch`)?.value); const rows = adminFileRows.filter(row => !needle || normalize(`${row.invoiceNumber} ${row.repName} ${row.supervisorName} ${row.pharmacyCode} ${row.pharmacyName} ${row.productCode} ${row.productName} ${row.batch}`).includes(needle));
    target.innerHTML = rows.length ? `<div class="pills"><span class="pill">النتائج: ${rows.length}</span><span class="pill">إجمالي الكمية: ${rows.reduce((sum,row)=>sum+number(row.soldQty),0)}</span><span class="pill">إجمالي البونص: ${rows.reduce((sum,row)=>sum+number(row.bonusQty),0)}</span></div><div class="table-wrap admin-records-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>المندوب</th><th>الصيدلية</th><th>الصنف</th><th>Batch</th><th>الانتهاء</th><th>الكمية</th><th>البونص</th><th>السعر</th></tr></thead><tbody>${rows.slice(0,500).map(row=>`<tr><td>${escapeHtml(row.saleDate)}</td><td>${escapeHtml(row.invoiceNumber)}</td><td>${escapeHtml(row.repName)}</td><td>${escapeHtml(row.pharmacyCode)}<br>${escapeHtml(row.pharmacyName)}</td><td>${escapeHtml(row.productCode)}<br>${escapeHtml(row.productName)}</td><td>${escapeHtml(row.batch)}</td><td>${escapeHtml(row.expiryDate)}</td><td>${number(row.soldQty)}</td><td>${number(row.bonusQty)}</td><td>${money(row.unitPrice)}</td></tr>`).join(``)}</tbody></table></div>${rows.length>500?`<div class="banner show info" style="margin-top:12px">يظهر أول 500 سجل من نتائج البحث. التنزيل يشمل جميع السجلات.</div>`:``}` : `<div class="empty">لا توجد سجلات مطابقة داخل هذا الملف.</div>`;
}
async function openStoredUpload(upload) { ensureAdminFileDrawer(); activeAdminUpload = upload; $(`adminFileTitle`).textContent = upload.fileName || `ملف مبيعات`; $(`adminFileMeta`).textContent = `${dateText(upload.createdAt)} — ${upload.records || 0} سجل`; $(`adminFileSearch`).value = ``; $(`adminFileContent`).innerHTML = `<div class="empty">جاري تحميل محتويات الملف...</div>`; $(`adminFileDrawer`).classList.add(`show`); try { adminFileRows = await getUploadSales(upload.id); renderAdminFileRows(); } catch(error) { console.error(error); $(`adminFileContent`).innerHTML = `<div class="empty">تعذر تحميل محتويات الملف.</div>`; } }
function downloadStoredUpload(upload, rows) { if (!upload || !rows.length) return showBanner(`لا توجد سجلات محفوظة لتنزيلها.`,`error`); const ws=XLSX.utils.json_to_sheet(storedSalesExcelRows(rows)),wb=XLSX.utils.book_new();ws[`!cols`]=[{wch:14},{wch:18},{wch:20},{wch:20},{wch:16},{wch:30},{wch:16},{wch:32},{wch:16},{wch:16},{wch:14},{wch:12},{wch:14}];XLSX.utils.book_append_sheet(wb,ws,`Sales`);const base=text(upload.fileName||`Returns_Sales`).replace(/\.(xlsx|xls)$/i,``).replace(/[\\/:*?"<>|]/g,`_`);XLSX.writeFile(wb,`${base}_saved.xlsx`); }
async function rebuildPharmacyAfterDelete(repPharmacyKey) { const remaining = await getDocs(query(collection(db, SALES), where(`repPharmacyKey`, `==`, repPharmacyKey))), pharmacyRef = doc(db, PHARMACIES, `pharmacy_${hash(repPharmacyKey)}`); if (remaining.empty) { await deleteDoc(pharmacyRef); return; } const latest = remaining.docs.map(item=>item.data()).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))[0]; await setDoc(pharmacyRef,{repName:latest.repName,repKey:latest.repKey,supervisorName:latest.supervisorName,supervisorKey:latest.supervisorKey,pharmacyCode:latest.pharmacyCode,pharmacyName:latest.pharmacyName,repPharmacyKey,updatedAt:now()},{merge:true}); }
async function deleteStoredUpload(upload) { if (!upload) return; const confirmed = confirm(`سيتم حذف الملف ${upload.fileName} وجميع سجلات المبيعات التابعة له نهائيًا. هل أنت متأكد؟`); if (!confirmed) return; const button=$(`deleteAdminFile`);button.disabled=true;try{const rows=adminFileRows.length?adminFileRows:await getUploadSales(upload.id),pharmacyKeys=[...new Set(rows.map(row=>row.repPharmacyKey).filter(Boolean))];for(let index=0;index<rows.length;index+=60)await Promise.all(rows.slice(index,index+60).map(row=>deleteDoc(doc(db,SALES,row.id))));await deleteDoc(doc(db,IMPORTS,upload.id));for(const key of pharmacyKeys)await rebuildPharmacyAfterDelete(key);$(`adminFileDrawer`).classList.remove(`show`);activeAdminUpload=null;adminFileRows=[];await loadUploadLogs();showBanner(`تم حذف الملف وسجلاته نهائيًا وتحديث الصيدليات المرتبطة.`,`success`);}catch(error){console.error(error);showBanner(`تعذر حذف الملف كاملًا. أعد المحاولة.`,`error`);}finally{button.disabled=false;}}
async function loadUploadLogs(){const snap=await getDocs(collection(db,IMPORTS)),rows=[];snap.forEach(item=>rows.push({id:item.id,...item.data()}));rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));$(`uploadLogs`).innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الملف</th><th>السجلات</th><th>الصيدليات</th><th>الإجراءات</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateText(row.createdAt)}</td><td><strong>${escapeHtml(row.fileName)}</strong></td><td>${row.records||0}</td><td>${row.pharmacies||0}</td><td><div class="file-actions"><button class="btn secondary view-upload" data-id="${row.id}"><i class="ph ph-eye"></i> عرض</button><button class="btn secondary download-upload" data-id="${row.id}"><i class="ph ph-download-simple"></i> تنزيل</button><button class="btn danger delete-upload" data-id="${row.id}"><i class="ph ph-trash"></i> حذف</button></div></td></tr>`).join(``)}</tbody></table></div>`:`<div class="empty">لا توجد ملفات مرفوعة.</div>`;const byId=new Map(rows.map(row=>[row.id,row]));$(`uploadLogs`).querySelectorAll(`.view-upload`).forEach(button=>button.onclick=()=>openStoredUpload(byId.get(button.dataset.id)));$(`uploadLogs`).querySelectorAll(`.download-upload`).forEach(button=>button.onclick=async()=>{button.disabled=true;try{downloadStoredUpload(byId.get(button.dataset.id),await getUploadSales(button.dataset.id));}finally{button.disabled=false;}});$(`uploadLogs`).querySelectorAll(`.delete-upload`).forEach(button=>button.onclick=async()=>{button.disabled=true;try{ensureAdminFileDrawer();activeAdminUpload=byId.get(button.dataset.id);adminFileRows=await getUploadSales(button.dataset.id);await deleteStoredUpload(activeAdminUpload);}catch(error){console.error(error);showBanner(`تعذر تجهيز الملف للحذف.`,`error`);}finally{button.disabled=false;}});}
async function initAdmin(){if(typeof XLSX===`undefined`)return showBanner(`مكتبة Excel غير محملة.`,`error`);ensureAdminFileDrawer();$(`downloadTemplate`).onclick=downloadTemplate;$(`salesFile`).onchange=event=>event.target.files[0]&&parseSales(event.target.files[0]);$(`commitSales`).onclick=commitSales;await loadUploadLogs();}

let loginReps = [], loginPharmacies = [], selectedSupervisor = ``;
function showLoginPanel(role) { $(`roleStep`).classList.add(`hidden`); $(`repLoginPanel`).classList.toggle(`hidden`, role !== `rep`); $(`supervisorLoginPanel`).classList.toggle(`hidden`, role !== `supervisor`); }
async function loadLoginReps() {
    const snap = await getDocs(collection(db, `reps`)); loginReps = []; snap.forEach(item => { const row = { id: item.id, ...item.data() }; if (REP_PASSWORDS[text(row.name)]) loginReps.push(row); }); loginReps.sort((a,b)=>text(a.name).localeCompare(text(b.name),`ar`));
    $(`loginRep`).innerHTML = `<option value="">اختر المندوب</option>${loginReps.map(row=>`<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join(``)}`;
}
async function loadLoginPharmacies(repId) {
    const select=$(`loginPharmacy`);select.disabled=true;select.innerHTML=`<option value="">جاري تحميل الصيدليات...</option>`;loginPharmacies=[];
    if(!repId){select.innerHTML=`<option value="">اختر المندوب أولًا</option>`;return;}
    const snap=await getDocs(query(collection(db,`pharmacies`),where(`rep_id`,`==`,repId)));snap.forEach(item=>loginPharmacies.push({id:item.id,...item.data()}));loginPharmacies.sort((a,b)=>text(a.name).localeCompare(text(b.name),`ar`));select.innerHTML=`<option value="">اختر الصيدلية</option>${loginPharmacies.map(row=>`<option value="${escapeHtml(row.id)}">${escapeHtml(row.pharmacyCode||row.pharmacy_code||row.customerCode||``)} — ${escapeHtml(row.name)}</option>`).join(``)}`;select.disabled=false;
}
async function loginRepresentative(){const rep=loginReps.find(row=>row.id===$(`loginRep`).value),pharmacy=loginPharmacies.find(row=>row.id===$(`loginPharmacy`).value),password=text($(`loginRepPassword`).value);if(!rep)return showBanner(`اختر اسم المندوب.`,`error`);if(!pharmacy)return showBanner(`اختر صيدلية صحيحة.`,`error`);if(!password||btoa(password)!==REP_PASSWORDS[text(rep.name)])return showBanner(`كلمة سر المندوب غير صحيحة.`,`error`);const pharmacyCode=text(pharmacy.pharmacyCode||pharmacy.pharmacy_code||pharmacy.customerCode);if(!pharmacyCode)return showBanner(`الصيدلية المختارة لا تحتوي على كود صيدلية.`,`error`);writeAccessSession({role:`rep`,repId:rep.id,repName:text(rep.name),supervisorName:repSupervisorMap[text(rep.name)]||``,pharmacyId:pharmacy.id,pharmacyCode,pharmacyName:text(pharmacy.name),createdAt:Date.now()});location.href=`rep.html`;}
function loginSupervisor(){const password=text($(`loginSupervisorPassword`).value);if(!selectedSupervisor)return showBanner(`اختر اسم المشرف.`,`error`);if(password!==`202604`)return showBanner(`كلمة سر المشرف غير صحيحة.`,`error`);writeAccessSession({role:`supervisor`,name:selectedSupervisor,createdAt:Date.now()});location.href=`supervisor.html`;}
async function initLogin(){document.querySelectorAll(`[data-login-role]`).forEach(button=>button.onclick=()=>showLoginPanel(button.dataset.loginRole));document.querySelectorAll(`.back-roles`).forEach(button=>button.onclick=()=>{$(`roleStep`).classList.remove(`hidden`);$(`repLoginPanel`).classList.add(`hidden`);$(`supervisorLoginPanel`).classList.add(`hidden`);});document.querySelectorAll(`[data-supervisor]`).forEach(button=>button.onclick=()=>{selectedSupervisor=button.dataset.supervisor;document.querySelectorAll(`[data-supervisor]`).forEach(card=>card.classList.toggle(`selected`,card===button));$(`supervisorLoginButton`).disabled=false;});$(`loginRep`).onchange=event=>loadLoginPharmacies(event.target.value);$(`repLoginButton`).onclick=loginRepresentative;$(`supervisorLoginButton`).onclick=loginSupervisor;try{const config=await getDoc(doc(db,`system_settings`,`rep_supervisor_assignments`));if(config.exists()&&config.data()?.assignments)repSupervisorMap={...DEFAULT_REP_SUPERVISOR_MAP,...config.data().assignments};}catch(error){console.warn(`تعذر تحميل توزيع المشرفين.`,error);}await loadLoginReps();enhanceCombobox($(`loginRep`),{placeholder:`اكتب اسم المندوب...`});enhanceCombobox($(`loginPharmacy`),{placeholder:`اكتب اسم الصيدلية أو الكود...`});}

document.addEventListener(`DOMContentLoaded`,async()=>{try{if(document.body.dataset.page===`login`)await initLogin();else if(document.body.dataset.page===`rep`)await initRep();else if(document.body.dataset.page===`review`)await initReview();else if(document.body.dataset.page===`admin`)await initAdmin();}catch(error){console.error(error);showBanner(error.message||`حدث خطأ أثناء تحميل الصفحة.`,`error`);}});
