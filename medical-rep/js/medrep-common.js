const MEDREP_SESSION_KEY = `dad_medical_rep_session_v2`;
const MEDREP_ADMIN_SESSION_KEY = `dad_medical_rep_admin_v1`;
const MEDREP_TEAM_SESSION_KEY = `dad_medical_rep_team_session_v1`;
const ADMIN_SECRET_HASH = `MjAyNjA0`;
const OTHER_AREA_KEYS = [`اخرين`, `آخرين`, `others`, `other`, `منطقة اخرين`, `منطقة آخرين`];
const CACHE_PREFIX = `dad_medrep_cache_v7_`;
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const BACKGROUND_REFRESH_AFTER_MS = 1000 * 60 * 30;


function lockPageHorizontalScroll() {
    try {
        if (!document.body || !document.body.classList.contains(`medrep-dashboard-app`)) return;
        const reset = () => {
            if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
            if (document.documentElement) document.documentElement.scrollLeft = 0;
            if (document.body) document.body.scrollLeft = 0;
        };
        reset();
        window.addEventListener(`resize`, reset, { passive: true });
        window.addEventListener(`orientationchange`, () => setTimeout(reset, 120), { passive: true });
        window.addEventListener(`scroll`, reset, { passive: true });
    } catch (error) {
        console.warn(`تعذر ضبط الإزاحة الأفقية:`, error);
    }
}

