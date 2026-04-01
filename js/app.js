// استيراد دالة إضافة المستندات من firebase.js
import { addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const submitOrderBtn = document.getElementById('submitOrderBtn');

submitOrderBtn.addEventListener('click', async () => {
    const rows = document.querySelectorAll('#orderBody tr');
    
    // 1. التحقق من وجود أصناف
    if (rows.length === 0) {
        alert("لا يمكن إرسال طلبية فارغة!");
        return;
    }

    // 2. تجميع بيانات الأصناف من الجدول
    const orderItems = [];
    let isValid = true;

    rows.forEach(row => {
        const productSelect = row.querySelector('.product-select');
        const qtyInput = row.querySelector('.qty-input');
        const bonusInput = row.querySelector('.bonus-input');
        const price = row.querySelector('.price-cell').innerText;
        const total = row.querySelector('.row-total').innerText;

        if (!productSelect.value) {
            isValid = false;
            return;
        }

        orderItems.push({
            productId: productSelect.value,
            productName: productSelect.options[productSelect.selectedIndex].text,
            quantity: parseInt(qtyInput.value),
            bonus: parseInt(bonusInput.value) || 0,
            price: parseFloat(price),
            lineTotal: parseFloat(total)
        });
    });

    if (!isValid) {
        alert("يرجى اختيار الصنف في جميع الأسطر أو حذف الأسطر الفارغة.");
        return;
    }

    // 3. بناء كائن الطلبية الكاملة
    const orderData = {
        repId: repSelect.value,
        repName: repSelect.options[repSelect.selectedIndex].text,
        pharmacyId: pharmacySelect.value,
        pharmacyName: pharmacySelect.options[pharmacySelect.selectedIndex].text,
        items: orderItems,
        grandTotal: parseFloat(document.getElementById('grandTotal').innerText),
        createdAt: new Date(), // تاريخ ووقت الطلبية
        status: "Pending" // حالة الطلبية (قيد الانتظار)
    };

    // 4. الحفظ في Firebase
    try {
        submitOrderBtn.disabled = true;
        submitOrderBtn.innerText = "جاري الإرسال...";
        
        await addDoc(collection(db, "orders"), orderData);
        
        alert("✅ تم إرسال الطلبية بنجاح إلى شركة دار الدواء!");
        
        // العودة لشاشة الدخول وتفريغ البيانات
        location.reload(); 
    } catch (error) {
        console.error("خطأ في حفظ الطلبية: ", error);
        alert("حدث خطأ أثناء الإرسال، حاول مرة أخرى.");
        submitOrderBtn.disabled = false;
        submitOrderBtn.innerText = "إعتماد وإرسال الطلبية";
    }
});
