import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
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
    documentId,
    writeBatch,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g",
    authDomain: "dad-ordering-system.firebaseapp.com",
    projectId: "dad-ordering-system",
    storageBucket: "dad-ordering-system.firebasestorage.app",
    messagingSenderId: "43886677849",
    appId: "1:43886677849:web:de5f80c06e1b743c948648"
};

const app = initializeApp(firebaseConfig);

// The previous auto-detected WebChannel transport was repeatedly losing the
// Firestore Listen back-channel and falling into offline mode. Force long
// polling for this operational web app so proxies, antivirus software and
// restrictive networks cannot indefinitely buffer the realtime stream.
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: {
        timeoutSeconds: 25
    },
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

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
    documentId,
    writeBatch,
    runTransaction
};
