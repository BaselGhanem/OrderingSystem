
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
