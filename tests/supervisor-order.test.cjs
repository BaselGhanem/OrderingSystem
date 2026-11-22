const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const read = path => readFileSync(join(__dirname, '..', path), 'utf8');
const app = read('js/app.status-source.js');
const workflow = read('js/workflow.status-source.js');
const extract = (code, start, end) => code.slice(code.indexOf(start), code.indexOf(end, code.indexOf(start)));

function supervisorContext(managerName) {
    const session = { name: managerName, type: 'manager', token: 'session-token' };
    const values = new Map([['adminOrderMode', '1']]);
    const context = vm.createContext({
        getAdminSession: () => session,
        sessionStorage: { getItem: key => values.get(key) ?? null },
        selection: null
    });
    vm.runInContext(
        extract(app, 'const DEFAULT_REP_MANAGER_MAP', 'async function loadRepManagerAssignments(') +
        extract(app, 'function getManagerName(', 'function finishSupervisorOrder('),
        context
    );
    return { context, values, session };
}

for (const [managerName, ownRep, ownOthers, otherOthers] of [
    ['محمد طوالبه', 'مراد عمر', 'آخرين - محمد', 'آخرين - عبدالله'],
    ['عبدالله الناطور', 'اجود التلهوني', 'آخرين - عبدالله', 'آخرين - محمد']
]) {
    test(`supervisor delegation is scoped to the active session and team for ${managerName}`, () => {
        const { context, values, session } = supervisorContext(managerName);
        assert.equal(context.canPlaceSupervisorOrderFor(ownRep, managerName), true);
        assert.equal(context.canPlaceSupervisorOrderFor(otherOthers, managerName), false);

        values.set('supervisorOrderRep', JSON.stringify({ id: 'others', name: 'اخرين', token: session.token }));
        const selection = context.getSupervisorOrderSelection();
        assert.equal(selection.managerName, managerName);
        assert.equal(context.canPlaceSupervisorOrderAt({ rep_id: 'others', repName: ownOthers }, selection), true);
        assert.equal(context.canPlaceSupervisorOrderAt({ rep_id: 'others', repName: otherOthers }, selection), false);
        assert.equal(context.canPlaceSupervisorOrderAt({ rep_id: 'others', repName: 'آخرين' }, selection), false);
        assert.equal(context.canPlaceSupervisorOrderAt({ rep_id: 'another', repName: ownOthers }, selection), false);

        session.token = 'new-session';
        assert.equal(context.getSupervisorOrderSelection(), null);
        session.token = 'session-token';
        session.type = 'reports';
        assert.equal(context.getSupervisorOrderSelection(), null);
    });
}

test('submitting a delegated order saves a market manager pending order with the supervisor as actor', async () => {
    const { context, values } = supervisorContext('محمد طوالبه');
    values.set('supervisorOrderRep', JSON.stringify({ id: 'others', name: 'آخرين', token: 'session-token' }));
    let saved;
    let returned = false;
    const noop = () => {};
    const input = { value: 'Fixture product', classList: { remove: noop } };
    const pharmacy = { name: 'Fixture pharmacy', rep_id: 'others', repName: 'آخرين - محمد' };
    Object.assign(context, {
        getEl: () => null,
        submitOrderBtn: { disabled: false, classList: { add: noop, remove: noop } },
        isAdmin: true,
        navigator: { onLine: true },
        document: { querySelectorAll: () => [{ querySelector: () => input }] },
        currentRepId: 'others',
        currentRepName: 'آخرين',
        currentPharmacyId: 'pharmacy-id',
        currentPharmacyName: pharmacy.name,
        currentPharmacyCode: '1',
        productsList: [{ name: input.value }],
        isProductHidden: () => false,
        createProductItemFromRow: () => ({ name: input.value }),
        refreshInventoryReservations: async () => {},
        tagItemsByCurrentReservations: items => items,
        evaluateOrderItemTypes: () => ({ orderType: 'regular' }),
        grandTotalEl: { innerText: '20.00' },
        parseAppNumber: Number,
        buildAuditEntry: (action, user, role) => ({ action, user, role }),
        db: {},
        doc: noop,
        collection: noop,
        getDoc: async () => ({ data: () => pharmacy }),
        addDoc: async (_, payload) => { saved = payload; },
        showToast: (_, kind) => assert.notEqual(kind, 'error'),
        clearDraft: noop,
        finishSupervisorOrder: () => { returned = true; }
    });
    vm.runInContext(extract(app, 'if (submitOrderBtn) submitOrderBtn.onclick', 'async function loadMyOrders('), context);
    await context.submitOrderBtn.onclick();
    assert.equal(returned, true);
    assert.equal(saved.repName, 'آخرين - محمد');
    assert.equal(saved.status, 'market_manager_pending');
    assert.equal(saved.workflowStage, 'market_manager');
    assert.equal(saved.financeStatus, '');
    assert.equal(saved.auditTrail[0].role, 'supervisor');
    assert.equal(saved.auditTrail[0].user, 'محمد طوالبه');
});

