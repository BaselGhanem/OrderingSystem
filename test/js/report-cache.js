import { db, collection, getDocs, query, where, orderBy } from './firebase.js';

export const REPORT_CACHE_VERSION = `20260628_monthly_report_cache_fix1`;

const ORDER_COLLECTION = `orders`;
const HISTORICAL_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const CURRENT_TTL_MS = 1000 * 60 * 10;
const DEFAULT_START_MONTH = 0;
const CACHE_PREFIX = `dad_month_orders_${REPORT_CACHE_VERSION}`;

function pad2(value) {
    return String(value).padStart(2, `0`);
}

export function reportDateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseInputDate(value = ``, fallback = null, endOfDay = false) {
    if (!value) return fallback;
    const date = new Date(`${value}T${endOfDay ? `23:59:59.999` : `00:00:00.000`}`);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function currentMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function monthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function nextMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function monthKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function isHistoricalMonth(date) {
    return monthEnd(date).getTime() < currentMonthStart().getTime();
}

function ttlForMonth(date) {
    return isHistoricalMonth(date) ? HISTORICAL_TTL_MS : CURRENT_TTL_MS;
}

function cacheKey(namespace = `global`, date) {
    return `${CACHE_PREFIX}_${namespace}_${monthKey(date)}`;
}

function normalizeDateValue(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === `function`) return value.toDate();
    if (typeof value === `object` && typeof value.seconds === `number`) return new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000));
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function readMonthCache(namespace, date, allowExpired = false) {
    try {
        const raw = localStorage.getItem(cacheKey(namespace, date)) || sessionStorage.getItem(cacheKey(namespace, date));
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.orders)) return null;
        const age = Date.now() - Number(payload.savedAt || 0);
        if (!allowExpired && age > ttlForMonth(date)) return null;
        return payload.orders;
    } catch (error) {
        console.warn(`Report cache read failed`, error);
        return null;
    }
}

function compactOrder(order = {}) {
    return { id: order.id || ``, ...order };
}

function writeMonthCache(namespace, date, orders = []) {
    const payload = JSON.stringify({
        version: REPORT_CACHE_VERSION,
        month: monthKey(date),
        historical: isHistoricalMonth(date),
        savedAt: Date.now(),
        orders: orders.map(compactOrder)
    });
    try {
        localStorage.setItem(cacheKey(namespace, date), payload);
    } catch (error) {
        try {
            sessionStorage.setItem(cacheKey(namespace, date), payload);
        } catch (_) {}
    }
}

function splitMonths(fromDate, toDate) {
    const parts = [];
    let cursor = monthStart(fromDate);
    while (cursor.getTime() <= toDate.getTime()) {
        const start = new Date(Math.max(cursor.getTime(), fromDate.getTime()));
        const end = new Date(Math.min(monthEnd(cursor).getTime(), toDate.getTime()));
        parts.push({ month: new Date(cursor), start, end });
        cursor = nextMonth(cursor);
    }
    return parts;
}

function dedupeSortOrders(orders = []) {
    const map = new Map();
    orders.forEach(order => {
        if (order?.id) map.set(order.id, order);
    });
    return [...map.values()].sort((a, b) => {
        const db = normalizeDateValue(b.createdAt || b.date || b.timestamp || b.updatedAt)?.getTime() || 0;
        const da = normalizeDateValue(a.createdAt || a.date || a.timestamp || a.updatedAt)?.getTime() || 0;
        return db - da;
    });
}

export function resolveReportRange(fromValue = ``, toValue = ``) {
    const today = new Date();
    const defaultFrom = new Date(today.getFullYear(), DEFAULT_START_MONTH, 1, 0, 0, 0, 0);
    const defaultTo = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    let fromDate = parseInputDate(fromValue, defaultFrom, false);
    let toDate = parseInputDate(toValue, defaultTo, true);
    if (fromDate.getTime() > toDate.getTime()) {
        const temp = fromDate;
        fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0);
        toDate = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate(), 23, 59, 59, 999);
    }
    return {
        fromDate,
        toDate,
        fromValue: reportDateInputValue(fromDate),
        toValue: reportDateInputValue(toDate),
        key: `${reportDateInputValue(fromDate)}_${reportDateInputValue(toDate)}`
    };
}

async function fetchMonthOrders(part) {
    const ordersQuery = query(
        collection(db, ORDER_COLLECTION),
        where(`createdAt`, `>=`, part.start),
        where(`createdAt`, `<=`, part.end),
        orderBy(`createdAt`, `desc`)
    );
    const snap = await getDocs(ordersQuery);
    return snap.docs.map(item => ({ id: item.id, ...item.data() }));
}

export async function loadReportOrdersByDateRange(options = {}) {
    const namespace = options.namespace || `global`;
    const forceRemote = options.forceRemote === true;
    const range = resolveReportRange(options.fromValue || ``, options.toValue || ``);
    const parts = splitMonths(range.fromDate, range.toDate);
    const combined = [];
    const monthStatuses = [];

    for (const part of parts) {
        const cached = readMonthCache(namespace, part.month, false);
        if (cached && !forceRemote) {
            combined.push(...cached);
            monthStatuses.push({ month: monthKey(part.month), source: `cache`, historical: isHistoricalMonth(part.month), rows: cached.length });
            continue;
        }

        try {
            const rows = await fetchMonthOrders(part);
            writeMonthCache(namespace, part.month, rows);
            combined.push(...rows);
            monthStatuses.push({ month: monthKey(part.month), source: `firebase`, historical: isHistoricalMonth(part.month), rows: rows.length });
        } catch (error) {
            const stale = readMonthCache(namespace, part.month, true);
            if (stale) {
                combined.push(...stale);
                monthStatuses.push({ month: monthKey(part.month), source: `stale-cache`, historical: isHistoricalMonth(part.month), rows: stale.length, error: String(error?.message || error) });
                continue;
            }
            throw error;
        }
    }

    return {
        orders: dedupeSortOrders(combined),
        range,
        monthStatuses,
        fromCacheOnly: monthStatuses.length > 0 && monthStatuses.every(item => item.source === `cache`),
        usedStaleCache: monthStatuses.some(item => item.source === `stale-cache`)
    };
}

export function currentMonthRange() {
    const now = new Date();
    return {
        fromValue: reportDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        toValue: reportDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    };
}
