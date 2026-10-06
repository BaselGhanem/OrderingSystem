import { MONTH_NAMES, monthLabel, validMonth, normalizeName, eligibleRows, progress, forecastValue, invoiceTotals, parseSalesRows, dateValue } from './forecast-core.js?v=20261006_forecast1';
import * as api from './forecast-store.js?v=20261006_forecast1';

const escape = value => String(value ?? ``).replace(/[&<>"']/g, c => ({ [`&`]: `&amp;`, [`<`]: `&lt;`, [`>`]: `&gt;`, [`"`]: `&quot;`, [`'`]: `&#39;` })[c]);
const money = amount => amount === undefined || amount === null ? `—` : (amount / 100).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amountText = amount => Number.isSafeInteger(amount) ? (amount / 100).toFixed(2) : ``;
const dateText = value => dateValue(value)?.toLocaleString(`en-GB`, { timeZone: `Asia/Amman`, hour12: true }) || `—`;
export async function mountForecast(host, { mode = `rep` } = {}) {
    host.classList.add(`forecast-root`);
    const state = { month: ``, config: null, dataset: null, docs: new Map(), entries: {}, invalid: new Set(), rawInputs: new Map(), dirty: false, busy: false, selected: ``, orders: null, filter: ``, status: `all`, pending: null, admin: false, permits: new Map(), request: 0 };
    const $ = id => host.querySelector(`#${id}`);
    const notify = (message, type = ``) => { const element = $(`fcMessage`); if (element) { element.textContent = message; element.className = `fc-status ${type}`; element.hidden = false; } };
    const acting = api.session();
    if (mode !== `admin` && (mode === `rep` ? !acting.repId || sessionStorage.getItem(`adminOrderMode`) === `1` : !acting.admin || acting.admin.type !== `manager`)) {
        host.innerHTML = `<div class="fc-shell"><div class="fc-panel"><h2>تسجيل الدخول مطلوب</h2><p>افتح الصفحة من حسابك في نظام الطلبيات.</p><a class="fc-link" href="login.html" target="_top">تسجيل الدخول</a></div></div>`; return;
    }
    const admin = mode === `admin`, team = mode === `team` || mode === `tracking`;
    host.innerHTML = `<div class="fc-shell"><header class="fc-hero"><div><small dir="ltr">SALES FORECAST</small><h1>${admin ? `إدارة توقعات المبيعات` : mode === `tracking` ? `متابعة التوقع مقابل المفوتر` : team ? `توقعات فريقي` : `توقعات مبيعاتي`}</h1><p id="fcIdentity">${escape(team ? acting.admin.name : admin ? `إدارة شهرية للمبيعات والتوقعات` : acting.repName)}</p></div><div><label for="fcMonth">الشهر</label><br><input id="fcMonth" type="month" aria-label="شهر التوقع"></div></header>
    ${!admin && window.self === window.top ? `<nav class="fc-quick-nav"><a class="fc-link secondary" href="${team ? `supervisor.html` : `order.html`}">العودة للنظام</a></nav>` : ``}
    <div id="fcMessage" role="status" class="fc-status" hidden></div>
    ${admin ? `<section id="fcAdminGate" class="fc-panel"><h2>فتح إدارة التوقعات</h2><p class="fc-muted">استخدم كلمة مرور الصفحة السرية. إعادة فتح التوقعات ومنح المهلة متاحتان هنا فقط.</p><form id="fcAdminLogin" class="fc-toolbar"><input id="fcAdminPassword" type="password" autocomplete="off" required aria-label="كلمة مرور الإدارة"><button type="submit">فتح الإدارة</button></form></section><section id="fcAdminControls" class="fc-panel" hidden><h2>المبيعات الفعلية وإعدادات الشهر</h2><div class="fc-fields"><label class="fc-field">سنة ملف المبيعات<input id="fcYear" type="number" min="2020" max="2099" step="1"></label><label class="fc-field">رفع ملف المبيعات<input id="fcUpload" type="file" accept=".xlsx,.xls"></label></div><div class="fc-toolbar"><button id="fcAttached" type="button" class="secondary">معاينة الملف المرفق: يناير–سبتمبر 2026</button><button id="fcImport" type="button" hidden>اعتماد ملف المبيعات</button></div><div id="fcImportPreview" class="fc-report" hidden></div><p class="fc-muted">الربط بكود الصيدلية فقط. رفع المبيعات يحدث الأشهر الموجودة بالملف ويحافظ على التوقعات والأشهر السابقة.</p><div class="fc-fields"><label class="fc-field">شهر التعبئة ومنع الطلبات<input id="fcActiveMonth" type="month"></label><label class="fc-field">إلزام التأكيد قبل إدخال الطلبية<select id="fcEnforce"><option value="yes">مفعل</option><option value="no">غير مفعل</option></select></label></div><div class="fc-toolbar"><button id="fcConfigSave" type="button">حفظ إعداد الشهر</button><button id="fcAdminLock" type="button" class="secondary">قفل الإدارة</button></div></section>` : ``}
    <div id="fcContent"><div class="fc-busy"><span class="fc-spinner"></span>جاري تحميل البيانات من النظام…</div></div></div>`;
    const selectedRows = () => state.dataset.rows.filter(row => !team || normalizeName(row.supervisor) === normalizeName(acting.admin.name));
    const representativeRows = () => eligibleRows(state.dataset.sales, state.dataset.routes, acting.repId);
    const documentFor = id => state.docs.get(id) || { revision: 0, status: `draft`, entries: {} };
    const currentDocument = () => documentFor(acting.repId);
    const groupRows = id => selectedRows().filter(row => row.repId === id);
    const fullRows = id => state.dataset.rows.filter(row => row.repId === id);
    const rowStatus = id => {
        const doc = documentFor(id), p = progress(doc, fullRows(id));
        return p.confirmed ? `confirmed` : p.filled ? `partial` : `empty`;
    };
    function statusBadge(id) { const status = rowStatus(id); return `<span class="fc-badge ${status === `confirmed` ? `done` : status === `partial` ? `partial` : ``}">${status === `confirmed` ? `مؤكد` : status === `partial` ? `حفظ جزئي` : `لم يبدأ`}</span>`; }
    async function run(action) {
        if (state.busy) return;
        state.busy = true;
        const controls = [...host.querySelectorAll(`button,input,select,textarea`)];
        const disabled = controls.map(control => control.disabled);
        controls.forEach(control => control.disabled = true);
        try { await action(); } catch (error) { notify(error.message || `تعذر إتمام العملية`, `error`); }
        finally { state.busy = false; controls.forEach((control, index) => { if (control.isConnected) control.disabled = disabled[index]; }); updateSummary(); }
    }
    function stats(items) { return `<div class="fc-stats">${items.map(([label, value]) => `<article class="fc-stat"><span>${escape(label)}</span><b>${escape(value)}</b></article>`).join(``)}</div>`; }
    function toolbar() { return `<div class="fc-toolbar"><input id="fcSearch" type="search" placeholder="ابحث باسم الصيدلية أو كودها" aria-label="البحث" value="${escape(state.filter)}"><select id="fcFilter" aria-label="تصفية النتائج">${(team || admin ? [[`all`, `كل المندوبين`], [`empty`, `لم يبدأ`], [`partial`, `حفظ جزئي`], [`confirmed`, `مؤكد`]] : [[`all`, `كل الصيدليات`], [`missing`, `غير المعبأة فقط`]]).map(([value, label]) => `<option value="${value}" ${state.status === value ? `selected` : ``}>${label}</option>`).join(``)}</select><button id="fcRefresh" type="button" class="secondary">تحديث</button>${team || admin ? `<button id="fcDownload" type="button" class="secondary">تصدير المعروض</button>` : ``}</div>`; }
    function bindToolbar() {
        $(`fcSearch`)?.addEventListener(`input`, event => { state.filter = event.target.value; renderTable(); });
        $(`fcFilter`)?.addEventListener(`change`, event => { state.status = event.target.value; if (team || admin) renderTeam(); else renderTable(); });
        $(`fcRefresh`)?.addEventListener(`click`, () => { if (state.dirty && !confirm(`يوجد تعديل غير محفوظ. تحديث الصفحة يفقد هذه التعديلات. المتابعة؟`)) return; run(load); });
        $(`fcDownload`)?.addEventListener(`click`, download);
    }
    async function load() {
        const request = ++state.request;
        state.config = await api.loadConfig();
        if (!state.month) state.month = state.config.activeMonth;
        $(`fcMonth`).value = state.month;
        if (!validMonth(state.month)) throw new Error(`الشهر المختار غير صالح`);
        const dataset = await api.loadDataset(state.month);
        if (request !== state.request) return;
        state.dataset = dataset;
        if (!dataset.sales) {
            $(`fcContent`).innerHTML = `<div class="fc-panel fc-empty">لم يتم رفع ملف مبيعات سنة ${escape(state.month.slice(0, 4))}. ${admin ? `عاين الملف المرفق ثم اعتمده.` : `يرجى مراجعة الإدارة.`}</div>`;
            if (admin) syncAdminControls(); return;
        }
        const ids = [...new Set((team || admin ? selectedRows() : representativeRows()).map(row => row.repId))];
        state.docs = await api.loadTeamForecasts(state.month, ids);
        if (request !== state.request) return;
        state.dirty = false; state.invalid.clear(); state.rawInputs.clear();
        if (admin) { state.permits = await api.loadPermits(state.month, ids); syncAdminControls(); }
        if (mode === `tracking`) {
            const orders = await api.loadOrders();
            if (request !== state.request) return;
            state.orders = invoiceTotals(orders, state.month);
            if (state.orders.missingDates || state.orders.missingCodes) notify(`استبعدت ${state.orders.missingDates} طلبية مفوترة بلا تاريخ سحب موثوق، و${state.orders.missingCodes} طلبية بلا كود. لا يستخدم تاريخ إنشاء الطلبية كبديل.`, `warn`);
        }
        if (team || admin) renderTeam(); else renderRep();
        if (!admin && [...dataset.conflicts.values()].some(routes => routes.some(route => mode === `rep` ? route.repId === acting.repId : normalizeName(route.supervisor) === normalizeName(acting.admin.name)))) notify(`يوجد كود مرتبط بأكثر من مندوب. هذه الأكواد مستبعدة مؤقتا وتحتاج تصحيح الإدارة قبل التأكيد.`, `error`);
    }
    function renderRep() {
        state.entries = structuredClone(currentDocument().entries || {});
        const rows = representativeRows();
        $(`fcContent`).innerHTML = `${stats([[`الصيدليات المطلوبة`, rows.length], [`تم تعبئتها`, `0`], [`إجمالي التوقع / دينار`, `0.00`], [`حالة التوقع`, `—`]])}<section class="fc-panel" style="margin-top:16px">${toolbar()}<p class="fc-muted">أدخل صافي مبيعات ${escape(monthLabel(state.month))} المتوقع بالدينار. الصفر مقبول، والفراغ يمنع التأكيد. الملاحظة اختيارية.</p><div id="fcTableHost"></div></section><div class="fc-savebar fc-foot" style="margin-top:14px"><div id="fcSavedStatus" class="fc-muted"></div><div class="fc-toolbar"><button id="fcSave" type="button" class="secondary">حفظ جزئي</button><button id="fcConfirm" type="button">تأكيد جميع التوقعات</button></div></div>`;
        bindToolbar(); $(`fcSave`).onclick = () => save(false); $(`fcConfirm`).onclick = () => save(true); renderTable(); updateSummary();
    }
    function updateSummary() {
        if (mode !== `rep` || !state.dataset || !$(`fcSave`)) return;
        const rows = representativeRows(), doc = currentDocument();
        const p = progress({ ...doc, entries: state.entries }, rows);
        const figures = host.querySelectorAll(`.fc-stat b`);
        if (figures.length === 4) { figures[1].textContent = p.filled; figures[2].textContent = money(p.totalCents); figures[3].textContent = doc.status === `confirmed` ? `مؤكد` : state.month !== state.config.activeMonth ? `شهر سابق` : `مسودة`; }
        const locked = doc.status === `confirmed` || state.month !== state.config.activeMonth || !rows.length;
        $(`fcSave`).disabled = locked || state.busy;
        $(`fcConfirm`).disabled = locked || state.busy || p.filled !== rows.length || state.invalid.size > 0;
        $(`fcSavedStatus`).textContent = state.dirty ? `تعديلات غير محفوظة` : doc.updatedAt ? `آخر حفظ: ${dateText(doc.updatedAt)}` : `لم تحفظ التوقعات بعد`;
        $(`fcSavedStatus`).classList.toggle(`fc-dirty`, state.dirty);
        if (doc.status === `confirmed`) $(`fcSavedStatus`).textContent = p.confirmed ? `تم التأكيد. إعادة الفتح للأدمن فقط.` : `تغيرت قائمة الصيدليات بعد التأكيد. اطلب من الأدمن إعادة فتح التوقع لاستكمالها.`;
    }
    function visibleRows() {
        const base = team || admin ? (state.selected ? groupRows(state.selected) : []) : representativeRows();
        const search = normalizeName(state.filter);
        return base.filter(row => (!search || normalizeName(`${row.pharmacyName} ${row.salesName} ${row.code}`).includes(search)) && (state.status !== `missing` || !Number.isSafeInteger(state.entries[row.code]?.amount)));
    }
    function renderTable() {
        const target = $(`fcTableHost`); if (!target) return;
        const rows = visibleRows();
        if (!rows.length) { target.innerHTML = `<div class="fc-empty">لا توجد صيدليات مطابقة.</div>`; return; }
        const tracking = mode === `tracking`;
        const months = (state.dataset.sales.months || []).filter(month => month < Number(state.month.slice(5)));
        const locked = team || admin || currentDocument().status === `confirmed` || state.month !== state.config.activeMonth;
        const labels = tracking ? [`الصيدلية / الكود`, `التوقع`, `المفوتر`, `المتبقي`, `التحقيق`, `عدد الطلبيات`, `المبيعات الفعلية المرفوعة`, `الملاحظة`] : [`الصيدلية / الكود`, ...months.map(month => MONTH_NAMES[month - 1]), `توقع ${monthLabel(state.month)}`, `الملاحظة`];
        target.innerHTML = `<div class="fc-table-wrap" tabindex="0" aria-label="جدول الصيدليات"><table class="fc-table ${tracking ? `fc-tracking-table` : ``}"><thead><tr>${labels.map((label, i) => `<th class="${i === 0 ? `fc-name` : !tracking && i === labels.length - 2 ? `fc-input-cell` : ``}">${escape(label)}</th>`).join(``)}</tr></thead><tbody>${rows.map(row => {
            const doc = team || admin ? documentFor(row.repId) : { entries: state.entries }, entry = doc.entries?.[row.code] || {};
            let cells;
            if (tracking) {
                const actual = state.orders?.totals.get(row.code) || { amount: 0, count: 0 };
                const valid = Number.isSafeInteger(entry.amount), remaining = valid ? Math.max(0, entry.amount - actual.amount) : null;
                const achievement = valid && entry.amount > 0 ? `${(actual.amount / entry.amount * 100).toFixed(1)}%` : `—`;
                cells = [money(entry.amount), money(actual.amount), money(remaining), achievement, String(actual.count), money(row.months[String(Number(state.month.slice(5)))]), escape(entry.note || `—`)];
            } else {
                cells = [...months.map(month => money(row.months[String(month)])), locked ? `<b class="fc-total-highlight fc-numeric">${money(entry.amount)}</b>` : `<input class="fc-input ${state.invalid.has(row.code) ? `fc-invalid` : ``}" data-code="${row.code}" type="text" inputmode="decimal" autocomplete="off" placeholder="غير معبأ" value="${escape(state.rawInputs.has(row.code) ? state.rawInputs.get(row.code) : amountText(entry.amount))}" aria-label="توقع ${escape(row.pharmacyName)}">`, locked ? escape(entry.note || `—`) : `<textarea data-note="${row.code}" maxlength="1000" aria-label="ملاحظة ${escape(row.pharmacyName)}" placeholder="ملاحظة اختيارية">${escape(entry.note || ``)}</textarea>`];
            }
            return `<tr><td class="fc-name"><b>${escape(row.pharmacyName || row.salesName)}</b><span class="fc-code">${escape(row.code)}</span></td>${cells.map((cell, i) => `<td data-label="${escape(labels[i + 1])}" class="${!tracking && i === cells.length - 2 ? `fc-input-cell` : i === cells.length - 1 ? locked ? `fc-note` : `fc-note-cell` : `fc-history fc-numeric`}">${cell}</td>`).join(``)}</tr>`;
        }).join(``)}</tbody></table></div>`;
        target.querySelectorAll(`[data-code]`).forEach(input => input.addEventListener(`input`, () => {
            const code = input.dataset.code, entry = state.entries[code] || { amount: null, note: `` };
            state.rawInputs.set(code, input.value);
            try { entry.amount = forecastValue(input.value); state.invalid.delete(code); input.classList.remove(`fc-invalid`); input.removeAttribute(`title`); }
            catch (error) { entry.amount = null; state.invalid.add(code); input.classList.add(`fc-invalid`); input.title = error.message; }
            state.entries[code] = entry; state.dirty = true; updateSummary();
        }));
        target.querySelectorAll(`[data-note]`).forEach(input => input.addEventListener(`input`, () => {
            const code = input.dataset.note; state.entries[code] = { amount: null, ...(state.entries[code] || {}), note: input.value }; state.dirty = true; updateSummary();
        }));
    }
    function save(confirmAll) {
        if (state.invalid.size) { notify(`صحح القيم غير الصالحة قبل الحفظ.`, `error`); return; }
        if (confirmAll && !confirm(`تأكيد توقعات ${monthLabel(state.month)} لجميع الصيدليات؟ لا يمكن تعديلها بعدها إلا بإعادة فتح من الأدمن.`)) return;
        run(async () => {
            const saved = await api.saveForecast(state.month, acting.repId, state.entries, currentDocument().revision || 0, confirmAll);
            state.docs.set(acting.repId, saved); state.dirty = false; state.invalid.clear(); state.rawInputs.clear(); renderRep();
            notify(confirmAll ? `تم تأكيد جميع التوقعات. يمكنك الآن إدخال الطلبيات.` : `تم حفظ التوقعات جزئيا. أكمل الصيدليات المتبقية ثم أكدها.`);
        });
    }
    function renderTeam() {
        const rows = selectedRows();
        const ids = [...new Set(rows.map(row => row.repId))];
        const displayed = ids.filter(id => state.status === `all` || rowStatus(id) === state.status);
        if (!displayed.includes(state.selected)) state.selected = displayed[0] || ``;
        const totalForecast = rows.reduce((sum, row) => sum + (documentFor(row.repId).entries?.[row.code]?.amount ?? 0), 0);
        const actual = mode === `tracking` ? rows.reduce((sum, row) => sum + (state.orders?.totals.get(row.code)?.amount || 0), 0) : null;
        $(`fcContent`).innerHTML = `${stats([[`مندوبو ${team ? `فريقي` : `النظام`}`, ids.length], [`أكدوا التوقعات`, ids.filter(id => rowStatus(id) === `confirmed`).length], [`إجمالي التوقع / دينار`, money(totalForecast)], [mode === `tracking` ? `المفوتر / دينار` : `لم يؤكدوا`, mode === `tracking` ? money(actual) : ids.filter(id => rowStatus(id) !== `confirmed`).length]])}<section class="fc-panel" style="margin-top:16px">${toolbar()}<p class="fc-muted">${mode === `tracking` ? `المفوتر يحسب بتاريخ سحب قسم الطلبيات بتوقيت عمّان. المبيعات الفعلية تعتمد حصرا على الملف الشهري المرفوع.` : `الحالة تعتمد على تأكيد جميع صيدليات المندوب، والحفظ الجزئي ظاهر للمتابعة.`}</p><div id="fcTeamCards" class="fc-team">${displayed.map(id => {
            const owned = groupRows(id), names = [...new Set(owned.map(row => row.repName))];
            const doc = documentFor(id), filled = owned.filter(row => Number.isSafeInteger(doc.entries?.[row.code]?.amount)).length;
            const total = owned.reduce((sum, row) => sum + (doc.entries?.[row.code]?.amount ?? 0), 0);
            return `<button type="button" class="fc-team-card ${state.selected === id ? `active` : ``}" data-rep="${escape(id)}"><strong>${escape(names.join(` / `))}</strong>${statusBadge(id)}<span class="fc-muted">${filled} / ${owned.length} صيدلية • <span class="fc-numeric">${money(total)}</span> دينار</span><div class="fc-progress"><div style="width:${owned.length ? filled / owned.length * 100 : 0}%"></div></div><span class="fc-muted">${doc.updatedAt ? `آخر حفظ: ${dateText(doc.updatedAt)}` : `لا يوجد حفظ بعد`}</span></button>`;
        }).join(``) || `<div class="fc-empty">لا توجد نتائج.</div>`}</div><div id="fcRepAdmin"></div><h2 style="margin-top:24px" id="fcDetailTitle"></h2><div id="fcTableHost"></div></section>${admin ? `<section class="fc-panel" style="margin-top:16px"><h2>مطابقة الأكواد مع النظام</h2><div id="fcCoverage"></div></section>` : ``}`;
        bindToolbar();
        host.querySelectorAll(`[data-rep]`).forEach(button => button.addEventListener(`click`, () => { state.selected = button.dataset.rep; renderTeam(); }));
        $(`fcDetailTitle`).textContent = state.selected ? `صيدليات ${[...new Set(groupRows(state.selected).map(row => row.repName))].join(` / `)}` : ``;
        if (admin) { renderAdminActions(); renderCoverage(); }
        renderTable();
    }
    function renderAdminActions() {
        if (!state.selected) return;
        const id = state.selected, document = documentFor(id), permission = state.permits.get(id);
        const expiry = permission?.grantedAt && !permission.revoked ? new Date(dateValue(permission.grantedAt).getTime() + permission.hours * 3600000) : null;
        $(`fcRepAdmin`).innerHTML = `<div class="fc-report"><b>إدارة المندوب المختار</b><div class="fc-fields"><label class="fc-field">سبب إعادة فتح التوقع<input id="fcReopenReason" type="text" maxlength="500"></label><label class="fc-field">مدة السماح بإدخال الطلبات / ساعات<input id="fcHours" type="number" step="0.25" min="0.25" max="720" value="2"></label></div><div class="fc-admin-actions"><button id="fcReopen" type="button" ${document.status !== `confirmed` ? `disabled` : ``}>إعادة فتح التوقع</button><button id="fcPermit" type="button">منح مهلة مؤقتة</button><button id="fcRevoke" type="button" class="secondary">إلغاء المهلة</button></div><div class="fc-permit">${expiry ? `نهاية المهلة بتوقيت عمّان: ${dateText(expiry)}` : `لا توجد مهلة مفعلة`}</div></div>`;
        $(`fcReopen`).onclick = () => run(async () => { await api.reopenForecast(state.month, id, $(`fcReopenReason`).value); await load(); notify(`أعيد فتح التوقع مع الاحتفاظ بالقيم السابقة وتسجيل السبب.`); });
        $(`fcPermit`).onclick = () => run(async () => { await api.grantPermit(state.month, id, Number($(`fcHours`).value)); await load(); notify(`تم منح مهلة مؤقتة للمندوب. تنتهي تلقائيا حسب وقت الخادم.`); });
        $(`fcRevoke`).onclick = () => run(async () => { await api.revokePermit(state.month, id); await load(); notify(`تم إلغاء المهلة.`); });
    }
    function renderCoverage() {
        const sales = state.dataset.sales;
        const unmatched = Object.keys(sales.customers).filter(code => !state.dataset.routes.has(code));
        $(`fcCoverage`).innerHTML = `<p>أكواد الملف: ${Object.keys(sales.customers).length} • مرتبطة: ${state.dataset.rows.length} • غير مرتبطة أو متعارضة: ${unmatched.length}</p>${unmatched.length ? `<div class="fc-report"><ul>${unmatched.slice(0, 100).map(code => `<li><span dir="ltr">${code}</span> — ${escape(sales.customers[code].name)} ${state.dataset.conflicts.has(code) ? `(تعارض بين المندوبين)` : `(غير مرتبط بمندوب معروف)`}</li>`).join(``)}</ul>${unmatched.length > 100 ? `<p>يعرض أول 100 كود. نزّل القائمة الكاملة لفحص الباقي.</p>` : ``}</div><button id="fcDownloadUnmatched" type="button" class="secondary">تنزيل الأكواد غير المرتبطة</button>` : `<p class="fc-muted">جميع أكواد الملف مرتبطة بمندوبي النظام.</p>`}`;
        $(`fcDownloadUnmatched`)?.addEventListener(`click`, () => exportWorkbook(unmatched.map(code => ({ [`Cust No`]: code, [`Cust Name`]: sales.customers[code].name, [`المشكلة`]: state.dataset.conflicts.has(code) ? `تعارض ربط` : `غير مرتبط` })), `Forecast_Unmatched_Codes.xlsx`));
    }
    function exportWorkbook(rows, name) {
        if (!globalThis.XLSX) { notify(`تعذر تحميل مكتبة التصدير. أعد فتح الصفحة.`, `error`); return; }
        const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(rows);
        sheet[`!cols`] = Object.keys(rows[0] || {}).map((_, index) => ({ wch: index === 1 ? 40 : 20 }));
        XLSX.utils.book_append_sheet(workbook, sheet, `Forecast`); XLSX.writeFile(workbook, name);
    }
    function download() {
        const data = visibleRows().map(row => {
            const entry = documentFor(row.repId).entries?.[row.code] || {};
            const result = { [`Cust No`]: row.code, [`Cust Name`]: row.pharmacyName || row.salesName, [`المندوب`]: row.repName, [`حالة التوقع`]: rowStatus(row.repId), [`التوقع`]: entry.amount === null || entry.amount === undefined ? `` : entry.amount / 100, [`الملاحظة`]: entry.note || `` };
            if (mode === `tracking`) { result[`المفوتر`] = (state.orders?.totals.get(row.code)?.amount || 0) / 100; result[`المبيعات الفعلية`] = row.months[String(Number(state.month.slice(5)))] === undefined ? `` : row.months[String(Number(state.month.slice(5)))] / 100; }
            else for (const month of state.dataset.sales.months || []) if (month < Number(state.month.slice(5))) result[MONTH_NAMES[month - 1]] = row.months[String(month)] === undefined ? `` : row.months[String(month)] / 100;
            return result;
        });
        if (!data.length) return notify(`لا توجد بيانات معروضة للتصدير.`, `warn`);
        exportWorkbook(data, `Forecast_${state.month}.xlsx`);
    }
    function syncAdminControls() {
        $(`fcYear`).value ||= state.month.slice(0, 4); $(`fcActiveMonth`).value = state.config.activeMonth; $(`fcEnforce`).value = state.config.enabled ? `yes` : `no`;
    }
    async function previewImport(matrix, filename, year) {
        const parsed = parseSalesRows(matrix);
        const reference = await api.loadDataset(`${year}-01`);
        const unmatched = Object.keys(parsed.customers).filter(code => !reference.routes.has(code));
        state.pending = { parsed, filename, year };
        $(`fcImportPreview`).hidden = false;
        $(`fcImportPreview`).textContent = `تم فحص ${parsed.count} صيدلية، من يناير إلى ${MONTH_NAMES[parsed.months.at(-1) - 1]} ${year}. أكواد غير مرتبطة أو متعارضة: ${unmatched.length}. لم يتم حفظ أي تغيير بعد.`;
        $(`fcImport`).hidden = false;
        if (unmatched.length) { const list = document.createElement(`ul`); for (const code of unmatched.slice(0, 25)) { const item = document.createElement(`li`); item.textContent = `${code} — ${parsed.customers[code].name}`; list.append(item); } $(`fcImportPreview`).append(list); }
    }
    if (admin) {
        $(`fcContent`).hidden = true;
        $(`fcAdminLogin`).onsubmit = event => { event.preventDefault(); run(async () => { const password = $(`fcAdminPassword`).value; $(`fcAdminPassword`).value = ``; await api.unlockAdmin(password); state.admin = true; $(`fcAdminGate`).hidden = true; $(`fcAdminControls`).hidden = false; $(`fcContent`).hidden = false; await load(); }); };
        $(`fcAttached`).onclick = () => run(async () => { const baseline = await api.attachedBaseline(); $(`fcYear`).value = baseline.year; await previewImport(baseline.matrix, baseline.filename, String(baseline.year)); });
        $(`fcUpload`).onchange = () => { state.pending = null; $(`fcImport`).hidden = true; $(`fcImportPreview`).hidden = true; const file = $(`fcUpload`).files[0]; if (!file) return; run(async () => { if (!globalThis.XLSX) throw new Error(`تعذر تحميل مكتبة قراءة Excel`); const workbook = XLSX.read(await file.arrayBuffer(), { type: `array` }); if (workbook.SheetNames.length !== 1) throw new Error(`استخدم ملف مبيعات بورقة واحدة فقط`); await previewImport(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null, raw: true }), file.name, $(`fcYear`).value); }); };
        $(`fcYear`).onchange = () => { state.pending = null; $(`fcImport`).hidden = true; $(`fcImportPreview`).hidden = true; $(`fcUpload`).value = ``; };
        $(`fcImport`).onclick = () => run(async () => { if (!state.pending) return; const { parsed, year, filename } = state.pending; if (!confirm(`اعتماد مبيعات ${parsed.count} صيدلية لسنة ${year} وتحديث الأشهر الموجودة بالملف؟`)) return; await api.importSales(parsed, year, filename); state.pending = null; $(`fcImport`).hidden = true; $(`fcUpload`).value = ``; await load(); notify(`تم اعتماد المبيعات. اختر شهر التعبئة ثم احفظ إعداد الشهر لتفعيل المنع.`); });
        $(`fcConfigSave`).onclick = () => run(async () => { const month = $(`fcActiveMonth`).value; await api.saveConfig(month, $(`fcEnforce`).value === `yes`); state.month = month; await load(); notify(`تم حفظ إعداد ${monthLabel(month)}.`); });
        $(`fcAdminLock`).onclick = () => { api.lockAdmin(); state.admin = false; state.pending = null; $(`fcAdminGate`).hidden = false; $(`fcAdminControls`).hidden = true; $(`fcContent`).hidden = true; };
    }
    $(`fcMonth`).onchange = () => { if (state.busy) { $(`fcMonth`).value = state.month; return; } if (state.dirty && !confirm(`يوجد تعديل غير محفوظ. تغيير الشهر يفقد هذه التعديلات. المتابعة؟`)) { $(`fcMonth`).value = state.month; return; } state.month = $(`fcMonth`).value; if (!admin || state.admin) run(load); };
    window.addEventListener(`beforeunload`, event => { if (state.dirty) { event.preventDefault(); event.returnValue = ``; } });
    if (!admin) await run(load);
    else { state.config = await api.loadConfig(); state.month = state.config.activeMonth; $(`fcMonth`).value = state.month; }
}
