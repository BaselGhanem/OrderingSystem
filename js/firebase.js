import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where,
    addDoc,
    deleteDoc,
    setDoc,
    doc,
    updateDoc,
    getDoc,
    orderBy,
    limit,
    startAfter,
    documentId
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-lite.js";

// إعدادات الاتصال بقاعدة البيانات (كما هي بدون تغيير)
const firebaseConfig = {
    apiKey: "AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g",
    authDomain: "dad-ordering-system.firebaseapp.com",
    projectId: "dad-ordering-system",
    storageBucket: "dad-ordering-system.firebasestorage.app",
    messagingSenderId: "43886677849",
    appId: "1:43886677849:web:de5f80c06e1b743c948648"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SNAPSHOT_POLL_INTERVAL_MS = 30000;

function onSnapshot(source, next, error) {
    let stopped = false;
    let loading = false;
    let timerId = null;

    const load = async () => {
        if (stopped || loading) return;
        loading = true;
        try {
            const snap = await getDocs(source);
            if (!stopped && typeof next === 'function') next(snap);
        } catch (err) {
            console.error('Firestore load failed', err);
            if (!stopped && typeof error === 'function') error(err);
        } finally {
            loading = false;
        }
    };

    load();
    if (typeof window !== 'undefined') {
        timerId = window.setInterval(load, SNAPSHOT_POLL_INTERVAL_MS);
    }

    return () => {
        stopped = true;
        if (timerId && typeof window !== 'undefined') window.clearInterval(timerId);
    };
}

export {
    db,
    collection,
    getDocs,
    query,
    where,
    addDoc,
    deleteDoc,
    setDoc,
    doc,
    updateDoc,
    getDoc,
    onSnapshot,
    orderBy,
    limit,
    startAfter,
    documentId
};
