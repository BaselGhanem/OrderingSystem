import { db, collection, getDocs, query, where, addDoc, doc, setDoc, updateDoc, deleteDoc, getDoc, runTransaction, orderBy, limit, startAfter, serverTimestamp } from './firebase.js';
import { STAFF_ROLES, ROLE_LABELS, loginWithPin, logoutReturns, requireReturnsAuth, pageForRole, getLoginDirectory, ensureUserDirectorySeeded, listUserConfigs, saveUserConfig, deleteUserConfig } from './auth.js';

const SALES_CHUNKS = `returns_sales_chunks`;
const PHARMACIES = `returns_pharmacies`;
const RETURNS = `returns_requests`;
const IMPORTS = `returns_imports`;
const ALLOCATIONS = `return_allocations`;
const AUDIT_SUBCOLLECTION = `audit`;
const REVIEW_PAGE_SIZE = 75;
const STATUS_LABELS = {
    pending_returns_manager: `بانتظار رئيس قسم الطلبيات`, returned_to_rep: `معاد للمندوب`, pending_supervisor: `بانتظار المشرف`,
    pending_market_manager: `بانتظار مدير السوق`, returned_to_returns_manager: `معاد لرئيس قسم الطلبيات`,
    pending_finance: `بانتظار المالية`, approved_for_export: `جاهز للسحب`, exported: `تمت الفوترة`
};
const $ = id => document.getElementById(id);
const text = value => String(value ?? ``).trim();
const normalize = value => text(value).toLocaleLowerCase(`ar`).replace(/\s+/g, ` `);
const number = value => { const parsed = Number(text(value).replace(/,/g, ``).replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit)))); return Number.isFinite(parsed) ? parsed : 0; };
const money = value => number(value).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = value => text(value).replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/"/g, `&quot;`).replace(/'/g, `&#039;`);
const hash = value => { let a = 2166136261, b = 2246822519; for (const char of String(value)) { const code = char.charCodeAt(0); a = Math.imul(a ^ code, 16777619); b = Math.imul(b ^ code, 3266489917); } return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`; };
const now = () => new Date();
const serverNow = () => serverTimestamp();
const dateText = value => { const date = value?.toDate ? value.toDate() : new Date(value || Date.now()); return Number.isNaN(date.getTime()) ? `-` : date.toLocaleString(`en-GB`); };
const isoDate = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const raw = text(value); if (!raw) return ``;
    const ymd = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, `0`)}-${ymd[3].padStart(2, `0`)}`;
    const dmy = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/); if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, `0`)}-${dmy[1].padStart(2, `0`)}`;
    const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? `` : parsed.toISOString().slice(0, 10);
};
const params = new URLSearchParams(location.search);
let currentAccess = null;
const actorName = () => text(currentAccess?.displayName || currentAccess?.role || `النظام`);

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
function audit(action, role, details = ``) { return { action, role, actor: actorName(), actorUid: text(currentAccess?.uid), details: text(details) }; }
function auditLabel(entry = {}) {
    const labels = { rerouted: `نقل المرتجع`, finance_approved: `إنهاء مراجعة المالية`, finance_returned: `إعادة من المالية`, created: `إنشاء المرتجع`, resubmitted: `إعادة إرسال من المندوب`, returned_to_rep: `إعادة للمندوب`, split_completed: `فصل الكمية والبونص`, supervisor_edited: `تعديل المشرف`, supervisor_approved: `موافقة المشرف`, supervisor_returned: `إعادة من المشرف`, market_edited: `تعديل مدير السوق`, market_approved: `اعتماد مدير السوق`, market_returned: `رفض/إعادة من مدير السوق`, returns_manager_reworked: `إعادة تدقيق رئيس قسم الطلبيات`, exported: `تم سحب المرتجع`, deleted: `حذف المرتجع` }; return labels[entry.action] || entry.action;
}
function appendAudit(row, entry) { return [...(Array.isArray(row.auditTrail) ? row.auditTrail : []), entry]; }
function auditDocRef(requestId) { return doc(collection(db, RETURNS, requestId, AUDIT_SUBCOLLECTION)); }
async function assertAllocationLedgerReady() {
    const meta=await getDoc(doc(db,ALLOCATIONS,`ledger_meta_v1`));
    if(!meta.exists()||number(meta.data().schemaVersion)<1)throw new Error(`دفتر الكميات يحتاج مزامنة من Admin قبل متابعة عمليات المرتجعات.`);
    return true;
}
function lineKey(row) { return `${normalize(row.invoiceNumber)}__${normalize(row.pharmacyCode)}__${normalize(row.productCode)}__${normalize(row.batch)}__${number(row.unitPrice)}__${isoDate(row.saleDate)}`; }
function saleIdentity(row) { return `${lineKey(row)}__${text(row.expiryDate)}`; }

function summarizeAllocations(items = []) {
    const map = new Map();
    for (const item of items || []) {
        const saleId = text(item.saleId);
        if (!saleId) continue;
        const current = map.get(saleId) || {
            saleId,
            total: 0,
            paid: 0,
            bonus: 0,
            soldLimit: number(item.originalSoldQty ?? item.soldQty),
            bonusLimit: number(item.originalBonusQty ?? item.bonusQty),
            invoiceNumber: text(item.invoiceNumber),
            productName: text(item.productName),
            batch: text(item.batch)
        };
        current.total += number(item.totalReturnQty);
        current.paid += item.paidReturnQty == null ? 0 : number(item.paidReturnQty);
        current.bonus += item.bonusReturnQty == null ? 0 : number(item.bonusReturnQty);
        current.soldLimit = Math.max(current.soldLimit, number(item.originalSoldQty ?? item.soldQty));
        current.bonusLimit = Math.max(current.bonusLimit, number(item.originalBonusQty ?? item.bonusQty));
        map.set(saleId, current);
    }
    return map;
}

async function applyAllocationDelta(transaction, oldItems = [], nextItems = []) {
    const before = summarizeAllocations(oldItems), after = summarizeAllocations(nextItems);
    const saleIds = [...new Set([...before.keys(), ...after.keys()])];
    if (!saleIds.length) return;
    const refs = saleIds.map(saleId => doc(db, ALLOCATIONS, saleId));
    const snapshots = [];
    for (const ref of refs) snapshots.push(await transaction.get(ref));
    saleIds.forEach((saleId, index) => {
        const oldValue = before.get(saleId) || { total: 0, paid: 0, bonus: 0, soldLimit: 0, bonusLimit: 0, invoiceNumber: ``, productName: ``, batch: `` };
        const nextValue = after.get(saleId) || { total: 0, paid: 0, bonus: 0, soldLimit: oldValue.soldLimit, bonusLimit: oldValue.bonusLimit, invoiceNumber: oldValue.invoiceNumber, productName: oldValue.productName, batch: oldValue.batch };
        const existing = snapshots[index].exists() ? snapshots[index].data() : {};
        // If an allocation document does not exist yet but this request already existed,
        // treat the request's current quantities as the baseline to avoid negative migration deltas.
        const baselineTotal = snapshots[index].exists() ? number(existing.totalAllocated) : number(oldValue.total);
        const baselinePaid = snapshots[index].exists() ? number(existing.paidAllocated) : number(oldValue.paid);
        const baselineBonus = snapshots[index].exists() ? number(existing.bonusAllocated) : number(oldValue.bonus);
        const totalAllocated = baselineTotal + number(nextValue.total) - number(oldValue.total);
        const paidAllocated = baselinePaid + number(nextValue.paid) - number(oldValue.paid);
        const bonusAllocated = baselineBonus + number(nextValue.bonus) - number(oldValue.bonus);
        const soldLimit = Math.max(number(existing.originalSoldQty), number(nextValue.soldLimit), number(oldValue.soldLimit));
        const bonusLimit = Math.max(number(existing.originalBonusQty), number(nextValue.bonusLimit), number(oldValue.bonusLimit));
        const totalLimit = soldLimit + bonusLimit;
        if (totalAllocated < 0 || paidAllocated < 0 || bonusAllocated < 0) throw new Error(`تعذر مزامنة حجز الكمية للفاتورة ${nextValue.invoiceNumber || oldValue.invoiceNumber}.`);
        if (totalAllocated > totalLimit) throw new Error(`إجمالي المرتجعات يتجاوز الكمية المباعة للفاتورة ${nextValue.invoiceNumber || oldValue.invoiceNumber}. المتاح ${Math.max(0, totalLimit - baselineTotal + number(oldValue.total))} فقط.`);
        if (paidAllocated > soldLimit) throw new Error(`الكمية المدفوعة تتجاوز الكمية الأصلية للفاتورة ${nextValue.invoiceNumber || oldValue.invoiceNumber}.`);
        if (bonusAllocated > bonusLimit) throw new Error(`البونص المرتجع يتجاوز البونص الأصلي للفاتورة ${nextValue.invoiceNumber || oldValue.invoiceNumber}.`);
        transaction.set(refs[index], {
            saleId,
            originalSoldQty: soldLimit,
            originalBonusQty: bonusLimit,
            totalPurchasedQty: totalLimit,
            totalAllocated,
            paidAllocated,
            bonusAllocated,
            invoiceNumber: nextValue.invoiceNumber || oldValue.invoiceNumber || text(existing.invoiceNumber),
            productName: nextValue.productName || oldValue.productName || text(existing.productName),
            batch: nextValue.batch || oldValue.batch || text(existing.batch),
            updatedAt: serverNow()
        }, { merge: true });
    });
}

async function loadAuditEvents(row) {
    const target = $(`auditTrailView`);
    if (!target) return;
    try {
        const snap = await getDocs(query(collection(db, RETURNS, row.id, AUDIT_SUBCOLLECTION), orderBy(`at`, `desc`), limit(100)));
        const events = snap.docs.map(item => ({ id: item.id, ...item.data() }));
        target.innerHTML = events.length ? auditHtml(events.slice().reverse()) : auditHtml(row.auditTrail || []);
    } catch (error) {
        console.warn(`تعذر تحميل سجل التدقيق من السيرفر.`, error);
        target.innerHTML = auditHtml(row.auditTrail || []);
    }
}


// Ratios are derived from the manually approved split; no bonus tiers are inferred.
function bonusRate(paid, bonus) {
    if (paid === null || paid === undefined || paid === `` || bonus === null || bonus === undefined || bonus === ``) return null;
    if (number(paid) === 0) return number(bonus) === 0 ? 0 : null;
    return number(bonus) / number(paid) * 100;
}
function rateText(rate) { return rate === null || rate === undefined ? `غير محددة` : `${number(rate).toLocaleString(`en-US`, {maximumFractionDigits: 1})}%`; }
function rateBefore(item) { return Object.hasOwn(item, `bonusRateBefore`) ? item.bonusRateBefore : bonusRate(item.paidReturnQty, item.bonusReturnQty); }
function showInvoiceIdentifiers() { return document.body.dataset.page===`rep` || [`representative`,`rep`,`returns_manager`].includes(document.body.dataset.role); }
function hasBonusComparison(item) {
    const current=bonusRate(item.paidReturnQty,item.bonusReturnQty),before=rateBefore(item);
    if(item.bonusReturnQty==null || item.paidReturnQty==null) return false;
    if(Object.hasOwn(item,`bonusBeforeEdit`)) return item.bonusBeforeEdit!==null && number(item.bonusBeforeEdit)!==number(item.bonusReturnQty);
    return before!==null && current!==null && Math.abs(before-current)>1e-10;
}
function ratioHtml(item) {
    const current=rateText(bonusRate(item.paidReturnQty,item.bonusReturnQty));
    return hasBonusComparison(item)?`<div class="ratio-pair"><span>قبل التعديل <b>${rateText(rateBefore(item))}</b></span><span>بعد التعديل <b>${current}</b></span></div>`:`<div class="ratio-pair"><span>نسبة البونص <b>${current}</b></span></div>`;
}
function splitChanged(a, b) { return a.paidReturnQty !== b.paidReturnQty || a.bonusReturnQty !== b.bonusReturnQty || number(a.totalReturnQty) !== number(b.totalReturnQty); }
function withSplit(item, paid, bonus) {
    const changed = item.paidReturnQty !== paid || item.bonusReturnQty !== bonus;
    const bonusBeforeEdit=changed?(item.bonusReturnQty??null):(Object.hasOwn(item,`bonusBeforeEdit`)?item.bonusBeforeEdit:hasBonusComparison(item)?undefined:null);
    return {...item, ...(bonusBeforeEdit===undefined?{}:{bonusBeforeEdit}), paidReturnQty:paid, bonusReturnQty:bonus, bonusRateBefore:changed ? (bonusRate(item.paidReturnQty,item.bonusReturnQty) ?? rateBefore(item)) : rateBefore(item), bonusRateAfter:bonusRate(paid,bonus), lineValue:paid*number(item.unitPrice)};
}
function hasQuantityChanges(row) {
    if (row.quantitiesModified) return true;
    return (row.auditTrail || []).some(entry => entry.changes?.length || /(?:كمية|بونص)\s+([\d.]+)→([\d.]+)/g.test(entry.details || ``) && [...(entry.details || ``).matchAll(/(?:كمية|بونص)\s+([\d.]+)→([\d.]+)/g)].some(match => number(match[1]) !== number(match[2])));
}
function allocationKey(row, item) { return `${row.repPharmacyKey}__${item.saleId || `${item.invoiceNumber}__${item.productCode}__${item.batch}`}`; }
function finalBalance(row, item, rows) {
    let paid=0, bonus=0;
    rows.filter(request=>request.status===`exported` && !request.deletedAt).forEach(request=>(request.items||[]).forEach(line=>{
        if(allocationKey(request,line)===allocationKey(row,item)){paid+=number(line.paidReturnQty);bonus+=number(line.bonusReturnQty);}
    }));
    return {paid:number(item.originalSoldQty)-paid, bonus:number(item.originalBonusQty)-bonus};
}
function balanceHtml(row, rows) {
    if(row.status!==`exported`) return `<span class="muted">يظهر المتبقي بعد السحب النهائي</span>`;
    const seen=new Set();
    return (row.items||[]).filter(item=>{const key=allocationKey(row,item);if(seen.has(key))return false;seen.add(key);return true;}).map(item=>{
        const balance=finalBalance(row,item,rows);
        return `<div class="balance-card"><strong>${escapeHtml(item.productName)}</strong>${showInvoiceIdentifiers()?`<small>فاتورة ${escapeHtml(item.invoiceNumber)} · Batch ${escapeHtml(item.batch)}</small>`:``}<div>الكمية المتبقية <b>${balance.paid}</b> · البونص المتبقي <b>${balance.bonus}</b></div><span class="ratio-result">نسبة البونص المتبقي ${rateText(bonusRate(balance.paid,balance.bonus))}</span></div>`;
    }).join(``);
}
function auditComparisonHtml(change) {
    const before=change.before||{},after=change.after||{},allocated=before.paid!=null&&before.bonus!=null;
    const changed=allocated&&(before.paid!==after.paid||before.bonus!==after.bonus),bonusChanged=allocated&&before.bonus!==after.bonus;
    if(!changed)return `<div class="audit-comparison"><span>الكمية ${after.paid??`—`} / البونص ${after.bonus??`—`} / نسبة البونص ${rateText(after.rate)}</span></div>`;
    return `<div class="audit-comparison"><span>قبل: كمية ${before.paid} / بونص ${before.bonus}${bonusChanged?` / ${rateText(before.rate)}`:``}</span><b>←</b><span>بعد: كمية ${after.paid??`—`} / بونص ${after.bonus??`—`}${bonusChanged?` / ${rateText(after.rate)}`:``}</span>${bonusChanged?``:`<span>نسبة البونص ${rateText(after.rate)}</span>`}</div>`;
}
function auditHtml(entries) {
    const roles={representative:`المندوب`,rep:`المندوب`,supervisor:`المشرف`,returns_manager:`رئيس قسم الطلبيات`,market_manager:`مدير السوق`,finance:`المالية`,reports:`التقارير`};
    return (entries||[]).slice().reverse().map(entry=>{
        const kind=entry.changes?.length?`edit`:/return|rerouted/.test(entry.action)?`return`:/approved|exported/.test(entry.action)?`approve`:`create`;
        const changes=(entry.changes||[]).map(change=>`<div class="audit-change"><strong>${escapeHtml(change.productName)}</strong>${showInvoiceIdentifiers()?`<small>فاتورة ${escapeHtml(change.invoiceNumber)} · ${escapeHtml(change.batch)}</small>`:``}${auditComparisonHtml(change)}</div>`).join(``);
        return `<article class="audit-event audit-${kind}"><header><strong>${escapeHtml(auditLabel(entry))}</strong><time>${entry.at?dateText(entry.at):`—`}</time></header><div class="audit-actor">${escapeHtml(entry.actor)} · ${escapeHtml(roles[entry.role]||entry.role)}</div>${changes || (entry.details?`<p>${escapeHtml(entry.details)}</p>`:``)}</article>`;
    }).join(``) || `<div class="empty">لا يوجد سجل.</div>`;
}
function canEditSplit(row,role) { return role===`returns_manager` && [`pending_returns_manager`,`returned_to_returns_manager`].includes(row.status) || role===`supervisor` && row.status===`pending_supervisor` || role===`market_manager` && row.status===`pending_market_manager`; }
function assertRoleAction(row,role,allowed) {
    if(document.body.dataset.role!==role || row.deletedAt || !allowed.includes(row.status))throw new Error(`الحالة أو الصلاحية تغيرت؛ حدّث الصفحة.`);
    if(role===`supervisor` && normalize(currentAccess?.supervisorKey)!==normalize(row.supervisorKey))throw new Error(`هذا المرتجع ليس ضمن عهدتك.`);
}
// Reject stale tabs and update the request, allocation ledger and server audit atomically.
async function mutateRequest(row, allowed, build) {
    await assertAllocationLedgerReady();
    const role=document.body.dataset.role;
    const eventRef=auditDocRef(row.id);
    await runTransaction(db,async transaction=>{
        const ref=doc(db,RETURNS,row.id), snapshot=await transaction.get(ref);
        if(!snapshot.exists())throw new Error(`المرتجع غير موجود.`);
        const current={id:snapshot.id,...snapshot.data()};assertRoleAction(current,role,allowed);
        if(current.status!==row.status || JSON.stringify(current.items)!==JSON.stringify(row.items))throw new Error(`تم تعديل المرتجع من مستخدم آخر؛ أعد فتحه قبل المتابعة.`);
        const result=build(current)||{};
        const {__audit,...patch}=result;
        const nextItems=patch.deletedAt?[]:(patch.items||current.items||[]);
        if(patch.items || patch.deletedAt) await applyAllocationDelta(transaction,current.items||[],nextItems);
        patch.updatedAt=serverNow();
        if(patch.deletedAt)patch.deletedAt=serverNow();
        if(patch.exportedAt)patch.exportedAt=serverNow();
        transaction.update(ref,patch);
        if(__audit)transaction.set(eventRef,{...__audit,at:serverNow()});
    });
}

let repName = ``;
let selectedPharmacy = null;
let pharmacySales = [];
let salesById = new Map();
let editingId = ``;

async function loadRepPharmacies() {
    const snap = await getDocs(query(collection(db, PHARMACIES), where(`repKey`, `==`, normalize(repName))));
    const rows = []; snap.forEach(item => rows.push({ id: item.id, ...item.data() })); rows.sort((a, b) => text(a.pharmacyName).localeCompare(text(b.pharmacyName), `ar`));
    $(`pharmacySelect`).innerHTML = `<option value="">اختر الصيدلية</option>${rows.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.pharmacyName)}</option>`).join(``)}`;
    $(`pharmacySelect`)._rows = rows;
}

