import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

// Separate API sessions represent another actor/device, never SQL mutations.
export async function checkIntegration10({send,js,nav,login,click,text,waitFor,profile,password}) {
 const origin=await js('location.origin'), q=JSON.stringify;
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'phase10a');await mkdir(out,{recursive:true});
 const findings={};
 async function api(path,token,body,method='POST',status=200){
  const response=await fetch(origin+path,{method:body?method:'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),'Idempotency-Key':randomUUID()},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,status,path);return response.headers.get('content-type')?.includes('application/json')?(await response.json()).data:null;
 }
 const auth=async email=>api('/api/auth/login',null,{email,password});
 const [admin,user,administrator]=await Promise.all(['admin','owner','administrator'].map(role=>auth(role+'@phase1.invalid')));
 const officerEmail=randomUUID()+'@integration10.invalid';
 await api('/api/auth/register',null,{name:'Petugas Integration 10',email:officerEmail,password},'POST',201);
 const registered=await auth(officerEmail);
 await api('/api/administrator/accounts/'+registered.id,administrator.token,{role:'petugas',is_active:true,expected_role:'user',expected_active:true,reason:'Akun petugas khusus fixture integrasi.'},'PATCH');
 const officer=await auth(officerEmail);
 const prefix='Integration10-'+Date.now(), base='/api/ecorecycle/facility-reports';
 const form=values=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,String(v));return f;};
 const report=await api(base,user.token,form({category:'waste_bank',title:prefix,description:'Pemeriksaan lintas role Phase 10A.',address:'Jalan Fixture Bandung',latitude:-6.9,longitude:107.6}),'POST',201);
 await api(base+'/'+report.id+'/verification',admin.token,{status:'approved',version:report.version});
 const path=base+'/'+report.id+'/handling';
 let task=await api(path+'/assignment',admin.token,{version:0,petugas_id:officer.id});
 const activity=async(action,fields={})=>task=await api(path+'/activity',officer.token,form({version:task.version,action,...fields}));
 await activity('start_assessment');await activity('record_assessment',{condition:'Rusak',assessment:'Engsel perlu diperbaiki.'});
 await activity('record_progress',{action_taken:'Engsel telah diperbaiki.',internal_note:'INTERNAL10A'});
 await activity('submit_resolution',{result:'HASIL10A pertama'});
 assert.equal(task.status,'resolution_submitted');
 await login('admin@phase1.invalid','/admin');await click('[aria-controls=admin-facility-handling]');
 await text('[data-facility-handling] .facility-muted','laporan');
 findings.admin_default_queue=await js(`document.querySelector('[data-facility-handling] .facility-cards').innerText.includes(${q(prefix)})`);
 // Continue collecting evidence even when the initial filter is broken.
 await js(`(()=>{const s=document.querySelector('[data-facility-handling] .facility-filters select');s.value='resolution_submitted';s.dispatchEvent(new Event('change'));})()`);
 await text('[data-facility-handling] .facility-cards',prefix);
 await js(`Array.from(document.querySelectorAll('[data-facility-handling] .facility-cards > *')).find(e=>e.innerText.includes(${q(prefix)})).querySelector('button').click()`);
 await text('[data-facility-handling]','HASIL10A pertama');
 task=await api(path+'/review',admin.token,{version:task.version,decision:'request_revision',internal_note:'Periksa sekali lagi.'});
 await activity('record_progress',{action_taken:'Perbaikan kedua selesai.'});await activity('submit_resolution',{result:'HASIL10A terbaru'});
 await js('window.dispatchEvent(new Event("focus"));void 0');await sleep(1200);
 findings.admin_focus_detail=await js(`document.querySelector('[data-facility-handling]').innerText.includes('HASIL10A terbaru')`);
 await capture('admin-detail');
 // An older pending review must still contribute to the overview counters.
 await Promise.all(Array.from({length:21},async(_,i)=>{
  const r=await api(base,user.token,form({category:'other',title:prefix+' newer '+i,description:'Pagination fixture.',address:'Jalan Fixture'}),'POST',201);
  await api(base+'/'+r.id+'/verification',admin.token,{status:'approved',version:r.version});
 }));
 await click('[aria-controls=admin-overview]');await text('#admin-overview [role=status]','Cuplikan');
 const totals=await api('/api/analytics',admin.token);
 findings.admin_global_validation_count=Number(await js(`document.querySelector('[data-overview-status=resolution_submitted]').textContent`))===totals.awaiting_validation;
 await capture('admin-overview');
 // Catalog already open when an administrator publishes on another device.
 await login('owner@phase1.invalid','/dashboard');await click('[data-target=poin-voucher]');await text('[data-catalog] [data-list-state]','data dimuat');
 const values={name:prefix,description:'SIMULASI — tidak berlaku di merchant nyata.',category:'apresiasi',point_cost:10,stock:3,active:true,valid_from:new Date(Date.now()-3600000).toISOString(),valid_until:new Date(Date.now()+86400000).toISOString()};
 const voucher=await api('/api/administrator/vouchers',administrator.token,values);
 assert((await api('/api/vouchers?limit=100',user.token)).some(row=>row.id===voucher.id));
 await click('[data-target=beranda]');await click('[data-target=poin-voucher]');await sleep(1200);
 findings.user_catalog_reentry=await js(`document.querySelector('[data-catalog]').innerText.includes(${q(prefix)})`);
 await click('[data-catalog] [data-list-retry]');await text('[data-catalog]',prefix);
 const saved=(await api('/api/administrator/vouchers?limit=100',administrator.token)).find(row=>row.id===voucher.id);
 await api('/api/administrator/vouchers/'+voucher.id,administrator.token,{...values,version:saved.version,description:'DESKRIPSI10A diperbarui',stock:4},'PUT');
 await js('window.dispatchEvent(new Event("focus"));void 0');await sleep(1200);
 findings.user_catalog_focus=await js(`document.querySelector('[data-catalog]').innerText.includes('DESKRIPSI10A diperbarui')`);
 await capture('user-catalog');
 await login('administrator@phase1.invalid','/administrator');await click('[data-voucher-new]');
 findings.publish_checkbox_clear=await js(`document.querySelector('.p9-dialog [name=active]').closest('span').innerText.includes('Tampilkan voucher di katalog User')`);
 await capture('administrator-publish');
 await click('.p9-dialog [data-dialog-close]');
 await writeFile(join(out,'integration-observations.json'),JSON.stringify({report_id:report.id,voucher_id:voucher.id,findings},null,2));
 console.log('Phase 10 reproduced cross-role observations: '+JSON.stringify(findings));
 assert(Object.values(findings).every(Boolean),'Cross-role integration failures: '+Object.entries(findings).filter(([,pass])=>!pass).map(([name])=>name).join(', '));
 // Persistence after real navigation and a new login.
 await login('admin@phase1.invalid','/admin');await click('[aria-controls=admin-facility-handling]');
 await text('[data-facility-handling] .facility-muted','laporan');
 await js(`Array.from(document.querySelectorAll('[data-facility-handling] button')).find(e=>e.textContent==='Muat laporan berikutnya').click()`);
 await waitFor(()=>js(`Array.from(document.querySelectorAll('[data-facility-handling] .facility-cards h4')).some(e=>e.textContent===${q(prefix)})`),'Older report missing after pagination');
 await js(`Array.from(document.querySelectorAll('[data-facility-handling] .facility-cards > *')).find(e=>e.querySelector('h4')?.textContent===${q(prefix)}).querySelector('button').click()`);
 await text('[data-facility-handling]','HASIL10A terbaru');
 await js(`Array.from(document.querySelectorAll('[data-facility-handling] .handling-actions button')).find(e=>e.textContent==='Validasi penyelesaian').click()`);
 await waitFor(()=>js('Boolean(document.querySelector(".handling-dialog[open] form"))'),'Missing validation form');
 await js(`(()=>{const f=document.querySelector('.handling-dialog[open] form');f.elements.public_note.value='HASIL10A tervalidasi untuk pelapor';f.requestSubmit();})()`);
 await text('[data-facility-handling]','Hasil tervalidasi');
 assert.equal((await api(path,admin.token)).status,'completed');
 const publicResult=await api(path,user.token);assert.equal(publicResult.status,'completed');assert(!JSON.stringify(publicResult).includes('INTERNAL10A'));
 await capture('admin-validated');
 await login('owner@phase1.invalid','/dashboard');await click('[data-target=poin-voucher]');await text('[data-catalog]','DESKRIPSI10A diperbarui');
 console.log('PASS Phase 10 targeted cross-role queue, detail refresh, voucher entry/focus, publishing label and persistence.');
 async function capture(name){for(const width of (process.env.SAMPIRA_TEST_FINAL10C==='1'?[1280,1440,768,360,390]:[1280,390])){await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<500});await sleep(150);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow');const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}.png`),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});}
}
