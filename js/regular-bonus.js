import { bonusDefaults } from './regular-bonus-defaults.js?v=20261001_bonus1';

export function productBonusKey(product = {}) {
    return String(product.productCode || product.product_code || product.code || ``).trim();
}

export function validatePolicy(policy) {
    if (!policy || ![`tiers`, `none`, `manual`].includes(policy.mode)) throw new Error(`نوع البونص غير صحيح`);
    const tiers = policy.mode === `tiers` ? [...(policy.tiers || [])].sort((a, b) => a.qty - b.qty) : [];
    if (policy.mode === `tiers` && !tiers.length) throw new Error(`أضف شريحة واحدة على الأقل`);
    const seen = new Set();
    for (const tier of tiers) {
        if (!Number.isSafeInteger(tier.qty) || tier.qty <= 0 || !Number.isSafeInteger(tier.bonus) || tier.bonus < 0 || seen.has(tier.qty)) throw new Error(`الشرائح تتطلب كميات صحيحة موجبة غير مكررة وبونصا صحيحا غير سالب`);
        seen.add(tier.qty);
    }
    return { mode: policy.mode, tiers };
}

export function calculateRegularBonus(quantity, policy) {
    const qty = Number(quantity);
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error(`أدخل كمية صحيحة موجبة`);
    const valid = validatePolicy(policy);
    if (valid.mode === `manual`) return null;
    if (valid.mode === `none`) return 0;
    if (qty < valid.tiers[0].qty) return 0;
    const exact = valid.tiers.find(tier => tier.qty === qty);
    if (exact) return exact.bonus;
    const max = valid.tiers.at(-1);
    if (qty <= max.qty) throw new Error(`اختر شريحة أو أدخل كمية أكبر من ${max.qty}`);
    const result = Number(BigInt(qty) * BigInt(max.bonus) / BigInt(max.qty));
    if (!Number.isSafeInteger(result)) throw new Error(`الكمية تتجاوز الحد الحسابي`);
    return result;
}

let overrides = {};
let readyPromise;
let loadError;
export async function loadBonusConfiguration() {
    if (!readyPromise) readyPromise = (async () => {
        const { db, doc, getDoc } = await import(`./firebase.js`);
        let timeout;
        const snapshot = await Promise.race([
            getDoc(doc(db, `settings`, `regularBonus`)),
            new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error(`تعذر تحميل إعدادات البونص خلال المهلة`)), 15000); })
        ]).finally(() => clearTimeout(timeout));
        overrides = snapshot.exists() ? snapshot.data().policies || {} : {};
        for (const policy of Object.values(overrides)) validatePolicy(policy);
    })().catch(error => { loadError = error; throw error; });
    return readyPromise;
}
export function configurationAvailable() { return !!readyPromise && !loadError; }
export function getBonusPolicy(product) {
    const key = productBonusKey(product);
    return validatePolicy(overrides[key] || bonusDefaults[key] || { mode: `manual`, tiers: [] });
}

