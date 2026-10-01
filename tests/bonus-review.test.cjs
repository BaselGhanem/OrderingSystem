const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const defaults=fs.readFileSync(path.join(root,'js/regular-bonus-defaults.js'),'utf8').replace('export const bonusDefaults = ','').trim().replace(/;$/,'');
const source=fs.readFileSync(path.join(root,'js/regular-bonus.js'),'utf8').replace(/^import[^\n]+\n/,`const bonusDefaults = ${defaults};\n`);
const modulePromise=import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Field {
 constructor(value='') {this.value=value;this.listeners={};this.options=[];this.attributes={};this.style={};this.hidden=false;}
 addEventListener(event,cb){(this.listeners[event]??=[]).push(cb);}
 fire(event){for(const cb of this.listeners[event]||[])cb();}
 setAttribute(key,value){this.attributes[key]=value;}
 removeAttribute(key){delete this.attributes[key];}
 before(node){this.select=node;}
 after(node){this.hint=node;}
 replaceChildren(){this.options=[];this.value='';}
 add(option){this.options.push(option);}
 setCustomValidity(message){this.validationMessage=message;}
 focus(){}
 checkValidity(){return !this.validationMessage;}
}
test('changing from an automatic product to a manual product clears the old quantity and bonus',async()=>{
 const {attachBonusRow}=await modulePromise;
 const oldDocument=global.document,oldOption=global.Option;
 global.document={createElement:()=>new Field()};global.Option=class {constructor(text,value){this.text=text;this.value=value;}};
 try {
  const input=new Field('Automatic'),qty=new Field('213'),bonus=new Field('31');
  const row={querySelector:selector=>({'.product-input':input,'.qty-input':qty,'.bonus-input':bonus}[selector])};
  attachBonusRow(row,name=>({code:name==='Automatic'?'F0000GMCCPJOG01':'UNKNOWN'}),()=>{});
  assert.equal(bonus.value,'31');assert.equal(bonus.readOnly,true);
  input.value='Manual';row.regularBonusChanged();
  assert.equal(qty.value,'');assert.equal(bonus.value,'0');assert.equal(bonus.readOnly,false);
 }finally{global.document=oldDocument;global.Option=oldOption;}
});
test('bonus configuration becomes available only after loading, and a failed load can be retried',async()=>{
 let complete;let calls=0;
 global.__reviewFirebase={db:{},doc:()=>({}),getDoc:()=>{calls++;return new Promise((resolve,reject)=>{complete={resolve,reject};});}};
 const isolated=source.replace('await import(`./firebase.js`)','globalThis.__reviewFirebase');
 const mod=await import(`data:text/javascript;base64,${Buffer.from(isolated).toString('base64')}`);
 const first=mod.loadBonusConfiguration();assert.equal(mod.configurationAvailable(),false);
 complete.reject(new Error('temporary failure'));await assert.rejects(first);assert.equal(mod.configurationAvailable(),false);
 const second=mod.loadBonusConfiguration();assert.equal(calls,2);assert.equal(mod.configurationAvailable(),false);
 complete.resolve({exists:()=>false});await second;assert.equal(mod.configurationAvailable(),true);
 delete global.__reviewFirebase;
});
test('upload rejects duplicate and orphan tier columns instead of silently ignoring data',async()=>{
 const importSource=fs.readFileSync(path.join(root,'js/regular-bonus-import.js'),'utf8').replace(/^import[^\n]+\n/,source+'\n');
 const {parseBonusRows}=await import(`data:text/javascript;base64,${Buffer.from(importSource).toString('base64')}`);
 const products=[{code:'P',name:'Product'}];
 assert.throws(()=>parseBonusRows([['كود الصنف','اسم الصنف','نوع البونص','كمية 1','بونص 1','بونص 1'],['P','Product','شرائح',12,1,999]],products),/عمود مكرر/);
 assert.throws(()=>parseBonusRows([['كود الصنف','اسم الصنف','نوع البونص','بونص 1'],['P','Product','بدون بونص',999]],products),/عمود مفقود/);
});
for(const file of ['app.status-source.js','workflow.status-source.js'])test(`${file}: Extra marker updates when a note is entered or removed`,()=>{
 const code=fs.readFileSync(path.join(root,'js',file),'utf8');let listener;let marker='';let highlighted=false;
 const note={value:'',addEventListener:(_event,cb)=>{listener=cb;}};
 const row={querySelector:()=>note,classList:{toggle:(_name,value)=>{highlighted=value;}}};
 const nameCell={querySelectorAll:()=>marker?[{remove(){marker='';}}]:[],insertAdjacentHTML:(_position,html)=>{marker=html;}};
 const context={row,nameCell};vm.createContext(context);vm.runInContext(code.slice(0,code.indexOf('import ')),context);context.bindExtraNoteMarker(row,'.note',nameCell);
 note.value='أي ملاحظة';listener();assert.equal(highlighted,true);assert.match(marker,/Extra/);
 note.value='   ';listener();assert.equal(highlighted,false);assert.equal(marker,'');
});
test('clearing supervisor filters includes the bonus classification',()=>{
 const code=fs.readFileSync(path.join(root,'js/app.status-source.js'),'utf8');
 const start=code.indexOf("btnClearManagerFilter?.addEventListener('click'");
 let click;const extra={value:'extra'};
 const context={btnClearManagerFilter:{addEventListener:(_event,cb)=>{click=cb;}},managerFilterFrom:{value:'2026-10-01'},managerFilterTo:{value:'2026-10-31'},getEl:id=>id==='supervisorExtraFilter'?extra:null,closeSupervisorSearchFilter(){},handleManagerDateChange(){},showToast(){}};
 vm.createContext(context);vm.runInContext(code.slice(start,code.indexOf('\n});',start)+4),context);click();assert.equal(extra.value,'');
});
