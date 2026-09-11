const loaders = {
    manage: () => import(`./admin/manage.js?v=20260911`),
    overview: () => import(`./admin/overview.js?v=20260911`),
    assignments: () => import(`./admin/assignments.js?v=20260911`),
    areas: () => import(`./admin/areas.js?v=20260911`)
};
const titles = {manage: `إدارة الطلبيات`, overview: `لوحة القيادة`, assignments: `تغيير المشرف`, areas: `تدقيق المناطق`};
const pending = new Set();
async function loadTool(key) {
    const host = document.querySelector(`[data-tool-host="${key}"]`);
    if (!host || host.querySelector(`iframe`) || pending.has(key)) return;
    pending.add(key);
    host.textContent = `جاري فتح ${titles[key]}…`;
    try {
        const {default: source} = await loaders[key]();
        const frame = document.createElement(`iframe`);
        frame.title = titles[key];
        frame.className = `admin-tool-frame`;
        // Repository-owned HTML only. Isolated documents preserve existing tools' IDs and handlers.
        const base = new URL(`../`, import.meta.url).href;
        frame.srcdoc = source.replace(/<head>/i, `<head><base href="${base}" target="_parent">`);
        host.replaceChildren(frame);
    } catch (error) {
        host.textContent = `تعذر فتح الأداة. `;
        const retry = document.createElement(`button`);
        retry.type = `button`;
        retry.textContent = `إعادة المحاولة`;
        retry.addEventListener(`click`, () => loadTool(key));
        host.append(retry);
        console.error(error);
    } finally { pending.delete(key); }
}
let previousAuditView = null;
function activate() {
    const key = location.hash.slice(1);
    const audit = document.body.dataset.page === `audit`;
    if (audit) {
        const active = [`manage`, `overview`].includes(key) ? key : `log`;
        document.querySelectorAll(`[data-audit-view]`).forEach(panel => { panel.hidden = panel.dataset.auditView !== active; });
        document.querySelectorAll(`[data-hub-tab]`).forEach(tab => {
            tab.classList.toggle(`active`, tab.dataset.hubTab === active);
            tab.setAttribute(`aria-current`, tab.dataset.hubTab === active ? `page` : `false`);
        });
        for (const id of [`refreshBtn`, `exportAuditBtn`]) document.getElementById(id).hidden = active !== `log`;
        if (active !== `log`) loadTool(active);
        else if (previousAuditView && previousAuditView !== `log`) window.dispatchEvent(new Event(`audit:reload`));
        previousAuditView = active;
    } else {
        const target = document.querySelector(`[data-tool="${key}"]`);
        if (target) { target.click(); loadTool(key); }
    }
}
document.querySelectorAll(`.tab-button`).forEach(tab => tab.addEventListener(`click`, () => {
    if (tab.dataset.tool) {
        history.replaceState(null, ``, `#${tab.dataset.tool}`);
        loadTool(tab.dataset.tool);
    } else if (location.hash) history.replaceState(null, ``, location.pathname + location.search);
}));
window.addEventListener(`hashchange`, activate);
activate();
// Mobile editors use labelled cards; all original inputs and actions remain in place.
function labelRows() {
    document.querySelectorAll(`.settings-table`).forEach(table => {
        const labels = [...table.querySelectorAll(`thead th`)].map(th => th.textContent.trim());
        table.querySelectorAll(`tbody tr`).forEach(row => [...row.cells].forEach((cell, i) => {
            if (cell.colSpan === 1) cell.dataset.label = labels[i] || ``;
            cell.querySelectorAll(`input,select`).forEach(input => input.setAttribute(`aria-label`, labels[i] || `القيمة`));
        }));
    });
}
labelRows();
window.addEventListener(`admin:rows`, labelRows);
const observer = new MutationObserver(labelRows);
document.querySelectorAll(`.settings-table tbody`).forEach(body => observer.observe(body, {childList: true}));