export function attachBonusRow(row, findProduct, recalculate, { preserveExisting = false } = {}) {
    const input = row.querySelector(`.product-input`);
    const quantity = row.querySelector(`.qty-input`);
    const bonus = row.querySelector(`.bonus-input`);
    const select = document.createElement(`select`);
    select.className = `regular-bonus-select`;
    select.setAttribute(`aria-label`, `شريحة الكمية والبونص`);
    select.style.cssText = `width:100%;min-width:125px;padding:9px;border:1px solid #b6d7d7;border-radius:8px;font:inherit;background:#fff;color:#173c45;`;
    quantity.before(select);
    quantity.step = `1`;
    const hint = document.createElement(`small`);
    hint.style.cssText = `display:block;color:#64748b;font-size:11px;margin-top:4px;`;
    quantity.after(hint);
    let productKey = null;
    let policy;
    let legacy = preserveExisting ? { name: input.value.trim(), qty: quantity.value, bonus: bonus.value } : null;
    let signature = ``;
    const notify = () => { quantity.oninput?.(); bonus.oninput?.(); recalculate(); };

    function apply() {
        quantity.setCustomValidity(``);
        if (legacy && select.value === `legacy`) return;
        try {
            const value = calculateRegularBonus(quantity.value, policy);
            if (value !== null) bonus.value = String(value);
        } catch (error) { quantity.setCustomValidity(error.message); bonus.value = `0`; }
    }
    function configure(reset = true) {
        const product = findProduct(input.value.trim());
        const nextKey = productBonusKey(product);
        if (nextKey === productKey && reset) return;
        productKey = nextKey;
        if (legacy && legacy.name !== input.value.trim()) legacy = null;
        policy = getBonusPolicy(product);
        signature = JSON.stringify(policy);
        select.replaceChildren();
        bonus.readOnly = policy.mode !== `manual` || !!legacy;
        bonus.title = bonus.readOnly ? `البونص تلقائي. اطلب الاستثناء في ملاحظات الصنف` : ``;
        select.hidden = policy.mode !== `tiers`;
        quantity.hidden = policy.mode === `tiers`;
        quantity.min = `1`;
        quantity.removeAttribute(`max`);
        hint.textContent = policy.mode === `none` ? `هذا الصنف بدون بونص` : policy.mode === `tiers` ? `البونص تلقائي؛ الاستثناء في ملاحظات الصنف` : ``;
        if (policy.mode === `tiers`) {
            select.add(new Option(`اختر الكمية والبونص`, ``));
            const max = policy.tiers.at(-1);
            const min = policy.tiers[0];
            if (min.qty > 1) select.add(new Option(`كمية أقل من ${min.qty} — بدون بونص`, `below`));
            for (const tier of policy.tiers) select.add(new Option(`${tier.qty} قطعة + ${tier.bonus} بونص`, String(tier.qty)));
            select.add(new Option(`كمية أكبر من ${max.qty}`, `custom`));
            if (legacy) {
                select.add(new Option(`القيمة الحالية: ${legacy.qty} + ${legacy.bonus} بونص`, `legacy`));
                select.value = `legacy`;
            } else if (!reset && policy.tiers.some(tier => tier.qty === Number(quantity.value))) {
                select.value = quantity.value;
                apply();
            } else if (!reset && Number(quantity.value) > max.qty) {
                select.value = `custom`; quantity.hidden = false; quantity.min = String(max.qty + 1); apply();
            } else if (!reset && Number(quantity.value) > 0 && Number(quantity.value) < min.qty) {
                select.value = `below`; quantity.hidden = false; quantity.max = String(min.qty - 1); apply();
            } else { quantity.value = ``; bonus.value = `0`; }
        } else if (!legacy) { apply(); }
    }
    select.addEventListener(`change`, () => {
        legacy = null;
        bonus.readOnly = policy.mode !== `manual`;
        const custom = select.value === `custom`;
        const below = select.value === `below`;
        quantity.hidden = !(custom || below);
        quantity.min = custom ? String(policy.tiers.at(-1).qty + 1) : `1`;
        if (below) quantity.max = String(policy.tiers[0].qty - 1);
        else quantity.removeAttribute(`max`);
        quantity.value = custom || below ? `` : select.value;
        apply(); notify();
        if (custom || below) quantity.focus();
    });
    quantity.addEventListener(`input`, () => { legacy = null; apply(); bonus.oninput?.(); });
    input.addEventListener(`blur`, () => { configure(); notify(); });
    row.regularBonusChanged = () => { configure(); notify(); };
    row.validateRegularBonus = () => {
        configure();
        if (legacy && input.value.trim() === legacy.name && quantity.value === legacy.qty && bonus.value === legacy.bonus) return true;
        if (!configurationAvailable()) { alert(`تعذر تحميل إعدادات البونص. أعد تحميل الصفحة قبل الحفظ.`); return false; }
        if (JSON.stringify(getBonusPolicy(findProduct(input.value.trim()))) !== signature) { alert(`تغيرت شرائح الصنف. أعد فتح الطلبية قبل الحفظ.`); return false; }
        apply(); notify();
        if (!quantity.checkValidity() || !quantity.value) { alert(quantity.validationMessage || `اختر كمية الصنف`); if (!quantity.hidden) quantity.focus(); else select.focus(); return false; }
        return true;
    };
    configure(false);
}
