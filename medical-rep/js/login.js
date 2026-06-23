import { db, collection, getDocs, query, where } from './firebase.js';

const C = window.medrepCommon;

function normalizeBirthDate(value = ``) {
    if (!value) return ``;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value).trim();
    return C.toDateInputValue(date);
}

async function login() {
    const employeeNo = C.$(`employeeNo`)?.value.trim() || ``;
    const birthDate = normalizeBirthDate(C.$(`birthDate`)?.value || ``);
    const remember = !!C.$(`rememberMe`)?.checked;
    const button = C.$(`loginBtn`);

    if (!employeeNo || !birthDate) return C.showToast(`أدخل الرقم الوظيفي وتاريخ الميلاد.`, `warning`);

    try {
        C.setLoading(button, true, `تسجيل الدخول`);
        const q = query(collection(db, `medicalReps`), where(`employeeNo`, `==`, employeeNo));
        const snap = await getDocs(q);
        let found = null;
        snap.forEach(item => {
            const data = item.data();
            if (String(data.birthDate || ``).trim() === birthDate && data.active !== false) {
                found = { id: item.id, ...data };
            }
        });

        if (!found) {
            C.showToast(`بيانات الدخول غير صحيحة أو الحساب غير مفعّل.`, `error`);
            return;
        }

        C.saveSession({
            id: found.id,
            employeeNo: found.employeeNo,
            name: found.name,
            normalizedName: found.normalizedName || C.normalizeArabic(found.name),
            team: found.team || ``,
            role: `medical_rep`
        }, remember);
        window.location.href = `dashboard.html`;
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر الاتصال ببيانات بوابة الدعاية الطبية.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function init() {
    if (C.readSession()?.role === `medical_rep`) {
        window.location.href = `dashboard.html`;
        return;
    }
    C.$(`loginBtn`)?.addEventListener(`click`, login);
    [`employeeNo`, `birthDate`].forEach(id => {
        C.$(id)?.addEventListener(`keydown`, event => {
            if (event.key === `Enter`) login();
        });
    });
}

init();
