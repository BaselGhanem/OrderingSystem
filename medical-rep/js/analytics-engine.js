import { db, collection, getDocs, query, where } from './firebase.js';

const C = window.medrepCommon;

async function getCollectionCached(collectionName, force = false, ttlMs = C.DEFAULT_CACHE_TTL_MS) {
    const key = `collection_${collectionName}`;
    if (!force) {
        const cached = C.cacheGet(key, ttlMs);
        if (cached) return { rows: cached.data || [], fromCache: true, cacheAge: C.cacheAgeText(cached) };
    }
    const snap = await getDocs(collection(db, collectionName));
    const rows = [];
    snap.forEach(item => rows.push({ id: item.id, ...item.data() }));
    C.cacheSet(key, rows);
    return { rows, fromCache: false, cacheAge: `الآن` };
}

async function getInvoicedOrders(force = false, ttlMs = C.DEFAULT_CACHE_TTL_MS) {
    const key = `orders_invoiced_hidden_v3`;
    if (!force) {
        const cached = C.cacheGet(key, ttlMs);
        if (cached) return { rows: cached.data || [], fromCache: true, cacheAge: C.cacheAgeText(cached) };
    }

    const ordersById = new Map();
    const invoicedQueries = [
        query(collection(db, `orders`), where(`status`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`orderStaffStatus`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`hiddenByOrderStaff`, `==`, true))
    ];

    for (const q of invoicedQueries) {
        try {
            const snap = await getDocs(q);
            snap.forEach(item => ordersById.set(item.id, { id: item.id, ...item.data() }));
        } catch (error) {
            console.warn(`تعذر تنفيذ استعلام الطلبيات المفوترة:`, error);
        }
    }

    const rows = [...ordersById.values()];
    C.cacheSet(key, rows);
    return { rows, fromCache: false, cacheAge: `الآن` };
}

async function loadCoreData(force = false) {
    const [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack] = await Promise.all([
        getInvoicedOrders(force),
        getCollectionCached(`pharmacies`, force),
        getCollectionCached(`medicalRepAreaRules`, force),
        getCollectionCached(`medicalRepOtherShares`, force),
        getCollectionCached(`medicalRepTargets`, force)
    ]);
    return {
        orders: ordersPack.rows,
        pharmacies: pharmaciesPack.rows,
        areaRules: areaRulesPack.rows,
        otherShares: otherSharesPack.rows,
        targets: targetsPack.rows,
        cacheText: ordersPack.fromCache || pharmaciesPack.fromCache || areaRulesPack.fromCache || otherSharesPack.fromCache || targetsPack.fromCache ? `من التخزين المحلي - ${ordersPack.cacheAge}` : `مباشر من Firebase`
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
    orders.filter(isInvoicedOrder).forEach(order => {
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
                invoiceStatus: order.orderStaffStatus || order.status || `-`
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
    loadCoreData,
    buildRowsForRep,
    buildRowsForTeam,
    distinctTeams,
    targetForRows
};
