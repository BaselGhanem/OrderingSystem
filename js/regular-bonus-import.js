import { validatePolicy, productBonusKey } from './regular-bonus.js?v=20261001_bonus1';

export const bonusModes = { tiers: `شرائح`, none: `بدون بونص`, manual: `يدوي` };
export function templateRows(products, policyFor) {
    const count = Math.max(5, ...products.map(product => policyFor(product).tiers.length));
    const headers = [`كود الصنف`, `اسم الصنف`, `نوع البونص`];
    for (let i = 1; i <= count; i++) headers.push(`كمية ${i}`, `بونص ${i}`);
    return [headers, ...products.map(product => {
        const policy = policyFor(product);
        const row = [productBonusKey(product), product.name, bonusModes[policy.mode]];
        for (let i = 0; i < count; i++) row.push(policy.tiers[i]?.qty ?? ``, policy.tiers[i]?.bonus ?? ``);
        return row;
    })];
}
export function parseBonusRows(rows, products) {
    if (!rows.length) throw new Error(`الملف فارغ`);
    const headers = rows[0].map(value => String(value ?? ``).trim());
    for (const header of [`كود الصنف`, `اسم الصنف`, `نوع البونص`]) if (!headers.includes(header)) throw new Error(`عمود مفقود: ${header}`);
    const codeIndex = headers.indexOf(`كود الصنف`);
    const modeIndex = headers.indexOf(`نوع البونص`);
    const productMap = new Map(products.map(product => [productBonusKey(product), product]));
    if (productMap.size !== products.length) throw new Error(`توجد أكواد أصناف مكررة في النظام؛ صححها قبل الاستيراد`);
    const pairs = headers.flatMap((header, index) => {
        const match = /^كمية (\d+)$/.exec(header);
        if (!match) return [];
        const bonusIndex = headers.indexOf(`بونص ${match[1]}`);
        if (bonusIndex < 0) throw new Error(`عمود مفقود: بونص ${match[1]}`);
        return [{ qtyIndex: index, bonusIndex }];
    });
    const policies = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every(value => value === `` || value == null)) continue;
        const key = String(row[codeIndex] ?? ``).trim();
        const fail = message => { throw new Error(`السطر ${i + 1}: ${message}`); };
        if (!productMap.has(key)) fail(`كود صنف غير موجود: ${key}`);
        if (Object.hasOwn(policies, key)) fail(`كود الصنف مكرر: ${key}`);
        const value = String(row[modeIndex] ?? ``).trim();
        const mode = Object.keys(bonusModes).find(key => bonusModes[key] === value || key === value);
        if (!mode) fail(`نوع البونص يجب أن يكون شرائح أو بدون بونص أو يدوي`);
        const tiers = [];
        for (const pair of pairs) {
            const q = row[pair.qtyIndex];
            const b = row[pair.bonusIndex];
            const blank = v => v == null || String(v).trim() === ``;
            if (blank(q) && blank(b)) continue;
            if (blank(q) || blank(b)) fail(`أكمل الكمية والبونص معا`);
            if (mode !== `tiers`) fail(`امسح الشرائح عند اختيار بدون بونص أو يدوي`);
            if (typeof q === `boolean` || typeof b === `boolean`) fail(`قيم الشرائح يجب أن تكون أرقاما`);
            tiers.push({ qty: Number(q), bonus: Number(b) });
        }
        try { policies[key] = validatePolicy({ mode, tiers }); } catch (error) { fail(error.message); }
    }
    if (!Object.keys(policies).length) throw new Error(`لا توجد أصناف للاستيراد`);
    return policies;
}
