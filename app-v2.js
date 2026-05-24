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
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

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

                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

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
        adminLoginBtn?.addEventListener('click', () => this.adminLogin());
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
        const repSelect = document.getElementById('repSelect');
        if (!repSelect) return;
        repSelect.innerHTML = '<option value="">اختر المندوب...</option>';

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
        if (!suggestions) return;
        suggestions.innerHTML = '';

        if (searchText.length > 0) {
            const filtered = pharmacies.filter(p => p.includes(searchText));
            if (filtered.length > 0) {
                filtered.forEach(pharmacy => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = pharmacy;
                    item.addEventListener('click', () => {
                        const pInput = document.getElementById('pharmacyInput');
                        if (pInput) pInput.value = pharmacy;
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

        if (!repSelect || !pharmacyInput || !startBtn) return;

        const isValid = repSelect.value && pharmacyInput.value.trim();
        startBtn.disabled = !isValid;
    }

    static startOrder() {
        const repSelect = document.getElementById('repSelect');
        const pharmacyInput = document.getElementById('pharmacyInput');
        const passwordInput = document.getElementById('repPasswordInput');

        if (!repSelect || !pharmacyInput) return;

        const repOption = repSelect.options[repSelect.selectedIndex];
        const pharmacy = pharmacyInput.value;
        const password = passwordInput ? passwordInput.value : '';

        const rep = window.representativesData?.find(r => r.id === repSelect.value);
        if (rep?.password && rep.password !== password) {
            ToastManager.error('كلمة المرور غير صحيحة');
            return;
        }

        window.currentRepId = repSelect.value;
        window.currentRepName = repOption.textContent;
        window.currentPharmacy = pharmacy;

        const repDisplay = document.getElementById('currentRepDisplay');
        const pharmacyDisplay = document.getElementById('currentPharmacyDisplay');
        const dateDisplay = document.getElementById('currentDateDisplay');

        if (repDisplay) repDisplay.textContent = repOption.textContent;
        if (pharmacyDisplay) pharmacyDisplay.textContent = pharmacy;
        if (dateDisplay) dateDisplay.textContent = new Date().toLocaleDateString('ar-SA');

        ScreenManager.show('order-screen');
        
        if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'flex';
        if (document.getElementById('headerActions')) document.getElementById('headerActions').style.display = 'flex';
        if (document.getElementById('headerStats')) document.getElementById('headerStats').style.display = 'grid';
        if (document.getElementById('navTabs')) document.getElementById('navTabs').style.display = 'grid';

        ToastManager.success(`مرحباً ${repOption.textContent} 👋`);
    }

    static adminLogin() {
        const adminPasswordInput = document.getElementById('adminPasswordInput');
        const managerNameInput = document.getElementById('managerNameInput');

        if (!adminPasswordInput || !managerNameInput) return;

        const adminPassword = adminPasswordInput.value;
        const managerName = managerNameInput.value;
        const MASTER_PASSWORD = 'admin123'; 

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
        
        if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'flex';
        if (document.getElementById('headerActions')) document.getElementById('headerActions').style.display = 'flex';
        if (document.getElementById('headerStats')) document.getElementById('headerStats').style.display = 'grid';
        if (document.getElementById('navTabs')) document.getElementById('navTabs').style.display = 'grid';
        if (document.getElementById('managerTab')) document.getElementById('managerTab').style.display = 'flex';

        ToastManager.success(`مرحباً بك يا ${managerName} 👑`);
    }

    static loadSavedCredentials() {
        const rememberRepPass = localStorage.getItem('rememberRepPass') === 'true';
        const rememberAdmin = localStorage.getItem('rememberAdmin') === 'true';

        const repSelect = document.getElementById('repSelect');
        const rememberRepCheckbox = document.getElementById('rememberRepPass');
        const managerNameInput = document.getElementById('managerNameInput');
        const rememberAdminCheckbox = document.getElementById('rememberAdmin');

        if (rememberRepPass && repSelect && rememberRepCheckbox) {
            const savedRep = localStorage.getItem('savedRep');
            if (savedRep) {
                repSelect.value = savedRep;
                rememberRepCheckbox.checked = true;
            }
        }

        if (rememberAdmin && managerNameInput && rememberAdminCheckbox) {
            const savedManager = localStorage.getItem('savedManager');
            if (savedManager) {
                managerNameInput.value = savedManager;
                rememberAdminCheckbox.checked = true;
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
        if (!suggestions) return;
        suggestions.innerHTML = '';

        if (searchText.length > 0) {
            const filtered = products.filter(p => p.includes(searchText));
            if (filtered.length > 0) {
                filtered.forEach(product => {
                    const item = document.createElement('div');
                    item.className = 'suggestion-item';
                    item.textContent = product;
                    item.addEventListener('click', () => {
                        const prodInput = document.getElementById('newProductInput');
                        if (prodInput) prodInput.value = product;
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
        if (!productInput) return;
        
        const productName = productInput.value.trim();

        if (!productName) {
            ToastManager.warning('الرجاء إدخال اسم المنتج');
            return;
        }

        const tbody = document.getElementById('orderBody');
        if (!tbody) return;

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
        
        const emptyMsg = document.getElementById('tableEmpty');
        if (emptyMsg) emptyMsg.style.display = 'none';

        // إضافة حدث مستمع لتحديث المجموع تلقائياً عند تغيير الكمية
        row.querySelector('.qty-input')?.addEventListener('input', () => this.updateOrderSummary());

        ToastManager.success('تمت إضافة المنتج ✓');
    }

    static removeProduct(btn) {
        btn.closest('tr').remove();
        this.updateOrderSummary();

        const tbody = document.getElementById('orderBody');
        if (tbody && tbody.children.length === 0) {
            const emptyMsg = document.getElementById('tableEmpty');
            if (emptyMsg) emptyMsg.style.display = 'block';
        }

        ToastManager.info('تم حذف المنتج');
    }

    static updateOrderSummary() {
        const rows = document.querySelectorAll('#orderBody tr');
        let itemCount = 0;
        let totalQty = 0;

        rows.forEach(row => {
            const productInput = row.querySelector('.product-input');
            const qtyInput = row.querySelector('.qty-input');
            if (productInput && productInput.value.trim()) {
                itemCount++;
                totalQty += parseInt(qtyInput.value) || 0;
            }
        });

        const itemCntElem = document.getElementById('itemCount');
        const totQtyElem = document.getElementById('totalQty');
        const totAmtElem = document.getElementById('totalAmount');

        if (itemCntElem) itemCntElem.textContent = itemCount;
        if (totQtyElem) totQtyElem.textContent = totalQty;
        if (totAmtElem) totAmtElem.textContent = (totalQty * 50).toFixed(0) + ' ₪'; 
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
        const noteInput = document.getElementById('orderNoteInput');
        const note = noteInput ? noteInput.value : '';

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

        const noteInput = document.getElementById('orderNoteInput');
        const note = noteInput ? noteInput.value : '';

        const order = {
            id: 'ORDER_' + Date.now(),
            rep: window.currentRepName,
            repId: window.currentRepId,
            pharmacy: window.currentPharmacy,
            date: new Date().toISOString(),
            items,
            note: note,
            status: 'pending',
            total: items.reduce((sum, item) => sum + (item.qty * 50), 0)
        };

        SavingIndicator.show();

        try {
            const orders = JSON.parse(localStorage.getItem('orders') || '[]');
            orders.push(order);
            localStorage.setItem('orders', JSON.stringify(orders));

            setTimeout(() => {
                SavingIndicator.hide();
                ToastManager.success('تم إرسال الطلبية بنجاح ✓');
                
                this.clearOrder();
                
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
            const qtyInput = row.querySelector('.qty-input');
            const bonusInput = row.querySelector('.bonus-input');
            const noteInput = row.querySelector('.item-note-input');

            if (productInput) {
                const product = productInput.value.trim();
                if (product) {
                    items.push({
                        product,
                        qty: parseInt(qtyInput.value) || 0,
                        bonus: parseInt(bonusInput.value) || 0,
                        note: noteInput ? noteInput.value : ''
                    });
                }
            }
        });
        return items;
    }

    static clearOrder() {
        const orderBody = document.getElementById('orderBody');
        const orderNote = document.getElementById('orderNoteInput');
        const newProduct = document.getElementById('newProductInput');
        const tableEmpty = document.getElementById('tableEmpty');

        if (orderBody) orderBody.innerHTML = '';
        if (orderNote) orderNote.value = '';
        if (newProduct) newProduct.value = '';
        
        this.updateOrderSummary();
        if (tableEmpty) tableEmpty.style.display = 'block';
    }

    static changePharmacy() {
        ScreenManager.show('login-screen');
        if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'none';
        if (document.getElementById('headerActions')) document.getElementById('headerActions').style.display = 'none';
        if (document.getElementById('headerStats')) document.getElementById('headerStats').style.display = 'none';
        if (document.getElementById('navTabs')) document.getElementById('navTabs').style.display = 'none';
    }

    static setupTabNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const screenId = tab.dataset.screen;
                ScreenManager.show(screenId);

                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

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
                if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'none';
                if (document.getElementById('headerActions')) document.getElementById('headerActions').style.display = 'none';
                if (document.getElementById('headerStats')) document.getElementById('headerStats').style.display = 'none';
                if (document.getElementById('navTabs')) document.getElementById('navTabs').style.display = 'none';

                this.clearOrder();
                ToastManager.info('تم تسجيل الخروج');
            }
        });
    }

    static loadOrdersFromFirebase() {
        // Firebase Logic Local fallback
    }

    static loadOrdersForRep() {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        const repOrders = orders.filter(o => o.repId === window.currentRepId);

        const ordersList = document.getElementById('ordersList');
        if (!ordersList) return;
        ordersList.innerHTML = '';

        if (repOrders.length === 0) {
            const ordersEmpty = document.getElementById('ordersEmpty');
            if (ordersEmpty) ordersEmpty.style.display = 'block';
            return;
        }

        const ordersEmpty = document.getElementById('ordersEmpty');
        if (ordersEmpty) ordersEmpty.style.display = 'none';

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

        const badge = document.getElementById('ordersBadge');
        if (badge) {
            const pendingCount = repOrders.filter(o => o.status === 'pending').length;
            badge.textContent = pendingCount;
            badge.style.display = pendingCount > 0 ? 'inline' : 'none';
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

        const reportBody = document.getElementById('reportTableBody');
        if (reportBody) {
            reportBody.innerHTML = repOrders.map(order => `
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
        }

        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
            chartContainer.textContent = `الطلبيات: ${total} | قيد الانتظار: ${pending} | مكتملة: ${completed}`;
        }
    }
}

// ===== 7. INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    OfflineManager.init();
    LoginManager.init();
    OrderManager.init();

    if (window.currentRepId && window.currentRepName) {
        ScreenManager.show('order-screen');
    } else if (window.isManager) {
        ScreenManager.show('manager-screen');
    } else {
        ScreenManager.show('login-screen');
    }
});

window.OrderManager = OrderManager;
window.ToastManager = ToastManager;
window.ScreenManager = ScreenManager;
