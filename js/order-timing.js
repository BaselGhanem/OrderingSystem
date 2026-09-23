import { db, collection, getDocs } from './firebase.js';

const $ = id => document.getElementById(id);
const ZONE = 'Asia/Amman';
const owners = { market: 'محمد عميرة', finance: 'حمزة', staff: 'قسم الطلبيات (زياد/زكريا)' };
const waiting = {
  supervisor_approved: 'market', market_manager_pending: 'market', returned_to_market_manager: 'market',
  market_manager_approved: 'finance', finance_pending: 'finance', returned_to_finance: 'finance',
  finance_approved: 'staff', orders_staff_pending: 'staff', orders_staff_exported: 'staff'
};
const outcome = { market_manager_approved: 'موافقة', market_manager_rejected: 'رفض', finance_approved: 'موافقة', finance_rejected: 'رفض', orders_staff_hidden: 'فوترة/إغلاق' };
let rows = [];
let timer;
const dateOf = value => {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : value.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const instant = value => dateOf(value)?.getTime() ?? NaN;
const stage = value => waiting[String(value || '').trim()] || null;
const fmt = value => new Intl.DateTimeFormat('ar-JO', { timeZone: ZONE, dateStyle: 'short', timeStyle: 'short' }).format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parts = date => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:ZONE, year:'numeric', month:'2-digit', day:'2-digit', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(date).map(x => [x.type, x.value]));
  return { key:`${p.year}-${p.month}-${p.day}`, day:p.weekday, minute:Number(p.hour)*60+Number(p.minute) };
};
function businessMinutes(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let total = 0, cursor = Math.floor(start / 3600000) * 3600000;
  const stop = end;
  while (cursor < stop) {
    const p = parts(new Date(cursor));
    const next = Math.min(stop, cursor + 3600000);
    if (!['Fri','Sat'].includes(p.day) && p.minute >= 480 && p.minute < 1020) total += Math.max(0, next - Math.max(start, cursor)) / 60000;
    cursor += 3600000;
  }
  return Math.round(total);
}
const duration = minutes => `${Math.floor(minutes / 60)} س ${minutes % 60} د`;
function eventStatus(entry) {
  const next = entry.newValue;
  if (typeof next === 'string') return next;
  if (next?.status) return next.status;
  const action = String(entry.action || entry.type || '');
  const alias = {supervisor_approved:'market_manager_pending', market_manager_approved:'finance_pending', finance_approved:'orders_staff_pending', orders_staff_returned_to_finance:'returned_to_finance', orders_staff_edit_returned_to_finance:'returned_to_finance', orders_staff_invoiced_after_export:'orders_staff_hidden', orders_staff_invoiced_and_hidden_after_export:'orders_staff_hidden'};
  return alias[action] || (action in waiting || action in outcome ? action : '');
}
function build(order) {
  const events = (Array.isArray(order.auditTrail) ? order.auditTrail : []).map(e => ({at:instant(e.timestamp || e.at || e.changedAt), status:eventStatus(e), action:String(e.action || ''), actor:String(e.user || e.by || ''), note:String(e.notes || '')}))
    .filter(e => Number.isFinite(e.at) && e.status).sort((a,b) => a.at-b.at);
  let open = null;
  const periods = [];
  for (const event of events) {
    const target = stage(event.status);
    if (open && (target !== open.owner || (event.action.includes('approved') || event.action.includes('rejected') || event.action.includes('returned') || event.action.includes('invoiced') || event.action.includes('deleted')) && event.action !== 'orders_staff_exported')) {
      periods.push({...open, end:event.at, decision:outcome[event.action] || (event.action.includes('returned') ? 'إرجاع' : event.action.includes('deleted') ? 'حذف' : 'انتقال'), actor:event.actor, note:event.note});
      open = null;
    }
    if (!open && target) open = {owner:target, start:event.at};
  }
  const current = stage(order.status || order.orderStatus || order.workflowStatus);
  if (open && open.owner === current) periods.push({...open, end:null, decision:'بانتظار الإجراء', actor:'', note:''});
  return periods.map((period, i) => ({...period, id:order.id, pharmacy:order.pharmacyName || '—', type:order.orderType === 'reserved' ? 'أصناف مقطوعة' : 'أصناف متاحة', period:i+1}));
}
function render() {
  const now = Date.now(), person=$('person').value, status=$('status').value, from=$('from').value, to=$('to').value, search=$('search').value.trim().toLowerCase();
  const selected = rows.map(row => ({...row, minutes:businessMinutes(row.start, row.end || now)})).filter(row =>
    (!person || row.owner === person) && (!status || (status === 'open' ? !row.end : !!row.end)) &&
    (!from || parts(new Date(row.start)).key >= from) && (!to || parts(new Date(row.start)).key <= to) &&
    (!search || `${row.id} ${row.pharmacy}`.toLowerCase().includes(search)));
  const open = selected.filter(row => !row.end);
  $('count').textContent = String(open.length);
  $('oldest').textContent = open.length ? duration(Math.max(...open.map(row => row.minutes))) : '—';
  const closed = selected.filter(row => row.end);
  $('average').textContent = closed.length ? duration(Math.round(closed.reduce((n,row)=>n+row.minutes,0)/closed.length)) : '—';
  $('closed').textContent = String(closed.length);
  $('cards').innerHTML = Object.entries(owners).map(([key,label]) => {
    const list = open.filter(row=>row.owner===key);
    return `<article class="person"><span>${escape(label)}</span><strong>${list.length}</strong><small>بانتظار الإجراء · الأقدم ${list.length ? duration(Math.max(...list.map(row=>row.minutes))) : '—'}</small></article>`;
  }).join('');
  selected.sort((a,b) => (a.end===null)-(b.end===null) ? (a.end===null ? -1 : 1) : b.minutes-a.minutes);
  $('results').textContent = `${selected.length} فترة معالجة موثقة`;
  $('body').innerHTML = selected.slice(0,500).map(row => `<tr><td><b>${escape(row.id)}</b><small>${escape(row.pharmacy)}</small></td><td>${escape(owners[row.owner])}</td><td>${fmt(row.start)}</td><td>${row.end ? fmt(row.end) : '<span class="pending">مفتوحة الآن</span>'}</td><td><b>${duration(row.minutes)}</b></td><td>${escape(row.decision)}${row.actor ? `<small>${escape(row.actor)}</small>` : ''}</td><td>${escape(row.type)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا توجد فترات موثقة تطابق الفلاتر.</td></tr>';
  $('limit').hidden = selected.length <= 500;
}
async function load() {
  $('refresh').disabled = true;
  $('message').textContent = 'جاري تحميل سجل الطلبات…';
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    rows = snapshot.docs.flatMap(doc => build({id:doc.id,...doc.data()}));
    $('message').textContent = `آخر تحديث ${fmt(Date.now())} · التوقيت حسب عمّان · تحتسب ساعات الأحد–الخميس، 8:00–17:00 فقط`;
    render();
  } catch (error) {
    console.error(error);
    $('message').textContent = 'تعذر تحميل الطلبات. تحقق من الاتصال وصلاحيات Firebase ثم أعد المحاولة.';
  } finally { $('refresh').disabled = false; }
}
['person','status','from','to','search'].forEach(id => $(id).addEventListener(id === 'search' ? 'input' : 'change', render));
$('refresh').addEventListener('click', load);
const todayInAmman = parts(new Date()).key;
$('from').value = `${todayInAmman.slice(0, 8)}01`;
$('to').value = todayInAmman;
load();
timer = setInterval(() => { if (!document.hidden && rows.some(row=>!row.end)) render(); }, 60000);
window.addEventListener('pagehide',()=>clearInterval(timer));
