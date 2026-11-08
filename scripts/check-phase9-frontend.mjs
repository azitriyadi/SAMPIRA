import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

// The enclosing runner supplies a freshly initialized, isolated DB/server.
export async function checkPhase9Frontend({send,js,nav,login,click,text,waitFor,profile}) {
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'phase9b');await mkdir(out,{recursive:true});
 const q=JSON.stringify;
 const ready=selector=>waitFor(()=>js('Boolean(document.querySelector('+q(selector)+')?.getClientRects().length)'),'Missing '+selector);
 const reloadCatalog=async()=>{await waitFor(()=>js('Boolean(document.querySelector("[data-catalog] [data-list-retry]"))&&!document.querySelector("[data-catalog] [data-list-retry]").disabled'),'Catalog refresh still in flight');await click('[data-catalog] [data-list-retry]');};
 const read=path=>js('portalFetch('+q(path)+').then(async r=>{if(!r.ok)throw Error("API read "+r.status);return (await r.json()).data;})');
 const post=(path,body)=>js('portalFetch('+q(path)+',{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify('+q(body)+')}).then(async r=>{if(!r.ok)throw Error("Fixture write "+r.status);return (await r.json()).data;})');
 async function fields(values){await js(`(()=>{const f=document.querySelector('.p9-dialog form');for(const [name,value] of Object.entries(${q(values)})){const el=f.elements.namedItem(name);if(el.type==='checkbox')el.checked=value;else el.value=value;}f.requestSubmit();})()`);}
 async function capture(name,selector){
  await js('document.fonts.ready');
  for(const width of (process.env.SAMPIRA_TEST_FINAL10C==='1'?[1280,1440,768,360,390]:[1280,390])){
   await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
   if(selector)await js(`document.querySelector(${q(selector)}).scrollIntoView({block:'start',behavior:'instant'});void 0`);
   await sleep(200);
   const box=await js('({page:document.documentElement.scrollWidth,width:innerWidth})');assert(box.page<=box.width+2,`${name} overflow ${JSON.stringify(box)}`);
   const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
 }
 const local=value=>new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16);
 const from=new Date(Date.now()-3600000).toISOString(),until=new Date(Date.now()+86400000).toISOString();
 const prefix='QA9B-'+Date.now();
 const tokenResponse=await fetch('http://127.0.0.1:18081/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'administrator@phase1.invalid',password:process.env.SAMPIRA_TEST_PASSWORD})});
 assert.equal(tokenResponse.status,200);const token=(await tokenResponse.json()).data.token;
 async function adminAPI(path,body,method='POST'){
  const response=await fetch('http://127.0.0.1:18081'+path,{method:body?method:'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert(response.ok,path+' '+data.message);return data.data;
 }
 const voucherDefaults={name:prefix,description:'Voucher simulasi untuk QA. Tidak berlaku di merchant nyata.',category:'apresiasi',point_cost:10,stock:3,valid_from:from,valid_until:until,active:true};
 // >20 rows proves real cursor pagination, not a decorative pagination control.
 await Promise.all(Array.from({length:21},(_,i)=>adminAPI('/api/administrator/vouchers',{...voucherDefaults,name:prefix+' contoh '+i,active:false})));
 await login('owner@phase1.invalid','/dashboard');
 const owner=await js('portalUser("user")');
 const pickup=await post('/api/ecorecycle/request_pickup',{item_description:'Pengujian kontribusi Phase 9B',category:'Computers',weight_kg:10,pickup_address:'Jalan Uji Kontribusi Bandung 123',contact_phone:'081234567890',latitude:-6.91,longitude:107.61});
 const reports=[];
 for(let i=0;i<3;i++)reports.push(await js(`(async()=>{const f=new FormData();for(const [k,v] of Object.entries({category:'tps',title:'${prefix} laporan ${i}',description:'Laporan fasilitas sintetis untuk pengujian grid dan penugasan.',address:'Jalan Uji Fasilitas Bandung 123',latitude:'-6.91',longitude:'107.61'}))f.set(k,v);const r=await portalFetch('/api/ecorecycle/facility-reports',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:f});if(r.status!==201)throw Error('Report fixture');return (await r.json()).data;})()`));
 await login('collector@phase1.invalid','/petugas');
 await post('/api/ecorecycle/assign_collector',{tracking_number:pickup.tracking_number});
 for(const status of ['transit','arrived'])await post('/api/ecorecycle/pickup_status',{tracking_number:pickup.tracking_number,status});
 await post('/api/ecorecycle/verify_pickup',{pickup_id:pickup.pickup_id,final_weight_kg:10});
 await text('[data-p9-analytics=petugas] [data-analytics-state]','Diperbarui');await capture('petugas-statistics','[data-p9-analytics=petugas]');
 await click('[data-collector-view=operations]');await ready('[data-map-canvas] .leaflet-pane');await capture('petugas-map','[data-map-canvas]');
 await login('admin@phase1.invalid','/admin');
 for(const report of reports)await post('/api/ecorecycle/facility-reports/'+report.id+'/verification',{version:report.version,status:'approved'});
 await click('[aria-controls=admin-analytics]');await ready('#admin-analytics .p9-map .leaflet-pane');
 await click('#admin-analytics .p9-grid-filter [type=submit]');await text('#admin-analytics [data-grid-state]','sel ditampilkan');
 assert(await js('document.querySelector("#admin-analytics [data-grid-table]").innerText.includes("3")'));
 assert(await js('document.querySelectorAll("#admin-analytics .p9-map path.leaflet-interactive").length>=2'));
 await capture('admin-statistics','#admin-analytics');await capture('admin-grid','#admin-analytics .p9-grid-filter');
 await js('document.querySelector("#admin-analytics [name=min_lat]").value="-6";document.querySelector("#admin-analytics form").requestSubmit();void 0');await text('#admin-analytics [data-grid-state]','empat batas');
 await js('document.querySelector("#admin-analytics [name=min_lat]").value="";void 0');
 await click('[aria-controls=admin-report-verification]');await ready('#facility-list');await capture('admin-verification','#admin-report-verification');
 await click('[aria-controls=admin-facility-handling]');await capture('admin-assignment','#admin-facility-handling');

 await login('administrator@phase1.invalid','/administrator');await text('#p9-system [data-analytics-state]','Diperbarui');
 await capture('administrator-statistics','#p9-system');
 await click('[data-voucher-new]');await ready('.p9-dialog[open]');
 await fields({name:prefix,description:voucherDefaults.description,category:'apresiasi',point_cost:10,stock:2,valid_from:local(from),valid_until:local(until),active:true});
 await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Voucher creation failed');
 let catalog=await read('/api/administrator/vouchers?limit=100');let voucher=catalog.find(row=>row.name===prefix);assert(voucher);
 await click(`[data-voucher-edit="${voucher.id}"]`);await ready('.p9-dialog');await capture('administrator-voucher-editor','.p9-dialog');
 await fields({stock:3});await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Voucher edit failed');
 catalog=await read('/api/administrator/vouchers?limit=100');voucher=catalog.find(row=>row.id===voucher.id);assert.equal(voucher.stock,3);
 await capture('administrator-vouchers','#p9-voucher-admin');
 await click('#p9-voucher-admin [data-list-more]');await text('#p9-voucher-admin [data-list-state]','data dimuat');assert(await js('document.querySelectorAll("#p9-voucher-admin tbody tr").length>20'));
 const accountEmail=(prefix+'@phase9b.invalid').toLowerCase();await post('/api/auth/register',{name:'Akun UI Phase 9B',email:accountEmail,password:process.env.SAMPIRA_TEST_PASSWORD});
 await click('#p9-accounts [data-list-retry]');await text('#p9-accounts [data-list-items]',accountEmail);
 const account=(await read('/api/administrator/accounts?limit=100')).find(row=>row.email.toLowerCase()===accountEmail.toLowerCase());assert(account);
 await click(`[data-account-edit="${account.id}"]`);await capture('administrator-account-dialog','.p9-dialog');
 await fields({role:'petugas',is_active:'false',reason:'Pengujian perubahan role dan penonaktifan akun sintetis.'});
 await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Account update failed');
 const changed=(await read('/api/administrator/accounts?limit=100')).find(row=>row.id===account.id);assert.equal(changed.role,'petugas');assert.equal(changed.is_active,false);
 await capture('administrator-accounts','#p9-accounts');

 await login('owner@phase1.invalid','/dashboard');await click('[data-target=poin-voucher]');await text('[data-wallet-state]','Saldo sesuai');await text('[data-catalog] [data-list-state]','data dimuat');
 const walletBefore=await read('/api/user/contributions');assert(walletBefore.balance>=100);
 const mineBefore=(await read('/api/user/vouchers')).length;
 await capture('user-points','#poin-voucher');
 await click(`[data-redeem="${voucher.id}"]`);await capture('user-redeem-confirm','.p9-dialog');
 // Simulate a connection loss AFTER the server commits. Retry must return the
 // original redemption without another debit, including the same receipt code.
 await js(`window.p9OriginalFetch=window.fetch;window.p9LostOnce=false;window.fetch=async (url,options)=>{const r=await p9OriginalFetch(url,options);if(String(url).endsWith('/redeem')&&!p9LostOnce&&r.ok){p9LostOnce=true;throw new TypeError('Simulated lost response');}return r;};void 0`);
 await click('.p9-dialog [type=submit]');await text('.p9-dialog [data-dialog-state]','Koneksi');
 await click('.p9-dialog [type=submit]');await text('.p9-dialog [data-dialog-body]','Penukaran berhasil');await text('[data-wallet-state]','Saldo sesuai');
 await js('window.fetch=p9OriginalFetch;void 0');
 const walletAfter=await read('/api/user/contributions'),issued=await read('/api/user/vouchers');
 assert.equal(walletAfter.balance,walletBefore.balance-10);assert.equal(walletAfter.lifetime_points,walletBefore.lifetime_points);assert.equal(issued.length,mineBefore+1);
 const stockAfter=(await adminAPI('/api/administrator/vouchers?limit=100')).find(row=>row.id===voucher.id);assert.equal(stockAfter.stock,2);
 assert.equal(await js('document.querySelector(".p9-dialog .p9-code").textContent'),issued[0].code);
 await capture('user-redeem-success','.p9-dialog');await click('.p9-dialog [data-dialog-close]');
 await click('[data-points-view=mine]');await capture('user-my-vouchers','[data-points-panel=mine]');
 await click(`[data-voucher-detail="${issued[0].id}"]`);await capture('user-voucher-code','.p9-dialog');await click('.p9-dialog [data-dialog-close]');
 await click('[data-points-view=ledger]');await capture('user-point-history','[data-points-panel=ledger]');assert(await js('document.querySelector("[data-ledger]").innerText.includes("-10")'));
 await click('[data-points-view=analytics]');await text('[data-points-panel=analytics] [data-analytics-state]','Diperbarui');await capture('user-analytics','[data-points-panel=analytics]');
 await click('[data-target=reward-user]');await text('[data-reward-summary] [data-analytics-state]','Diperbarui');await capture('user-rewards','#reward-user');
 await js('document.querySelector("[data-reward-filter]").value="pending";document.querySelector("[data-reward-filter]").dispatchEvent(new Event("change"));void 0');
 assert(!await js('document.querySelector("[data-reward-list] tbody")?.innerText.includes("Pembayaran tercatat")'));
 await click('[data-target=poin-voucher]');await click('[data-points-view=catalog]');
 // Stale browser catalog: expiry, stock and cost are decided by Backend.
 for(const change of [{stock:0},{active:false,valid_from:'2020-01-01T00:00:00Z',valid_until:'2020-02-01T00:00:00Z'},{point_cost:11}]){
  const candidate=await adminAPI('/api/administrator/vouchers',{...voucherDefaults,name:prefix+' stale '+Math.random()});
  await reloadCatalog();await waitFor(()=>js(`Boolean(document.querySelector('[data-redeem="${candidate.id}"]'))`),'Stale voucher missing');
  const row=(await adminAPI('/api/administrator/vouchers?limit=100')).find(row=>row.id===candidate.id);
  await click(`[data-redeem="${candidate.id}"]`);
  await adminAPI('/api/administrator/vouchers/'+candidate.id,{name:row.name,description:row.description,category:row.category,point_cost:row.point_cost,stock:row.stock,valid_from:row.valid_from,valid_until:row.valid_until,active:row.active,version:row.version,...change},'PUT');
  await click('.p9-dialog [type=submit]');await text('.p9-dialog [data-dialog-state]',change.point_cost?'Biaya poin berubah':'tidak cukup');await capture('user-redemption-rejected-'+(change.stock===0?'stock':change.active===false?'expired':'price'),'.p9-dialog');await click('.p9-dialog [data-dialog-close]');
 }
 assert.equal((await read('/api/user/contributions')).balance,walletAfter.balance);
 // Spend from a second client after the confirmation dialog has opened.
 const balanceCandidate=await adminAPI('/api/administrator/vouchers',{...voucherDefaults,name:prefix+' balance race'});
 await reloadCatalog();await waitFor(()=>js(`Boolean(document.querySelector('[data-redeem="${balanceCandidate.id}"]'))`),'Balance candidate missing');
 await click(`[data-redeem="${balanceCandidate.id}"]`);
 const drain=await adminAPI('/api/administrator/vouchers',{...voucherDefaults,name:prefix+' spend other client',point_cost:walletAfter.balance});
 const userResponse=await fetch('http://127.0.0.1:18081/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@phase1.invalid',password:process.env.SAMPIRA_TEST_PASSWORD})});
 const userToken=(await userResponse.json()).data.token;
 const spent=await fetch(`http://127.0.0.1:18081/api/vouchers/${drain.id}/redeem`,{method:'POST',headers:{Authorization:'Bearer '+userToken,'Idempotency-Key':crypto.randomUUID()}});assert.equal(spent.status,201);
 await click('.p9-dialog [type=submit]');await text('.p9-dialog [data-dialog-state]','tidak cukup');await capture('user-redemption-rejected-balance','.p9-dialog');await click('.p9-dialog [data-dialog-close]');
 assert.equal((await read('/api/user/contributions')).balance,0);
 await js(`window.p9OriginalFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/vouchers?')?Promise.resolve(Response.json({status:'error',message:'Fixture unavailable'},{status:500})):p9OriginalFetch(url,options);void 0`);
 await reloadCatalog();await text('[data-catalog] [data-list-state]','Fixture unavailable');await capture('user-catalog-error','[data-catalog]');
 await js('window.fetch=p9OriginalFetch;void 0');await reloadCatalog();await text('[data-catalog] [data-list-state]','data dimuat');
 await login('administrator@phase1.invalid','/administrator');await text('#p9-audit [data-list-state]','data dimuat');await capture('administrator-redemptions','#p9-audit');
 await capture('administrator-facility-grid','#p9-system-grid');
 const pending=(await read('/api/administrator/pickup-rewards')).find(row=>row.pickup_id===pickup.pickup_id);assert(pending);
 await click(`[data-void-reward="${pickup.pickup_id}"]`);await fields({reason:'Pengujian pembatalan kewajiban pending dari UI.'});await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Cash cancellation failed');
 await waitFor(()=>js(`!document.querySelector('[data-void-reward="${pickup.pickup_id}"]')`),'Cash list did not refresh');
 await send('Emulation.clearDeviceMetricsOverride');
 console.log('PASS Phase 9B browser: four-role navigation/analytics/maps, voucher UI CRUD, account role/deactivation, redemption actual balance+stock, lost-response retry once, expired/stock/balance conflicts, private rewards/filter, histories/code, error recovery, cursor pagination, cash cancellation; 1280/390 screenshots '+out);
}

