// ========================================
// 🔥 FIREBASE CONFIGURATION v2.0
// ========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    limit,
    onSnapshot,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getAuth, 
    signInAnonymously,
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ===== FIREBASE CONFIG =====
// ⚠️ استبدل هذه البيانات بـ Firebase Project الخاص بك
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};

// ===== INITIALIZE FIREBASE =====
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== AUTHENTICATION =====
export async function initializeAuth() {
    try {
        await signInAnonymously(auth);
        console.log('✓ Firebase Auth initialized');
    } catch (error) {
        console.error('Firebase Auth error:', error);
    }
}

// ===== ORDERS COLLECTION =====
export const OrdersManager = {
    // إضافة طلبية جديدة
    async addOrder(orderData) {
        try {
            const docRef = await addDoc(collection(db, 'orders'), {
                ...orderData,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                synced: true
            });
            console.log('✓ Order added:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error adding order:', error);
            throw error;
        }
    },

    // الحصول على جميع الطلبيات للمندوب
    async getOrdersByRep(repId) {
        try {
            const q = query(
                collection(db, 'orders'),
                where('repId', '==', repId),
                orderBy('createdAt', 'desc'),
                limit(100)
            );
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting orders:', error);
            return [];
        }
    },

    // الحصول على الطلبيات بناءً على التاريخ
    async getOrdersByDateRange(startDate, endDate) {
        try {
            const q = query(
                collection(db, 'orders'),
                where('createdAt', '>=', Timestamp.fromDate(new Date(startDate))),
                where('createdAt', '<=', Timestamp.fromDate(new Date(endDate))),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting orders by date:', error);
            return [];
        }
    },

    // تحديث حالة الطلبية
    async updateOrderStatus(orderId, status) {
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                status,
                updatedAt: Timestamp.now()
            });
            console.log('✓ Order status updated:', orderId);
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
    },

    // حذف طلبية
    async deleteOrder(orderId) {
        try {
            await deleteDoc(doc(db, 'orders', orderId));
            console.log('✓ Order deleted:', orderId);
        } catch (error) {
            console.error('Error deleting order:', error);
            throw error;
        }
    },

    // الاستماع للتغييرات في الوقت الفعلي
    subscribeToOrders(repId, callback) {
        const q = query(
            collection(db, 'orders'),
            where('repId', '==', repId),
            orderBy('createdAt', 'desc')
        );

        return onSnapshot(q, (querySnapshot) => {
            const orders = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(orders);
        }, (error) => {
            console.error('Error subscribing to orders:', error);
        });
    }
};

// ===== REPRESENTATIVES COLLECTION =====
export const RepresentativesManager = {
    // الحصول على جميع المندوبين
    async getAllReps() {
        try {
            const querySnapshot = await getDocs(collection(db, 'representatives'));
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting representatives:', error);
            return [];
        }
    },

    // إضافة مندوب جديد
    async addRep(repData) {
        try {
            const docRef = await addDoc(collection(db, 'representatives'), {
                ...repData,
                createdAt: Timestamp.now()
            });
            console.log('✓ Representative added:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error adding representative:', error);
            throw error;
        }
    },

    // تحديث بيانات المندوب
    async updateRep(repId, repData) {
        try {
            await updateDoc(doc(db, 'representatives', repId), {
                ...repData,
                updatedAt: Timestamp.now()
            });
            console.log('✓ Representative updated:', repId);
        } catch (error) {
            console.error('Error updating representative:', error);
            throw error;
        }
    }
};

// ===== PHARMACIES COLLECTION =====
export const PharmaciesManager = {
    // الحصول على جميع الصيدليات
    async getAllPharmacies() {
        try {
            const querySnapshot = await getDocs(collection(db, 'pharmacies'));
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting pharmacies:', error);
            return [];
        }
    },

    // إضافة صيدلية جديدة
    async addPharmacy(pharmacyData) {
        try {
            const docRef = await addDoc(collection(db, 'pharmacies'), {
                ...pharmacyData,
                createdAt: Timestamp.now()
            });
            console.log('✓ Pharmacy added:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error adding pharmacy:', error);
            throw error;
        }
    }
};

// ===== STATISTICS COLLECTION =====
export const StatisticsManager = {
    // حفظ إحصائيات يومية
    async saveDaily Stats(date, data) {
        try {
            const docRef = await addDoc(collection(db, 'statistics'), {
                date: Timestamp.fromDate(new Date(date)),
                totalOrders: data.totalOrders,
                totalAmount: data.totalAmount,
                completedOrders: data.completedOrders,
                repPerformance: data.repPerformance,
                topPharmacies: data.topPharmacies,
                createdAt: Timestamp.now()
            });
            console.log('✓ Statistics saved:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('Error saving statistics:', error);
            throw error;
        }
    },

    // الحصول على الإحصائيات الشهرية
    async getMonthlyStats(year, month) {
        try {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);

            const q = query(
                collection(db, 'statistics'),
                where('date', '>=', Timestamp.fromDate(startDate)),
                where('date', '<=', Timestamp.fromDate(endDate)),
                orderBy('date', 'desc')
            );

            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting monthly statistics:', error);
            return [];
        }
    }
};

// ===== SYNC MANAGER =====
export const SyncManager = {
    // مزامنة البيانات المحلية مع Firebase
    async syncLocalData() {
        console.log('🔄 Starting sync...');
        try {
            const pendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');

            for (const order of pendingOrders) {
                try {
                    await OrdersManager.addOrder(order);
                    // إزالة من المعلقات بعد الحفظ بنجاح
                    const remaining = pendingOrders.filter(o => o.id !== order.id);
                    localStorage.setItem('pendingOrders', JSON.stringify(remaining));
                } catch (error) {
                    console.warn('Failed to sync order:', order.id);
                }
            }

            console.log('✓ Sync completed');
            return true;
        } catch (error) {
            console.error('Sync error:', error);
            return false;
        }
    },

    // إضافة طلبية للمعلقات إذا فشلت المزامنة
    addToPending(orderData) {
        const pendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
        pendingOrders.push({
            ...orderData,
            id: 'pending_' + Date.now(),
            syncPending: true
        });
        localStorage.setItem('pendingOrders', JSON.stringify(pendingOrders));
    }
};

// ===== INITIALIZE ON LOAD =====
initializeAuth();

// Export Collections
export { 
    db, 
    auth, 
    collection, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    query, 
    where, 
    orderBy,
    onSnapshot,
    Timestamp
};
