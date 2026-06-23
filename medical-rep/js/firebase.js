import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    getDocs,
    query,
    where,
    setDoc,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: `AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g`,
    authDomain: `dad-ordering-system.firebaseapp.com`,
    projectId: `dad-ordering-system`,
    storageBucket: `dad-ordering-system.firebasestorage.app`,
    messagingSenderId: `43886677849`,
    appId: `1:43886677849:web:de5f80c06e1b743c948648`
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
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
    setDoc,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp
};
