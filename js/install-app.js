(() => {
    const button = document.getElementById(`installAppFab`);
    const help = document.getElementById(`installAppHelp`);
    if (!button || !help) return;

    const userAgent = navigator.userAgent;
    const touchPoints = navigator.maxTouchPoints;
    const iPad = /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
    const androidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
    const touchTablet = window.matchMedia(`(any-pointer: coarse) and (min-width: 600px)`);
    const standalone = window.matchMedia(`(display-mode: standalone)`);
    let installPrompt = null;
    let installed = false;

    function render() {
        const isTablet = iPad || androidTablet || (touchPoints > 0 && touchTablet.matches);
        const runningAsApp = standalone.matches || navigator.standalone === true;
        button.hidden = !isTablet || runningAsApp || installed || (!installPrompt && !iPad);
        if (button.hidden && help.open) help.close();
    }

    window.addEventListener(`beforeinstallprompt`, event => {
        if (!(iPad || androidTablet || (touchPoints > 0 && touchTablet.matches))) return;
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
            if (iPad && !help.open) help.showModal();
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
    touchTablet.addEventListener(`change`, render);
    window.addEventListener(`pageshow`, render);
    render();

    if (`serviceWorker` in navigator) {
        navigator.serviceWorker.getRegistration(`./`).then(registration =>
            registration || navigator.serviceWorker.register(`./push-sw.js?v=20260917_push_v3`, { scope: `./` })
        ).catch(error => console.warn(`تعذر تسجيل خدمة التطبيق`, error));
    }
})();
