import { db, collection, getDocs, doc, getDoc } from './firebase.js';

const CONFIG_CACHE_KEY = 'dad_system_config_v1';
const CONFIG_CACHE_TTL = 5 * 60 * 1000;
const ADMIN_SESSION_KEY = 'dad_admin_session_v2';
const ADMIN_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

export const ROLE_LABELS = Object.freeze({
    representative: 'مندوب',
    supervisor: 'مشرف',
    manager: 'مشرف',
    market_manager: 'مدير السوق',
    finance_controller: 'المراقب المالي',
    orders_staff: 'قسم الطلبيات',
    reports: 'التقارير',
    settings: 'الإعدادات',
    audit: 'سجل التدقيق',
    control: 'مركز التحكم'
});

export const ROLE_ROUTES = Object.freeze({
    supervisor: 'supervisor.html',
    manager: 'supervisor.html',
    market_manager: 'market_manager.html',
    finance_controller: 'finance_controller.html',
    orders_staff: 'orders_staff.html',
    reports: 'reports.html',
    settings: 'setting.html',
    audit: 'audit.html',
    control: 'control.html'
});

export const PERMISSION_CATALOG = Object.freeze([
    ['page.supervisor', 'فتح شاشة المشرف'],
    ['order.create_for_rep', 'إنشاء طلبية نيابة عن مندوب'],
    ['order.edit_supervisor', 'تعديل الطلبية من شاشة المشرف'],
    ['order.approve_supervisor', 'اعتماد الطلبية من المشرف'],
    ['order.return_to_rep', 'إرجاع الطلبية للمندوب'],
    ['order.delete_before_approval', 'حذف الطلبية قبل الاعتماد'],
    ['page.market_manager', 'فتح شاشة مدير السوق'],
    ['market.approve', 'اعتماد مدير السوق'],
    ['market.reject', 'رفض مدير السوق'],
    ['market.return', 'إرجاع الطلبية من مدير السوق'],
    ['market.edit', 'تعديل الطلبية من مدير السوق'],
    ['page.finance_controller', 'فتح شاشة المراقب المالي'],
    ['finance.approve', 'اعتماد المالية'],
    ['finance.reject', 'رفض المالية'],
    ['finance.return', 'إرجاع الطلبية من المالية'],
    ['finance.export', 'تصدير كشف المالية'],
    ['page.orders_staff', 'فتح شاشة قسم الطلبيات'],
    ['staff.edit', 'تعديل الطلبية بقسم الطلبيات'],
    ['staff.export', 'تصدير طلبيات قسم الطلبيات'],
    ['staff.return', 'إرجاع الطلبية للمالية'],
    ['staff.delete', 'حذف الطلبية من قسم الطلبيات'],
    ['page.reports', 'فتح التقارير'],
    ['reports.export', 'تصدير التقارير'],
    ['reports.delete', 'حذف طلبية من التقارير'],
    ['page.settings', 'فتح الإعدادات'],
    ['settings.manage_users', 'إدارة المستخدمين'],
    ['settings.manage_products', 'إدارة الأصناف'],
    ['settings.manage_pharmacies', 'إدارة الصيدليات'],
    ['settings.manage_permissions', 'إدارة الصلاحيات'],
    ['settings.manage_system', 'إدارة إعدادات النظام'],
    ['settings.export_data', 'تصدير بيانات النظام'],
    ['settings.import_history', 'استيراد الطلبيات والمرتجعات التاريخية'],
    ['page.audit', 'فتح سجل التدقيق'],
    ['audit.modify', 'تعديل الحالات من سجل التدقيق'],
    ['page.control', 'فتح مركز التحكم'],
    ['control.modify', 'تعديل الحالات من مركز التحكم']
]);