async function loadPharmacySales() {
    pharmacySales = []; salesById = new Map();
    if (!selectedPharmacy) return;
    const [chunkSnap, returnsSnap, importsSnap] = await Promise.all([
        // Historical sales are uploaded independently to dad-returns.
        // The current Ordering System is never queried as a sales source.
        getDocs(query(collection(db, SALES_CHUNKS), where(`repPharmacyKey`, `==`, selectedPharmacy.repPharmacyKey))),
        getDocs(query(collection(db, RETURNS), where(`repUid`, `==`, currentAccess.uid))),
        getDocs(query(collection(db, IMPORTS), where(`status`, `==`, `completed`)))
    ]);
    const completedUploads = new Set(); importsSnap.forEach(item => completedUploads.add(item.id));
    const uniqueSales = new Map();
    const acceptSale = source => {
        if (source.repPharmacyKey !== selectedPharmacy.repPharmacyKey) return;
        if (source.sourceUploadId && !completedUploads.has(source.sourceUploadId)) return;
        const identity = saleIdentity(source), saleId = `sale_${hash(identity)}`;
        if (!uniqueSales.has(identity)) uniqueSales.set(identity, { ...source, id: saleId, saleId });
    };
    chunkSnap.forEach(item => { const chunk = item.data(); if (!completedUploads.has(chunk.sourceUploadId)) return; (chunk.records || []).forEach(acceptSale); });
    pharmacySales = [...uniqueSales.values()]; pharmacySales.forEach(row => salesById.set(row.id, row));
    const used = new Map();
    returnsSnap.forEach(item => {
        const request = item.data(); if (request.deletedAt || request.repPharmacyKey !== selectedPharmacy.repPharmacyKey) return;
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
function updateTotal() { /* Monetary estimates are intentionally not rendered for representatives. */ }
function addLine(prefill = null) {
    if (!selectedPharmacy) return showBanner(`اختر الصيدلية أولًا.`, `error`);
    const products = productOptions();
    const line = document.createElement(`div`); line.className = `line`;
    line.innerHTML = `<div><label>الصنف</label><select class="product"><option value="">اختر الصنف</option>${products.map(row => `<option value="${escapeHtml(normalize(row.code || row.name))}">${escapeHtml(row.name)}</option>`).join(``)}</select></div><div><label>Batch / رقم الفاتورة</label><select class="batch" disabled><option value="">اختر</option></select></div><div><label>تاريخ الانتهاء</label><div class="readonly expiry">-</div></div><div><label>إجمالي المرتجع</label><input class="qty" type="number" min="1" step="1" value="1"></div><div><label>&nbsp;</label><button class="btn danger remove"><i class="ph ph-trash"></i></button></div>`;
    const product = line.querySelector(`.product`), batch = line.querySelector(`.batch`), expiry = line.querySelector(`.expiry`), qty = line.querySelector(`.qty`);
    const populate = () => { const rows = salesForProduct(product.value); batch.innerHTML = `<option value="">اختر</option>${rows.map(row => `<option value="${row.id}">${escapeHtml(row.batch)} — فاتورة ${escapeHtml(row.invoiceNumber)}</option>`).join(``)}`; batch.disabled = rows.length === 0; };
    const sync = () => { const sale = salesById.get(batch.value); expiry.textContent = sale?.expiryDate || `-`; qty.max = sale?.availableReturnQty || 0; updateTotal(); };
    product.onchange = () => { populate(); batch.value = ``; sync(); }; batch.onchange = sync; qty.oninput = updateTotal; line.querySelector(`.remove`).onclick = () => { line.remove(); updateTotal(); };
    $(`returnLines`).appendChild(line);
    enhanceCombobox(product, { placeholder: `اكتب اسم الصنف...` }); enhanceCombobox(batch, { placeholder: `ابحث بالـBatch أو الفاتورة...` });
    if (prefill) { product.value = normalize(prefill.productCode || prefill.productName); populate(); batch.value = prefill.saleId; qty.value = number(prefill.totalReturnQty); sync(); product._searchCombobox.sync(); batch._searchCombobox.sync(); }
    updateTotal();
}

function collectRepLines() {
    const returnType = text($(`returnType`).value);
    if (![`good`, `expired`].includes(returnType)) throw new Error(`اختر نوع المرتجع: بضاعة جيدة أو Expired.`);
    const items = [], totals = new Map();
    document.querySelectorAll(`.line`).forEach((line, index) => {
        const sale = salesById.get(line.querySelector(`.batch`).value), qty = number(line.querySelector(`.qty`).value);
        if (!sale || qty <= 0 || !Number.isInteger(qty)) throw new Error(`أكمل بيانات السطر ${index + 1}.`);
        totals.set(sale.id, (totals.get(sale.id) || 0) + qty);
        items.push({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, saleDate: sale.saleDate || ``, productCode: sale.productCode, productName: sale.productName, batch: sale.batch, expiryDate: sale.expiryDate, totalReturnQty: qty, paidReturnQty: null, bonusReturnQty: null, originalSoldQty: number(sale.soldQty), originalBonusQty: number(sale.bonusQty), unitPrice: number(sale.unitPrice), reason: returnType, lineValue: qty * number(sale.unitPrice) });
    });
    totals.forEach((qty, id) => { const sale = salesById.get(id); if (qty > sale.availableReturnQty) throw new Error(`مرتجع ${sale.productName} / ${sale.batch} هو ${qty} بينما المتاح ${sale.availableReturnQty}.`); });
    if (!items.length) throw new Error(`أضف صنفًا واحدًا على الأقل.`); return items;
}

async function submitRepReturn() {
    const button = $(`submitReturn`); button.disabled = true;
    try {
        await assertAllocationLedgerReady();
        await loadPharmacySales(); const items = collectRepLines();
        const basePayload = { repUid: currentAccess.uid, repName, repKey: normalize(repName), supervisorName: text(selectedPharmacy.supervisorName), supervisorKey: normalize(selectedPharmacy.supervisorName), pharmacyCode: selectedPharmacy.pharmacyCode, pharmacyName: selectedPharmacy.pharmacyName, repPharmacyKey: selectedPharmacy.repPharmacyKey, returnType: text($(`returnType`).value), items, totalReturnQty: items.reduce((s, x) => s + x.totalReturnQty, 0), totalValue: items.reduce((s, x) => s + x.lineValue, 0), note: text($(`returnNote`).value), status: `pending_returns_manager` };
        if (editingId) {
            const requestId=editingId,eventRef=auditDocRef(requestId);
            await runTransaction(db,async transaction=>{
                const ref=doc(db,RETURNS,requestId),snapshot=await transaction.get(ref);
                if(!snapshot.exists()||snapshot.data().status!==`returned_to_rep`||snapshot.data().deletedAt||snapshot.data().repUid!==currentAccess.uid)throw new Error(`لم يعد المرتجع متاحًا للتعديل.`);
                const old={id:snapshot.id,...snapshot.data()},previous=new Map();
                (old.items||[]).forEach(item=>{const current=previous.get(item.saleId)||{...item,totalReturnQty:0};current.totalReturnQty+=number(item.totalReturnQty);previous.set(item.saleId,current);});
                const next=new Map();items.forEach(item=>next.set(item.saleId,(next.get(item.saleId)||0)+number(item.totalReturnQty)));
                const changed=[...new Set([...previous.keys(),...next.keys()])].some(id=>number(previous.get(id)?.totalReturnQty)!==number(next.get(id)));
                const nextItems=items.map(item=>({...item,bonusRateBefore:previous.has(item.saleId)?bonusRate(previous.get(item.saleId).paidReturnQty,previous.get(item.saleId).bonusReturnQty):null,bonusRateAfter:null}));
                await applyAllocationDelta(transaction,old.items||[],nextItems);
                const details=[...new Set([...previous.keys(),...next.keys()])].map(id=>{const item=items.find(line=>line.saleId===id)||previous.get(id);return `${item.productName}: إجمالي ${number(previous.get(id)?.totalReturnQty)}→${number(next.get(id))}`;}).join(` | `);
                transaction.update(ref,{...basePayload,items:nextItems,quantitiesModified:hasQuantityChanges(old)||changed,updatedAt:serverNow()});
                transaction.set(eventRef,{...audit(`resubmitted`,`representative`,details),at:serverNow()});
            });
        } else {
            const requestRef=doc(collection(db,RETURNS)),eventRef=auditDocRef(requestRef.id);
            await runTransaction(db,async transaction=>{
                await applyAllocationDelta(transaction,[],items);
                transaction.set(requestRef,{...basePayload,createdAt:serverNow(),updatedAt:serverNow()});
                transaction.set(eventRef,{...audit(`created`,`representative`),at:serverNow()});
            });
        }
        editingId = ``; $(`returnLines`).innerHTML = ``; $(`returnType`).value = ``; $(`returnType`)._searchCombobox?.sync(); $(`returnNote`).value = ``; await loadPharmacySales(); addLine(); showBanner(`تم إرسال المرتجع لرئيس قسم الطلبيات.`, `success`);
    } catch (error) { console.error(error); showBanner(error.message || `تعذر إرسال المرتجع.`, `error`); } finally { button.disabled = false; }
}

async function loadRepHistory() {
    const body = $(`rowsBody`); body.innerHTML = `<tr><td colspan="7"><div class="empty">جاري التحميل...</div></td></tr>`;
    try {
        const snap = await getDocs(query(collection(db, RETURNS), where(`repUid`, `==`, currentAccess.uid), orderBy(`createdAt`, `desc`), limit(100))); const rows = []; snap.forEach(item => { if (!item.data().deletedAt) rows.push({ id: item.id, ...item.data() }); });
        body.innerHTML = rows.length ? rows.map(row => `<tr><td>${dateText(row.createdAt)}</td><td><strong>${escapeHtml(row.pharmacyName)}</strong></td><td>${row.items.map(item => `${escapeHtml(item.productName)} — ${escapeHtml(item.batch)} — فاتورة ${escapeHtml(item.invoiceNumber)} × ${item.totalReturnQty}${ratioHtml(item)}`).join(`<br>`)}</td><td>${balanceHtml(row, rows)}</td><td><span class="status ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td><td>${escapeHtml(row.returnReason || row.rejectionReason || `-`)}</td><td>${row.status === `returned_to_rep` ? `<button class="btn warning edit" data-id="${row.id}">تعديل</button>` : `<button class="btn secondary view-return" data-id="${row.id}"><i class="ph ph-eye"></i> مشاهدة</button>`}</td></tr>`).join(``) : `<tr><td colspan="7"><div class="empty">لا توجد مرتجعات.</div></td></tr>`;
        body.querySelectorAll(`.edit`).forEach(button => button.onclick = () => editRepReturn(rows.find(row => row.id === button.dataset.id)));
        body.querySelectorAll(`.view-return`).forEach(button => button.onclick = () => openDetailPage(button.dataset.id));
    } catch (error) { body.innerHTML = `<tr><td colspan="7"><div class="empty">تعذر تحميل البيانات.</div></td></tr>`; }
}
async function editRepReturn(row) {
    editingId = row.id; if (!selectedPharmacy || selectedPharmacy.repPharmacyKey !== row.repPharmacyKey) return showBanner(`هذا المرتجع يعود لصيدلية أخرى. ادخل من الصيدلية الصحيحة لتعديله.`, `error`);
    $(`pharmacySelect`).value = selectedPharmacy.id; $(`pharmacySelect`)._searchCombobox?.sync(); $(`returnType`).value = row.returnType || row.items?.[0]?.reason || ``; $(`returnType`)._searchCombobox?.sync(); await loadPharmacySales(); $(`returnLines`).innerHTML = ``; row.items.forEach(addLine); $(`returnNote`).value = row.note || ``; switchRepTab(`new`); showBanner(`تم فتح المرتجع للتعديل وإعادة الإرسال.`, `info`);
}
function switchRepTab(tab) { $(`newPanel`).classList.toggle(`hidden`, tab !== `new`); $(`historyPanel`).classList.toggle(`hidden`, tab !== `history`); document.querySelectorAll(`[data-tab]`).forEach(button => button.classList.toggle(`active`, button.dataset.tab === tab)); if (tab === `history`) loadRepHistory(); }
async function initRep() {
    currentAccess = await requireReturnsAuth([`representative`]);
    if (!currentAccess) { location.replace(`login.html`); return; }
    repName = text(currentAccess.displayName);
    $(`pageIdentity`).textContent = repName;
    await loadRepPharmacies();
    enhanceCombobox($(`pharmacySelect`), { placeholder: `اختر الصيدلية...` });
    enhanceCombobox($(`returnType`), { placeholder: `اختر نوع المرتجع للسند كاملًا...` });
    $(`pharmacySelect`).onchange = async event => {
        const rows = $(`pharmacySelect`)._rows || [];
        selectedPharmacy = rows.find(row => row.id === event.target.value) || null;
        $(`returnLines`).innerHTML = ``;
        if (!selectedPharmacy) return;
        $(`pageIdentity`).textContent = `${repName} — ${selectedPharmacy.pharmacyName}`;
        await loadPharmacySales();
        addLine();
    };
    $(`addLine`).onclick = () => addLine();
    $(`submitReturn`).onclick = submitRepReturn;
    document.querySelectorAll(`[data-tab]`).forEach(button => button.onclick = () => switchRepTab(button.dataset.tab));
    document.querySelectorAll(`[data-logout]`).forEach(button => button.onclick = async event => { event.preventDefault(); await logoutReturns(); location.replace(`login.html`); });
}

let reviewRows = [];
let reviewCursor = null;
let reviewHasMore = true;
function roleStatus() { return Object.keys(STATUS_LABELS); }
function renderReviewShell() {
    $(`reviewRoot`).innerHTML = `<section class="card"><div class="summary"><div class="stat"><span>عدد المرتجعات المحملة</span><strong id="countStat">0</strong></div><div class="stat"><span>إجمالي الكمية</span><strong id="qtyStat">0</strong></div><div class="stat"><span>الكمية المدفوعة</span><strong id="paidStat">0</strong></div><div class="stat"><span>القيمة</span><strong id="valueStat">0.00</strong></div></div><div class="grid"><div class="field"><label>بحث داخل النتائج المحملة</label><input id="searchFilter" placeholder="الصيدلية، المندوب، الفاتورة"></div><div class="field"><label>الحالة</label><select id="statusFilter"><option value="">جميع الحالات</option></select></div><div class="field"><label>من تاريخ</label><input id="fromFilter" type="date"></div><div class="field"><label>إلى تاريخ</label><input id="toFilter" type="date"></div></div></section><section class="card"><div class="table-wrap"><table class="table"><thead><tr><th><input id="selectAll" class="check" type="checkbox"></th><th>التاريخ</th><th>المندوب / المشرف</th><th>الصيدلية</th><th>الأصناف</th><th>الكمية / البونص</th><th>القيمة</th><th>الحالة</th>${document.body.dataset.role===`returns_manager`?`<th>تم التعديل</th>`:``}<th>الإجراء</th></tr></thead><tbody id="reviewBody"></tbody></table></div><div class="pagination-actions"><small id="reviewPageInfo"></small><button id="loadMoreRows" type="button" class="btn secondary"><i class="ph ph-arrow-down"></i> تحميل المزيد</button></div></section>`;
    [`searchFilter`,`fromFilter`,`toFilter`].forEach(id => $(id).oninput = () => { syncStatusFilterOptions(); renderReviewRows(); }); $(`statusFilter`).oninput = renderReviewRows; $(`statusFilter`).onchange = renderReviewRows; enhanceCombobox($(`statusFilter`), { placeholder: `ابحث عن الحالة...` }); $(`selectAll`).onchange = event => document.querySelectorAll(`.row-check`).forEach(box => box.checked = event.target.checked); $(`loadMoreRows`).onclick=()=>loadReviewRows(document.body.dataset.role,{append:true});
}
function syncStatusFilterOptions() {
    const select = $(`statusFilter`); if (!select) return;
    const selected = text(select.value), needle = normalize($(`searchFilter`)?.value), from = text($(`fromFilter`)?.value), to = text($(`toFilter`)?.value);
    const available = new Set(reviewRows.filter(row => { const haystack = normalize(`${row.repName} ${row.supervisorName} ${row.pharmacyCode} ${row.pharmacyName} ${(row.items || []).map(x => `${x.invoiceNumber} ${x.productName} ${x.batch}`).join(` `)}`); const created = row.createdAt?.toDate ? row.createdAt.toDate().toISOString().slice(0,10) : isoDate(row.createdAt); return (!needle || haystack.includes(needle)) && (!from || created >= from) && (!to || created <= to); }).map(row => row.status));
    const options = Object.entries(STATUS_LABELS).filter(([key]) => available.has(key)); select.innerHTML = `<option value="">جميع الحالات</option>${options.map(([key,value]) => `<option value="${key}">${value}</option>`).join(``)}`; select.value = available.has(selected) ? selected : ``; select._searchCombobox?.sync();
}
function filteredReviewRows() {
    const needle = normalize($(`searchFilter`)?.value), status = text($(`statusFilter`)?.value), from = text($(`fromFilter`)?.value), to = text($(`toFilter`)?.value);
    return reviewRows.filter(row => { const haystack = normalize(`${row.repName} ${row.supervisorName} ${row.pharmacyCode} ${row.pharmacyName} ${(row.items || []).map(x => `${x.invoiceNumber} ${x.productName} ${x.batch}`).join(` `)}`); const created = row.createdAt?.toDate ? row.createdAt.toDate().toISOString().slice(0,10) : isoDate(row.createdAt); return (!needle || haystack.includes(needle)) && (!status || row.status === status) && (!from || created >= from) && (!to || created <= to); });
}
function renderReviewRows() {
    const rows = filteredReviewRows(), body = $(`reviewBody`); $(`countStat`).textContent = rows.length; $(`qtyStat`).textContent = rows.reduce((s,r)=>s+number(r.totalReturnQty),0); $(`paidStat`).textContent = rows.reduce((s,r)=>s+(r.items||[]).reduce((a,x)=>a+number(x.paidReturnQty),0),0); $(`valueStat`).textContent = money(rows.reduce((s,r)=>s+number(r.totalValue),0));
    body.innerHTML = rows.length ? rows.map(row => `<tr><td><input class="check row-check" type="checkbox" value="${row.id}"></td><td>${dateText(row.createdAt)}</td><td><strong>${escapeHtml(row.repName)}</strong><br>${escapeHtml(row.supervisorName || `-`)}</td><td><strong>${escapeHtml(row.pharmacyName)}</strong></td><td>${(row.items||[]).map(x=>`${escapeHtml(x.productName)}${showInvoiceIdentifiers()?`<br><small>${escapeHtml(x.batch)} | ${escapeHtml(x.invoiceNumber)}</small>`:``}`).join(`<hr>`)}</td><td>${(row.items||[]).map(x=>`${x.totalReturnQty} / Bonus ${x.bonusReturnQty ?? `-`}${ratioHtml(x)}`).join(`<br>`)}</td><td>${money(row.totalValue)}</td><td><span class="status ${row.status}">${STATUS_LABELS[row.status]||row.status}</span></td>${document.body.dataset.role===`returns_manager`?`<td>${hasQuantityChanges(row)?`<span class="modified-badge">تم التعديل</span>`:`—`}</td>`:``}<td><button class="btn secondary open-row" data-id="${row.id}"><i class="ph ph-eye"></i> فتح</button></td></tr>`).join(``) : `<tr><td colspan="${document.body.dataset.role===`returns_manager`?10:9}"><div class="empty">لا توجد مرتجعات مطابقة ضمن النتائج المحملة.</div></td></tr>`;
    body.querySelectorAll(`.open-row`).forEach(button => button.onclick = () => openDetailPage(button.dataset.id));
    if($(`reviewPageInfo`))$(`reviewPageInfo`).textContent=`تم تحميل ${reviewRows.length.toLocaleString(`en-US`)} مرتجع${reviewHasMore?` — يوجد المزيد`:``}`;
    if($(`loadMoreRows`))$(`loadMoreRows`).classList.toggle(`hidden`,!reviewHasMore);
}
function reviewPageForRole(role) { return pageForRole(role); }
function openDetailPage(id) { location.href = `detail.html?id=${encodeURIComponent(id)}`; }
async function loadReviewRows(role,{append=false}={}) {
    if(append&&!reviewHasMore)return;
    const button=$(`loadMoreRows`);if(button)button.disabled=true;
    try{
        if(!append){reviewRows=[];reviewCursor=null;reviewHasMore=true;}
        let q;
        if(role===`supervisor`){
            const key=text(currentAccess?.supervisorKey);if(!key){location.replace(`login.html`);return;}$(`pageIdentity`).textContent=currentAccess.displayName;
            q=reviewCursor?query(collection(db,RETURNS),where(`supervisorKey`,`==`,key),orderBy(`createdAt`,`desc`),startAfter(reviewCursor),limit(REVIEW_PAGE_SIZE)):query(collection(db,RETURNS),where(`supervisorKey`,`==`,key),orderBy(`createdAt`,`desc`),limit(REVIEW_PAGE_SIZE));
        }else{
            q=reviewCursor?query(collection(db,RETURNS),orderBy(`createdAt`,`desc`),startAfter(reviewCursor),limit(REVIEW_PAGE_SIZE)):query(collection(db,RETURNS),orderBy(`createdAt`,`desc`),limit(REVIEW_PAGE_SIZE));
        }
        const snap=await getDocs(q),statuses=roleStatus(),existing=new Set(reviewRows.map(row=>row.id));
        snap.forEach(item=>{const row=item.data();if(!row.deletedAt&&statuses.includes(row.status)&&!existing.has(item.id))reviewRows.push({id:item.id,...row});});
        reviewCursor=snap.docs.at(-1)||reviewCursor;reviewHasMore=snap.size===REVIEW_PAGE_SIZE;
        syncStatusFilterOptions();renderReviewRows();
    }finally{if(button)button.disabled=false;}
}
function invoiceHistoryHtml(item) {
    return `<div class="audit-row">${showInvoiceIdentifiers()?`<strong>الفاتورة ${escapeHtml(item.invoiceNumber)}</strong><br>`:``}${escapeHtml(item.productName)}${showInvoiceIdentifiers()?` — Batch ${escapeHtml(item.batch)}`:``} — انتهاء ${escapeHtml(item.expiryDate || `-`)}<br><small>تاريخ الفاتورة: ${escapeHtml(item.saleDate || `-`)} | المسحوبات الأصلية: كمية ${number(item.originalSoldQty ?? item.soldQty)} + بونص ${number(item.originalBonusQty ?? item.bonusQty)}${document.body.dataset.role===`representative`?``:` | سعر الوحدة ${money(item.unitPrice)}`}</small></div>`;
}
async function loadInvoiceHistory(row) {
    const target=$(`invoiceHistory`);target.classList.remove(`hidden`);target.innerHTML=`<div class="empty">جاري تحميل الفواتير القديمة...</div>`;
    try{
        const activeRole=document.body.dataset.role;
        const chunksQuery=activeRole===`supervisor`
            ? query(collection(db,SALES_CHUNKS),where(`repPharmacyKey`,`==`,row.repPharmacyKey),where(`supervisorKey`,`==`,currentAccess.supervisorKey))
            : query(collection(db,SALES_CHUNKS),where(`repPharmacyKey`,`==`,row.repPharmacyKey));
        const [chunks,imports]=await Promise.all([getDocs(chunksQuery),getDocs(query(collection(db,IMPORTS),where(`status`,`==`,`completed`)))]);
        const completed=new Set();imports.forEach(d=>completed.add(d.id));
        const keys=new Set((row.items||[]).map(item=>normalize(item.productCode||item.productName))),sales=new Map();
        const accept=sale=>{if(sale.repPharmacyKey!==row.repPharmacyKey)return;if(keys.has(normalize(sale.productCode||sale.productName))&&(!sale.sourceUploadId||completed.has(sale.sourceUploadId)))sales.set(saleIdentity(sale),sale);};
        chunks.forEach(d=>{const chunk=d.data();if(completed.has(chunk.sourceUploadId))(chunk.records||[]).forEach(accept);});
        const rows=[...sales.values()].sort((a,b)=>text(b.saleDate).localeCompare(text(a.saleDate)));
        target.innerHTML=rows.length?rows.map(invoiceHistoryHtml).join(``):(row.items||[]).map(invoiceHistoryHtml).join(``);
    }catch(error){target.innerHTML=`<div class="empty">تعذر تحميل الفواتير القديمة.</div>`;}
}
function openDrawer(row) {
    const role=document.body.dataset.role, representative=role===`representative`, editable=canEditSplit(row,role), identifiers=showInvoiceIdentifiers();
    $(`drawer`).classList.add(`show`);$(`drawerTitle`).textContent=`مرتجع ${row.pharmacyName}`;
    const splitRows=(row.items||[]).map((item,index)=>`<tr data-index="${index}"><td><strong>${escapeHtml(item.productName)}</strong></td><td>${identifiers?`${escapeHtml(item.batch)}<br>`:``}<small>${escapeHtml(item.expiryDate||`—`)}</small></td>${identifiers?`<td>${escapeHtml(item.invoiceNumber)}</td>`:``}<td>${item.totalReturnQty}</td><td><input aria-label="الكمية" class="paid-input" type="number" min="0" max="${item.totalReturnQty}" step="1" value="${item.paidReturnQty??``}" ${editable?``:`disabled`}></td><td><input aria-label="البونص" class="bonus-input" type="number" min="0" max="${item.totalReturnQty}" step="1" value="${item.bonusReturnQty??``}" ${editable?``:`disabled`}></td><td class="rate-cell">${ratioHtml(item)}</td>${representative?``:`<td>${money(item.unitPrice)}</td><td class="line-value">${money(item.lineValue)}</td>`}</tr>`).join(``);
    let actions=``;
    if(editable){actions=role===`returns_manager`?`<button class="btn primary save-split">حفظ وإرسال للمشرف</button><button class="btn warning return-rep">إعادة للمندوب</button>`:role===`supervisor`?`<button class="btn primary save-split">موافقة وإرسال لمدير السوق</button><button class="btn warning return-manager">إعادة لرئيس قسم الطلبيات</button>`:`<button class="btn primary save-split">اعتماد وإرسال للمالية</button><button class="btn warning return-manager">إعادة لرئيس قسم الطلبيات</button>`;}
    if(role===`returns_manager` && row.status===`approved_for_export`)actions=`<div class="field"><label for="routeTarget">نقل المرتجع إلى</label><select id="routeTarget"><option value="">اختر الجهة</option><option value="returned_to_rep">المندوب</option><option value="pending_supervisor">المشرف</option><option value="pending_market_manager">مدير السوق</option><option value="pending_finance">المالية</option><option value="returned_to_returns_manager">رئيس قسم الطلبيات — إعادة التدقيق</option></select></div><button class="btn primary route-request">نقل المرتجع</button>`;
    if(role===`finance` && row.status===`pending_finance`)actions=`<button class="btn primary finance-release">إنهاء المراجعة وإعادته جاهزًا للسحب</button><button class="btn warning return-manager">إعادة لرئيس قسم الطلبيات</button>`;
    if(role===`returns_manager` && !row.deletedAt)actions+=`<button class="btn danger delete-request">حذف</button>`;
    $(`drawerContent`).innerHTML=`<div class="grid"><div class="field"><label>المندوب</label><div class="readonly">${escapeHtml(row.repName)}</div></div><div class="field"><label>المشرف</label><div class="readonly">${escapeHtml(row.supervisorName||`—`)}</div></div><div class="field"><label>الصيدلية</label><div class="readonly">${escapeHtml(row.pharmacyName)}</div></div><div class="field"><label>نوع المرتجع</label><div class="readonly">${(row.returnType||row.items?.[0]?.reason)===`expired`?`Expired`:`بضاعة جيدة`}</div></div></div><h3>تفاصيل الأصناف</h3>${editable&&role===`returns_manager`?`<p class="split-guidance">حدّد الكمية والبونص حسب شريحة الكمية المتبقية والفواتير القديمة. النسبة تُحسب تلقائيًا من التقسيم الذي تعتمده.</p>`:``}<div class="table-wrap"><table class="table split-table"><thead><tr><th>الصنف</th><th>${identifiers?`Batch / الانتهاء`:`الانتهاء`}</th>${identifiers?`<th>الفاتورة</th>`:``}<th>الإجمالي</th><th>الكمية</th><th>البونص</th><th>نسبة البونص</th>${representative?``:`<th>السعر</th><th>المجموع</th>`}</tr></thead><tbody>${splitRows}</tbody></table></div><div class="toolbar"><button class="btn secondary invoice-history">الفواتير القديمة للصنف والصيدلية</button></div><div id="invoiceHistory" class="hidden">${(row.items||[]).map(invoiceHistoryHtml).join(``)}</div>${row.status===`exported`?`<h3>الرصيد المتبقي بعد المرتجعات المسحوبة</h3><div id="finalBalances">جاري التحميل...</div>`:``}<h3>سجل التعديلات</h3><div id="auditTrailView" class="audit"><div class="empty">جاري تحميل سجل التدقيق...</div></div><div class="split-actions">${actions}</div>`;
    $(`drawerContent`).querySelectorAll(`.split-table tbody tr`).forEach(tr=>{
        const item=row.items[number(tr.dataset.index)],paidInput=tr.querySelector(`.paid-input`),bonusInput=tr.querySelector(`.bonus-input`);
        const sync=source=>{
            const input=source===`paid`?paidInput:bonusInput, other=source===`paid`?bonusInput:paidInput;
            if(input.value===``){other.value=``;tr.querySelector(`.rate-cell`).innerHTML=ratioHtml({...item,paidReturnQty:null,bonusReturnQty:null});return;}
            const value=Math.max(0,Math.min(number(item.totalReturnQty),number(input.value)));input.value=value;other.value=number(item.totalReturnQty)-value;
            const paid=number(paidInput.value),bonus=number(bonusInput.value);
            tr.querySelector(`.rate-cell`).innerHTML=ratioHtml(withSplit(item,paid,bonus));
            const amount=tr.querySelector(`.line-value`);if(amount)amount.textContent=money(paid*number(item.unitPrice));
        };
        paidInput.oninput=()=>sync(`paid`);bonusInput.oninput=()=>sync(`bonus`);
    });
    const bind=(selector,handler)=>$(`drawerContent`).querySelector(selector)?.addEventListener(`click`,handler);
    bind(`.invoice-history`,()=>loadInvoiceHistory(row));bind(`.save-split`,()=>saveSplit(row,role));bind(`.return-rep`,()=>returnRequest(row,`rep`));bind(`.return-manager`,()=>returnRequest(row,`manager`));bind(`.delete-request`,()=>deleteRequest(row));bind(`.route-request`,()=>routeRequest(row));bind(`.finance-release`,()=>releaseFinance(row));
    loadAuditEvents(row);
    if(row.status===`exported`)loadFinalBalances(row);
}
async function loadFinalBalances(row){try{const role=document.body.dataset.role;let balanceQuery;if(role===`representative`)balanceQuery=query(collection(db,RETURNS),where(`repUid`,`==`,currentAccess.uid));else if(role===`supervisor`)balanceQuery=query(collection(db,RETURNS),where(`repPharmacyKey`,`==`,row.repPharmacyKey),where(`supervisorKey`,`==`,currentAccess.supervisorKey));else balanceQuery=query(collection(db,RETURNS),where(`repPharmacyKey`,`==`,row.repPharmacyKey));const snap=await getDocs(balanceQuery);const rows=[];snap.forEach(d=>{const data=d.data();if(data.repPharmacyKey===row.repPharmacyKey)rows.push({id:d.id,...data});});if($(`finalBalances`))$(`finalBalances`).innerHTML=balanceHtml(row,rows);}catch(error){if($(`finalBalances`))$(`finalBalances`).textContent=`تعذر تحميل الرصيد؛ أعد فتح الصفحة.`;}}
function drawerItems(row) {
    return (row.items||[]).map((item,index)=>{ const tr=$(`drawerContent`).querySelector(`tr[data-index="${index}"]`),input=tr?.querySelector(`.paid-input`), paid=number(input?.value), bonusInput=tr?.querySelector(`.bonus-input`),bonus=bonusInput?number(bonusInput.value):number(item.totalReturnQty)-paid; if (!input || input.value === ``) throw new Error(`أدخل الكمية المدفوعة لكل صنف.`); if (paid<0 || bonus<0 || paid+bonus!==number(item.totalReturnQty)) throw new Error(`مجموع الكمية والبونص يجب أن يساوي إجمالي المرتجع.`); if (paid>number(item.originalSoldQty)) throw new Error(`كمية ${item.productName} المدفوعة تتجاوز كمية الفاتورة الأصلية.`); if (bonus>number(item.originalBonusQty)) throw new Error(`بونص ${item.productName} يتجاوز بونص الفاتورة الأصلية.`); if(!Number.isInteger(paid)||!Number.isInteger(bonus))throw new Error(`الكمية والبونص يجب أن يكونا أعدادًا صحيحة.`); return withSplit(item,paid,bonus); });
}
async function saveSplit(row,role) {
    if(!canEditSplit(row,role))return showBanner(`المرتجع ليس في عهدتك للتعديل.`,`error`);
    const buttons=[...$(`drawerContent`).querySelectorAll(`.split-actions button`)];buttons.forEach(b=>b.disabled=true);
    try{
        const items=drawerItems(row);
        const status=role===`returns_manager`?`pending_supervisor`:role===`supervisor`?`pending_market_manager`:`pending_finance`;
        const action=role===`returns_manager`?`split_completed`:role===`supervisor`?`supervisor_approved`:`market_approved`;
        await mutateRequest(row,[row.status],current=>{
            const changes=items.flatMap((item,index)=>splitChanged(current.items[index],item)?[{productName:item.productName,invoiceNumber:item.invoiceNumber,batch:item.batch,before:{paid:current.items[index].paidReturnQty??null,bonus:current.items[index].bonusReturnQty??null,rate:bonusRate(current.items[index].paidReturnQty,current.items[index].bonusReturnQty)},after:{paid:item.paidReturnQty,bonus:item.bonusReturnQty,rate:bonusRate(item.paidReturnQty,item.bonusReturnQty)}}]:[]);
            return {items,status,quantitiesModified:hasQuantityChanges(current)||changes.length>0,totalValue:items.reduce((sum,item)=>sum+item.lineValue,0),__audit:{...audit(action,role),changes}};
        });await finishReviewAction(role,`تم حفظ التعديل والنسب وإرسال المرتجع.`);
    }catch(error){showBanner(error.message,`error`);}finally{buttons.forEach(b=>b.disabled=false);}
}
async function finishReviewAction(role,message){if(document.body.dataset.page===`detail`)location.href=reviewPageForRole(role);else{closeDrawer();await loadReviewRows(role);showBanner(message,`success`);}}
async function returnRequest(row,target) {
    const role=document.body.dataset.role;
    if(!(canEditSplit(row,role)||role===`finance`&&row.status===`pending_finance`) || target===`rep`&&role!==`returns_manager`)return showBanner(`المرتجع ليس في عهدتك.`,`error`);
    const reason=prompt(`سبب الإعادة إجباري:`);if(reason===null)return;if(!text(reason))return showBanner(`سبب الإعادة إجباري.`,`error`);
    try{await mutateRequest(row,[row.status],current=>({status:target===`rep`?`returned_to_rep`:`returned_to_returns_manager`,returnReason:text(reason),__audit:audit(target===`rep`?`returned_to_rep`:role===`market_manager`?`market_returned`:role===`finance`?`finance_returned`:`supervisor_returned`,role,reason)}));await finishReviewAction(role,`تمت إعادة المرتجع.`);}catch(error){showBanner(error.message,`error`);}
}
async function routeRequest(row) {
    const target=text($(`routeTarget`)?.value),allowed=[`returned_to_rep`,`pending_supervisor`,`pending_market_manager`,`pending_finance`,`returned_to_returns_manager`];
    if(document.body.dataset.role!==`returns_manager`||!allowed.includes(target))return showBanner(`اختر الجهة أولًا.`,`error`);
    const reason=prompt(`سبب نقل المرتجع:`);if(reason===null)return;if(!text(reason))return showBanner(`سبب النقل إجباري.`,`error`);
    try{await mutateRequest(row,[`approved_for_export`],current=>({status:target,returnReason:text(reason),__audit:audit(`rerouted`,`returns_manager`,`${STATUS_LABELS[target]}: ${reason}`)}));await finishReviewAction(`returns_manager`,`تم نقل المرتجع.`);}catch(error){showBanner(error.message,`error`);}
}
async function releaseFinance(row) {
    if(document.body.dataset.role!==`finance`)return;
    try{await mutateRequest(row,[`pending_finance`],current=>({status:`approved_for_export`,__audit:audit(`finance_approved`,`finance`)}));await finishReviewAction(`finance`,`تمت المراجعة وإعادة المرتجع جاهزًا للسحب.`);}catch(error){showBanner(error.message,`error`);}
}
async function deleteRequest(row) {
    if(document.body.dataset.role!==`returns_manager`)return showBanner(`الحذف متاح لرئيس قسم الطلبيات فقط.`,`error`);
    const reason=prompt(`سبب الحذف إجباري:`);if(reason===null)return;if(!text(reason))return showBanner(`سبب الحذف إجباري.`,`error`);
    try{await mutateRequest(row,[row.status],current=>({deletedAt:true,deletedBy:actorName(),deletedByUid:text(currentAccess?.uid),deleteReason:text(reason),__audit:audit(`deleted`,`returns_manager`,reason)}));await finishReviewAction(`returns_manager`,`تم حذف المرتجع من القوائم النشطة.`);}catch(error){showBanner(error.message,`error`);}
}
function closeDrawer(){ $(`drawer`)?.classList.remove(`show`); }
function selectedRows(){ const ids=[...document.querySelectorAll(`.row-check:checked`)].map(x=>x.value); return filteredReviewRows().filter(row=>ids.includes(row.id)); }
function exportRows(rows){ if(typeof XLSX===`undefined`)throw new Error(`مكتبة Excel غير محملة.`);if(!rows.length)throw new Error(`حدد مرتجعًا واحدًا على الأقل.`);const data=rows.flatMap(row=>(row.items||[]).map(item=>({[`تاريخ المرتجع`]:dateText(row.createdAt),[`المندوب`]:row.repName,[`المشرف`]:row.supervisorName,[`كود الصيدلية`]:row.pharmacyCode,[`اسم الصيدلية`]:row.pharmacyName,[`رقم الفاتورة`]:item.invoiceNumber,[`تاريخ الفاتورة`]:item.saleDate,[`كود الصنف`]:item.productCode,[`اسم الصنف`]:item.productName,[`Batch`]:item.batch,[`تاريخ الانتهاء`]:item.expiryDate,[`إجمالي المرتجع`]:item.totalReturnQty,[`الكمية`]:item.paidReturnQty,[`البونص`]:item.bonusReturnQty,[`نسبة البونص قبل التعديل`]:rateText(rateBefore(item)),[`نسبة البونص بعد التعديل`]:rateText(bonusRate(item.paidReturnQty,item.bonusReturnQty)),[`السبب`]:(row.returnType||item.reason)===`expired`?`Expired`:`بضاعة جيدة`,[`سعر الوحدة`]:item.unitPrice,[`المجموع الفرعي`]:item.lineValue,[`الحالة`]:STATUS_LABELS[row.status]||row.status})));const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,`Returns`);XLSX.writeFile(wb,`Returns_${new Date().toISOString().slice(0,10)}.xlsx`);}
let exportBusy=false;
async function markExported() { return downloadReview(true); }
async function downloadReview(selectedOnly=false) {
    if(exportBusy)return;
    const role=document.body.dataset.role,chosen=selectedRows(),base=chosen.length?chosen:selectedOnly?[]:filteredReviewRows();
    if(role!==`returns_manager`){try{exportRows(base);}catch(error){showBanner(error.message,`error`);}return;}
    const rows=base.filter(row=>[`approved_for_export`,`exported`].includes(row.status));
    if(!rows.length)return showBanner(`حدد مرتجعات جاهزة للسحب أو مفوترة.`,`error`);
    const pending=rows.filter(row=>row.status===`approved_for_export`);
    if(pending.length){try{await assertAllocationLedgerReady();}catch(error){return showBanner(error.message,`error`);}}
    if(pending.length&&!confirm(`تنزيل ${pending.length} مرتجع واعتماد سحبها النهائي؟ ستصبح حالتها تمت الفوترة.`))return;
    exportBusy=true;document.querySelectorAll(`#exportSelected,#markExported`).forEach(button=>button.disabled=true);
    let downloaded=false;
    try{
        const fresh=[];for(const row of rows){const snap=await getDoc(doc(db,RETURNS,row.id));if(!snap.exists()||snap.data().deletedAt||![`approved_for_export`,`exported`].includes(snap.data().status))throw new Error(`تغيرت حالة أحد المرتجعات؛ حدّث القائمة.`);fresh.push({id:snap.id,...snap.data()});}
        fresh.forEach(row=>(row.items||[]).forEach(item=>{if(item.paidReturnQty==null||item.bonusReturnQty==null||number(item.paidReturnQty)+number(item.bonusReturnQty)!==number(item.totalReturnQty))throw new Error(`يوجد مرتجع لم يتم تدقيق تقسيمه بعد.`);}));
        exportRows(fresh);downloaded=true;
        const requests=fresh.filter(row=>row.status===`approved_for_export`);
        if(requests.length){const eventRefs=new Map(requests.map(row=>[row.id,auditDocRef(row.id)]));await runTransaction(db,async transaction=>{
            const snapshots=[];for(const row of requests)snapshots.push(await transaction.get(doc(db,RETURNS,row.id)));
            snapshots.forEach((snapshot,index)=>{
                if(!snapshot.exists())throw new Error(`أحد المرتجعات لم يعد موجودًا.`);
                const current={id:snapshot.id,...snapshot.data()},original=requests[index];
                if(current.status===`exported`)return;
                assertRoleAction(current,`returns_manager`,[`approved_for_export`]);
                if(JSON.stringify(current.items)!==JSON.stringify(original.items))throw new Error(`تغيرت الكميات أثناء التنزيل. أعد التنزيل بعد تحديث الصفحة.`);
                transaction.update(snapshot.ref,{status:`exported`,exportedAt:serverNow(),exportedBy:actorName(),exportedByUid:text(currentAccess?.uid),updatedAt:serverNow()});
                transaction.set(eventRefs.get(current.id),{...audit(`exported`,`returns_manager`),at:serverNow()});
            });
        });}
        await loadReviewRows(role);showBanner(`تم تنزيل الملف${requests.length?` واعتماد السحب النهائي`:``}.`,`success`);
    }catch(error){showBanner(`${downloaded?`بدأ تنزيل الملف، لكن تعذر إكمال الاعتماد. حدّث القائمة وتحقق من الحالة قبل إعادة المحاولة. `:``}${error.message}`,`error`);}
    finally{exportBusy=false;document.querySelectorAll(`#exportSelected,#markExported`).forEach(button=>button.disabled=false);}
}
async function initReview(){const expectedRole=document.body.dataset.role;currentAccess=await requireReturnsAuth([expectedRole]);if(!currentAccess){location.replace(`login.html`);return;}document.body.dataset.role=currentAccess.role;renderReviewShell();$(`closeDrawer`).onclick=closeDrawer;$(`drawer`).onclick=event=>{if(event.target===$(`drawer`))closeDrawer();};$(`exportSelected`)?.addEventListener(`click`,()=>downloadReview());$(`markExported`)?.addEventListener(`click`,markExported);document.querySelectorAll(`[data-logout]`).forEach(button=>button.onclick=async event=>{event.preventDefault();await logoutReturns();location.replace(`login.html`);});try{await loadReviewRows(currentAccess.role);}catch(error){showBanner(error.message||`تعذر تحميل البيانات.`,`error`);}}

async function initDetail(){const id=text(params.get(`id`));if(!id)return location.replace(`login.html`);currentAccess=await requireReturnsAuth([`representative`,`supervisor`,`returns_manager`,`market_manager`,`finance`,`reports`]);if(!currentAccess)return location.replace(`login.html`);const role=currentAccess.role;document.body.dataset.role=role;$(`backToList`).href=reviewPageForRole(role);const snapshot=await getDoc(doc(db,RETURNS,id));if(!snapshot.exists()||snapshot.data().deletedAt)throw new Error(`المرتجع غير موجود أو تم حذفه.`);const row={id:snapshot.id,...snapshot.data()};if(role===`supervisor`&&normalize(currentAccess.supervisorKey)!==normalize(row.supervisorKey))return location.replace(`login.html`);if(role===`representative`&&row.repUid!==currentAccess.uid)return location.replace(`login.html`);openDrawer(row);}

let uploadRows=[],uploadMeta=null,uploadCancelled=false,uploadInProgress=false;
async function fileHash(file){const digest=await crypto.subtle.digest(`SHA-256`,await file.arrayBuffer());return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,`0`)).join(``);}
function downloadTemplate(){const sample=[{[`تاريخ البيع`]:`2026-08-01`,[`رقم الفاتورة`]:`INV-10001`,[`اسم المندوب`]:`اجود التلهوني`,[`اسم المشرف`]:`عبدالله الناطور`,[`كود الصيدلية`]:`PH-001`,[`اسم الصيدلية`]:`صيدلية المثال`,[`كود الصنف`]:`P-100`,[`اسم الصنف`]:`Example Product`,[`Batch`]:`B24001`,[`تاريخ الانتهاء`]:`2027-12-31`,[`الكمية المباعة`]:10,[`البونص`]:2,[`سعر الوحدة`]:5.25}];const ws=XLSX.utils.json_to_sheet(sample),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,`Sales`);XLSX.writeFile(wb,`Returns_Sales_Template.xlsx`);}
function buildSalesChunks(rows, fileHashValue) {
    const groups = new Map(); rows.forEach(row => { const group = groups.get(row.repPharmacyKey) || []; group.push(row); groups.set(row.repPharmacyKey, group); });
    const chunks = []; const chunkSize = 160;
    groups.forEach((records, repPharmacyKey) => { for (let index = 0; index < records.length; index += chunkSize) { const part = records.slice(index, index + chunkSize).map(row => ({ ...row, totalPurchasedQty: number(row.soldQty) + number(row.bonusQty), saleId: `sale_${hash(saleIdentity(row))}` })); chunks.push({ id: `chunk_${fileHashValue}_${hash(repPharmacyKey)}_${index / chunkSize}`, repPharmacyKey, repKey: part[0].repKey, repName: part[0].repName, supervisorKey: part[0].supervisorKey, supervisorName: part[0].supervisorName, pharmacyCode: part[0].pharmacyCode, pharmacyName: part[0].pharmacyName, records: part }); } });
    return chunks;
}
function setUploadProgress(completed, total, message) { const panel=$(`uploadProgress`),bar=$(`uploadProgressBar`),label=$(`uploadProgressLabel`),count=$(`uploadProgressCount`);if(!panel)return;panel.classList.remove(`hidden`);const pct=total?Math.round((completed/total)*100):0;bar.style.width=`${pct}%`;bar.setAttribute(`aria-valuenow`,pct);label.textContent=message;count.textContent=`${completed.toLocaleString(`en-US`)} / ${total.toLocaleString(`en-US`)} Documents`; }
async function parseSales(file){const workbook=XLSX.read(await file.arrayBuffer(),{type:`array`,cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]],source=XLSX.utils.sheet_to_json(sheet,{defval:``,raw:false}),errors=[],map=new Map();source.forEach((raw,index)=>{const row={saleDate:isoDate(raw[`تاريخ البيع`]),invoiceNumber:text(raw[`رقم الفاتورة`]),repName:text(raw[`اسم المندوب`]),supervisorName:text(raw[`اسم المشرف`]),pharmacyCode:text(raw[`كود الصيدلية`]),pharmacyName:text(raw[`اسم الصيدلية`]),productCode:text(raw[`كود الصنف`]),productName:text(raw[`اسم الصنف`]),batch:text(raw[`Batch`]||raw[`الباتش`]),expiryDate:isoDate(raw[`تاريخ الانتهاء`]),soldQty:number(raw[`الكمية المباعة`]),bonusQty:number(raw[`البونص`]||raw[`الكمية المجانية`]),unitPrice:number(raw[`سعر الوحدة`])};if(!row.saleDate||!row.invoiceNumber||!row.repName||!row.supervisorName||!row.pharmacyCode||!row.pharmacyName||!row.productCode||!row.productName||!row.batch||!row.expiryDate||row.soldQty<0||row.bonusQty<0||row.soldQty+row.bonusQty<=0||row.unitPrice<0){errors.push(`السطر ${index+2}: بيانات إلزامية ناقصة أو كمية غير صحيحة.`);return;}row.repKey=normalize(row.repName);row.supervisorKey=normalize(row.supervisorName);row.repPharmacyKey=`${row.repKey}__${normalize(row.pharmacyCode)}`;const key=saleIdentity(row);const current=map.get(key)||{...row,soldQty:0,bonusQty:0};current.soldQty+=row.soldQty;current.bonusQty+=row.bonusQty;map.set(key,current);});uploadRows=[...map.values()];const hashValue=await fileHash(file),chunks=buildSalesChunks(uploadRows,hashValue);uploadMeta={name:file.name,size:file.size,hash:hashValue,errors,plannedDocuments:chunks.length,pharmacies:new Set(uploadRows.map(row=>row.repPharmacyKey)).size};const sample=uploadRows.slice(0,8);$(`preview`).innerHTML=`<div class="pills"><span class="pill">سجلات Excel: ${uploadRows.length.toLocaleString(`en-US`)}</span><span class="pill">Firestore Documents: ${chunks.length.toLocaleString(`en-US`)}</span><span class="pill">الصيدليات: ${uploadMeta.pharmacies.toLocaleString(`en-US`)}</span><span class="pill">الأخطاء: ${errors.length}</span></div>${errors.length?`<div class="banner show error">${errors.slice(0,8).join(` — `)}</div>`:``}<div class="table-wrap"><table class="table"><thead><tr>${sample[0]?Object.keys(sample[0]).filter(key=>![`pharmacyCode`,`invoiceNumber`,`batch`].includes(key)).slice(0,10).map(key=>`<th>${escapeHtml(key)}</th>`).join(``):`<th>لا توجد بيانات</th>`}</tr></thead><tbody>${sample.map(row=>`<tr>${Object.entries(row).filter(([key])=>![`pharmacyCode`,`invoiceNumber`,`batch`].includes(key)).slice(0,10).map(([,value])=>`<td>${escapeHtml(value)}</td>`).join(``)}</tr>`).join(``)}</tbody></table></div>`;$(`commitSales`).disabled=!uploadRows.length||errors.length>0;$(`cancelUpload`).disabled=true;$(`uploadProgress`).classList.add(`hidden`);}
async function syncPharmacyDirectory(rows) {
    const pharmacies = new Map();
    rows.forEach(row => {
        const key = row.repPharmacyKey;
        if (!key || pharmacies.has(key)) return;
        pharmacies.set(key, {
            repKey: row.repKey, repName: row.repName, supervisorKey: row.supervisorKey, supervisorName: row.supervisorName,
            pharmacyCode: row.pharmacyCode, pharmacyName: row.pharmacyName, repPharmacyKey: row.repPharmacyKey, updatedAt: serverNow()
        });
    });
    for (const [key, pharmacy] of pharmacies) await setDoc(doc(db, PHARMACIES, `ph_${hash(key)}`), pharmacy, { merge: true });
}
async function commitSales(){const button=$(`commitSales`),fileInput=$(`salesFile`);if(!uploadMeta||!uploadRows.length)return showBanner(`اختر ملفًا صالحًا أولًا.`,`error`);button.disabled=true;fileInput.disabled=true;$(`cancelUpload`).disabled=false;uploadCancelled=false;uploadInProgress=true;const chunks=buildSalesChunks(uploadRows,uploadMeta.hash),uploadId=`upload_${uploadMeta.hash}`;try{const matching=await getDocs(query(collection(db,IMPORTS),where(`fileHash`,`==`,uploadMeta.hash),limit(1)));let previous=null;matching.forEach(item=>{previous={id:item.id,...item.data()};});if(previous?.status===`completed`)throw new Error(`هذا الملف مرفوع ومعتمد مسبقًا.`);const existingSnap=await getDocs(query(collection(db,SALES_CHUNKS),where(`sourceUploadId`,`==`,uploadId))),existingIds=new Set();existingSnap.forEach(item=>existingIds.add(item.id));await setDoc(doc(db,IMPORTS,uploadId),{fileName:uploadMeta.name,fileHash:uploadMeta.hash,hashAlgorithm:`SHA-256`,records:uploadRows.length,pharmacies:uploadMeta.pharmacies,documents:chunks.length,status:`uploading`,startedAt:previous?.startedAt||serverNow(),updatedAt:serverNow()},{merge:true});let completed=existingIds.size;setUploadProgress(completed,chunks.length,existingIds.size?`استكمال الرفع من آخر نقطة مكتملة...`:`بدء الرفع الآمن...`);for(const chunk of chunks){if(existingIds.has(chunk.id))continue;if(uploadCancelled){await setDoc(doc(db,IMPORTS,uploadId),{status:`paused`,completedDocuments:completed,updatedAt:serverNow()},{merge:true});showBanner(`تم إيقاف الرفع عند ${completed} من ${chunks.length}. يمكنك رفع الملف نفسه لاحقًا للاستكمال.`,`info`);return;}await setDoc(doc(db,SALES_CHUNKS,chunk.id),{...chunk,sourceUploadId:uploadId,sourceFileHash:uploadMeta.hash,createdAt:serverNow(),updatedAt:serverNow()});completed+=1;setUploadProgress(completed,chunks.length,`جاري رفع البيانات بشكل آمن...`);}await syncPharmacyDirectory(uploadRows);await setDoc(doc(db,IMPORTS,uploadId),{status:`completed`,completedDocuments:chunks.length,completedAt:serverNow(),updatedAt:serverNow()},{merge:true});setUploadProgress(chunks.length,chunks.length,`اكتمل الرفع والاعتماد بنجاح`);showBanner(`تم اعتماد ${uploadRows.length.toLocaleString(`en-US`)} سجل داخل ${chunks.length.toLocaleString(`en-US`)} Document فقط.`,`success`);uploadRows=[];uploadMeta=null;fileInput.value=``;$(`preview`).innerHTML=``;await loadUploadLogs();}catch(error){console.error(error);const exhausted=error?.code===`resource-exhausted`||text(error?.message).includes(`resource-exhausted`);showBanner(exhausted?`حصة Firebase مستنفدة حاليًا. أعد رفع الملف نفسه بعد تجدد الحصة؛ سيكمل من آخر Document محفوظ دون تكرار.`:(error.message||`تعذر رفع الملف.`),`error`);}finally{uploadInProgress=false;$(`cancelUpload`).disabled=true;button.disabled=!uploadRows.length;fileInput.disabled=false;}}
async function loadUploadLogs(){const snap=await getDocs(query(collection(db,IMPORTS),orderBy(`updatedAt`,`desc`),limit(50))),rows=[];snap.forEach(item=>rows.push({id:item.id,...item.data()}));const labels={completed:`مكتمل`,uploading:`قيد الرفع`,paused:`متوقف مؤقتًا`};$(`uploadLogs`).innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الملف</th><th>السجلات</th><th>Documents</th><th>الحالة</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateText(row.completedAt||row.updatedAt||row.createdAt||row.startedAt)}</td><td>${escapeHtml(row.fileName)}</td><td>${number(row.records).toLocaleString(`en-US`)}</td><td>${number(row.completedDocuments||row.documents).toLocaleString(`en-US`)}</td><td><span class="status ${row.status===`completed`?`approved_for_export`:`pending_returns_manager`}">${labels[row.status]||`مكتمل قديم`}</span></td></tr>`).join(``)}</tbody></table></div>`:`<div class="empty">لا توجد ملفات مرفوعة.</div>`;}
let adminUsers = [];

