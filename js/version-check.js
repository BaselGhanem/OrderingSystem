(() => {
    const currentVersion = `20260923-2`;
    const versionUrl = new URL(`./version.json`, document.baseURI);
    let checking = false;
    let reloading = false;

    async function checkVersion() {
        if (checking || reloading || !navigator.onLine) return;
        checking = true;
        try {
            const response = await fetch(`${versionUrl.href}?t=${Date.now()}`, { cache: `no-store` });
            if (!response.ok) return;
            const { version } = await response.json();
            if (!version || version === currentVersion) return;
            reloading = true;
            const url = new URL(location.href);
            url.searchParams.set(`appVersion`, version);
            location.replace(url.href);
        } catch (error) {
            // A temporary connection failure should never interrupt the page.
        } finally {
            checking = false;
        }
    }

    checkVersion();
    window.addEventListener(`pageshow`, checkVersion);
    document.addEventListener(`visibilitychange`, () => {
        if (document.visibilityState === `visible`) checkVersion();
    });
    window.addEventListener(`online`, checkVersion);
    setInterval(() => {
        if (document.visibilityState === `visible`) checkVersion();
    }, 60_000);
})();