export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
    supervisor: {
        'page.supervisor': true,
        'order.create_for_rep': true,
        'order.edit_supervisor': true,
        'order.approve_supervisor': true,
        'order.return_to_rep': true,
        'order.delete_before_approval': true
    },
    market_manager: {
        'page.market_manager': true,
        'market.approve': true,
        'market.reject': true,
        'market.return': true,
        'market.edit': true
    },
    finance_controller: {
        'page.finance_controller': true,
        'finance.approve': true,
        'finance.reject': true,
        'finance.return': true,
        'finance.export': true
    },
    orders_staff: {
        'page.orders_staff': true,
        'staff.edit': true,
        'staff.export': true,
        'staff.return': true,
        'staff.delete': true
    },
    reports: {
        'page.reports': true,
        'reports.export': true,
        'reports.delete': false
    },
    settings: {
        'page.settings': true,
        'settings.manage_users': true,
        'settings.manage_products': true,
        'settings.manage_pharmacies': true,
        'settings.manage_permissions': true,
        'settings.manage_system': true,
        'settings.export_data': true,
        'settings.import_history': true,
        'page.audit': true,
        'audit.modify': true,
        'page.control': true,
        'control.modify': true,
        'page.reports': true,
        'reports.export': true,
        'reports.delete': true
    },
    audit: {
        'page.audit': true,
        'audit.modify': false
    },
    control: {
        'page.control': true,
        'control.modify': true,
        'page.audit': true
    }
});

const LEGACY_PASSWORD_HASH = 'MjAyNjA0';