if (document.readyState === `loading`) {
    document.addEventListener(`DOMContentLoaded`, lockPageHorizontalScroll, { once: true });
} else {
    lockPageHorizontalScroll();
}

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value = ``) {
    return String(value ?? ``)
        .replace(/&/g, `&amp;`)
        .replace(/</g, `&lt;`)
        .replace(/>/g, `&gt;`)
        .replace(/"/g, `&quot;`)
        .replace(/'/g, `&#039;`);
}

function normalizeArabic(value = ``) {
    return String(value ?? ``)
        .toLowerCase()
        .replace(/[أإآ]/g, `ا`)
        .replace(/ة/g, `ه`)
        .replace(/ى/g, `ي`)
        .replace(/ؤ/g, `و`)
        .replace(/ئ/g, `ي`)
        .replace(/ـ/g, ``)
        .replace(/[\u064B-\u065F]/g, ``)
        .replace(/\s+/g, ` `)
        .trim();
}

function normalizeItem(value = ``) {
    return normalizeArabic(value)
        .replace(/\s*\/\s*/g, `/`)
        .replace(/\s*-\s*/g, ` - `)
        .replace(/\s+/g, ` `)
        .trim();
}

function parseNumber(value) {
    if (value === null || value === undefined || value === ``) return 0;
    if (typeof value === `number`) return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
        .replace(/,/g, ``)
        .replace(/[٪%]/g, ``)
        .replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit)))
        .replace(/[^0-9.\-]/g, ``)
        .trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
    return parseNumber(value).toLocaleString(`en-US`, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatQty(value) {
    return parseNumber(value).toLocaleString(`en-US`, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function toDate(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === `function`) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    if (value._seconds) return new Date(value._seconds * 1000);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date = new Date()) {
    const d = toDate(date) || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, `0`);
    const day = String(d.getDate()).padStart(2, `0`);
    return `${y}-${m}-${day}`;
}

function firstDayOfMonth() {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function formatDate(value) {
    const date = toDate(value);
    if (!date) return `-`;
    return date.toLocaleDateString(`en-GB`);
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return `-`;
    return date.toLocaleString(`en-GB`, { hour: `2-digit`, minute: `2-digit` });
}

function isWithinRange(value, fromValue, toValue) {
    const date = toDate(value);
    if (!date) return false;
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (fromValue) {
        const from = new Date(`${fromValue}T00:00:00`);
        if (day < from.getTime()) return false;
    }
    if (toValue) {
        const to = new Date(`${toValue}T00:00:00`);
        if (day > to.getTime()) return false;
    }
    return true;
}

function makeDocId(parts = []) {
    const source = parts.map(part => normalizeItem(part)).join(`|`);
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
        hash = ((hash << 5) - hash) + source.charCodeAt(i);
        hash |= 0;
    }
    const safe = source
        .replace(/[^a-z0-9\u0600-\u06FF]+/g, `_`)
        .replace(/^_+|_+$/g, ``)
        .slice(0, 80) || `record`;
    return `${safe}_${Math.abs(hash)}`;
}

function readSession() {
    try {
        return JSON.parse(localStorage.getItem(MEDREP_SESSION_KEY) || sessionStorage.getItem(MEDREP_SESSION_KEY) || `null`);
    } catch (error) {
        localStorage.removeItem(MEDREP_SESSION_KEY);
        sessionStorage.removeItem(MEDREP_SESSION_KEY);
        return null;
    }
}

function saveSession(session, remember = false) {
    const payload = JSON.stringify({ ...session, savedAt: Date.now() });
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    target.setItem(MEDREP_SESSION_KEY, payload);
    other.removeItem(MEDREP_SESSION_KEY);
}

function clearSession() {
    localStorage.removeItem(MEDREP_SESSION_KEY);
    sessionStorage.removeItem(MEDREP_SESSION_KEY);
}

function readAdminSession() {
    try {
        return JSON.parse(localStorage.getItem(MEDREP_ADMIN_SESSION_KEY) || sessionStorage.getItem(MEDREP_ADMIN_SESSION_KEY) || `null`);
    } catch (error) {
        localStorage.removeItem(MEDREP_ADMIN_SESSION_KEY);
        sessionStorage.removeItem(MEDREP_ADMIN_SESSION_KEY);
        return null;
    }
}

function saveAdminSession(remember = false) {
    const payload = JSON.stringify({ role: `medical_rep_admin`, savedAt: Date.now() });
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    target.setItem(MEDREP_ADMIN_SESSION_KEY, payload);
    other.removeItem(MEDREP_ADMIN_SESSION_KEY);
}

function clearAdminSession() {
    localStorage.removeItem(MEDREP_ADMIN_SESSION_KEY);
    sessionStorage.removeItem(MEDREP_ADMIN_SESSION_KEY);
}

function readTeamSession() {
    try {
        return JSON.parse(localStorage.getItem(MEDREP_TEAM_SESSION_KEY) || sessionStorage.getItem(MEDREP_TEAM_SESSION_KEY) || `null`);
    } catch (error) {
        localStorage.removeItem(MEDREP_TEAM_SESSION_KEY);
        sessionStorage.removeItem(MEDREP_TEAM_SESSION_KEY);
        return null;
    }
}

function saveTeamSession(session = {}, remember = false) {
    const payload = JSON.stringify({ ...session, role: `medical_team_leader`, savedAt: Date.now() });
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    target.setItem(MEDREP_TEAM_SESSION_KEY, payload);
    other.removeItem(MEDREP_TEAM_SESSION_KEY);
}

function clearTeamSession() {
    localStorage.removeItem(MEDREP_TEAM_SESSION_KEY);
    sessionStorage.removeItem(MEDREP_TEAM_SESSION_KEY);
}

function setLoading(button, loading, text = `جاري المعالجة...`) {
    if (!button) return;
    if (loading) {
        button.dataset.oldText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="ph ph-spinner-gap ph-spin"></i> ${text}`;
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.oldText || button.innerHTML;
    }
}

function showToast(message, type = `info`) {
    let container = $(`toastContainer`);
    if (!container) {
        container = document.createElement(`div`);
        container.id = `toastContainer`;
        container.className = `toast-container`;
        document.body.appendChild(container);
    }
    const icon = type === `success` ? `ph-check-circle` : type === `error` ? `ph-warning-circle` : type === `warning` ? `ph-warning` : `ph-info`;
    const toast = document.createElement(`div`);
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="ph ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

function isOtherArea(area = ``) {
    const normalized = normalizeArabic(area);
    return OTHER_AREA_KEYS.some(key => normalizeArabic(key) === normalized);
}

function rowValue(row = {}, aliases = [], fallback = ``) {
    const keys = Object.keys(row);
    for (const alias of aliases) {
        const exact = keys.find(key => normalizeArabic(key) === normalizeArabic(alias));
        if (exact !== undefined && row[exact] !== undefined && row[exact] !== null && String(row[exact]).trim() !== ``) {
            return row[exact];
        }
    }
    return fallback;
}

function readExcelFile(file, options = {}) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error(`لم يتم اختيار ملف.`));
        if (typeof XLSX === `undefined`) return reject(new Error(`مكتبة Excel غير محملة.`));
        const reader = new FileReader();
        reader.onload = event => {
            try {
                const workbook = XLSX.read(event.target.result, { type: `array` });
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                resolve(XLSX.utils.sheet_to_json(sheet, { defval: ``, raw: false, ...options }));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error(`تعذر قراءة الملف.`));
        reader.readAsArrayBuffer(file);
    });
}

function downloadWorkbook(rows, sheetName, fileName) {
    if (typeof XLSX === `undefined`) return showToast(`مكتبة Excel غير محملة.`, `error`);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
}

function cacheKey(key) {
    return `${CACHE_PREFIX}${key}`;
}

function cacheGet(key, ttlMs = DEFAULT_CACHE_TTL_MS) {
    try {
        const raw = localStorage.getItem(cacheKey(key));
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !payload.savedAt) return null;
        if (ttlMs !== 0 && Date.now() - payload.savedAt > ttlMs) return null;
        return payload;
    } catch (error) {
        localStorage.removeItem(cacheKey(key));
        return null;
    }
}

function cacheSet(key, data) {
    try {
        localStorage.setItem(cacheKey(key), JSON.stringify({ savedAt: Date.now(), data }));
        return true;
    } catch (error) {
        return false;
    }
}

function cacheRemove(key) {
    localStorage.removeItem(cacheKey(key));
}

function clearMedrepCache() {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    });
}

function cacheAgeText(payload) {
    if (!payload?.savedAt) return `غير متاح`;
    const minutes = Math.max(0, Math.round((Date.now() - payload.savedAt) / 60000));
    if (minutes < 1) return `الآن`;
    if (minutes === 1) return `قبل دقيقة`;
    return `قبل ${minutes} دقيقة`;
}

function cacheIsStale(payload, thresholdMs = BACKGROUND_REFRESH_AFTER_MS) {
    if (!payload?.savedAt) return true;
    return Date.now() - payload.savedAt > thresholdMs;
}

function saveAdminImpersonation(rep = {}) {
    saveSession({
        role: `medical_rep`,
        employeeNo: rep.employeeNo || rep.id || ``,
        name: rep.name || rep.medrep || ``,
        normalizedName: rep.normalizedName || normalizeArabic(rep.name || rep.medrep || ``),
        team: rep.team || ``,
        active: rep.active !== false,
        adminPreview: true,
        loginMethod: `admin_direct_open`
    }, true);
}

function sumRows(rows = [], valueKey = `allocatedValue`) {
    return rows.reduce((sum, row) => sum + parseNumber(row[valueKey]), 0);
}

function groupBy(rows = [], keyFactory) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFactory(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    });
    return map;
}

window.medrepCommon = {
    $,
    escapeHtml,
    normalizeArabic,
    normalizeItem,
    parseNumber,
    formatMoney,
    formatQty,
    toDate,
    toDateInputValue,
    firstDayOfMonth,
    formatDate,
    formatDateTime,
    isWithinRange,
    makeDocId,
    readSession,
    saveSession,
    clearSession,
    readAdminSession,
    saveAdminSession,
    clearAdminSession,
    readTeamSession,
    saveTeamSession,
    clearTeamSession,
    setLoading,
    showToast,
    isOtherArea,
    rowValue,
    readExcelFile,
    downloadWorkbook,
    cacheGet,
    cacheSet,
    cacheRemove,
    clearMedrepCache,
    cacheAgeText,
    cacheIsStale,
    saveAdminImpersonation,
    sumRows,
    groupBy,
    ADMIN_SECRET_HASH,
    DEFAULT_CACHE_TTL_MS,
    BACKGROUND_REFRESH_AFTER_MS
};
