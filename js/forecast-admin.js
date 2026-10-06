import { mountForecast } from './forecast-ui.js?v=20261006_forecast1';
const host = document.getElementById(`forecastAdminPanel`);
let loaded = false;
async function mount() {
    if (!host || loaded) return;
    loaded = true;
    try { await mountForecast(host, { mode: `admin` }); }
    catch (error) { host.textContent = `تعذر فتح إدارة التوقعات: ${error.message}`; loaded = false; }
}
document.querySelector(`[data-target="forecastAdminPanel"]`)?.addEventListener(`click`, mount);
if (location.hash === `forecast`) { document.querySelector(`[data-target="forecastAdminPanel"]`)?.click(); mount(); }
