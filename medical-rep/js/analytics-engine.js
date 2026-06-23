import { db, collection, getDocs, query, where } from './firebase.js';

const C = window.medrepCommon;

async function readCachedPack(key, ttlMs, options = {}) {
    const cached = C.cacheGet(key, ttlMs);
    if (cached) {
        return { rows: cached.data || [], fromCache: true, cacheAge: C.cacheAgeText(cached), isStale: C.cacheIsStale(cached) };
    }
    if (options.allowStale) {
        const stale = C.cacheGet(key, 0);
        if (stale) return { rows: stale.data || [], fromCache: true, cacheAge: C.cacheAgeText(stale), isStale: true };
    }
    return null;
}

async function getCollectionCached(collectionName, force = false, ttlMs = C.DEFAULT_CACHE_TTL_MS, options = {}) {
    const key = `collection_${collectionName}`;
    if (!force) {
        const cached = await readCachedPack(key, ttlMs, options);
        if (cached) return cached;
    }
    const snap = await getDocs(collection(db, collectionName));
    const rows = [];
    snap.forEach(item => rows.push({ id: item.id, ...item.data() }));
    C.cacheSet(key, rows);
    return { rows, fromCache: false, cacheAge: `الآن`, isStale: false };
}

async function getInvoicedOrders(force = false, ttlMs = C.DEFAULT_CACHE_TTL_MS, options = {}) {
    const key = `orders_invoiced_hidden_v3`;
    if (!force) {
        const cached = await readCachedPack(key, ttlMs, options);
        if (cached) return cached;
    }

    const rows = await fetchModernInvoicedOrders();
    C.cacheSet(key, rows);
    return { rows, fromCache: false, cacheAge: `الآن`, isStale: false };
}

async function getMedicalRepDashboardOrders(force = false, ttlMs = C.DEFAULT_CACHE_TTL_MS, options = {}) {
    const key = `orders_medrep_dashboard_legacy_plus_invoiced_v5`;
    if (!force) {
        const cached = await readCachedPack(key, ttlMs, options);
        if (cached) return cached;
    }

    const ordersById = new Map();
    const modernRows = await fetchModernInvoicedOrders();
    modernRows.forEach(order => ordersById.set(order.id, { ...order, medicalRepSaleSource: `invoiced` }));

    const legacyRows = await fetchLegacySalesOrders();
    legacyRows.forEach(order => {
        if (!ordersById.has(order.id)) ordersById.set(order.id, { ...order, medicalRepSaleSource: `legacy` });
    });

    const rows = [...ordersById.values()];
    C.cacheSet(key, rows);
    return { rows, fromCache: false, cacheAge: `الآن`, isStale: false };
}

async function fetchModernInvoicedOrders() {
    const ordersById = new Map();
    const invoicedQueries = [
        query(collection(db, `orders`), where(`status`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`orderStaffStatus`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`hiddenByOrderStaff`, `==`, true))
    ];

    for (const q of invoicedQueries) {
        try {
            const snap = await getDocs(q);
            snap.forEach(item => {
                const order = { id: item.id, ...item.data() };
                if (isInvoicedOrder(order)) ordersById.set(item.id, order);
            });
        } catch (error) {
            console.warn(`تعذر تنفيذ استعلام الطلبيات المفوترة:`, error);
        }
    }
    return [...ordersById.values()];
}

async function fetchLegacySalesOrders() {
    const ordersById = new Map();
    const legacyQueries = [
        query(collection(db, `orders`), where(`status`, `==`, `approved`)),
        query(collection(db, `orders`), where(`status`, `==`, ``)),
        query(collection(db, `orders`), where(`status`, `==`, null))
    ];

    for (const q of legacyQueries) {
        try {
            const snap = await getDocs(q);
            snap.forEach(item => {
                const order = { id: item.id, ...item.data() };
                if (isLegacySalesOrder(order)) ordersById.set(item.id, order);
            });
        } catch (error) {
            console.warn(`تعذر تنفيذ استعلام الطلبيات القديمة لشاشة مندوب الدعاية:`, error);
        }
    }
    return [...ordersById.values()];
}

