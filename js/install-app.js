(() => {
    document.body.insertAdjacentHTML(`beforeend`, `
        <button class="install-app-fab" id="installAppFab" type="button" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>
            </svg>
            <span lang="en" dir="ltr">Install App</span>
        </button>
        <dialog class="install-app-help" id="installAppHelp" dir="rtl" aria-labelledby="installAppHelpTitle">
            <h2 id="installAppHelpTitle">تثبيت التطبيق</h2>
            <p>افتح الصفحة في Safari، ثم من قائمة المشاركة اختار «إضافة إلى الشاشة الرئيسية» واضغط «إضافة»</p>
            <form method="dialog"><button type="submit" autofocus>تمام</button></form>
        </dialog>
    `);

    const button = document.getElementById(`installAppFab`);
    const help = document.getElementById(`installAppHelp`);
    const userAgent = navigator.userAgent;
    const touchPoints = navigator.maxTouchPoints;
    const appleMobile = /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
    const mobileAgent = appleMobile || /Android/i.test(userAgent);
    const touchInput = window.matchMedia(`(pointer: coarse)`);
    const standalone = window.matchMedia(`(display-mode: standalone)`);
    const canShowInstall = () => mobileAgent || (touchPoints > 0 && touchInput.matches);
    let installPrompt = null;
    let installed = false;

    function render() {
        const runningAsApp = standalone.matches || navigator.standalone === true;
        button.hidden = !canShowInstall() || runningAsApp || installed || (!installPrompt && !appleMobile);
        if (button.hidden && help.open) help.close();
    }

    window.addEventListener(`beforeinstallprompt`, event => {
        if (!canShowInstall()) return;
        event.preventDefault();
        installPrompt = event;
        render();
    });

    window.addEventListener(`appinstalled`, () => {
        installed = true;
        installPrompt = null;
        render();
    });

    button.addEventListener(`click`, async () => {
        if (!installPrompt) {
            if (appleMobile && !help.open) help.showModal();
            return;
        }
        const prompt = installPrompt;
        installPrompt = null;
        button.disabled = true;
        try {
            const result = await prompt.prompt();
            installed = installed || result?.outcome === `accepted`;
        } catch (error) {
            console.warn(`تعذر فتح نافذة تثبيت التطبيق`, error);
        } finally {
            button.disabled = false;
            render();
        }
    });

    standalone.addEventListener(`change`, render);
    touchInput.addEventListener(`change`, render);
    window.addEventListener(`pageshow`, render);
    render();

    if (canShowInstall() && `serviceWorker` in navigator) {
        navigator.serviceWorker.getRegistration(`./`).then(registration =>
            registration || navigator.serviceWorker.register(`./push-sw.js?v=20260917_push_v3`, { scope: `./` })
        ).catch(error => console.warn(`تعذر تسجيل خدمة التطبيق`, error));
    }
})();
