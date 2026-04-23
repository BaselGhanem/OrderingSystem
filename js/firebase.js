import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore,               // ✅ بديلة لـ getFirestore لتمكين إعدادات متقدمة
    persistentLocalCache,              // ✅ لتفعيل الكاش المحلي
    persistentMultipleTabManager,      // ✅ لضمان عمل الكاش حتى لو فتح المستخدم عدة تبويبات
    collection, 
    getDocs, 
    query, 
    where, 
    addDoc, 
    deleteDoc, 
    doc, 
    updateDoc,       
    getDoc,         
    onSnapshot                         // ✅ السلاح السري للتحديث الفوري وتقليل التكلفة
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g",
    authDomain: "dad-ordering-system.firebaseapp.com",
    projectId: "dad-ordering-system",
    storageBucket: "dad-ordering-system.firebasestorage.app",
    messagingSenderId: "43886677849",
    appId: "1:43886677849:web:de5f80c06e1b743c948648"
};

const app = initializeApp(firebaseConfig);

// ✅ تهيئة قاعدة البيانات مع تفعيل التخزين المحلي (IndexedDB)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// تصدير كل الأدوات
export { 
    db, 
    collection, 
    getDocs, 
    query, 
    where, 
    addDoc, 
    deleteDoc, 
    doc, 
    updateDoc,   
    getDoc,
    onSnapshot    // ✅ تم التصدير بنجاح لاستخدامها في app.js
};
