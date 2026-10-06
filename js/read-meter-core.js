// Local diagnostics only. Never reads snapshot data or sends telemetry.
export const PREFIX = `dad_read_meter_v1:`;
export function makeMeter(env = globalThis) {
    const page = () => {
        try { const url = new URL(env.location.href); const path = url.pathname.replace(/^\/OrderingSystem\//, ``) || `index.html`; const mode = url.searchParams.get(`mode`); return path + ([`team`,`tracking`].includes(mode) ? ` / ${mode}` : ``); } catch { return `embedded`; }
    };
    const record = { version: 1, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, page: page(), title: env.document?.title || ``, startedAt: Date.now(), updatedAt: Date.now(), rows: {} };
    if (record.page === `embedded` || record.page === `srcdoc`) { try { record.page = `${env.parent.location.pathname.replace(/^\/OrderingSystem\//, ``)} / ${record.title}`; } catch {} }
    let timer;
    const safe = action => { try { return action(); } catch {} };
    const persist = () => safe(() => env.localStorage.setItem(PREFIX + record.id, JSON.stringify(record)));
    function touch(row) { record.updatedAt = Date.now(); row.updatedAt = record.updatedAt; if (!timer) timer = env.setTimeout(() => { timer = null; persist(); }, 1000); }
    safe(() => {
        const keys = Array.from({ length: env.localStorage.length }, (_, i) => env.localStorage.key(i)).filter(key => key?.startsWith(PREFIX));
        keys.sort().reverse().forEach((key, index) => { const item = JSON.parse(env.localStorage.getItem(key)); if (index >= 120 || item.updatedAt < Date.now() - 7 * 86400000) env.localStorage.removeItem(key); });
    });
    function begin(operation, target) {
        const stack = new Error().stack || ``;
        const source = (stack.split(`\n`).find(line => /\.(js|html)(?:[?:]|$)/.test(line) && !/read-meter|firestore-meter/.test(line)) || `مصدر غير محدد`).replace(/.*(?:https?:\/\/[^/]+\/OrderingSystem\/)/, ``).replace(/\?.*?(?=:\d+:\d+\)?$)/, ``).trim().slice(0, 180);
        const scope = target?.path ? String(target.path).split(`/`)[0] : target?.type || `query`;
        const key = JSON.stringify([operation, scope, source]);
        const row = record.rows[key] ||= { operation, scope, source, requests: 0, serverDocs: 0, cacheDocs: 0, localDocs: 0, emptyResults: 0, events: 0, errors: 0, lastError: ``, active: 0, removed: 0 };
        row.requests++; touch(row); return row;
    }
    function result(row, snap, incremental = false) { safe(() => {
        row.events++;
        let count = typeof snap.size === `number` ? snap.size : snap.exists() ? 1 : 0;
        if (incremental && typeof snap.docChanges === `function`) {
            const changes = snap.docChanges(); row.removed += changes.filter(change => change.type === `removed`).length;
            count = changes.filter(change => change.type !== `removed`).length;
        }
        if (snap.metadata?.hasPendingWrites) row.localDocs += count;
        else if (snap.metadata?.fromCache) row.cacheDocs += count;
        else { row.serverDocs += count; if (!count && !incremental) row.emptyResults++; }
        touch(row);
    }); }
    const error = (row, err) => safe(() => { row.errors++; row.lastError = String(err?.code || `unknown`).slice(0, 80); touch(row); });
    function wrapRead(original, operation) { return async (...args) => {
        const row = begin(operation, args[0]);
        try { const snap = await original(...args); result(row, snap); return snap; } catch (err) { error(row, err); throw err; }
    }; }
    function wrapListen(original) { return (target, ...args) => {
        const row = begin(`onSnapshot`, target); let seenServer = false, active = true;
        row.active++; touch(row);
        const stop = () => { if (active) { active = false; row.active--; touch(row); } };
        const next = callback => snap => {
            result(row, snap, seenServer && !snap.metadata?.fromCache);
            if (!snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites) seenServer = true;
            return callback?.(snap);
        };
        const fail = callback => err => { error(row, err); stop(); return callback?.(err); };
        const callbackIndex = typeof args[0] === `function` || args[0]?.next || args[0]?.error || args[0]?.complete ? 0 : 1;
        const callback = args[callbackIndex];
        if (typeof callback === `function`) { args[callbackIndex] = next(callback); args[callbackIndex + 1] = fail(args[callbackIndex + 1]); }
        else { const observer = callback || {}; args[callbackIndex] = { ...observer, next: next(observer.next?.bind(observer)), error: fail(observer.error?.bind(observer)), complete: observer.complete?.bind(observer) }; }
        try { const unsubscribe = original(target, ...args); return () => { stop(); return unsubscribe(); }; } catch (err) { error(row, err); stop(); throw err; }
    }; }
    function wrapTransaction(original) { return (db, action, ...options) => original(db, tx => action(new Proxy(tx, { get(target, property) {
        if (property === `get`) return wrapRead(target.get.bind(target), `transaction.get`);
        const value = Reflect.get(target, property); return typeof value === `function` ? value.bind(target) : value;
    } })), ...options); }
    env.addEventListener?.(`pagehide`, persist);
    env.document?.addEventListener?.(`visibilitychange`, () => { if (env.document.hidden) persist(); });
    return { wrapRead, wrapListen, wrapTransaction, flush: persist, report: () => structuredClone(record) };
}
export const meter = makeMeter();
if (typeof window !== `undefined`) window.DADReadMeter = { flush: meter.flush, report: meter.report };
