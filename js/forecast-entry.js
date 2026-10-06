import { session, checkOrderGate, errorMessage } from './forecast-store.js?v=20261006_forecast2';
const context = session();
if (document.body.dataset.page === `order` && context.repId && sessionStorage.getItem(`adminOrderMode`) !== `1`) {
    const panel = document.createElement(`div`);
    panel.style.cssText = `margin:12px;padding:16px;border-radius:16px;background:#fff8e8;border:1px solid #eddfbb;color:#7a5b18;font-family:Tahoma;line-height:1.8`;
    panel.hidden = true;
    const message = document.createElement(`p`); message.style.margin = `0 0 10px`;
    const link = document.createElement(`a`); link.href = `forecast.html`; link.textContent = `تعبئة وتأكيد التوقعات`;
    link.style.cssText = `display:inline-block;background:#099999;color:white;padding:8px 16px;border-radius:10px;text-decoration:none`;
    panel.append(message, link); document.getElementById(`mainTabs`)?.after(panel);
    let checking = false;
    let lastCheck = 0;
    async function refresh() {
        if (checking || Date.now() - lastCheck < 30000) return;
        checking = true;
        lastCheck = Date.now();
        try { const gate = await checkOrderGate(context.repId); panel.hidden = gate.allowed; message.textContent = gate.allowed ? `` : `قبل إدخال طلبية، أكد توقعات ${gate.month} لكل صيدلياتك. تم تعبئة ${gate.filled} من ${gate.total}.`; }
        catch (error) { panel.hidden = false; message.textContent = errorMessage(error); }
        finally { checking = false; }
    }
    refresh();
    window.addEventListener(`forecast:blocked`, refresh);
    window.addEventListener(`pageshow`, refresh);
    window.addEventListener(`online`, refresh);
    document.addEventListener(`visibilitychange`, () => { if (!document.hidden) refresh(); });
}
