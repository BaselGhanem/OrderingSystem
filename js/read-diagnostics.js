const prefix = `dad_read_meter_v1:`, $ = id => document.getElementById(id);
const esc = value => String(value ?? ``).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day = value => new Intl.DateTimeFormat(`en-CA`,{timeZone:`Asia/Amman`,year:`numeric`,month:`2-digit`,day:`2-digit`}).format(new Date(value));
const fields = [`requests`,`serverDocs`,`cacheDocs`,`localDocs`,`events`,`errors`,`active`,`removed`,`emptyResults`];
let visible = [];
function records() { const rows = []; try { for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;try{const item=JSON.parse(localStorage.getItem(key));if(item.version===1&&item.rows)rows.push(item);}catch{}}}catch{}return rows; }
function total(rows){const sums=Object.fromEntries(fields.map(f=>[f,0]));for(const row of rows)for(const f of fields)sums[f]+=Number(row[f]||0);return sums;}
function table(headers, rows){return rows.length?`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join(``)}</tr></thead><tbody>${rows.map(row=>`<tr class="report-row">${row.map((cell,i)=>`<td data-label="${esc(headers[i])}">${cell}</td>`).join(``)}</tr>`).join(``)}</tbody></table>`:`<div class="empty">لا توجد قراءات مسجلة بهذا الاختيار. افتح صفحة من النظام بعد وصول التحديث، ثم ارجع هنا.</div>`;}
function render(){
 const all=records();const selected=$(`page`).value;
 $(`page`).innerHTML=`<option value="">كل الصفحات</option>`+[...new Set(all.map(r=>r.page))].sort().map(p=>`<option value="${esc(p)}" ${p===selected?`selected`:``}>${esc(p)}</option>`).join(``);
 visible=all.filter(r=>(!$(`date`).value||day(r.updatedAt)===$(`date`).value)&&(!selected||r.page===selected)).flatMap(r=>Object.values(r.rows).map(row=>({...row,page:r.page,title:r.title,session:r.id})));
 const sums=total(visible);$(`stats`).innerHTML=[[`وثائق الخادم المرصودة`,sums.serverDocs],[`وثائق الكاش`,sums.cacheDocs],[`طلبات القراءة / الاشتراك`,sums.requests],[`أخطاء`,sums.errors]].map(([label,v])=>`<article class="card">${label}<b>${v.toLocaleString(`en-US`)}</b></article>`).join(``);
 const pages=new Map();for(const row of visible){const list=pages.get(row.page)||[];list.push(row);pages.set(row.page,list);}
 $(`pages`).innerHTML=table([`الصفحة`,`وثائق الخادم`,`وثائق الكاش`,`الطلبات`,`الأخطاء`,`الجلسات`],[...pages].map(([name,rows])=>({name,...total(rows),sessions:new Set(rows.map(r=>r.session)).size})).sort((a,b)=>b.serverDocs-a.serverDocs).map(r=>[esc(r.name),r.serverDocs,r.cacheDocs,r.requests,r.errors,r.sessions]));
 const sources=new Map();for(const row of visible){const key=JSON.stringify([row.page,row.operation,row.scope,row.source]);const previous=sources.get(key);if(previous){for(const f of fields)previous[f]+=row[f]||0;}else sources.set(key,{...row});}
 $(`sources`).innerHTML=table([`المصدر`,`وثائق الخادم`,`الكاش`,`الطلبات`,`الأخطاء`,`اشتراكات عند آخر رصد`],[...sources.values()].sort((a,b)=>b.serverDocs-a.serverDocs).map(r=>[`<div>${esc(r.page)} — <code>${esc(r.operation)} / ${esc(r.scope)}</code></div><code class="details">${esc(r.source)}</code>${r.errors?`<p class="muted">${esc(r.lastError)}</p>`:``}<p class="muted">نتائج خادم فارغة: ${r.emptyResults||0} · أحداث إزالة: ${r.removed||0}</p>`,r.serverDocs,r.cacheDocs,r.requests,r.errors,r.active]));
 $(`updated`).textContent=`آخر تحديث للعرض: ${new Date().toLocaleString(`en-GB`,{timeZone:`Asia/Amman`})}`;
}
$(`date`).value=day(Date.now());$(`date`).onchange=render;$(`page`).onchange=render;$(`refresh`).onclick=render;
$(`export`).onclick=()=>{const cols=[`page`,`operation`,`scope`,`source`,...fields];const csv=`\uFEFF`+[cols,...visible.map(r=>cols.map(c=>r[c]??``))].map(row=>row.map(v=>`"${String(v).replaceAll(`"`,`""`)}"`).join(`,`)).join(`\r\n`);const url=URL.createObjectURL(new Blob([csv],{type:`text/csv;charset=utf-8`}));const a=document.createElement(`a`);a.href=url;a.download=`Firestore_Reads_${$(`date`).value||`all`}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$(`clear`).onclick=()=>{if(!confirm(`مسح عدادات التشخيص في هذا المتصفح؟ هذا لا يحذف أي بيانات من Firebase.`))return;for(const r of records())localStorage.removeItem(prefix+r.id);render();};
window.addEventListener(`storage`,e=>{if(e.key?.startsWith(prefix))render();});render();
