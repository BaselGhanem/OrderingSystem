const MEDREP_SESSION_KEY = `dad_medical_rep_session_v1`;
const MEDREP_ADMIN_SESSION_KEY = `dad_medical_rep_admin_v1`;
const ADMIN_SECRET_HASH = `MjAyNjA0`;
const OTHER_AREA_KEYS = [`اخرين`, `آخرين`, `others`, `other`, `منطقة اخرين`, `منطقة آخرين`];

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
    isWithinRange,
    makeDocId,
    readSession,
    saveSession,
    clearSession,
    readAdminSession,
    saveAdminSession,
    clearAdminSession,
    setLoading,
    showToast,
    isOtherArea,
    rowValue,
    readExcelFile,
    downloadWorkbook,
    ADMIN_SECRET_HASH
};