function resetUserForm(){
    if(!$(`userForm`)) return;
    $(`userId`).value=``;
    $(`userName`).value=``;
    $(`userRole`).value=`representative`;
    $(`userRole`).disabled=false;
    $(`userPassword`).value=``;
    $(`userActive`).checked=true;
    $(`userFormTitle`).textContent=`إضافة مستخدم`;
    $(`userPasswordHint`).textContent=`كلمة السر مطلوبة للمستخدم الجديد.`;
    $(`cancelUserEdit`).classList.add(`hidden`);
}

function userRoleLabel(role){ return ROLE_LABELS[role] || role; }

function renderUsersTable(){
    const target=$(`usersList`);
    if(!target) return;
    target.innerHTML=adminUsers.length?`<div class="table-wrap"><table class="table users-table"><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>كلمة السر</th><th>الإجراء</th></tr></thead><tbody id="usersBody">${adminUsers.map(user=>`<tr>
        <td><strong>${escapeHtml(user.displayName)}</strong></td>
        <td>${escapeHtml(userRoleLabel(user.role))}</td>
        <td><span class="status ${user.active?`approved_for_export`:`returned_to_rep`}">${user.active?`فعال`:`موقوف`}</span></td>
        <td><span class="password-protected"><i class="ph ph-lock-key"></i> محفوظة كـ Hash</span></td>
        <td><div class="row-actions"><button type="button" class="btn secondary compact" data-edit-user="${escapeHtml(user.id)}"><i class="ph ph-pencil-simple"></i> تعديل</button><button type="button" class="btn danger compact" data-delete-user="${escapeHtml(user.id)}"><i class="ph ph-trash"></i> حذف</button></div></td>
    </tr>`).join(``)}</tbody></table></div>`:`<div class="empty">لا يوجد مستخدمون.</div>`;
    target.querySelectorAll(`[data-edit-user]`).forEach(button=>button.onclick=()=>editAdminUser(button.dataset.editUser));
    target.querySelectorAll(`[data-delete-user]`).forEach(button=>button.onclick=()=>removeAdminUser(button.dataset.deleteUser));
}

