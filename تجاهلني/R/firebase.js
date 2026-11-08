import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    initializeFirestore,
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
    runTransaction,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Firebase project dedicated ONLY to the Returns system.
// Firebase Authentication is intentionally not used.
// Login users are managed from Admin.html in returns_users_config; only salted PBKDF2 hashes are stored, never plaintext passwords.
// Historical customer sales used to validate returns are uploaded independently from Admin.html.
const firebaseConfig = {
    apiKey: "AIzaSyAWVQYXYvAFLSqwBxfqxe4DTnjsOyVqQwk",
    authDomain: "dad-returns.firebaseapp.com",
    projectId: "dad-returns",
    storageBucket: "dad-returns.firebasestorage.app",
    messagingSenderId: "573922926622",
    appId: "1:573922926622:web:b8f562e9773219a05e8e0f"
};

const app = initializeApp(firebaseConfig, `returns-app`);
const db = initializeFirestore(app, {});

export {
    app,
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
    runTransaction,
    serverTimestamp,
    Timestamp
};
