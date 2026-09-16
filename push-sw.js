const CACHE_VERSION = `orders-push-v1`;

self.addEventListener(`push`, event => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (error) {
        payload = { body: event.data?.text?.() || `لديك طلبيات جديدة بحاجة إلى إجراء.` };
    }

    const title = payload.title || `نظام الطلبيات`;
    const options = {
        body: payload.body || `لديك طلبيات جديدة بحاجة إلى إجراء.`,
        icon: `favicon.ico`,
        badge: `favicon.ico`,
        tag: payload.tag || `orders-action-required`,
        renotify: true,
        requireInteraction: true,
        data: {
            url: payload.url || `./login.html`,
            userKey: payload.userKey || ``,
            cacheVersion: CACHE_VERSION
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener(`notificationclick`, event => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || `./login.html`, self.location.origin).href;

    event.waitUntil((async () => {
        const clientsList = await clients.matchAll({ type: `window`, includeUncontrolled: true });
        for (const client of clientsList) {
            if (`focus` in client && new URL(client.url).origin === self.location.origin) {
                if (`navigate` in client) await client.navigate(targetUrl);
                return client.focus();
            }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
        return null;
    })());
});