async function refreshAdminUsers(){
    adminUsers=await listUserConfigs();
    renderUsersTable();
}

function editAdminUser(id){
    const user=adminUsers.find(item=>item.id===id);
    if(!user)return;
    $(`userId`).value=user.id;
    $(`userName`).value=user.displayName;
    $(`userRole`).value=user.role;
    $(`userRole`).disabled=true;
    $(`userPassword`).value=``;
    $(`userActive`).checked=user.active!==false;
    $(`userFormTitle`).textContent=`تعديل المستخدم`;
    $(`userPasswordHint`).textContent=`اترك كلمة السر فارغة للإبقاء عليها كما هي، أو أدخل كلمة جديدة لتغييرها.`;
    $(`cancelUserEdit`).classList.remove(`hidden`);
    $(`userName`).focus();
    $(`userManagementCard`)?.scrollIntoView({behavior:`smooth`,block:`start`});
}

async function saveAdminUser(){
    const button=$(`saveUser`);
    const id=text($(`userId`).value),displayName=text($(`userName`).value),role=text($(`userRole`).value),pin=text($(`userPassword`).value),active=$(`userActive`).checked;
    if(!displayName)return showBanner(`أدخل اسم المستخدم.`,`error`);
    if(!role)return showBanner(`اختر الدور.`,`error`);
    button.disabled=true;
    try{
        await saveUserConfig({id,displayName,role,pin,active});
        await refreshAdminUsers();
        resetUserForm();
        showBanner(id?`تم تحديث المستخدم بنجاح.`:`تمت إضافة المستخدم بنجاح.`,`success`);
    }catch(error){showBanner(error.message||`تعذر حفظ المستخدم.`,`error`);}
    finally{button.disabled=false;}
}

