const {db, collection, getDocs, query, orderBy, documentId, limit, startAfter} = await import(`./firebase.js`);
const input = document.getElementById(`pharmacySearchInput`);
const matches = document.getElementById(`pharmacyMatches`);
const status = document.getElementById(`pharmacySearchStatus`);
const more = document.getElementById(`morePharmaciesBtn`);
const normalize = value => String(value ?? ``).normalize(`NFKC`).replace(/[\u064B-\u065F\u0670\u0640]/g, ``).replace(/[أإآ]/g, `ا`).toLocaleLowerCase().trim();
let generation = 0, timer, cursor = null, exhausted = false, queue = [], count = 0, busy = false;
function clearSelection() {
    document.getElementById(`pharmaciesTableBody`).innerHTML = `<tr><td colspan="7">اختر صيدلية من نتائج البحث لتعديلها.</td></tr>`;
}
function addMatch(row) {
    const button = document.createElement(`button`);
    button.type = `button`;
    button.className = `pharmacy-match`;
    const name = document.createElement(`strong`);
    name.textContent = row.name || `صيدلية بدون اسم`;
    const detail = document.createElement(`span`);
    detail.textContent = [row.pharmacyCode || row.pharmacy_code, row.area, row.repName].filter(Boolean).join(` · `);
    button.append(name, detail);
    button.addEventListener(`click`, () => {
        matches.querySelectorAll(`button`).forEach(item => item.classList.remove(`selected`));
        button.classList.add(`selected`);
        window.dispatchEvent(new CustomEvent(`pharmacies:select`, {detail: row}));
    });
    matches.append(button);
}
async function nextPage(token = generation) {
    if (busy || token !== generation || !normalize(input.value)) return;
    busy = true;
    more.disabled = true;
    status.textContent = `جاري البحث…`;
    const term = normalize(input.value);
    let added = 0;
    try {
        while (added < 20 && token === generation) {
            while (queue.length && added < 20) { addMatch(queue.shift()); added++; count++; }
            if (added === 20 || exhausted) break;
            const constraints = [orderBy(documentId()), limit(150)];
            if (cursor) constraints.push(startAfter(cursor));
            const snapshot = await getDocs(query(collection(db, `pharmacies`), ...constraints));
            if (token !== generation) return;
            cursor = snapshot.docs.at(-1) || cursor;
            exhausted = snapshot.size < 150;
            queue = snapshot.docs.map(item => ({...item.data(), id: item.id})).filter(row => normalize(row.name).includes(term));
        }
        if (token !== generation) return;
        status.textContent = count ? `${count} نتيجة مطابقة${exhausted && !queue.length ? `` : ` · تتوفر نتائج أخرى للبحث`}. اختر الصيدلية لتعديلها.` : `لا توجد صيدليات تحتوي على «${input.value.trim()}».`;
        more.hidden = exhausted && !queue.length;
    } catch (error) {
        if (token !== generation) return;
        status.textContent = `تعذر إكمال البحث. أعد المحاولة.`;
        more.hidden = false;
        console.error(error);
    } finally {
        if (token === generation) { busy = false; more.disabled = false; }
    }
}
function resetSearch(delay = 300) {
    clearTimeout(timer);
    generation++;
    busy = false;
    cursor = null;
    exhausted = false;
    queue = [];
    count = 0;
    matches.replaceChildren();
    more.hidden = true;
    clearSelection();
    const token = generation;
    if (!normalize(input.value)) {
        status.textContent = `ابدأ بكتابة اسم الصيدلية لعرض الخيارات المطابقة.`;
        return;
    }
    status.textContent = `جاري البحث…`;
    timer = setTimeout(() => nextPage(token), delay);
}
input.addEventListener(`input`, () => resetSearch());
input.addEventListener(`keydown`, event => {
    if (event.key === `ArrowDown`) { event.preventDefault(); matches.querySelector(`button`)?.focus(); }
});
matches.addEventListener(`keydown`, event => {
    if (![ `ArrowDown`, `ArrowUp` ].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...matches.querySelectorAll(`button`)];
    const i = buttons.indexOf(document.activeElement);
    if (event.key === `ArrowUp` && i <= 0) input.focus();
    else buttons[Math.min(buttons.length - 1, i + (event.key === `ArrowDown` ? 1 : -1))]?.focus();
});
more.addEventListener(`click`, () => nextPage());
window.addEventListener(`pharmacies:refresh`, () => resetSearch(0));
