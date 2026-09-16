const VAPID_PUBLIC_KEY = `BDKdgrn3Z9nYEs6ZlD_IofwG7Ors1VorIfpIkx3JmuJtlhmuveILrQvNM5PkWiRkjFDgKRxEX4jRy8yi5ZPPoC4`;

const USERS = [
    { key: `hamza_shbatee`, name: `حمزة الشبيطي`, role: `المراقب المالي`, target: `finance_controller.html` },
    { key: `ziad_hourany`, name: `زياد الحوراني`, role: `قسم الطلبيات`, target: `orders_staff.html` },
    { key: `zakaria`, name: `زكريا`, role: `قسم الطلبيات`, target: `orders_staff.html` },
    { key: `mohammad_amira`, name: `محمد عميرة`, role: `مدير السوق`, target: `market_manager.html` },
    { key: `abdallah_alnatour`, name: `عبدالله الناطور`, role: `مشرف مبيعات`, target: `supervisor.html` },
    { key: `mohammad_tawalbeh`, name: `محمد طوالبة`, role: `مشرف مبيعات`, target: `supervisor.html` }
];

function urlBase64ToUint8Array(value) {
    const padding = `=`.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, `+`).replace(/_/g, `/`);
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function endpointId(endpoint) {
    const digest = await crypto.subtle.digest(`SHA-256`, new TextEncoder().encode(endpoint));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/g, ``);
}

async function savePushSubscription(user, subscription) {
    const firebase = await import(`./firebase.js`);
    const { db, collection, doc, setDoc } = firebase;

    const json = subscription.toJSON();
    const id = await endpointId(subscription.endpoint);
    await setDoc(doc(collection(db, `push_subscriptions`), id), {
        userKey: user.key,
        userName: user.name,
        role: user.role,
        target: user.target,
        endpoint: json.endpoint,
        keys: json.keys || {},
        active: true,
        updatedAt: new Date()
    }, { merge: true });
}

async function registerPushForUser(userKey) {
    const user = USERS.find(item => item.key === userKey);
    if (!user) throw new Error(`المستخدم غير معروف.`);
    if (!(`serviceWorker` in navigator) || !(`PushManager` in window) || !(`Notification` in window)) {
        throw new Error(`هذا المتصفح لا يدعم إشعارات Web Push.`);
    }

    const permission = await Notification.requestPermission();
    if (permission !== `granted`) throw new Error(`يجب السماح بالإشعارات من إعدادات المتصفح.`);

    const registration = await navigator.serviceWorker.register(`./push-sw.js`, { scope: `./` });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
    }

    await savePushSubscription(user, subscription);

    localStorage.setItem(`dad_push_user_key`, user.key);
    localStorage.setItem(`dad_push_enabled`, `1`);
    return user;
}

async function getPushStatus() {
    if (!(`serviceWorker` in navigator) || !(`PushManager` in window) || !(`Notification` in window)) {
        return { supported: false, enabled: false, permission: `unsupported`, userKey: `` };
    }

    const registration = await navigator.serviceWorker.getRegistration(`./`);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    return {
        supported: true,
        enabled: Boolean(subscription && Notification.permission === `granted`),
        permission: Notification.permission,
        userKey: localStorage.getItem(`dad_push_user_key`) || ``
    };
}

async function sendLocalTestNotification(userKey) {
    const user = USERS.find(item => item.key === userKey);
    if (!user) throw new Error(`اختر المستخدم أولاً.`);
    if (!(`Notification` in window)) throw new Error(`المتصفح لا يدعم الإشعارات.`);

    let permission = Notification.permission;
    if (permission !== `granted`) permission = await Notification.requestPermission();
    if (permission !== `granted`) throw new Error(`يجب السماح بالإشعارات من إعدادات المتصفح.`);

    const targetUrl = new URL(user.target, window.location.href).href;
    const title = `نظام الطلبيات - إشعار تجريبي`;
    const body = `تجربة ناجحة يا ${user.name}. هذا هو شكل إشعار الطلبيات الجديدة التي تحتاج إجراء منك.`;
    const tag = `orders-push-test-${Date.now()}`;
    const options = {
        body,
        icon: new URL(`../favicon.ico`, import.meta.url).href,
        badge: new URL(`../favicon.ico`, import.meta.url).href,
        tag,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        data: { url: targetUrl }
    };

    try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
            window.focus();
            window.location.href = targetUrl;
            notification.close();
        };
        return { method: `window-notification` };
    } catch (directError) {
        console.warn(`Direct notification failed, using service worker fallback.`, directError);
        if (!(`serviceWorker` in navigator)) throw directError;
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, options);
        return { method: `service-worker` };
    }
}

export { USERS, registerPushForUser, getPushStatus, sendLocalTestNotification };