async function removeAdminUser(id){
    const user=adminUsers.find(item=>item.id===id);
    if(!user)return;
    if(!confirm(`حذف المستخدم "${user.displayName}"؟ لن يتم حذف أي مرتجعات أو مبيعات مرتبطة به.`))return;
    try{
        await deleteUserConfig(id);
        if($(`userId`).value===id)resetUserForm();
        await refreshAdminUsers();
        showBanner(`تم حذف المستخدم من دليل الدخول.`,`success`);
    }catch(error){showBanner(error.message||`تعذر حذف المستخدم.`,`error`);}
}

async function initUserManagement(){
    const seeded=await ensureUserDirectorySeeded();
    $(`userRole`).innerHTML=Object.entries(ROLE_LABELS).map(([key,label])=>`<option value="${key}">${escapeHtml(label)}</option>`).join(``);
    $(`userForm`).addEventListener(`submit`,event=>{event.preventDefault();saveAdminUser();});
    $(`cancelUserEdit`).onclick=resetUserForm;
    resetUserForm();
    await refreshAdminUsers();
    if(seeded)showBanner(`تم إنشاء دليل المستخدمين في Firebase بنفس كلمات السر الحالية. يمكنك إدارتهم من هنا الآن.`,`success`);
}

async function checkAllocationLedgerStatus(){
    const card=$(`allocationMaintenanceCard`),status=$(`allocationLedgerStatus`),button=$(`rebuildAllocations`);
    if(!card||!status||!button)return;
    card.classList.remove(`hidden`);
    const metaRef=doc(db,ALLOCATIONS,`ledger_meta_v1`),meta=await getDoc(metaRef);
    if(meta.exists()&&number(meta.data().schemaVersion)>=1){status.textContent=`دفتر الكميات مفعّل ومزامن.`;button.classList.add(`hidden`);return;}
    const existing=await getDocs(query(collection(db,RETURNS),limit(1)));
    if(existing.empty){await setDoc(metaRef,{schemaVersion:1,initializedAt:serverNow(),updatedAt:serverNow()},{merge:true});status.textContent=`دفتر الكميات مفعّل. لا توجد مرتجعات سابقة تحتاج ترحيل.`;button.classList.add(`hidden`);return;}
    status.textContent=`يوجد مرتجعات سابقة قبل تفعيل دفتر الحجز. نفّذ المزامنة مرة واحدة قبل الاستخدام الفعلي.`;
    button.classList.remove(`hidden`);
    showBanner(`يوجد مرتجعات سابقة تحتاج مزامنة دفتر الكميات مرة واحدة من قسم الإدارة.`,`info`);
}