async function loadCoreData(force = false, options = {}) {
    const includeLegacySales = options.includeLegacySales === true;
    const cacheOptions = { allowStale: options.allowStale === true };
    const ordersLoader = includeLegacySales ? getMedicalRepDashboardOrders : getInvoicedOrders;
    const [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack] = await Promise.all([
        ordersLoader(force, C.DEFAULT_CACHE_TTL_MS, cacheOptions),
        getCollectionCached(`pharmacies`, force, C.DEFAULT_CACHE_TTL_MS, cacheOptions),
        getCollectionCached(`medicalRepAreaRules`, force, C.DEFAULT_CACHE_TTL_MS, cacheOptions),
        getCollectionCached(`medicalRepOtherShares`, force, C.DEFAULT_CACHE_TTL_MS, cacheOptions),
        getCollectionCached(`medicalRepTargets`, force, C.DEFAULT_CACHE_TTL_MS, cacheOptions)
    ]);
    const packs = [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack];
    const fromCache = packs.some(pack => pack.fromCache);
    const hasStaleCache = packs.some(pack => pack.isStale);
    const oldestCache = packs.filter(pack => pack.fromCache).sort((a, b) => String(b.cacheAge).localeCompare(String(a.cacheAge)))[0];
    return {
        orders: ordersPack.rows,
        pharmacies: pharmaciesPack.rows,
        areaRules: areaRulesPack.rows,
        otherShares: otherSharesPack.rows,
        targets: targetsPack.rows,
        cacheText: fromCache ? `التخزين الداخلي - ${oldestCache?.cacheAge || ordersPack.cacheAge}` : `Firebase مباشر`,
        hasStaleCache,
        fromCache
    };
}

function isInvoicedOrder(order = {}) {
    const status = String(order.status || ``);
    const staffStatus = String(order.orderStaffStatus || ``);
    const exportHistory = Array.isArray(order.exportHistory) ? order.exportHistory : [];
    const auditTrail = Array.isArray(order.auditTrail) ? order.auditTrail : [];
    return status === `orders_staff_hidden` ||
        staffStatus === `orders_staff_hidden` ||
        !!order.invoicedAt ||
        !!order.isInvoiced ||
        !!order.hiddenByOrderStaff ||
        exportHistory.some(entry => entry?.hideAfterExport === true || entry?.invoiced === true) ||
        auditTrail.some(entry => [`orders_staff_hidden`, `orders_staff_hide_after_export`, `orders_staff_invoiced_and_hidden_after_export`].includes(entry?.action));
}

function isLegacySalesOrder(order = {}) {
    if (isInvoicedOrder(order)) return false;
    const modernWorkflowKeys = [
        `orderStaffStatus`,
        `financeStatus`,
        `marketManagerStatus`,
        `supervisorStatus`,
        `workflowStage`,
        `hiddenByOrderStaff`,
        `exportedAt`,
        `financeApprovedAt`,
        `marketManagerApprovedAt`,
        `supervisorApprovedAt`,
        `previousStatus`,
        `actionType`,
        `changedByRole`
    ];
    const hasModernWorkflow = modernWorkflowKeys.some(key => Object.prototype.hasOwnProperty.call(order, key));
    if (hasModernWorkflow) return false;

    const rawStatus = Object.prototype.hasOwnProperty.call(order, `status`) ? String(order.status || ``).trim() : ``;
    const normalizedStatus = C.normalizeArabic(rawStatus).toLowerCase();
    const blockedStatuses = [`pending`, `rejected`, `deleted`, `cancelled`, `canceled`, `returned`, `draft`, `طلب جديد`, `مرفوض`, `محذوف`, `ملغي`, `مرتجع`];
    if (blockedStatuses.some(status => normalizedStatus === C.normalizeArabic(status).toLowerCase())) return false;

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return false;
    return !rawStatus || normalizedStatus === `approved` || normalizedStatus === C.normalizeArabic(`معتمد`).toLowerCase();
}

function orderDate(order = {}) {
    return order.invoicedAt || order.hiddenAt || order.exportedAt || order.updatedAt || order.createdAt;
}