export async function checkPhase9Finalization({send,js,nav,login,click,text,waitFor,profile,password}) {
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'phase9c');await mkdir(out,{recursive:true});
 const q=JSON.stringify,base='http://127.0.0.1:18081';
 const ready=selector=>waitFor(()=>js('Boolean(document.querySelector('+q(selector)+')?.getClientRects().length)'),'Missing '+selector);
 const read=path=>js('portalFetch('+q(path)+').then(async r=>{if(!r.ok)throw Error("Read failed "+r.status);return (await r.json()).data;})');
 async function capture(name,selector){
  for(const width of (process.env.SAMPIRA_TEST_FINAL10C==='1'?[1280,1440,768,360,390]:[1280,390])){
   await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
   if(selector)await js(`document.querySelector(${q(selector)}).scrollIntoView({block:'start',behavior:'instant'});void 0`);
   await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
   const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
 }
 const title='Phase 9C UI pickup '+Date.now();
 await login('owner@phase1.invalid','/dashboard');
 await waitFor(()=>js('document.querySelector("#user-display-level").textContent!=="Memuat level…"'),'Contribution level unavailable');
 const owner=await js('portalUser("user")'),before=await read('/api/user/contributions'),ledgerBefore=await read('/api/user/points?limit=100');
 await click('[data-target=setor-sampah]');await ready('#pickup-location-picker .location-coordinate-grid input');
 const photo=join(profile,'phase9c-pickup.png');await writeFile(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64'));
 const doc=await send('DOM.getDocument');const file=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#form-waste-photo'});await send('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[photo]});
 await js(`(()=>{for(const [id,value]of Object.entries({'form-request-title':${q(title)},'form-item-description':'Komputer bekas untuk pengujian siklus kontribusi akhir.','form-pickup-address':'Jalan Pengujian Siklus Bandung Nomor 123','form-donor-phone':'081234567890','form-waste-weight':'999','form-waste-category':'Computers'})){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change'));}const fields=document.querySelectorAll('#pickup-location-picker .location-coordinate-grid input');fields[0].value='-6.9154321';fields[1].value='107.6154321';fields.forEach(el=>el.dispatchEvent(new Event('input')));Array.from(document.querySelectorAll('#pickup-location-picker button')).find(el=>el.textContent.includes('Konfirmasi Titik')).click();})()`);
 await capture('user-pickup-form','#pickup-request-form');
 await js('document.querySelector("#pickup-request-form").requestSubmit();void 0');await text('.swal2-title','Permohonan Berhasil');
 const tracking=await js('document.querySelector(".swal2-html-container strong").textContent');assert(tracking.startsWith('ECR-'));
 await click('.swal2-confirm');await text('#track-disp-number',tracking);
 const created=await read('/api/ecorecycle/pickup_status?tracking_number='+tracking);
 assert.equal(created.latitude,-6.9154321);assert.equal(created.longitude,107.6154321);assert(created.photo_url);
 await login('collector@phase1.invalid','/petugas');await ready(`[data-tracking="${tracking}"]`);
 await click(`[data-tracking="${tracking}"]`);await ready('.swal2-confirm');await click('.swal2-confirm');await text('.swal2-title','Tugas Diambil');await click('.swal2-confirm');await text('#mission-resi',tracking);
 for(const label of ['Mulai Transit','Tiba di Hub']){
  await text('#mission-btn',label);await click('#mission-btn');await ready('.swal2-confirm');await click('.swal2-confirm');await text('.swal2-title','Berhasil');
  await waitFor(()=>js('!document.querySelector(".swal2-popup")'),'Progress confirmation did not close');
  await ready(`[data-mission="${tracking}"]`);await click(`[data-mission="${tracking}"]`);await text('#mission-resi',tracking);
 }
 await text('#mission-btn','Catat Berat Aktual');await click('#mission-btn');await ready('#swal2-input');
 await js('document.querySelector("#swal2-input").value="2.50";void 0');await capture('petugas-weighing','.swal2-popup');await click('.swal2-confirm');await text('.swal2-title','penjemputan selesai');await click('.swal2-confirm');
 await login('owner@phase1.invalid','/dashboard');await click('[data-target=poin-voucher]');await text('[data-wallet-state]','Saldo sesuai');
 const credited=await read('/api/user/contributions'),expected=Math.floor(2.5*before.points_per_kg);
 assert.equal(credited.balance,before.balance+expected);assert.equal(credited.lifetime_points,before.lifetime_points+expected);
 const ledger=await read('/api/user/points?limit=100');assert.equal(ledger.filter(row=>row.id>(ledgerBefore[0]?.id||0)&&row.amount===expected).length,1);
 const reward=(await read('/api/user/rewards?limit=100')).find(row=>row.pickup_id===created.id);assert(reward);assert.equal(reward.amount,15000);assert.equal(reward.payment_status,'pending');assert.equal(reward.verified_weight_kg,2.5);
 await click('[data-target=reward-user]');await text('[data-reward-list]',tracking);await capture('user-verified-reward','#reward-user');
 await login('administrator@phase1.invalid','/administrator');await ready('[data-voucher-new]');await click('[data-voucher-new]');await ready('.p9-dialog');
 const voucherName='Phase 9C UI appreciation '+Date.now();
 await js(`(()=>{const f=document.querySelector('.p9-dialog form');for(const [name,value] of Object.entries({name:${q(voucherName)},category:'simulasi',description:'Voucher simulasi siklus akhir Phase 9C.',point_cost:5,stock:1,valid_from:'2026-01-01T00:00',valid_until:'2099-01-01T00:00'}))f.elements.namedItem(name).value=value;f.elements.active.checked=true;f.requestSubmit();})()`);
 await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Voucher did not save');
 const voucher=(await read('/api/administrator/vouchers?limit=100')).find(row=>row.name===voucherName);assert(voucher);
 await login('owner@phase1.invalid','/dashboard');await send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:true});
 await click('#mobileMenuToggle');await ready('#sidebar.active');await click('[data-target=poin-voucher]');
 assert.equal(await js('document.querySelector("#mobileMenuToggle").getAttribute("aria-expanded")'),'false');
 await text('[data-wallet-state]','Saldo sesuai');await ready(`[data-redeem="${voucher.id}"]`);await click(`[data-redeem="${voucher.id}"]`);await click('.p9-dialog [type=submit]');await text('.p9-dialog [data-dialog-body]','Penukaran berhasil');
 const code=await js('document.querySelector(".p9-dialog .p9-code").textContent');await capture('user-e2e-redemption','.p9-dialog');await click('.p9-dialog [data-dialog-close]');
 assert.equal((await read('/api/user/contributions')).balance,credited.balance-5);assert((await read('/api/user/vouchers?limit=100')).some(row=>row.code===code&&row.point_cost===5));
 // Exercise actual session revocation while private voucher UI is open.
 const adminResponse=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'administrator@phase1.invalid',password})});const adminToken=(await adminResponse.json()).data.token;
 async function active(id,role,from,to){const r=await fetch(base+'/api/administrator/accounts/'+id,{method:'PATCH',headers:{Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:JSON.stringify({role,is_active:to,expected_role:role,expected_active:from,reason:'Phase 9C revocation and client cleanup test.'})});assert.equal(r.status,200);}
 await click('[data-points-view=mine]');await ready(`[data-voucher-detail="${(await read('/api/user/vouchers'))[0].id}"]`);await js('document.querySelector("[data-voucher-detail]").click();void 0');await ready('.p9-dialog .p9-code');await click('.p9-dialog [data-dialog-close]');
 await active(owner.id,'user',true,false);
 try{
  await click('[data-points-refresh]');await waitFor(()=>js('location.pathname==="/login"||document.querySelector("[data-p9-user]")?.innerText.includes("Sesi berakhir")'),'User session did not clear');
  assert(!await js(`document.body.textContent.includes(${q(code)})`));await capture('user-session-ended',await js('Boolean(document.querySelector("[data-p9-user]"))')?'[data-p9-user]':'body');
 }finally{await active(owner.id,'user',false,true);}
 await login('admin@phase1.invalid','/admin');await click('[aria-controls=admin-analytics]');await ready('#admin-analytics .p9-map .leaflet-pane');const admin=await js('portalUser("admin")');
 await active(admin.id,'admin',true,false);
 try{
  await click('#admin-analytics [data-analytics-retry]');await text('#admin-analytics','Sesi berakhir');
  await sleep(250);assert.equal(await js('document.querySelectorAll("#admin-analytics .p9-map").length'),0);await capture('admin-session-ended','#admin-analytics');
 }finally{await active(admin.id,'admin',false,true);}
 await send('Emulation.clearDeviceMetricsOverride');
 console.log('PASS Phase 9C UI cycle: pickup form/photo/coordinates, claim/transit/arrival/weighing via UI, actual-weight reward and single point credit, voucher UI creation/redemption, mobile navigation, real user/admin session revocation, private-code cleanup and map observer teardown. '+out);
}
