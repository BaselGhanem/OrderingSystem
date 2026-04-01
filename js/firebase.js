// استدعاء مكتبات فايربيس
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات مشروعك
const firebaseConfig = {
    apiKey: "AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g",
    authDomain: "dad-ordering-system.firebaseapp.com",
    projectId: "dad-ordering-system",
    storageBucket: "dad-ordering-system.firebasestorage.app",
    messagingSenderId: "43886677849",
    appId: "1:43886677849:web:de5f80c06e1b743c948648"
};

// تهيئة الاتصال
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// تصدير المتغيرات لنستخدمها في ملفات أخرى
export { db, collection, getDocs, query, where };
