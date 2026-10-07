(() => {
    const currentVersion = `20261006-reads1`;
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
            if (typeof version !== `string` || !version || version === currentVersion) return;
            const url = new URL(location.href);
            // Cached HTML or scripts must never cause a second reload for the same release.
            if (url.searchParams.get(`appVersion`) === version) return;
            const reloadKey = `dad_version_reload:${url.pathname}`;
            try {
                if (sessionStorage.getItem(reloadKey) === version) return;
                sessionStorage.setItem(reloadKey, version);
            } catch (_) {
                // The URL marker still protects browsers that block session storage.
            }
            reloading = true;
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