export const DEFAULT_SYSTEM_USERS = Object.freeze([
    { id: 'legacy_supervisor_tawalbeh', displayName: 'محمد طوالبه', role: 'supervisor', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_supervisor_natour', displayName: 'عبدالله الناطور', role: 'supervisor', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_market_manager', displayName: 'مدير السوق', role: 'market_manager', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_finance_controller', displayName: 'المراقب المالي', role: 'finance_controller', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_orders_staff', displayName: 'قسم الطلبيات', role: 'orders_staff', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_reports', displayName: 'لوحة التقارير', role: 'reports', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_settings', displayName: 'مسؤول الإعدادات', role: 'settings', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_audit', displayName: 'سجل التدقيق', role: 'audit', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true },
    { id: 'legacy_control', displayName: 'مركز التحكم', role: 'control', active: true, passwordHash: LEGACY_PASSWORD_HASH, legacy: true }
]);

export const DEFAULT_GENERAL_SETTINGS = Object.freeze({
    systemName: 'نظام الطلبيات',
    companyName: 'DAR ALDAWAA',
    companyLogoUrl: 'https://www.dadgroup.com/wp-content/uploads/2023/11/uplift-dad-website-05.png',
    currencyLabel: 'د.ا',
    enforcePermissions: false,
    allowRememberPasswords: true,
    cacheVersion: '20260712_settings_control_center_v2',
    dataRevision: 1,
    representativePasswordRequired: true,
    updatedAt: null
});

let memoryCache = null;
let memorySavedAt = 0;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function readBrowserCache() {
    try {
        const raw = localStorage.getItem(CONFIG_CACHE_KEY) || sessionStorage.getItem(CONFIG_CACHE_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload?.config || Date.now() - Number(payload.savedAt || 0) > CONFIG_CACHE_TTL) return null;
        return payload.config;
    } catch (_) {
        return null;
    }
}


function readBrowserCacheAnyAge() {
    try {
        const raw = localStorage.getItem(CONFIG_CACHE_KEY) || sessionStorage.getItem(CONFIG_CACHE_KEY);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        return payload?.config || null;
    } catch (_) {
        return null;
    }
}

function writeBrowserCache(config) {
    const payload = JSON.stringify({ savedAt: Date.now(), config });
    try {
        localStorage.setItem(CONFIG_CACHE_KEY, payload);
    } catch (_) {
        try { sessionStorage.setItem(CONFIG_CACHE_KEY, payload); } catch (__) {}
    }
}

function mergePermissions(remote = {}) {
    const result = clone(DEFAULT_ROLE_PERMISSIONS);
    Object.entries(remote || {}).forEach(([role, permissions]) => {
        result[normalizeRole(role)] = { ...(result[normalizeRole(role)] || {}), ...(permissions || {}) };
    });
    return result;
}

function normalizeUsers(rows = []) {
    const valid = rows
        .map(row => ({
            id: String(row.id || '').trim(),
            displayName: String(row.displayName || row.name || '').trim(),
            username: String(row.username || '').trim(),
            role: normalizeRole(row.role || row.type || ''),
            active: row.active !== false,
            passwordHash: String(row.passwordHash || row.password || '').trim(),
            route: String(row.route || '').trim(),
            permissions: row.permissions && typeof row.permissions === 'object' ? row.permissions : {},
            legacy: row.legacy === true
        }))
        .filter(row => row.id && row.displayName && row.role);
    return valid.length ? valid : clone(DEFAULT_SYSTEM_USERS);
}

export function normalizeRole(role = '') {
    const value = String(role || '').trim().toLowerCase();
    if (value === 'manager') return 'supervisor';
    if (value === 'finance') return 'finance_controller';
    return value;
}

export async function loadSystemConfig(force = false) {
    if (!force && memoryCache && Date.now() - memorySavedAt < CONFIG_CACHE_TTL) return memoryCache;
    if (!force) {
        const cached = readBrowserCache();
        if (cached) {
            memoryCache = cached;
            memorySavedAt = Date.now();
            return cached;
        }
    }

    let general = clone(DEFAULT_GENERAL_SETTINGS);
    let users = clone(DEFAULT_SYSTEM_USERS);
    let rolePermissions = clone(DEFAULT_ROLE_PERMISSIONS);
    let source = 'defaults';

    try {
        const [settingsSnap, usersSnap, permissionsSnap] = await Promise.all([
            getDoc(doc(db, 'systemSettings', 'main')),
            getDocs(collection(db, 'systemUsers')),
            getDocs(collection(db, 'rolePermissions'))
        ]);

        if (settingsSnap.exists()) general = { ...general, ...settingsSnap.data() };
        if (!usersSnap.empty) users = normalizeUsers(usersSnap.docs.map(item => ({ id: item.id, ...item.data() })));
        if (!permissionsSnap.empty) {
            const remotePermissions = {};
            permissionsSnap.docs.forEach(item => {
                const data = item.data() || {};
                remotePermissions[normalizeRole(data.role || item.id)] = data.permissions || {};
            });
            rolePermissions = mergePermissions(remotePermissions);
        }
        source = settingsSnap.exists() || !usersSnap.empty || !permissionsSnap.empty ? 'firebase' : 'defaults';
    } catch (error) {
        const cachedFallback = readBrowserCacheAnyAge();
        if (cachedFallback) {
            general = { ...general, ...(cachedFallback.general || {}) };
            users = normalizeUsers(cachedFallback.users || users);
            rolePermissions = mergePermissions(cachedFallback.rolePermissions || rolePermissions);
            source = 'cache-fallback';
        }
        console.warn('System configuration fallback is active.', error);
    }

    const config = { general, users, rolePermissions, roleLabels: clone(ROLE_LABELS), source, loadedAt: Date.now() };
    memoryCache = config;
    memorySavedAt = Date.now();
    writeBrowserCache(config);
    return config;
}



export function applySystemPresentation(config = null, root = document) {
    const runtime = config || memoryCache;
    const general = runtime?.general || DEFAULT_GENERAL_SETTINGS;
    const systemName = String(general.systemName || DEFAULT_GENERAL_SETTINGS.systemName).trim();
    const companyName = String(general.companyName || DEFAULT_GENERAL_SETTINGS.companyName).trim();
    const logoUrl = String(general.companyLogoUrl || DEFAULT_GENERAL_SETTINGS.companyLogoUrl).trim();

    if (logoUrl) {
        root.querySelectorAll?.('img.logo, img[data-system-logo]').forEach(image => {
            image.src = logoUrl;
            image.alt = companyName || image.alt || 'Logo';
        });
    }

    root.querySelectorAll?.('[data-system-name]').forEach(element => { element.textContent = systemName; });
    root.querySelectorAll?.('[data-company-name]').forEach(element => { element.textContent = companyName; });
    root.querySelectorAll?.('h1').forEach(element => {
        if (element.textContent.trim() === DEFAULT_GENERAL_SETTINGS.systemName) element.textContent = systemName;
    });

    if (document?.title) {
        document.title = document.title
            .replaceAll(DEFAULT_GENERAL_SETTINGS.systemName, systemName)
            .replaceAll('DAR ALDAWAA', companyName || 'DAR ALDAWAA');
    }

    const currencyLabel = String(general.currencyLabel || DEFAULT_GENERAL_SETTINGS.currencyLabel).trim();
    const currencyPattern = /د\.\s*[اأإآا]/g;
    const replaceCurrencyText = node => {
        if (!node || !currencyLabel) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const parentTag = node.parentElement?.tagName || '';
            if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION'].includes(parentTag)) return;
            const nextValue = String(node.nodeValue || '').replace(currencyPattern, currencyLabel);
            if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
            const next = walker.nextNode();
            replaceCurrencyText(current);
            current = next;
        }
    };
    replaceCurrencyText(root);
    if (!window.__DAD_CURRENCY_OBSERVER__) {
        window.__DAD_CURRENCY_OBSERVER__ = new MutationObserver(mutations => {
            mutations.forEach(mutation => mutation.addedNodes.forEach(replaceCurrencyText));
        });
        window.__DAD_CURRENCY_OBSERVER__.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    document.documentElement.dataset.systemName = systemName;
    document.documentElement.dataset.companyName = companyName;
    document.documentElement.dataset.currencyLabel = currencyLabel;
    window.__DAD_SYSTEM_GENERAL__ = general;
    return general;
}

export function getCurrencyLabel(config = null) {
    return String((config || memoryCache)?.general?.currencyLabel || DEFAULT_GENERAL_SETTINGS.currencyLabel);
}

export function invalidateSystemConfigCache() {
    memoryCache = null;
    memorySavedAt = 0;
    try { localStorage.removeItem(CONFIG_CACHE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(CONFIG_CACHE_KEY); } catch (_) {}
}

export async function hashPassword(password = '') {
    const text = String(password || '');
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `sha256:${hex}`;
}

export async function verifyPassword(password = '', storedHash = '') {
    const input = String(password || '');
    const hash = String(storedHash || '').trim();
    if (!hash) return false;
    if (hash.startsWith('sha256:')) return (await hashPassword(input)) === hash;
    if (/^[a-f0-9]{64}$/i.test(hash)) return (await hashPassword(input)).slice(7) === hash.toLowerCase();
    try { return btoa(unescape(encodeURIComponent(input))) === hash || btoa(input) === hash; } catch (_) { return input === hash; }
}

export function routeForRole(role = '', customRoute = '') {
    return customRoute || ROLE_ROUTES[normalizeRole(role)] || 'login.html';
}

export function getAdminSession() {
    const read = (storage, persistent = false) => {
        try {
            const raw = storage.getItem(ADMIN_SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session?.name || !session?.token) throw new Error('Invalid session');
            if (persistent && Date.now() - Number(session.savedAt || 0) > ADMIN_SESSION_TTL) {
                storage.removeItem(ADMIN_SESSION_KEY);
                return null;
            }
            return session;
        } catch (_) {
            try { storage.removeItem(ADMIN_SESSION_KEY); } catch (__) {}
            return null;
        }
    };
    return read(localStorage, true) || read(sessionStorage, false);
}

export function sessionRole(session = getAdminSession()) {
    return normalizeRole(session?.role || session?.type || '');
}

export async function hasPermission(permission, session = getAdminSession(), config = null) {
    const runtime = config || await loadSystemConfig();
    const role = sessionRole(session);
    const user = role
        ? runtime.users.find(item => item.id === session?.userId) || runtime.users.find(item => item.displayName === session?.name && item.role === role)
        : null;

    // الحساب المعطّل لا يبقى صالحاً حتى لو كانت هناك جلسة محفوظة قديمة.
    if (user?.active === false) return false;
    if (!runtime.general?.enforcePermissions) return true;
    if (!role || !user) return false;
    if (Object.prototype.hasOwnProperty.call(user.permissions || {}, permission)) return user.permissions[permission] === true;
    return runtime.rolePermissions?.[role]?.[permission] === true;
}

export async function guardPage(permission, options = {}) {
    const config = await loadSystemConfig();
    const allowed = await hasPermission(permission, getAdminSession(), config);
    if (allowed) return true;
    const target = options.redirect || 'login.html?forceLogin=1';
    if (options.silent !== true) alert(options.message || 'لا تملك صلاحية فتح هذه الشاشة.');
    window.location.replace(target);
    return false;
}

export async function applyPermissionVisibility(root = document) {
    const elements = Array.from(root.querySelectorAll('[data-permission]'));
    await Promise.all(elements.map(async element => {
        const allowed = await hasPermission(element.dataset.permission || '');
        element.hidden = !allowed;
        if ('disabled' in element) element.disabled = !allowed;
    }));
}
