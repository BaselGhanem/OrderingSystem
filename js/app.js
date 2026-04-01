// استيراد دالة الحذف من firebase
import { deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// دالة جلب التقارير وتحديث الجدول
async function loadReports() {
    const body = document.getElementById('reportsBody');
    body.innerHTML = '<tr><td colspan="7">جاري التحميل...</td></tr>';
    
    try {
        const snap = await getDocs(collection(db, "orders"));
        body.innerHTML = '';
        
        let ordersArray = [];
        snap.forEach(doc => ordersArray.push({ id: doc.id, ...doc.data() }));
        ordersArray.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        ordersArray.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${order.id.substring(0, 5).toUpperCase()}</b></td>
                <td>${order.createdAt.toDate().toLocaleString('ar-JO')}</td>
                <td>${order.repName}</td>
                <td>${order.pharmacyName}</td>
                <td>${order.grandTotal.toFixed(2)}</td>
                <td><span class="status-badge">قيد الانتظار</span></td>
                <td class="actions-cell">
                    <button class="btn-view" title="عرض الأصناف"><i class="ph ph-eye"></i></button>
                    <button class="btn-delete-report" title="حذف الطلبية"><i class="ph ph-trash"></i></button>
                </td>
            `;

            // برمجة زر العرض
            tr.querySelector('.btn-view').onclick = () => viewOrderDetails(order.items);
            
            // برمجة زر الحذف
            tr.querySelector('.btn-delete-report').onclick = () => deleteOrder(order.id);

            body.appendChild(tr);
        });
    } catch (e) {
        body.innerHTML = '<tr><td colspan="7">حدث خطأ في جلب البيانات</td></tr>';
    }
}

// دالة حذف الطلبية
async function deleteOrder(orderId) {
    if (confirm("هل أنت متأكد من حذف هذه الطلبية نهائياً؟")) {
        try {
            await deleteDoc(doc(db, "orders", orderId));
            alert("تم حذف الطلبية بنجاح");
            loadReports(); // إعادة تحميل الجدول
        } catch (e) {
            alert("فشل الحذف، حاول مرة أخرى");
        }
    }
}

// دالة عرض تفاصيل الأصناف
function viewOrderDetails(items) {
    const modal = document.getElementById('detailsModal');
    const body = document.getElementById('modalItemsBody');
    body.innerHTML = '';

    items.forEach(item => {
        body.innerHTML += `
            <tr>
                <td>${item.name || item.productName}</td>
                <td>${item.qty || item.quantity}</td>
                <td>${item.bonus}</td>
                <td>${parseFloat(item.price).toFixed(2)}</td>
                <td>${parseFloat(item.total || item.lineTotal).toFixed(2)}</td>
            </tr>
        `;
    });

    modal.style.display = 'flex';
}

// إغلاق النافذة المنبثقة
window.closeModal = () => {
    document.getElementById('detailsModal').style.display = 'none';
};

// إغلاق النافذة عند الضغط خارجها
window.onclick = (event) => {
    const modal = document.getElementById('detailsModal');
    if (event.target == modal) closeModal();
};