async function rebuildAllocationLedger(){
    const button=$(`rebuildAllocations`),status=$(`allocationLedgerStatus`);
    if(!confirm(`إعادة بناء دفتر الكميات من جميع المرتجعات الحالية؟ يفضل عدم إدخال مرتجعات جديدة أثناء العملية.`))return;
    button.disabled=true;status.textContent=`جاري قراءة المرتجعات وإعادة بناء الحجز...`;
    try{
        const requests=await getDocs(collection(db,RETURNS)),totals=new Map();
        requests.forEach(snapshot=>{
            const row=snapshot.data();if(row.deletedAt)return;
            (row.items||[]).forEach(item=>{
                const saleId=text(item.saleId);if(!saleId)return;
                const current=totals.get(saleId)||{saleId,totalAllocated:0,paidAllocated:0,bonusAllocated:0,originalSoldQty:0,originalBonusQty:0,invoiceNumber:text(item.invoiceNumber),productName:text(item.productName),batch:text(item.batch)};
                current.totalAllocated+=number(item.totalReturnQty);
                current.paidAllocated+=item.paidReturnQty==null?0:number(item.paidReturnQty);
                current.bonusAllocated+=item.bonusReturnQty==null?0:number(item.bonusReturnQty);
                current.originalSoldQty=Math.max(current.originalSoldQty,number(item.originalSoldQty));
                current.originalBonusQty=Math.max(current.originalBonusQty,number(item.originalBonusQty));
                totals.set(saleId,current);
            });
        });
        const existingAllocations=await getDocs(collection(db,ALLOCATIONS));
        const staleIds=existingAllocations.docs.map(item=>item.id).filter(id=>id!==`ledger_meta_v1`&&!totals.has(id));
        for(const saleId of staleIds)await setDoc(doc(db,ALLOCATIONS,saleId),{totalAllocated:0,paidAllocated:0,bonusAllocated:0,rebuiltAt:serverNow(),updatedAt:serverNow()},{merge:true});
        let completed=0;
        for(const [saleId,row] of totals){
            if(row.totalAllocated>row.originalSoldQty+row.originalBonusQty)throw new Error(`المرتجعات الحالية تتجاوز البيع الأصلي للصنف ${row.productName} / الفاتورة ${row.invoiceNumber}. راجع البيانات قبل المتابعة.`);
            if(row.paidAllocated>row.originalSoldQty||row.bonusAllocated>row.originalBonusQty)throw new Error(`تقسيم الكمية والبونص الحالي يتجاوز الفاتورة ${row.invoiceNumber}. راجع البيانات قبل المتابعة.`);
            await setDoc(doc(db,ALLOCATIONS,saleId),{...row,totalPurchasedQty:row.originalSoldQty+row.originalBonusQty,rebuiltAt:serverNow(),updatedAt:serverNow()},{merge:true});
            completed+=1;if(status)status.textContent=`جاري المزامنة: ${completed} / ${totals.size}`;
        }
        await setDoc(doc(db,ALLOCATIONS,`ledger_meta_v1`),{schemaVersion:1,rebuiltSales:totals.size,rebuiltAt:serverNow(),updatedAt:serverNow()},{merge:true});
        status.textContent=`اكتملت المزامنة: ${totals.size.toLocaleString(`en-US`)} سجل بيع محجوز.`;button.classList.add(`hidden`);showBanner(`تمت مزامنة دفتر الكميات بنجاح.`,`success`);
    }catch(error){console.error(error);status.textContent=`تعذرت المزامنة.`;showBanner(error.message||`تعذر إعادة بناء دفتر الكميات.`,`error`);}
    finally{button.disabled=false;}
}

