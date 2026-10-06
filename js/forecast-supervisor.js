const sections = [`teamOrdersSection`, `teamFinanceRejectedSection`, `allOrdersSection`, `setTargetsSection`, `targetDashboardSection`, `supervisorReminderSection`, `forecastTeamSection`, `forecastTrackingSection`];
const modes = { forecastTeamSection: `team`, forecastTrackingSection: `tracking` };
document.querySelectorAll(`[data-target-section]`).forEach(button => button.addEventListener(`click`, () => {
    const id = button.dataset.targetSection;
    for (const extra of Object.keys(modes)) {
        const section = document.getElementById(extra);
        if (section && extra !== id) section.style.display = `none`;
    }
    if (!modes[id]) return;
    for (const sectionId of sections) {
        const section = document.getElementById(sectionId);
        if (section) section.style.display = sectionId === id ? `block` : `none`;
    }
    for (const dashboardId of [`advancedManagerDashboard`, `managerDateFilters`]) {
        const element = document.getElementById(dashboardId); if (element) element.style.display = `none`;
    }
    document.querySelectorAll(`.supervisor-premium-tabs .btn-subtab`).forEach(tab => tab.classList.toggle(`active`, tab === button));
    const section = document.getElementById(id);
    if (!section.querySelector(`iframe`)) {
        const frame = document.createElement(`iframe`); frame.src = `forecast.html?mode=${modes[id]}&v=20261006_reads1`;
        frame.title = modes[id] === `team` ? `توقعات فريقي` : `متابعة التوقع مقابل المفوتر`;
        frame.style.cssText = `display:block;width:100%;min-height:1100px;border:0;border-radius:20px;background:#f2f7f8`;
        section.append(frame);
    }
}));
