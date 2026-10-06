const { chromium } = require(`playwright`);
const fs = require(`node:fs`), http = require(`node:http`), path = require(`node:path`), assert = require(`node:assert/strict`);
const root = path.resolve(__dirname, `..`);
const matrix = [[`Cust No`, `Cust Name`, `Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`], [1001, `الصيدلية الأولى`, 10, 20, 30, 40, 50, 60, 70, 80, -3.67], [1002, `الصيدلية الثانية`, 10, 20, 30, 40, 50, 60, 70, 80, 90], [1003, `صيدلية مندوب آخر`, 10, 20, 30, 40, 50, 60, 70, 80, 90]];
const fakeApi = `
const data = globalThis.__fixture;
export function session(){return data.identity;}
export async function loadConfig(){return structuredClone(data.config);}
export async function loadDataset(){return {...data.dataset,routes:new Map(data.dataset.rows.map(r=>[r.code,r])),conflicts:new Map()};}
export async function loadTeamForecasts(month,ids){return new Map(ids.map(id=>[id,structuredClone(data.docs[id]||{revision:0,status:'draft',entries:{}})]));}
export async function saveForecast(month,id,entries,revision,confirm){data.saved++;const value={status:confirm?'confirmed':'draft',entries:structuredClone(entries),revision:revision+1,updatedAt:new Date().toISOString()};data.docs[id]=value;return value;}
export async function unlockAdmin(password){if(password!=='test-only')throw Error('كلمة مرور الإدارة غير صحيحة');data.admin=true;}
export function lockAdmin(){data.admin=false;}
export async function attachedBaseline(){return {year:2026,filename:'test.xlsx',matrix:data.matrix};}
export async function importSales(parsed){data.imported=parsed.count;}
export async function saveConfig(month,enabled){data.config={activeMonth:month,enabled};}
export async function loadPermits(){return new Map();}
export async function reopenForecast(month,id,reason){if(!data.admin)throw Error('ممنوع');data.docs[id].status='draft';data.reopened=reason;}
export async function grantPermit(month,id,hours){data.permit={id,hours};}
export async function revokePermit(){data.permit=null;}
export async function loadOrders(){return [{id:'o1',status:'orders_staff_hidden',pharmacyCode:'1001',grandTotal:75,createdAt:'2026-01-01',exportedAt:'2026-10-06T09:00:00Z'}];}
`;
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://localhost`).pathname;
    if (pathname === `/admin-test.html`) { res.setHeader(`content-type`, `text/html`); return res.end(`<html dir="rtl"><head><link rel="stylesheet" href="forecast.css"></head><body><main id="forecastApp"></main><script type="module">import{mountForecast}from './js/forecast-ui.js';mountForecast(document.getElementById('forecastApp'),{mode:'admin'});</script></body></html>`); }
    if (pathname === `/js/forecast-store.js`) { res.setHeader(`content-type`, `text/javascript`); return res.end(fakeApi); }
    const filename = path.join(root, pathname);
    if (!filename.startsWith(root) || !fs.existsSync(filename)) { res.writeHead(404); return res.end(); }
    const extension = path.extname(filename); res.setHeader(`content-type`, ({ [`.js`]: `text/javascript`, [`.css`]: `text/css`, [`.html`]: `text/html`, [`.json`]: `application/json` })[extension] || `text/plain`);
    res.end(fs.readFileSync(filename));
});
(async () => {
    await new Promise(resolve => server.listen(0, `127.0.0.1`, resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(`**/*`, route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const fixture = {
        config: { enabled: true, activeMonth: `2026-10` }, matrix, docs: {}, saved: 0,
        identity: { repId: `r1`, repName: `مندوب أ`, admin: { name: `مدير أ`, type: `manager` } },
        dataset: {
            sales: { months: [1,2,3,4,5,6,7,8,9], customers: Object.fromEntries(matrix.slice(1).map(row => [row[0], { name: row[1], months: Object.fromEntries(row.slice(2).map((v,i)=>[i+1,Math.round(v*100)])) }])) },
            rows: matrix.slice(1).map((row,i)=>({code:String(row[0]),pharmacyName:row[1],salesName:row[1],repId:i===2?`r2`:`r1`,repName:i===2?`مندوب ب`:`مندوب أ`,supervisor:i===2?`مدير ب`:`مدير أ`,months:Object.fromEntries(row.slice(2).map((v,i)=>[i+1,Math.round(v*100)]))}))
        }
    };
    await context.addInitScript(value => { globalThis.__fixture=structuredClone(value); }, fixture);
    const page = await context.newPage(), errors=[]; page.on(`pageerror`,error=>errors.push(error.message));
    page.on(`dialog`,dialog=>dialog.accept());
    await page.goto(`${base}/forecast.html`, { waitUntil: `domcontentloaded` });
    await page.locator(`[data-code="1001"]`).waitFor();
    assert.equal(await page.locator(`tbody tr`).count(), 2);
    assert.equal(await page.getByText(`صيدلية مندوب آخر`,{exact:true}).count(),0);
    assert.equal(await page.locator(`#fcConfirm`).isDisabled(),true);
    await page.locator(`[data-code="1001"]`).fill(`0`);
    await page.locator(`[data-note="1001"]`).fill(`ملاحظة الاختبار`);
    await page.locator(`#fcSave`).click();
    await page.getByText(`تم حفظ التوقعات جزئيا. أكمل الصيدليات المتبقية ثم أكدها.`,{exact:true}).waitFor();
    assert.equal(await page.locator(`#fcConfirm`).isDisabled(),true);
    assert.equal(await page.locator(`[data-note="1001"]`).inputValue(),`ملاحظة الاختبار`);
    await page.locator(`[data-code="1002"]`).fill(`1bad`);
    await page.locator(`#fcSearch`).fill(`الأولى`);
    await page.locator(`#fcSave`).click();
    await page.getByText(`صحح القيم غير الصالحة قبل الحفظ.`,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>globalThis.__fixture.saved),1);
    await page.locator(`#fcSearch`).fill(``);
    assert.equal(await page.locator(`[data-code="1002"]`).inputValue(),`1bad`);
    await page.locator(`[data-code="1002"]`).fill(`125.50`);
    assert.equal(await page.locator(`#fcConfirm`).isDisabled(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({ path: `/tmp/forecast-mobile.png`, fullPage: true });
    await page.locator(`#fcConfirm`).click();
    await page.getByText(`تم تأكيد جميع التوقعات. يمكنك الآن إدخال الطلبيات.`,{exact:true}).waitFor();
    assert.equal(await page.locator(`[data-code]`).count(),0);
    assert.equal(await page.locator(`#fcSave`).isDisabled(),true);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${base}/forecast.html?mode=tracking`,{waitUntil:`domcontentloaded`});
    await page.getByText(`75.00`,{exact:true}).first().waitFor();
    assert.equal(await page.getByText(`صيدلية مندوب آخر`,{exact:true}).count(),0);
    assert.equal(await page.locator(`[data-code]`).count(),0);
    await page.screenshot({path:`/tmp/forecast-tracking.png`,fullPage:true});
    await page.goto(`${base}/admin-test.html`,{waitUntil:`domcontentloaded`});
    await page.locator(`#fcAdminPassword`).fill(`wrong`);await page.locator(`#fcAdminLogin button`).click();
    await page.getByText(`كلمة مرور الإدارة غير صحيحة`,{exact:true}).waitFor();
    assert.equal(await page.locator(`#fcAdminControls`).isHidden(),true);
    await page.locator(`#fcAdminPassword`).fill(`test-only`);await page.locator(`#fcAdminLogin button`).click();
    await page.locator(`#fcAttached`).waitFor({state:`visible`});
    await page.locator(`#fcAttached`).click();await page.locator(`#fcImport`).waitFor({state:`visible`});
    await page.locator(`#fcImport`).click();
    await page.getByText(`تم اعتماد المبيعات. اختر شهر التعبئة ثم احفظ إعداد الشهر لتفعيل المنع.`,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>globalThis.__fixture.imported),3);
    await page.locator(`#fcEnforce`).selectOption(`yes`);await page.locator(`#fcConfigSave`).click();
    await page.getByText(`تم حفظ إعداد أكتوبر 2026.`,{exact:true}).waitFor();
    await page.locator(`#fcHours`).fill(`4`);await page.locator(`#fcPermit`).click();
    await page.getByText(`تم منح مهلة مؤقتة للمندوب. تنتهي تلقائيا حسب وقت الخادم.`,{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>globalThis.__fixture.permit.hours),4);
    await page.locator(`#fcAdminLock`).click();
    assert.equal(await page.locator(`#fcAdminControls`).isHidden(),true);
    assert.deepEqual(errors,[]);
    console.log(`Browser UI checks passed: mobile layout, representative scope, partial save, notes, hidden invalid input, zero confirmation, lock, supervisor scope, tracking, admin unlock, baseline import, and hourly exception.`);
    await browser.close();server.close();
})().catch(error=>{console.error(error);server.close();process.exit(1);});