async function initAdmin(){
    currentAccess=await requireReturnsAuth([`admin`]);
    if(!currentAccess){location.replace(`login.html`);return;}
    $(`adminFirebaseNote`)?.classList.remove(`hidden`);
    document.querySelectorAll(`[data-logout]`).forEach(button=>button.onclick=async event=>{event.preventDefault();await logoutReturns();location.replace(`login.html`);});
    await initUserManagement();
    $(`rebuildAllocations`)?.addEventListener(`click`,rebuildAllocationLedger);
    await checkAllocationLedgerStatus();
    if(typeof XLSX===`undefined`)showBanner(`مكتبة Excel غير محملة؛ إدارة المستخدمين تعمل لكن رفع Excel غير متاح حالياً.`,`error`);
    else{
        $(`downloadTemplate`).onclick=downloadTemplate;
        $(`salesFile`).onchange=event=>event.target.files[0]&&parseSales(event.target.files[0]);
        $(`commitSales`).onclick=commitSales;
        $(`cancelUpload`).onclick=()=>{uploadCancelled=true;$(`cancelUpload`).disabled=true;$(`uploadProgressLabel`).textContent=`سيتم الإيقاف بعد اكتمال الـDocument الحالي...`;};
        window.addEventListener(`beforeunload`,event=>{if(uploadInProgress){event.preventDefault();event.returnValue=``;}});
        await loadUploadLogs();
    }
}

