const { test } = require(`node:test`);
const assert = require(`node:assert/strict`);
const fs = require(`node:fs`);
const path = require(`node:path`);

const root = path.join(__dirname, `..`);
const defaults = fs.readFileSync(path.join(root, `js/regular-bonus-defaults.js`), `utf8`).replace(`export const bonusDefaults = `, ``).trim().replace(/;$/, ``);
const source = fs.readFileSync(path.join(root, `js/regular-bonus.js`), `utf8`)
    .replace(/^import[^\n]+\n/, `const bonusDefaults = ${defaults};\n`);
const modulePromise = import(`data:text/javascript;base64,${Buffer.from(source).toString(`base64`)}`);

test(`all 86 mapped product policies are valid and each tier returns its exact bonus`, async () => {
    const { validatePolicy, calculateRegularBonus } = await modulePromise;
    const policies = JSON.parse(defaults);
    assert.equal(Object.keys(policies).length, 86);
    for (const policy of Object.values(policies)) {
        validatePolicy(policy);
        for (const tier of policy.tiers) assert.equal(calculateRegularBonus(tier.qty, policy), tier.bonus);
    }
});
test(`above maximum uses truncation, including exact integer and 100% cases`, async () => {
    const { calculateRegularBonus } = await modulePromise;
    const policy = { mode: `tiers`, tiers: [{ qty: 12, bonus: 1 }, { qty: 25, bonus: 3 }, { qty: 50, bonus: 7 }, { qty: 100, bonus: 15 }] };
    assert.equal(calculateRegularBonus(200, policy), 30);
    assert.equal(calculateRegularBonus(213, policy), 31);
    assert.equal(calculateRegularBonus(220, policy), 33);
    assert.equal(calculateRegularBonus(213, { mode: `tiers`, tiers: [{ qty: 100, bonus: 100 }] }), 213);
    assert.throws(() => calculateRegularBonus(20, policy));
    assert.throws(() => calculateRegularBonus(99, policy));
    assert.throws(() => calculateRegularBonus(100.5, policy));
});
test(`no-bonus and missing-policy fallback retain their defined behavior`, async () => {
    const { calculateRegularBonus, getBonusPolicy, validatePolicy } = await modulePromise;
    assert.equal(calculateRegularBonus(213, { mode: `none`, tiers: [] }), 0);
    assert.equal(calculateRegularBonus(20, getBonusPolicy({ code: `UNKNOWN` })), null);
    assert.throws(() => validatePolicy({ mode: `tiers`, tiers: [{ qty: 0, bonus: 0 }] }));
    assert.throws(() => validatePolicy({ mode: `tiers`, tiers: [{ qty: 12, bonus: 1 }, { qty: 12, bonus: 2 }] }));
});
