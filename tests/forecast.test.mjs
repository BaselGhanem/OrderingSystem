import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as core from '../js/forecast-core.js';

assert.equal(core.codeKey(` 00100247 `), `100247`);
assert.equal(core.codeKey(100247), `100247`);
assert.equal(core.codeKey(`١٠٠٢٤٧.٠`), `100247`);
assert.equal(core.codeKey(`100247x`), ``);
assert.equal(core.forecastValue(``), null);
assert.equal(core.forecastValue(`0`), 0);
assert.equal(core.forecastValue(`٠`), 0);
assert.equal(core.forecastValue(`-3.67`), -367);
assert.throws(() => core.forecastValue(`1.001`));
assert.throws(() => core.forecastValue(`1abc`));
assert.throws(() => core.forecastValue(`1e3`));
assert.equal(core.cents(1316.0299999999997), 131603);
assert.equal(core.cents(-3.669999999999999), -367);
assert.equal(core.ammanMonth(new Date(`2026-09-30T21:00:00Z`)), `2026-10`);
assert.equal(core.ammanMonth(new Date(`2026-10-31T21:00:00Z`)), `2026-11`);
const matrix = [[`Cust No`, `Cust Name`, `Jan`, `Feb`], [1001, `اسم الملف`, 0, -3.67], [1002, `اسم آخر`, 123.456, 4.999]];
const parsed = core.parseSalesRows(matrix);
assert.equal(parsed.customers[`1001`].months[`2`], -367);
assert.equal(parsed.customers[`1002`].months[`1`], 12346);
assert.throws(() => core.parseSalesRows([...matrix, matrix[1]]), /مكرر/);
assert.throws(() => core.parseSalesRows([[`Cust No`, `Cust Name`, `Jan`], [1001, `a`, null]]), /فارغة/);
assert.throws(() => core.parseSalesRows([[`Cust No`, `Cust Name`, `Jan`, `Mar`], [1001, `a`, 0, 1]]), /متصلة/);
assert.throws(() => core.parseSalesRows([[`Cust No`, `Cust Name`, `Jan`, `January`], [1001, `a`, 1, 2]]), /غير معروف/);
const pharmacies = [
    { id: `p1`, pharmacyCode: `1001`, name: `اسم النظام المختلف`, rep_id: `r1`, supervisor: `مدير أ` },
    { id: `p2`, pharmacyCode: `1002`, name: `اسم ثاني`, repId: `r2`, supervisor: `مدير ب` },
    { id: `p3`, pharmacyCode: `9999`, name: `غير موجود في الملف`, rep_id: `r1`, supervisor: `مدير أ` }
];
const reps = [{ id: `r1`, name: `مندوب أ` }, { id: `r2`, name: `مندوب ب` }];
const routing = core.resolveRoutes(pharmacies, reps);
const sales = { customers: parsed.customers, months: parsed.months };
const eligible = core.eligibleRows(sales, routing.routes, `r1`);
assert.equal(eligible.length, 1);
assert.equal(eligible[0].pharmacyName, `اسم النظام المختلف`);
assert.equal(core.resolveRoutes([...pharmacies, { ...pharmacies[0], rep_id: `r2` }], reps).conflicts.size, 1);
assert.equal(core.isComplete({ status: `confirmed`, entries: { [`1001`]: { amount: 0 } } }, eligible), true);
assert.equal(core.isComplete({ status: `draft`, entries: { [`1001`]: { amount: 0 } } }, eligible), false);
assert.equal(core.isComplete({ status: `confirmed`, entries: { [`1001`]: { amount: null } } }, eligible), false);
const invoice = { id: `o1`, status: `orders_staff_hidden`, pharmacyCode: `1001`, grandTotal: 100, createdAt: `2026-08-01`, exportedAt: `2026-10-06T09:00:00Z`, exportHistory: [{ source: `orders_staff_excel`, exportedAt: `2026-10-06T09:00:00Z`, hideAfterExport: false, invoiced: false }] };
assert.equal(core.invoiceTotals([invoice], `2026-10`).totals.get(`1001`).amount, 10000);
assert.equal(core.invoiceTotals([invoice], `2026-08`).totals.size, 0);
assert.equal(core.invoiceTotals([invoice, invoice], `2026-10`).totals.get(`1001`).count, 1);
assert.equal(core.invoiceDate({ ...invoice, status: `returned_to_finance` }), null);
assert.equal(core.invoiceDate({ ...invoice, status: `finance_approved` }), null);
assert.equal(core.invoiceDate({ ...invoice, status: `deleted_by_orders_staff` }), null);
assert.equal(core.invoiceDate({ ...invoice, exportedAt: null, exportHistory: [] }), null);
assert.equal(core.invoiceTotals([{ ...invoice, exportedAt: `2026-09-30T21:05:00Z`, exportHistory: [] }], `2026-10`).totals.size, 1);
assert.equal(core.invoiceTotals([{ ...invoice, exportedAt: `2026-10-31T21:05:00Z`, exportHistory: [] }], `2026-10`).totals.size, 0);
const permission = { grantedAt: `2026-10-06T09:00:00Z`, hours: 2, revoked: false };
assert.equal(core.permitActive(permission, new Date(`2026-10-06T10:59:59Z`)), true);
assert.equal(core.permitActive(permission, new Date(`2026-10-06T11:00:00Z`)), false);
assert.equal(core.permitActive({ ...permission, revoked: true }, new Date(`2026-10-06T10:00:00Z`)), false);

