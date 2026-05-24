// ========================================
// 🚀 ORDERING SYSTEM v2.0 - MAIN APP
// ========================================

// ===== 1. TOAST NOTIFICATIONS =====
class ToastManager {
    static show(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: 'ph-check-circle',
            error: 'ph-warning-circle',
            warning: 'ph-warning',
            info: 'ph-info'
        };

        toast.innerHTML = `
            <i class="ph ${icons[type]}"></i>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    static success(message) { this.show(message, 'success'); }
    static error(message) { this.show(message, 'error'); }
    static warning(message) { this.show(message, 'warning'); }
    static info(message) { this.show(message, 'info'); }
}

// ===== 2. ONLINE/OFFLINE STATUS =====
class OfflineManager {
    static init() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;

        const closeBtn = banner.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                banner.classList.remove('active');
            });
        }

        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        this.update();
    }

    static update() {
        const banner = document.getElementById('offline-banner');
        if (!banner) return;

        if (!navigator.onLine) {
            banner.classList.add('active');
        } else {
            banner.classList.remove('active');
        }
    }

    static handleOnline() {
        this.update();
        ToastManager.success('عاد الاتصال بالإنترنت ✓');
    }

    static handleOffline() {
        this.update();
        ToastManager.warning('فقدت الاتصال بالإنترنت');
    }
}

// ===== 3. SAVING INDICATOR =====
class SavingIndicator {
    static show() {
        const indicator = document.getElementById('saving-indicator');
        if (indicator) {
            indicator.classList.add('active');
        }
    }

    static hide() {
        const indicator = document.getElementById('saving-indicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }
}

// ===== 4. SCREEN MANAGER =====
class ScreenManager {
    static show(screenId) {
        // إخفاء جميع الشاشات
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // إظهار الشاشة المطلوبة
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }
    }
}

// ===== 5. LOGIN MANAGER =====
class LoginManager {
    static init() {
        this.setupTabSwitching();
        this.setupRepLogin();
        this.setupAdminLogin();
        this.setupPasswordToggle();
        this.loadSavedCredentials();
    }

    static setupTabSwitching() {
        const tabBtns = document.querySelectorAll('.login-tab-btn');
        const forms = document.querySelectorAll('.login-form');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = btn.dataset.tab;

                // تحديث الأزرار النشطة
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // تحديث النماذج النشطة
                forms.forEach(form => form.classList.remove('active'));
                document.getElementById(`${tabName}-form`)?.classList.add('active');
            });
        });
    }

    static setupRepLogin() {
        const repSelect = document.getElementById('repSelect');
        const pharmacyInput = document.getElementById('pharmacyInput');
        const startBtn = document.getElementById('startOrderBtn');
        const passwordGroup = document.getElementById('repPasswordGroup');
        const passwordInput = document.getElementById('repPasswordInput');

        // تحميل المندوبين
        this.loadRepresentatives();

        repSelect.addEventListener('change', (e) => {
            const repId = e.target.value;
            if (repId) {
                const rep = window.representativesData?.find(r => r.id === repId);
                if (rep && rep.password) {
                    passwordGroup.style.display = 'block';
                    passwordInput.focus();
                } else {
                    passwordGroup.style.display = 'none';
                }
                pharmacyInput.disabled = false;
                pharmacyInput.focus();
            } else {
                passwordGroup.style.display = 'none';
                pharmacyInput.disabled = true;
                pharmacyInput.value = '';
            }
            this.updateStartBtnState();
        });

        pharmacyInput.addEventListener('input', (e) => {
            this.filterPharmacies(e.target.value);
            this.updateStartBtnState();
        });

        startBtn.addEventListener('click', () => this.startOrder());
    }

    static setupAdminLogin() {
        const adminLoginBtn = document.getElementById('adminLoginBtn');
        adminLoginBtn.addEventListener('click', () => this.adminLogin());
    }

    static setupPasswordToggle() {
        document.getElementById('toggleRepPassword')?.addEventListener('click', (e) => {
            const input = document.getElementById('repPasswordInput');
            const icon = e.currentTarget.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'ph ph-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'ph ph-eye';
            }
        });

        document.getElementById('toggleAdminPassword')?.addEventListener('click', (e) => {
            const input = document.getElementById('adminPasswordInput');
            const icon = e.currentTarget.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'ph ph-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'ph ph-eye';
            }
        });
    }

    static async loadRepresentatives() {
        // في التطبيق الحقيقي، سيتم تحميلها من Firebase
        const repSelect = document.getElementById('repSelect');
        repSelect.innerHTML = '<option value="">اختر المندوب...</option>';

        // بيانات نموذجية
        const reps = [
            { id: 'rep1', name: 'أحمد محمد', password: '1234' },
            { id: 'rep2', name: 'فاطمة علي', password: '5678' },
            { id: 'rep3', name: 'محمود حسن', password: '' }
        ];

        window.representativesData = reps;

        reps.forEach(rep => {
            const option = document.createElement('option');
            option.value = rep.id;
            option.textContent = rep.name;
            repSelect.appendChild(option);
        });
    }

    static filterPharmacies(searchText) {
        const pharmacies = [
            'صيدلية الهلال',
            'صيدلية الطب الحديث',
            'صيدلية النجاح',
            'صيدلية الشفاء',
            'صيدلية الأمل'
        ];

        const suggestions = document.getElementById('pharmacySuggestions');
        suggestions.innerHTML = '';

        if (searchText.length > 0) {
            const filtered = pharmacies.filter(p => p.includes(searchText));
            if (filtered.length > 0) {
                filtered.forEach(pharmacy => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = pharmacy;
                    item.addEventListener('click', () => {
                        document.getElementById('pharmacyInput').value = pharmacy;
                        suggestions.innerHTML = '';
                        this.updateStartBtnState();
                    });
                    suggestions.appendChild(item);
                });
                suggestions.classList.add('active');
            }
        } else {
            suggestions.classList.remove('active');
        }
    }

    static updateStartBtnState() {
        const repSelect = document.getElementById('repSelect');
        const pharmacyInput = document.getElementById('pharmacyInput');
        const startBtn = document.getElementById('startOrderBtn');

        const isValid = repSelect.value && pharmacyInput.value.trim();
        startBtn.disabled = !isValid;
    }

    static startOrder() {
        const repSelect = document.getElementById('repSelect');
        const repOption = repSelect.options[repSelect.selectedIndex];
        const pharmacy = document.getElementById('pharmacyInput').value;
        const password = document.getElementById('repPasswordInput').value;

        // التحقق من كلمة المرور إن وجدت
        const rep = window.representativesData?.find(r => r.id === repSelect.value);
        if (rep?.password && rep.password !== password) {
            ToastManager.error('كلمة المرور غير صحيحة');
            return;
        }

        // حفظ البيانات
        window.currentRepId = repSelect.value;
        window.currentRepName = repOption.textContent;
        window.currentPharmacy = pharmacy;

        // تحديث الواجهة
        document.getElementById('currentRepDisplay').textContent = repOption.textContent;
        document.getElementById('currentPharmacyDisplay').textContent = pharmacy;
        document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString('ar-SA');

        // الانتقال للشاشة الرئيسية
        ScreenManager.show('order-screen');
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('headerActions').style.display = 'flex';
        document.getElementById('headerStats').style.display = 'grid';
        document.getElementById('navTabs').style.display = 'grid';

        ToastManager.success(`مرحباً ${repOption.textContent} 👋`);
    }

    static adminLogin() {
        const adminPassword = document.getElementById('adminPasswordInput').value;
        const managerName = document.getElementById('managerNameInput').value;

        // كلمة المرور الرئيسية
        const MASTER_PASSWORD = 'admin123'; // يجب تغييرها في الإنتاج

        if (adminPassword !== MASTER_PASSWORD) {
            ToastManager.error('كلمة المرور غير صحيحة');
            return;
        }

        if (!managerName.trim()) {
            ToastManager.error('الرجاء إدخال اسم المدير');
            return;
        }

        window.currentManager = managerName;
        window.isManager = true;

        ScreenManager.show('manager-screen');
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('headerActions').style.display = 'flex';
        document.getElementById('headerStats').style.display = 'grid';
        document.getElementById('navTabs').style.display = 'grid';
        document.getElementById('managerTab').style.display = 'flex';

        ToastManager.success(`مرحباً بك يا ${managerName} 👑`);
    }

    static loadSavedCredentials() {
        const rememberRepPass = localStorage.getItem('rememberRepPass') === 'true';
        const rememberAdmin = localStorage.getItem('rememberAdmin') === 'true';

        if (rememberRepPass) {
            const savedRep = localStorage.getItem('savedRep');
            if (savedRep) {
                document.getElementById('repSelect').value = savedRep;
                document.getElementById('rememberRepPass').checked = true;
            }
        }

        if (rememberAdmin) {
            const savedManager = localStorage.getItem('savedManager');
            if (savedManager) {
                document.getElementById('managerNameInput').value = savedManager;
                document.getElementById('rememberAdmin').checked = true;
            }
        }
    }
}

// ===== 6. ORDER MANAGER =====
class OrderManager {
    static init() {
        this.setupProductInput();
        this.setupAddProductBtn();
        this.setupOrderActions();
        this.setupTabNavigation();
        this.setupLogout();
        this.loadOrdersFromFirebase();
    }

    static setupProductInput() {
        const input = document.getElementById('newProductInput');
        input?.addEventListener('input', (e) => {
            this.filterProducts(e.target.value);
        });

        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addProduct();
            }
        });
    }

    static filterProducts(searchText) {
        const products = [
            'الأسبرين',
            'الباراسيتامول',
            'الإيبوبروفين',
            'فيتامين سي',
            'أوميغا 3',
            'الكالسيوم',
            'الحديد'
        ];

        const suggestions = document.getElementById('productSuggestions');
        suggestions.innerHTML = '';

        if (searchText.length > 0) {
            const filtered = products.filter(p => p.includes(searchText));
            if (filtered.length > 0) {
                filtered.forEach(product => {
                    const item = document.createElement('div');
                    item.className = 'suggestion-item';
                    item.textContent = product;
                    item.addEventListener('click', () => {
                        document.getElementById('newProductInput').value = product;
                        suggestions.innerHTML = '';
                        this.addProduct();
                    });
                    suggestions.appendChild(item);
                });
                suggestions.classList.add('active');
            }
        } else {
            suggestions.classList.remove('active');
        }
    }

    static setupAddProductBtn() {
        document.getElementById('addProductBtn')?.addEventListener('click', () => {
            this.addProduct();
        });
    }

    static addProduct() {
        const productInput = document.getElementById('newProductInput');
        const productName = productInput.value.trim();

        if (!productName) {
            ToastManager.warning('الرجاء إدخال اسم المنتج');
            return;
        }

        const tbody = document.getElementById('orderBody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="col-product"><input type="text" class="product-input" value="${productName}" placeholder="المنتج"></td>
            <td class="col-qty"><input type="number" class="qty-input" value="1" min="1" placeholder="0"></td>
            <td class="col-bonus"><input type="number" class="bonus-input" value="0" min="0" placeholder="0"></td>
            <td class="col-note"><input type="text" class="item-note-input" placeholder="ملاحظة"></td>
            <td class="col-action">
                <button type="button" class="btn-icon" onclick="OrderManager.removeProduct(this)">
                    <i class="ph ph-trash"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        productInput.value = '';
        productInput.focus();

        this.updateOrderSummary();
        document.getElementById('tableEmpty').style.display = 'none';

        ToastManager.success('تمت إضافة المنتج ✓');
    }

    static removeProduct(btn) {
        btn.closest('tr').remove();
        this.updateOrderSummary();

        const tbody = document.getElementById('orderBody');
        if (tbody.children.length === 0) {
            document.getElementById('tableEmpty').style.display = 'block';
        }

        ToastManager.info('تم حذف المنتج');
    }

    static updateOrderSummary() {
        const rows = document.querySelectorAll('#orderBody tr');
        let itemCount = 0;
        let totalQty = 0;

        rows.forEach(row => {
            const productInput = row.querySelector('.product-input');
            if (productInput.value.trim()) {
                itemCount++;
                totalQty += parseInt(row.querySelector('.qty-input').value) || 0;
            }
        });

        document.getElementById('itemCount').textContent = itemCount;
        document.getElementById('totalQty').textContent = totalQty;
        document.getElementById('totalAmount').textContent = (totalQty * 50).toFixed(0) + ' ₪'; // مثال: 50 شيكل للقطعة
    }

    static setupOrderActions() {
        document.getElementById('saveDraftBtn')?.addEventListener('click', () => {
            this.saveDraft();
        });

        document.getElementById('submitOrderBtn')?.addEventListener('click', () => {
            this.submitOrder();
        });

        document.getElementById('changePharmacyBtn')?.addEventListener('click', () => {
            this.changePharmacy();
        });

        document.getElementById('printDraftBtn')?.addEventListener('click', () => {
            window.print();
        });
    }

    static saveDraft() {
        const items = this.getOrderItems();
        const note = document.getElementById('orderNoteInput').value;

        const draft = {
            rep: window.currentRepName,
            pharmacy: window.currentPharmacy,
            date: new Date().toISOString(),
            items,
            note,
            status: 'draft'
        };

        localStorage.setItem(`draft_${window.currentRepId}_${window.currentPharmacy}`, JSON.stringify(draft));
        SavingIndicator.show();

        setTimeout(() => {
            SavingIndicator.hide();
            ToastManager.success('تم حفظ المسودة بنجاح ✓');
        }, 500);
    }

    static async submitOrder() {
        const items = this.getOrderItems();
        if (items.length === 0) {
            ToastManager.error('الرجاء إضافة منتجات');
            return;
        }

        const order = {
            id: 'ORDER_' + Date.now(),
            rep: window.currentRepName,
            repId: window.currentRepId,
            pharmacy: window.currentPharmacy,
            date: new Date().toISOString(),
            items,
            note: document.getElementById('orderNoteInput').value,
            status: 'pending',
            total: items.reduce((sum, item) => sum + (item.qty * 50), 0)
        };

        SavingIndicator.show();

        try {
            // حفظ في localStorage أولاً
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            orders.push(order);
            localStorage.setItem('orders', JSON.stringify(orders));

            // في التطبيق الحقيقي: حفظ في Firebase
            // await addDoc(collection(db, 'orders'), order);

            setTimeout(() => {
                SavingIndicator.hide();
                ToastManager.success('تم إرسال الطلبية بنجاح ✓');
                
                // إعادة تعيين النموذج
                this.clearOrder();
                
                // الانتقال لقائمة الطلبيات
                setTimeout(() => {
                    ScreenManager.show('orders-screen');
                    this.loadOrdersForRep();
                }, 1000);
            }, 800);
        } catch (error) {
            SavingIndicator.hide();
            ToastManager.error('حدث خطأ في إرسال الطلبية');
            console.error(error);
        }
    }

    static getOrderItems() {
        const items = [];
        document.querySelectorAll('#orderBody tr').forEach(row => {
            const productInput = row.querySelector('.product-input');
            const product = productInput.value.trim();
            if (product) {
                items.push({
                    product,
                    qty: parseInt(row.querySelector('.qty-input').value) || 0,
                    bonus: parseInt(row.querySelector('.bonus-input').value) || 0,
                    note: row.querySelector('.item-note-input').value
                });
            }
        });
        return items;
    }

    static clearOrder() {
        document.getElementById('orderBody').innerHTML = '';
        document.getElementById('orderNoteInput').value = '';
        document.getElementById('newProductInput').value = '';
        this.updateOrderSummary();
        document.getElementById('tableEmpty').style.display = 'block';
    }

    static changePharmacy() {
        ScreenManager.show('login-screen');
        document.getElementById('userInfo').style.display = 'none';
        document.getElementById('headerActions').style.display = 'none';
        document.getElementById('headerStats').style.display = 'none';
        document.getElementById('navTabs').style.display = 'none';
    }

    static setupTabNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const screenId = tab.dataset.screen;
                ScreenManager.show(screenId);

                // تحديث الأزرار النشطة
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // تحميل البيانات حسب الشاشة
                if (screenId === 'orders-screen') {
                    this.loadOrdersForRep();
                } else if (screenId === 'reports-screen') {
                    this.loadReports();
                }
            });
        });
    }

    static setupLogout() {
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('هل تريد تسجيل الخروج؟')) {
                window.currentRepId = null;
                window.currentRepName = null;
                window.currentPharmacy = null;
                window.isManager = false;

                ScreenManager.show('login-screen');
                document.getElementById('userInfo').style.display = 'none';
                document.getElementById('headerActions').style.display = 'none';
                document.getElementById('headerStats').style.display = 'none';
                document.getElementById('navTabs').style.display = 'none';

                this.clearOrder();
                ToastManager.info('تم تسجيل الخروج');
            }
        });
    }

    static loadOrdersFromFirebase() {
        // في التطبيق الحقيقي: استخدام Firebase
        // هنا نستخدم localStorage للاختبار
    }

    static loadOrdersForRep() {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        const repOrders = orders.filter(o => o.repId === window.currentRepId);

        const ordersList = document.getElementById('ordersList');
        ordersList.innerHTML = '';

        if (repOrders.length === 0) {
            document.getElementById('ordersEmpty').style.display = 'block';
            return;
        }

        document.getElementById('ordersEmpty').style.display = 'none';

        repOrders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card';
            card.innerHTML = `
                <div class="order-card-header">
                    <div class="order-card-pharmacy">${order.pharmacy}</div>
                    <span class="order-card-status status-${order.status}">${this.getStatusText(order.status)}</span>
                </div>
                <div class="order-card-details">
                    <div class="card-detail">
                        <span class="card-detail-label">الرقم</span>
                        <span class="card-detail-value">${order.id}</span>
                    </div>
                    <div class="card-detail">
                        <span class="card-detail-label">التاريخ</span>
                        <span class="card-detail-value">${new Date(order.date).toLocaleDateString('ar-SA')}</span>
                    </div>
                    <div class="card-detail">
                        <span class="card-detail-label">المنتجات</span>
                        <span class="card-detail-value">${order.items.length}</span>
                    </div>
                    <div class="card-detail">
                        <span class="card-detail-label">الإجمالي</span>
                        <span class="card-detail-value">${order.total} ₪</span>
                    </div>
                </div>
                <div class="order-card-actions">
                    <button onclick="OrderManager.viewOrder('${order.id}')">عرض</button>
                    <button onclick="OrderManager.editOrder('${order.id}')">تعديل</button>
                </div>
            `;
            ordersList.appendChild(card);
        });

        // تحديث الشارة
        document.getElementById('ordersBadge').textContent = repOrders.filter(o => o.status === 'pending').length;
        if (repOrders.some(o => o.status === 'pending')) {
            document.getElementById('ordersBadge').style.display = 'inline';
        }
    }

    static getStatusText(status) {
        const texts = {
            pending: '⏳ قيد الانتظار',
            completed: '✓ مكتملة',
            rejected: '✗ مرفوضة',
            draft: '📝 مسودة'
        };
        return texts[status] || status;
    }

    static viewOrder(orderId) {
        ToastManager.info('عرض الطلبية: ' + orderId);
    }

    static editOrder(orderId) {
        ToastManager.info('تعديل الطلبية: ' + orderId);
    }

    static loadReports() {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        const repOrders = orders.filter(o => o.repId === window.currentRepId);

        const pending = repOrders.filter(o => o.status === 'pending').length;
        const completed = repOrders.filter(o => o.status === 'completed').length;
        const total = repOrders.length;

        document.getElementById('reportTableBody').innerHTML = repOrders.map(order => `
            <tr>
                <td>${new Date(order.date).toLocaleDateString('ar-SA')}</td>
                <td>${order.pharmacy}</td>
                <td>${order.items.length}</td>
                <td><span class="order-card-status status-${order.status}">${this.getStatusText(order.status)}</span></td>
                <td>
                    <button class="btn-secondary" onclick="OrderManager.viewOrder('${order.id}')">
                        <i class="ph ph-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        // تحديث الرسوم البيانية
        document.querySelector('.chart-container')?.textContent = `
            الطلبيات: ${total} | قيد الانتظار: ${pending} | مكتملة: ${completed}
        `;
    }
}

// ===== 7. INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    OfflineManager.init();
    LoginManager.init();
    OrderManager.init();

    // التحقق من الجلسة المحفوظة
    if (window.currentRepId && window.currentRepName) {
        ScreenManager.show('order-screen');
    } else if (window.isManager) {
        ScreenManager.show('manager-screen');
    } else {
        ScreenManager.show('login-screen');
    }
});

// تصدير للدوال العالمية
window.OrderManager = OrderManager;
window.ToastManager = ToastManager;
window.ScreenManager = ScreenManager;