function getPharmacyCode(order = {}) {
    return String(order.pharmacyCode || order.pharmacy_code || order.customerCode || order.code || ``).trim();
}

function getProductCode(item = {}) {
    return String(item.productCode || item.product_code || item.code || ``).trim();
}

function getOrderArea(order = {}, pharmaciesByCode, pharmaciesByName) {
    const direct = String(order.area || order.Area || order.pharmacyArea || order.region || order.Region || ``).trim();
    if (direct && direct !== `-`) return direct;
    const code = getPharmacyCode(order);
    const name = String(order.pharmacyName || ``).trim();
    const byCode = code ? pharmaciesByCode.get(C.normalizeArabic(code)) : null;
    const byName = name ? pharmaciesByName.get(C.normalizeArabic(name)) : null;
    return String(byCode?.area || byCode?.Area || byCode?.region || byName?.area || byName?.Area || byName?.region || `-`).trim();
}

function lineValue(item = {}) {
    const total = C.parseNumber(item.total || item.rowTotal || item.subtotal);
    if (total) return total;
    return C.parseNumber(item.price) * C.parseNumber(item.qty || item.quantity);
}

function buildPharmacyLookups(pharmacies = []) {
    const pharmaciesByCode = new Map();
    const pharmaciesByName = new Map();
    pharmacies.forEach(pharmacy => {
        const code = String(pharmacy.pharmacyCode || pharmacy.pharmacy_code || pharmacy.code || pharmacy.id || ``).trim();
        const name = String(pharmacy.name || pharmacy.Name || ``).trim();
        if (code) pharmaciesByCode.set(C.normalizeArabic(code), pharmacy);
        if (name) pharmaciesByName.set(C.normalizeArabic(name), pharmacy);
    });
    return { pharmaciesByCode, pharmaciesByName };
}

function buildLookup(rows = [], keyFactory) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFactory(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    });
    return map;
}

function buildRowsForRep(session = {}, data = {}) {
    const repKey = session.normalizedName || C.normalizeArabic(session.name);
    const { pharmaciesByCode, pharmaciesByName } = buildPharmacyLookups(data.pharmacies || []);
    const myAreaRules = (data.areaRules || []).filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrepKey) === repKey);
    const myOtherShares = (data.otherShares || []).filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrepKey) === repKey);
    const areaRuleMap = buildLookup(myAreaRules, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}|${rule.areaKey || C.normalizeArabic(rule.area)}`);
    const otherShareMap = buildLookup(myOtherShares, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}`);
    return buildRowsFromMaps(data.orders || [], pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, { defaultTeam: session.team || ``, owner: session.name || `` });
}

function buildRowsForTeam(teamName = ``, data = {}) {
    const teamKey = C.normalizeArabic(teamName);
    const { pharmaciesByCode, pharmaciesByName } = buildPharmacyLookups(data.pharmacies || []);
    const teamAreaRules = (data.areaRules || []).filter(rule => !teamKey || C.normalizeArabic(rule.team) === teamKey);
    const teamOtherShares = (data.otherShares || []).filter(rule => !teamKey || C.normalizeArabic(rule.team) === teamKey);
    const areaRuleMap = buildLookup(teamAreaRules, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}|${rule.areaKey || C.normalizeArabic(rule.area)}`);
    const otherShareMap = buildLookup(teamOtherShares, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}`);
    return buildRowsFromMaps(data.orders || [], pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, { defaultTeam: teamName || ``, owner: `team` });
}