// Exercise the real store module against an isolated Firestore adapter: no production writes.
const memory = new Map([
    [`system_settings/forecast`, { enabled: true, activeMonth: `2026-10` }],
    [`forecast_sales/2026`, sales],
    ...pharmacies.map(row => [`pharmacies/${row.id}`, row]), ...reps.map(row => [`reps/${row.id}`, row])
]);
let counter = 0;
const ref = (...args) => ({ path: args.filter(arg => typeof arg === `string`).join(`/`) });
const snapshot = reference => ({ exists: () => memory.has(reference.path), data: () => structuredClone(memory.get(reference.path)), id: reference.path.split(`/`).at(-1) });
const storage = new Map([[`repId`, `r1`], [`repName`, `مندوب أ`]]);
const store = { getItem: key => storage.get(key) || null };
const testPassword = `test-password-only`;
const salt = new Uint8Array(16).fill(1), iv = new Uint8Array(12).fill(2);
const material = await webcrypto.subtle.importKey(`raw`, new TextEncoder().encode(testPassword), `PBKDF2`, false, [`deriveKey`]);
const testKey = await webcrypto.subtle.deriveKey({ name: `PBKDF2`, salt, iterations: 600000, hash: `SHA-256` }, material, { name: `AES-GCM`, length: 256 }, false, [`encrypt`]);
const cipher = await webcrypto.subtle.encrypt({ name: `AES-GCM`, iv }, testKey, new TextEncoder().encode(`[]`));
const base64 = value => Buffer.from(value).toString(`base64`);
const passSource = `const payload = ${JSON.stringify({ salt: base64(salt), iv: base64(iv), data: base64(cipher) })};`;
const context = vm.createContext({ console, navigator: { onLine: true }, sessionStorage: store, localStorage: { getItem: () => null }, Date, Number, String, Map, Set, Error, Object, Array, JSON, Boolean, TextEncoder, TextDecoder, Uint8Array, atob, crypto: webcrypto, structuredClone,
    fetch: async url => url.includes(`pass.html`) ? { ok: true, text: async () => passSource } : { ok: true, json: async () => [{ readTime: `2026-10-06T10:00:00Z` }] }
});
let readCount = 0, collectionReadCount = 0;
const sdk = {
    collection: (_, path) => ({ path }), doc: (...args) => args.length === 1 ? ({ path: `${args[0].path}/audit${++counter}` }) : ref(...args),
    getDocFromServer: async reference => { readCount++; return snapshot(reference); },
    getDocsFromServer: async reference => { collectionReadCount++; const items = [...memory.keys()].filter(key => key.startsWith(`${reference.path}/`)).map(path => snapshot({ path })); return { docs: items, size: items.length }; },
    setDoc: async (reference, value, options) => memory.set(reference.path, options?.merge ? { ...memory.get(reference.path), ...value } : value),
    serverTimestamp: () => new Date(`2026-10-06T09:00:00Z`),
    query: value => value, orderBy: () => null, documentId: () => null, limit: () => null, startAfter: () => null,
    runTransaction: async (_, action) => { const writes = []; const result = await action({ get: async reference => snapshot(reference), set: (reference, value) => writes.push(() => memory.set(reference.path, value)), update: (reference, value) => writes.push(() => memory.set(reference.path, { ...memory.get(reference.path), ...value })) }); writes.forEach(write => write()); return result; }
};
const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context });
const module = new vm.SourceTextModule(fs.readFileSync(new URL(`../js/forecast-store.js`, import.meta.url), `utf8`), { context });
await module.link(specifier => specifier.includes(`forecast-core`) ? synthetic(core) : (specifier.includes(`firebase-firestore`) || specifier.includes(`firestore-meter`)) ? synthetic(sdk) : synthetic({ db: {} }));
await module.evaluate();
const api = module.namespace;
const beforeConfig = readCount;
await Promise.all([api.loadConfig(), api.loadConfig(), api.loadConfig()]);
assert.equal(readCount - beforeConfig, 1, `Concurrent config reads share one request`);
const beforeMissing = collectionReadCount;
assert.equal((await api.loadDataset(`2027-01`)).sales, null);
assert.equal(collectionReadCount, beforeMissing, `Missing sales must not read whole pharmacy and rep collections`);
assert.ok((await api.loadDataset(`2027-01`, { routingOnly: true })).routes.size > 0, `Import preview can resolve codes before importing sales`);
assert.match(api.errorMessage({ code: `resource-exhausted` }), /الاستهلاك/);
assert.equal((await api.checkOrderGate(`r1`)).allowed, false);
assert.equal((await api.checkOrderGate(`r3`)).allowed, true);
await assert.rejects(api.saveForecast(`2026-10`, `r1`, { [`1001`]: { amount: null } }, 0, true), /تعبئة/);
await api.saveForecast(`2026-10`, `r1`, { [`1001`]: { amount: null, note: `جزئي` } }, 0, false);
assert.equal((await api.checkOrderGate(`r1`)).allowed, false);
await assert.rejects(api.saveForecast(`2026-10`, `r1`, { [`1001`]: { amount: 0 } }, 0, true), /نافذة أخرى/);
await api.saveForecast(`2026-10`, `r1`, { [`1001`]: { amount: 0 } }, 1, true);
assert.equal((await api.checkOrderGate(`r1`)).allowed, true);
await assert.rejects(api.saveForecast(`2026-10`, `r1`, { [`1001`]: { amount: 1 } }, 2, false), /مؤكد/);
await assert.rejects(api.reopenForecast(`2026-10`, `r1`, `تصحيح`), /إدارة/);
await api.unlockAdmin(testPassword);
await api.reopenForecast(`2026-10`, `r1`, `تصحيح`);
assert.equal(memory.get(`monthly_forecasts/2026-10__r1`).entries[`1001`].amount, 0);
assert.equal((await api.checkOrderGate(`r1`)).allowed, false);
await api.grantPermit(`2026-10`, `r1`, 2);
assert.equal((await api.checkOrderGate(`r1`)).temporary, true);
await api.revokePermit(`2026-10`, `r1`);
assert.equal((await api.checkOrderGate(`r1`)).allowed, false);
await assert.rejects(api.grantPermit(`2026-10`, `r1`, 0));
await api.importSales(core.parseSalesRows([[`Cust No`, `Cust Name`, `Jan`, `Feb`, `Mar`], [1001, `اسم محدث`, 0, -3.67, 999]]), `2026`, `updated.xlsx`);
assert.equal(memory.get(`forecast_sales/2026`).customers[`1001`].months[`3`], 99900);
assert.equal(memory.get(`forecast_sales/2026`).customers[`1002`].months[`1`], 12346);
assert.equal(memory.get(`monthly_forecasts/2026-10__r1`).entries[`1001`].amount, 0);
api.lockAdmin(); await assert.rejects(api.saveConfig(`2026-10`, true), /إدارة/);
console.log(`Forecast core and store checks passed: code-only joins, scope, zero versus blank, validation, month boundaries, invoice date, duplicate invoices, revisions, admin-only reopening, temporary permits, and history-preserving imports.`);
