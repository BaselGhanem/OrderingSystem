import { db, collection, getDocs, query, where, doc, getDoc } from './firebase.js';

const C = window.medrepCommon;

const TEAM_AUDIT_MANAGERS = [
    { username: `manager1`, passwordHash: `56c2e8a8eb98d18a1f6a967c88c69bafe0171533f8a87fc43648c0a92db58b5a`, displayName: `Manager 1` },
    { username: `manager2`, passwordHash: `67de2152bf76b0f580471aa52abb43b6ae58ea4610e89667c80b83ecef312f6b`, displayName: `Manager 2` },
    { username: `manager3`, passwordHash: `f953b5ac3ee3174a75fe50df348eaa3c19702e85c9bef2f1e4d5c4414b1e2189`, displayName: `Manager 3` }
];

function findTeamAuditManager(username = ``, passwordHash = ``) {
    const key = String(username || ``).trim().toLowerCase();
    return TEAM_AUDIT_MANAGERS.find(user => user.username.toLowerCase() === key && user.passwordHash === passwordHash) || null;
}

function normalizeBirthDate(value = ``) {
    if (!value) return ``;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value).trim();
    return C.toDateInputValue(date);
}

function currentRole() {
    return new URLSearchParams(window.location.search).get(`role`) || ``;
}

function setView(role = ``) {
    const entry = C.$(`portalEntry`);
    const repPanel = C.$(`repLoginPanel`);
    const teamPanel = C.$(`teamLoginPanel`);
    if (entry) entry.hidden = !!role;
    if (repPanel) repPanel.hidden = role !== `rep`;
    if (teamPanel) teamPanel.hidden = role !== `team`;
    document.body.classList.toggle(`login-page`, !!role);
    document.body.classList.toggle(`portal-page`, !role);
    setTimeout(() => {
        if (role === `rep`) C.$(`employeeNo`)?.focus();
        if (role === `team`) C.$(`teamNameInput`)?.focus();
    }, 50);
}

async function loginRep() {
    const employeeNo = C.$(`employeeNo`)?.value.trim() || ``;
    const birthDate = normalizeBirthDate(C.$(`birthDate`)?.value || ``);
    const remember = !!C.$(`rememberMe`)?.checked;
    const button = C.$(`loginBtn`);

    if (!employeeNo || !birthDate) return C.showToast(`أدخل الرقم الوظيفي وتاريخ الميلاد.`, `warning`);

    try {
        C.setLoading(button, true, `دخول`);
        const q = query(collection(db, `medicalReps`), where(`employeeNo`, `==`, employeeNo));
        const snap = await getDocs(q);
        let found = null;
        snap.forEach(item => {
            const data = item.data();
            if (data.role === `medical_team_leader`) return;
            if (String(data.birthDate || ``).trim() === birthDate && data.active !== false) {
                found = { id: item.id, ...data };
            }
        });

        if (!found) {
            C.showToast(`بيانات الدخول غير صحيحة.`, `error`);
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
        C.showToast(`تعذر تسجيل الدخول.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

async function findTeamAccess(teamName = ``) {
    const normalizedTeam = C.normalizeArabic(teamName);
    const directId = C.makeTeamAccessDocId(teamName);
    const directSnap = await getDoc(doc(db, `medicalReps`, directId));
    if (directSnap.exists()) return { id: directSnap.id, ...directSnap.data() };

    const q = query(collection(db, `medicalReps`), where(`normalizedTeam`, `==`, normalizedTeam));
    const snap = await getDocs(q);
    let found = null;
    snap.forEach(item => {
        const data = item.data();
        if (data.role === `medical_team_leader` && data.teamLeaderAccessEnabled !== false && !found) {
            found = { id: item.id, ...data };
        }
    });
    return found;
}

async function loginTeam() {
    const teamName = C.$(`teamNameInput`)?.value.trim() || ``;
    const password = C.$(`teamPassword`)?.value || ``;
    const remember = !!C.$(`rememberTeam`)?.checked;
    const button = C.$(`teamLoginBtn`);

    if (!teamName || !password) return C.showToast(`أدخل اسم الفريق أو حساب المدير وكلمة المرور.`, `warning`);

    try {
        C.setLoading(button, true, `دخول`);
        const incomingHash = await C.hashText(password);
        const auditManager = findTeamAuditManager(teamName, incomingHash);
        if (auditManager) {
            C.saveTeamSession({
                team: ``,
                normalizedTeam: ``,
                username: auditManager.username,
                displayName: auditManager.displayName,
                canViewAllTeams: true,
                role: `medical_team_audit`
            }, remember);
            window.location.href = `team_leader.html`;
            return;
        }

        const access = await findTeamAccess(teamName);
        if (!access || access.teamLeaderAccessEnabled === false || !access.passwordHash || access.passwordHash !== incomingHash) {
            C.showToast(`بيانات الدخول غير صحيحة.`, `error`);
            return;
        }
        C.saveTeamSession({
            team: access.team || teamName,
            normalizedTeam: access.normalizedTeam || C.normalizeArabic(teamName),
            canViewAllTeams: false,
            role: `medical_team_leader`
        }, remember);
        window.location.href = `team_leader.html`;
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تسجيل الدخول.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function init() {
    const role = currentRole();
    if (role === `rep` && C.readSession()?.role === `medical_rep`) {
        window.location.href = `dashboard.html`;
        return;
    }
    if (role === `team` && [`medical_team_leader`, `medical_team_audit`].includes(C.readTeamSession()?.role)) {
        window.location.href = `team_leader.html`;
        return;
    }

    setView(role === `rep` || role === `team` ? role : ``);

    document.querySelectorAll(`[data-back-entry]`).forEach(button => {
        button.addEventListener(`click`, () => {
            history.replaceState({}, ``, `index.html`);
            setView(``);
        });
    });
    C.$(`loginBtn`)?.addEventListener(`click`, loginRep);
    C.$(`teamLoginBtn`)?.addEventListener(`click`, loginTeam);
    [`employeeNo`, `birthDate`].forEach(id => {
        C.$(id)?.addEventListener(`keydown`, event => {
            if (event.key === `Enter`) loginRep();
        });
    });
    [`teamNameInput`, `teamPassword`].forEach(id => {
        C.$(id)?.addEventListener(`keydown`, event => {
            if (event.key === `Enter`) loginTeam();
        });
    });
}

init();
