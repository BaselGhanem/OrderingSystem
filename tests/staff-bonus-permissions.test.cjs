const { test } = require(`node:test`);
const assert = require(`node:assert/strict`);
const fs = require(`node:fs`);
const vm = require(`node:vm`);
const path = require(`node:path`);
const source = fs.readFileSync(path.join(__dirname, `../js/workflow.status-source.js`), `utf8`);
const collect = source.slice(source.indexOf(`function collectStaffModalItems()`), source.indexOf(`async function saveStaffEdits`));

test(`staff saves original approved bonus even if the displayed input is changed`, () => {
    const rows = [0, 1].map(index => ({
        dataset: { index: String(index) },
        querySelector: selector => ({ value: selector === `.staff-qty` ? `213` : selector === `.staff-bonus` ? `999` : selector === `.staff-product` ? `Product` : ``, dataset: { price: `2` }, textContent: `CODE` })
    }));
    const context = {
        state: { selectedOrder: { items: [{ name: `Product`, bonus: 15 }] } },
        document: { querySelectorAll: () => rows },
        parseNumber: value => Number(value) || 0,
        getProductByName: () => ({ code: `CODE` }),
        getItemProductCode: () => `CODE`,
        calculateItem: item => item,
        calculateGrandTotal: items => items.reduce((sum, item) => sum + item.total, 0)
    };
    vm.createContext(context);
    vm.runInContext(collect + `\nresult = collectStaffModalItems();`, context);
    assert.equal(context.result.kept[0].bonus, 15);
    assert.equal(context.result.kept[1].bonus, 0);
    assert.equal(context.result.kept[0].qty, 213);
});