test('delegated orders missing market approval are actionable in Market Manager and blocked in Finance', async () => {
    const skipped = {
        status: 'finance_pending', financeStatus: 'finance_pending', repName: 'آخرين - محمد',
        auditTrail: [{ action: 'order_created', role: 'supervisor' }]
    };
    const approved = { ...skipped, marketManagerApprovedAt: new Date() };
    const state = { orders: [skipped, approved] };
    let writes = 0;
    const context = vm.createContext({
        state, $: () => null, matchesExtraFilter: () => true, inDateRange: () => true,
        renderMarketOrders() {}, renderFinanceOrders() {},
        doc() {}, db: {}, getDoc: async () => ({ exists: () => true, data: () => skipped }),
        updateDoc() { writes++; }, showToast() {}
    });
    vm.runInContext(
        extract(workflow, 'function needsMissingMarketApproval(', 'function currentPageOrderSource(') +
        extract(workflow, 'async function updateOrderWithAudit(', 'async function loadProducts(') +
        extract(workflow, 'function getMarketManagerDisplayStatus(', 'function handleMarketAction(') +
        extract(workflow, 'function applyFinanceFilters(', 'function renderFinanceOrders('),
        context
    );
    context.applyMarketFilters();
    assert.equal(state.visibleOrders.length, 1);
    assert.equal(state.visibleOrders[0], skipped);
    context.applyFinanceFilters();
    assert.equal(state.visibleOrders.length, 1);
    assert.equal(state.visibleOrders[0], approved);
    assert.equal(await context.updateOrderWithAudit('fixture', {}, { role: 'finance_controller' }), false);
    assert.equal(writes, 0);

    assert.equal(context.needsMissingMarketApproval({ ...skipped, status: 'returned_to_finance' }), false);
    assert.equal(context.needsMissingMarketApproval({
        ...skipped, auditTrail: [...skipped.auditTrail, { action: 'market_manager_approved', role: 'market_manager' }]
    }), false);
    assert.equal(context.needsMissingMarketApproval({ ...skipped, auditTrail: [], supervisorApprovedBy: 'fixture' }), true);
});

function installContext(userAgent, touchPoints = 0) {
    const windowEvents = new EventTarget();
    const button = Object.assign(new EventTarget(), { hidden: true, disabled: false });
    const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
    const standalone = Object.assign(new EventTarget(), { matches: false });
    const coarse = Object.assign(new EventTarget(), { matches: false });
    const navigator = { userAgent, maxTouchPoints: touchPoints };
    const window = Object.assign(windowEvents, {
        matchMedia: query => query.includes('standalone') ? standalone : coarse
    });
    vm.runInNewContext(read('js/install-app.js'), {
        document: { getElementById: id => id === 'installAppFab' ? button : dialog }, window, navigator
    });
    return { button, dialog, window, standalone };
}

test('install button appears for Android tablet eligibility and hides after install', async () => {
    const { button, window } = installContext('Android Tablet', 5);
    assert.equal(button.hidden, true);
    const prompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => ({ outcome: 'accepted' })
    });
    window.dispatchEvent(prompt);
    assert.equal(prompt.defaultPrevented, true);
    assert.equal(button.hidden, false);
    button.dispatchEvent(new Event('click'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.hidden, true);
});

test('iPad can show manual install instructions and hides the button in installed mode', () => {
    const { button, dialog, standalone } = installContext('Macintosh', 5);
    assert.equal(button.hidden, false);
    button.dispatchEvent(new Event('click'));
    assert.equal(dialog.open, true);
    standalone.matches = true;
    standalone.dispatchEvent(new Event('change'));
    assert.equal(button.hidden, true);
    assert.equal(dialog.open, false);
    assert.equal(installContext('Macintosh').button.hidden, true);
});
