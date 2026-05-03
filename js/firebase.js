import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
    doc, 
    updateDoc,       
    getDoc,         
    onSnapshot                         
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// إعدادات الاتصال بقاعدة البيانات (كما هي بدون تغيير)
const firebaseConfig = {
    apiKey: "AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g",
    authDomain: "dad-ordering-system.firebaseapp.com",
    projectId: "dad-ordering-system",
    storageBucket: "dad-ordering-system.firebasestorage.app",
    messagingSenderId: "43886677849",
    appId: "1:43886677849:web:de5f80c06e1b743c948648"
};

// 1. تهيئة التطبيق الأساسي
const app = initializeApp(firebaseConfig);

// 2. تهيئة Firestore مع تفعيل "وضع عدم الاتصال" (Offline Persistence)
// هذا السطر هو العصب الأساسي الذي يجعل النظام يعمل في المستودعات أو المناطق بدون تغطية إنترنت
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        // استخدام تبويبات متعددة لضمان عدم تعطل الكاش إذا فتح المستخدم النظام في أكثر من شاشة
        tabManager: persistentMultipleTabManager()
    })
});

// 3. تصدير جميع الأدوات ليتم استخدامها في app.js
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
    onSnapshot    
};