let selectedSupervisor = ``;
function showLoginPanel(role) {
    $(`roleStep`).classList.add(`hidden`);
    $(`repLoginPanel`).classList.toggle(`hidden`, role !== `representative`);
    $(`supervisorLoginPanel`).classList.toggle(`hidden`, role !== `supervisor`);
    $(`staffLoginPanel`).classList.toggle(`hidden`, role !== `staff`);
}
async function loginRepresentative() {
    const name=text($(`loginRep`).value),password=text($(`loginRepPassword`).value);
    if(!name)return showBanner(`اختر اسم المندوب.`,`error`);
    if(!password)return showBanner(`أدخل كلمة السر.`,`error`);
    try{await loginWithPin(`representative`,name,password);location.href=`rep.html`;}catch(error){showBanner(error?.code===`auth/invalid-credential`?`اسم المستخدم أو كلمة السر غير صحيحة.`:(error.message||`تعذر تسجيل الدخول.`),`error`);}
}
async function loginSupervisor() {
    const password=text($(`loginSupervisorPassword`).value);
    if(!selectedSupervisor)return showBanner(`اختر اسم المشرف.`,`error`);
    if(!password)return showBanner(`أدخل كلمة السر.`,`error`);
    try{await loginWithPin(`supervisor`,selectedSupervisor,password);location.href=`supervisor.html`;}catch(error){showBanner(error?.code===`auth/invalid-credential`?`اسم المستخدم أو كلمة السر غير صحيحة.`:(error.message||`تعذر تسجيل الدخول.`),`error`);}
}
async function loginStaff() {
    const role=text($(`loginStaffRole`).value),password=text($(`loginStaffPassword`).value);
    if(!STAFF_ROLES[role])return showBanner(`اختر الجهة.`,`error`);
    if(!password)return showBanner(`أدخل كلمة السر.`,`error`);
    try{await loginWithPin(role,role,password);location.href=pageForRole(role);}catch(error){showBanner(error?.code===`auth/invalid-credential`?`بيانات الدخول غير صحيحة.`:(error.message||`تعذر تسجيل الدخول.`),`error`);}
}
async function initLogin(){
    const existing=await requireReturnsAuth([]);
    if(existing){location.replace(pageForRole(existing.role));return;}
    document.querySelectorAll(`[data-login-role]`).forEach(button=>button.onclick=()=>showLoginPanel(button.dataset.loginRole));
    document.querySelectorAll(`.back-roles`).forEach(button=>button.onclick=()=>{$(`roleStep`).classList.remove(`hidden`);$(`repLoginPanel`).classList.add(`hidden`);$(`supervisorLoginPanel`).classList.add(`hidden`);$(`staffLoginPanel`).classList.add(`hidden`);});
    const loginUsers=await getLoginDirectory();
    const reps=loginUsers.filter(user=>user.role===`representative`&&user.active!==false);
    const supervisors=loginUsers.filter(user=>user.role===`supervisor`&&user.active!==false);
    $(`loginRep`).innerHTML=`<option value="">اختر المندوب</option>${reps.map(user=>`<option value="${escapeHtml(user.displayName)}">${escapeHtml(user.displayName)}</option>`).join(``)}`;
    $(`supervisorCards`).innerHTML=supervisors.length?supervisors.map(user=>`<button class="person-card" data-supervisor="${escapeHtml(user.displayName)}"><i class="ph ph-user-circle"></i><strong>${escapeHtml(user.displayName)}</strong></button>`).join(``):`<div class="empty">لا يوجد مشرفون فعالون.</div>`;
    document.querySelectorAll(`[data-supervisor]`).forEach(button=>button.onclick=()=>{selectedSupervisor=button.dataset.supervisor;document.querySelectorAll(`[data-supervisor]`).forEach(card=>card.classList.toggle(`selected`,card===button));$(`supervisorLoginButton`).disabled=false;});
    const activeStaffRoles=new Set(loginUsers.filter(user=>STAFF_ROLES[user.role]&&user.active!==false).map(user=>user.role));
    $(`loginStaffRole`).innerHTML=`<option value="">اختر الجهة</option>${Object.entries(STAFF_ROLES).filter(([key])=>activeStaffRoles.has(key)).map(([key,value])=>`<option value="${key}">${escapeHtml(value.label)}</option>`).join(``)}`;
    $(`repLoginButton`).onclick=loginRepresentative;$(`supervisorLoginButton`).onclick=loginSupervisor;$(`staffLoginButton`).onclick=loginStaff;
    $(`loginRepPassword`).addEventListener(`keydown`,event=>{if(event.key===`Enter`){event.preventDefault();loginRepresentative();}});
    $(`loginSupervisorPassword`).addEventListener(`keydown`,event=>{if(event.key===`Enter`){event.preventDefault();loginSupervisor();}});
    $(`loginStaffPassword`).addEventListener(`keydown`,event=>{if(event.key===`Enter`){event.preventDefault();loginStaff();}});
    enhanceCombobox($(`loginRep`),{placeholder:`اكتب اسم المندوب...`});enhanceCombobox($(`loginStaffRole`),{placeholder:`اختر الجهة...`});
}

document.addEventListener(`DOMContentLoaded`,async()=>{try{if(document.body.dataset.page===`login`)await initLogin();else if(document.body.dataset.page===`rep`)await initRep();else if(document.body.dataset.page===`review`)await initReview();else if(document.body.dataset.page===`detail`)await initDetail();else if(document.body.dataset.page===`admin`)await initAdmin();}catch(error){console.error(error);showBanner(error.message||`حدث خطأ أثناء تحميل الصفحة.`,`error`);}});
