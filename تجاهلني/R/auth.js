import { db, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from './firebase.js';

const ACCESS_SESSION = `returns_access_context_v4_firestore_users`;
export const USER_CONFIG_COLLECTION = `returns_users_config`;

export const STAFF_ROLES = {
    returns_manager: { label: `رئيس قسم الطلبيات`, page: `returns_manager.html` },
    market_manager: { label: `مدير السوق`, page: `market_manager.html` },
    finance: { label: `المالية`, page: `finance.html` },
    admin: { label: `إدارة بيانات المرتجعات`, page: `Admin.html` },
    reports: { label: `تقارير المرتجعات`, page: `reports.html` }
};

export const ROLE_LABELS = {
    representative: `مندوب`,
    supervisor: `مشرف`,
    ...Object.fromEntries(Object.entries(STAFF_ROLES).map(([key, value]) => [key, value.label]))
};

const BOOTSTRAP_USERS = [
    { id:`rep_1w7xikdm7fod`, role:`representative`, displayName:`مراد الظاهر`, active:true, passwordSalt:`f9aaf7a908727d04755d23472b1c083b`, passwordHash:`0ffb2062e3e196821222c801bf155943951ec5568d2825c1137a316ec50bae0a` },
    { id:`rep_szp6kk15qept2`, role:`representative`, displayName:`محمد ابو يامين`, active:true, passwordSalt:`666aed318c68649f3da09c5b93400e48`, passwordHash:`b1744cacdfcac179eb45173803e97d39bad23b4cab442d7bf6add5d2364151bc` },
    { id:`rep_d9g32a1v1j92`, role:`representative`, displayName:`يزيد الرقب`, active:true, passwordSalt:`7ada3c8cb7202e5eac4202ce64896f55`, passwordHash:`3d8522c701f730244378b3837361257ff7fc96c0a523fbf81d0b098624a8b25b` },
    { id:`rep_1xpc5d91p1fxgt`, role:`representative`, displayName:`مؤيد الزعبي`, active:true, passwordSalt:`fa32a1790d9f2708a09c3533ba82ba0c`, passwordHash:`59774c7903cbad6e0c7517886949683e2d6a5099d32c8c69b8fedf43e2cd1c18` },
    { id:`rep_l8vyordsbjqd`, role:`representative`, displayName:`اجود التلهوني`, active:true, passwordSalt:`2174be4c2d999a336784f71a2f7926e9`, passwordHash:`5aeebc1803f8dd422b4286f022bf5f0195f709a06e1835e6c275fa66bbedf5fc` },
    { id:`rep_ytzqfh1tq1dat`, role:`representative`, displayName:`تامر عقل`, active:true, passwordSalt:`5406a6cd86760c7ec0b03e11171e52d5`, passwordHash:`91c9cf176d34fea9faf171c7df3024de865f92913ab7c2770cae7e5651bd6092` },
    { id:`rep_1mmvupg1gd122`, role:`representative`, displayName:`محمد الفاعوري`, active:true, passwordSalt:`beb8fb70ccfa03c32bb02ff26c749abd`, passwordHash:`f33d75406de6de57e8a1f22d6db36615163aefb330f767fe141f73b7c6ccb699` },
    { id:`rep_5svek81szj1me`, role:`representative`, displayName:`مراد عمر`, active:true, passwordSalt:`4b7a01858faac09895582b47f4044ce4`, passwordHash:`8d3f83a21f04cda371cf633c091aad86bcf525a6bf44545de38dd650d0249bd4` },
    { id:`rep_9i9v158zuuuh`, role:`representative`, displayName:`محمد عبدربه`, active:true, passwordSalt:`e7d671e2cfb834cbe164ccc93c45ad97`, passwordHash:`0a20b742192eb47fec8256cabc8f89477ea2618029333e84e586200086faa35a` },
    { id:`supervisor_pp33jd6x37ld`, role:`supervisor`, displayName:`عبدالله الناطور`, active:true, passwordSalt:`58e4d84eaefdf8ae6b72c98c95114ca3`, passwordHash:`612eff69653ff2b6abce5e8d309c1c39b1fce3405e2855ec90503a37744af80d` },
    { id:`supervisor_173vtigjs38ym`, role:`supervisor`, displayName:`محمد طوالبه`, active:true, passwordSalt:`df701519e9e09c2eb4cb53bc99b9e254`, passwordHash:`63325bf07119a53a95369170092b0bf5896cd8851c5c1de2b77952e00b83f35e` },
    { id:`role_returns_manager`, role:`returns_manager`, displayName:`رئيس قسم الطلبيات`, active:true, passwordSalt:`10cae9571125beb93e6105f0959862e0`, passwordHash:`b16cb61f12fa3b1b98d1896c4106b1bc4f49731bc8154b336c06e3ca529cc6e4` },
    { id:`role_market_manager`, role:`market_manager`, displayName:`مدير السوق`, active:true, passwordSalt:`7d21179fd33b1fb31d10908f3a808373`, passwordHash:`b59351512bac584d63700e52739249609a2c1d9f57e5f06323f2133471c67f3e` },
    { id:`role_finance`, role:`finance`, displayName:`المالية`, active:true, passwordSalt:`c65703eea95e3cdb087223b8adbb37ec`, passwordHash:`2800db8623bd3137e148060f39ad9aab12f67265869b3597882dde4e0f4311fd` },
    { id:`role_admin`, role:`admin`, displayName:`إدارة بيانات المرتجعات`, active:true, passwordSalt:`78c2dc2177150929f1a2bdf8f629d508`, passwordHash:`b9260fb7988657e95ff1cbf19df4363fe103fcef518673e45ae975b373a4e2c7` },
    { id:`role_reports`, role:`reports`, displayName:`تقارير المرتجعات`, active:true, passwordSalt:`e13d41b5a21c09aa43a61c4787087372`, passwordHash:`4ca4907495c6b11a75ea37033adc1f91e7efb418d72f98df7d51c727c9c32895` }
];

const normalize = value => String(value ?? ``).trim().toLocaleLowerCase(`ar`).replace(/\s+/g, ` `);
const PASSWORD_ITERATIONS = 150000;
const PASSWORD_ALGORITHM = `PBKDF2-SHA256`;
let directoryCache = null;

function saveSession(profile) {
    const safe = {
        uid: profile.uid,
        role: profile.role,
        displayName: profile.displayName || ``,
        repKey: profile.repKey || ``,
        supervisorKey: profile.supervisorKey || ``,
        createdAt: Date.now()
    };
    sessionStorage.setItem(ACCESS_SESSION, JSON.stringify(safe));
    return safe;
}

async function hashPin(pin, salt, iterations = PASSWORD_ITERATIONS) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(`raw`, encoder.encode(String(pin ?? ``).trim()), { name: `PBKDF2` }, false, [`deriveBits`]);
    const saltBytes = Uint8Array.from(String(salt).match(/.{1,2}/g) || [], byte => parseInt(byte, 16));
    const bits = await crypto.subtle.deriveBits({ name: `PBKDF2`, salt: saltBytes, iterations: Number(iterations) || PASSWORD_ITERATIONS, hash: `SHA-256` }, keyMaterial, 256);
    return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, `0`)).join(``);
}

function randomSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, `0`)).join(``);
}

function publicUser(user) {
    return {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        active: user.active !== false,
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null
    };
}

async function readFirebaseDirectory() {
    const snapshot = await getDocs(collection(db, USER_CONFIG_COLLECTION));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function getDirectory({ includeInactive = false, force = false } = {}) {
    if (!force && directoryCache) {
        return includeInactive ? directoryCache : directoryCache.filter(user => user.active !== false);
    }
    const firebaseUsers = await readFirebaseDirectory();
    directoryCache = firebaseUsers.length ? firebaseUsers : BOOTSTRAP_USERS.map(user => ({ ...user, bootstrap: true }));
    return includeInactive ? directoryCache : directoryCache.filter(user => user.active !== false);
}

export function readAccessSession() {
    try { return JSON.parse(sessionStorage.getItem(ACCESS_SESSION) || `null`); }
    catch (_) { return null; }
}

export function clearAccessSession() {
    sessionStorage.removeItem(ACCESS_SESSION);
}

export async function getLoginDirectory() {
    const users = await getDirectory();
    return users.map(publicUser).sort((a, b) => a.displayName.localeCompare(b.displayName, `ar`));
}

export async function listUserConfigs() {
    const users = await getDirectory({ includeInactive: true, force: true });
    return users.map(publicUser).sort((a, b) => {
        const roleCompare = (ROLE_LABELS[a.role] || a.role).localeCompare(ROLE_LABELS[b.role] || b.role, `ar`);
        return roleCompare || a.displayName.localeCompare(b.displayName, `ar`);
    });
}

export async function ensureUserDirectorySeeded() {
    const current = await readFirebaseDirectory();
    if (current.length) {
        directoryCache = current;
        return false;
    }
    await Promise.all(BOOTSTRAP_USERS.map(user => setDoc(doc(db, USER_CONFIG_COLLECTION, user.id), {
        role: user.role,
        displayName: user.displayName,
        active: true,
        passwordSalt: user.passwordSalt,
        passwordHash: user.passwordHash,
        passwordAlgorithm: PASSWORD_ALGORITHM,
        passwordIterations: PASSWORD_ITERATIONS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    })));
    directoryCache = null;
    await getDirectory({ includeInactive: true, force: true });
    return true;
}

export async function loginWithPin(role, identity, pin) {
    const cleanIdentity = String(identity ?? ``).trim();
    const users = await getDirectory({ includeInactive: true, force: true });
    let candidate;
    if (role === `representative` || role === `supervisor`) {
        candidate = users.find(user => user.role === role && normalize(user.displayName) === normalize(cleanIdentity));
    } else {
        candidate = users.find(user => user.role === role);
    }
    if (!candidate || candidate.active === false) throw new Error(`اسم المستخدم أو كلمة السر غير صحيحة.`);
    const attemptedHash = await hashPin(pin, candidate.passwordSalt || ``, candidate.passwordIterations || PASSWORD_ITERATIONS);
    if (!candidate.passwordHash || attemptedHash !== candidate.passwordHash) throw new Error(`اسم المستخدم أو كلمة السر غير صحيحة.`);

    return saveSession({
        uid: candidate.id,
        role: candidate.role,
        displayName: candidate.displayName,
        repKey: candidate.role === `representative` ? normalize(candidate.displayName) : ``,
        supervisorKey: candidate.role === `supervisor` ? normalize(candidate.displayName) : ``
    });
}

export async function saveUserConfig({ id = ``, displayName, role, pin = ``, active = true }) {
    const cleanName = String(displayName ?? ``).trim();
    const cleanRole = String(role ?? ``).trim();
    if (!cleanName) throw new Error(`اسم المستخدم مطلوب.`);
    if (!ROLE_LABELS[cleanRole]) throw new Error(`الدور غير صحيح.`);
    if (pin && String(pin).trim().length < 4) throw new Error(`كلمة السر يجب أن تكون 4 خانات على الأقل.`);

    await ensureUserDirectorySeeded();
    const allUsers = await getDirectory({ includeInactive: true, force: true });
    const editing = id ? allUsers.find(user => user.id === id) : null;
    if (id && !editing) throw new Error(`المستخدم غير موجود.`);
    if (editing && editing.role !== cleanRole) throw new Error(`لا يمكن تغيير نوع المستخدم بعد إنشائه. احذف المستخدم وأضفه من جديد.`);

    const duplicate = allUsers.find(user => user.id !== id && user.role === cleanRole && normalize(user.displayName) === normalize(cleanName));
    if (duplicate) throw new Error(`يوجد مستخدم بنفس الاسم والدور.`);
    if (STAFF_ROLES[cleanRole]) {
        const duplicateRole = allUsers.find(user => user.id !== id && user.role === cleanRole);
        if (duplicateRole) throw new Error(`يوجد حساب واحد فقط لهذا الدور الإداري.`);
    }

    if (editing?.role === `admin` && editing.active !== false && !active) {
        const otherAdmins = allUsers.filter(user => user.id !== id && user.role === `admin` && user.active !== false);
        if (!otherAdmins.length) throw new Error(`لا يمكن تعطيل آخر حساب Admin فعال.`);
    }

    let passwordSalt = editing?.passwordSalt || ``;
    let passwordHash = editing?.passwordHash || ``;
    if (!editing && !pin) throw new Error(`كلمة السر مطلوبة عند إضافة مستخدم جديد.`);
    if (pin) {
        passwordSalt = randomSalt();
        passwordHash = await hashPin(pin, passwordSalt);
    }

    const userId = editing?.id || `${cleanRole}_${crypto.randomUUID().replace(/-/g, ``)}`;
    await setDoc(doc(db, USER_CONFIG_COLLECTION, userId), {
        role: cleanRole,
        displayName: cleanName,
        active: Boolean(active),
        passwordSalt,
        passwordHash,
        passwordAlgorithm: PASSWORD_ALGORITHM,
        passwordIterations: PASSWORD_ITERATIONS,
        createdAt: editing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
    directoryCache = null;
    return userId;
}

export async function deleteUserConfig(id) {
    await ensureUserDirectorySeeded();
    const allUsers = await getDirectory({ includeInactive: true, force: true });
    const user = allUsers.find(item => item.id === id);
    if (!user) return;
    if (user.role === `admin` && user.active !== false) {
        const otherAdmins = allUsers.filter(item => item.id !== id && item.role === `admin` && item.active !== false);
        if (!otherAdmins.length) throw new Error(`لا يمكن حذف آخر حساب Admin فعال.`);
    }
    await deleteDoc(doc(db, USER_CONFIG_COLLECTION, id));
    directoryCache = null;
}

export async function logoutReturns() {
    clearAccessSession();
}

export async function requireReturnsAuth(allowedRoles = []) {
    const profile = readAccessSession();
    if (!profile?.role) return null;
    if (allowedRoles.length && !allowedRoles.includes(profile.role)) return null;

    // If the Firebase directory already exists, enforce active status for every fresh page load.
    try {
        const firebaseUsers = await readFirebaseDirectory();
        if (firebaseUsers.length) {
            const current = firebaseUsers.find(user => user.id === profile.uid);
            if (!current || current.active === false || current.role !== profile.role) {
                clearAccessSession();
                return null;
            }
            profile.displayName = current.displayName || profile.displayName;
            if (profile.role === `representative`) profile.repKey = normalize(profile.displayName);
            if (profile.role === `supervisor`) profile.supervisorKey = normalize(profile.displayName);
            sessionStorage.setItem(ACCESS_SESSION, JSON.stringify(profile));
        }
    } catch (error) {
        console.warn(`تعذر التحقق من حالة المستخدم من Firebase.`, error);
    }
    return profile;
}

export function pageForRole(role) {
    if (role === `representative`) return `rep.html`;
    if (role === `supervisor`) return `supervisor.html`;
    return STAFF_ROLES[role]?.page || `login.html`;
}