function buildRowsFromMaps(orders, pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, meta = {}) {
    const result = [];
    orders.filter(order => isInvoicedOrder(order) || isLegacySalesOrder(order)).forEach(order => {
        const area = getOrderArea(order, pharmaciesByCode, pharmaciesByName);
        const areaKey = C.normalizeArabic(area);
        const date = orderDate(order);
        const items = Array.isArray(order.items) ? order.items : [];
        const orderKey = String(order.id || ``);

        items.forEach((item, itemIndex) => {
            const itemName = String(item.name || item.itemName || item.productName || ``).trim();
            if (!itemName) return;
            const itemKey = C.normalizeItem(itemName);
            const qty = C.parseNumber(item.qty || item.quantity);
            const value = lineValue(item);
            const code = getProductCode(item);
            const common = {
                orderId: orderKey,
                orderShort: orderKey.slice(0, 6).toUpperCase(),
                lineKey: `${orderKey}_${itemIndex}`,
                date,
                dateText: C.formatDate(date),
                dateTimeText: C.formatDateTime(date),
                pharmacyName: order.pharmacyName || `-`,
                pharmacyCode: getPharmacyCode(order),
                salesRepName: order.repName || `-`,
                salesManagerName: order.managerName || `-`,
                area,
                areaKey,
                itemName,
                itemKey,
                productCode: code,
                sourceQty: qty,
                sourceValue: value,
                unitPrice: qty ? value / qty : C.parseNumber(item.price),
                invoiceStatus: order.medicalRepSaleSource === `legacy` ? `legacy_sale` : (order.orderStaffStatus || order.status || `-`)
            };

            if (C.isOtherArea(area)) {
                const matches = otherShareMap.get(itemKey) || [];
                matches.forEach(match => {
                    const pct = C.parseNumber(match.percentage);
                    if (!pct) return;
                    result.push({
                        ...common,
                        allocatedQty: qty * pct / 100,
                        allocatedValue: value * pct / 100,
                        percentage: pct,
                        channel: `others`,
                        team: match.team || meta.defaultTeam || ``,
                        medrep: match.medrep || meta.owner || ``,
                        medrepKey: match.medrepKey || C.normalizeArabic(match.medrep || meta.owner || ``),
                        ruleNote: `منطقة اخرين`
                    });
                });
                return;
            }

            const matches = areaRuleMap.get(`${itemKey}|${areaKey}`) || [];
            matches.forEach(match => {
                result.push({
                    ...common,
                    allocatedQty: qty,
                    allocatedValue: value,
                    percentage: 100,
                    channel: `direct`,
                    team: match.team || meta.defaultTeam || ``,
                    medrep: match.medrep || meta.owner || ``,
                    medrepKey: match.medrepKey || C.normalizeArabic(match.medrep || meta.owner || ``),
                    ruleNote: `منطقة مباشرة`
                });
            });
        });
    });
    return result.sort((a, b) => (C.toDate(b.date)?.getTime() || 0) - (C.toDate(a.date)?.getTime() || 0));
}

function distinctTeams(data = {}) {
    return [...new Set([...(data.areaRules || []), ...(data.otherShares || []), ...(data.targets || [])]
        .map(row => String(row.team || ``).trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, `ar`));
}

function targetForRows(rows = [], targets = [], filters = {}) {
    const repKey = filters.repName ? C.normalizeArabic(filters.repName) : ``;
    const teamKey = filters.team ? C.normalizeArabic(filters.team) : ``;
    const item = filters.itemName || ``;
    const fromMonth = filters.from ? filters.from.slice(0, 7) : ``;
    const toMonth = filters.to ? filters.to.slice(0, 7) : ``;
    return targets
        .filter(row => !repKey || C.normalizeArabic(row.medrep || row.medrepKey) === repKey || C.normalizeArabic(row.medrepKey) === repKey)
        .filter(row => !teamKey || C.normalizeArabic(row.team) === teamKey)
        .filter(row => !item || row.itemName === item)
        .filter(row => {
            const key = row.periodKey || `${row.year}-${String(row.month).padStart(2, `0`)}`;
            if (fromMonth && key < fromMonth) return false;
            if (toMonth && key > toMonth) return false;
            return true;
        })
        .reduce((acc, row) => {
            acc.value += C.parseNumber(row.targetValue);
            acc.qty += C.parseNumber(row.targetQty);
            return acc;
        }, { value: 0, qty: 0 });
}

export {
    getCollectionCached,
    getInvoicedOrders,
    getMedicalRepDashboardOrders,
    loadCoreData,
    buildRowsForRep,
    buildRowsForTeam,
    distinctTeams,
    targetForRows
};
