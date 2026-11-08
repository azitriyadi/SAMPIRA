import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

// New exploratory flows supplement the verified 10A/10B suites. Fixture only.
export async function checkPhase10CFinal({send,js,nav,login,click,text,waitFor,waitPath,profile,password}) {
 const origin=await js('location.origin');assert.equal(origin,'http://127.0.0.1:18081');
 const q=JSON.stringify,out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'phase10c');await mkdir(out,{recursive:true});
 async function api(path,token,body,code=200){
  const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),'Idempotency-Key':randomUUID()},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const result=await response.json();assert.equal(response.status,code,path+' '+result.message);return result.data;
 }
 const auth=email=>api('/api/auth/login',null,{email,password});
 const email='final10c-'+randomUUID()+'@fixture.invalid';
 await api('/api/auth/register',null,{name:'Final10C User',email,password},201);
 const user=await auth(email),officer=await auth('collector@phase1.invalid'),administrator=await auth('administrator@phase1.invalid');
 const findings={};
 await login(email,'/dashboard');await click('[data-target=pengaturan]');
 await waitFor(()=>js('document.getElementById("settings-name").value==="Final10C User"'),'Profile form not hydrated');
 const settings={name:'User Final QA',phone:'081234567890',address:'Jalan Fixture Final Bandung', 'payout-method':'bank','payout-name':'User Final QA','payout-number':''};
 await js(`(()=>{for(const [key,value] of Object.entries(${q(settings)}))document.getElementById('settings-'+key).value=value;document.getElementById('settings-profile-form').requestSubmit();})()`);
 await text('.swal2-title','Data Payout Belum Lengkap');assert.equal((await api('/api/user/profile',user.token)).name,'Final10C User');await click('.swal2-confirm');
 await js(`document.getElementById('settings-payout-number').value='12345678';document.getElementById('settings-profile-form').requestSubmit();void 0`);
 await text('.swal2-title','Profil Disimpan');await click('.swal2-confirm');
 assert.equal((await api('/api/user/profile',user.token)).payout_account_number,'12345678');
 await capture('user-settings','#pengaturan');
 await nav('/dashboard');await click('[data-target=pengaturan]');await waitFor(()=>js('document.getElementById("settings-payout-number").value==="12345678"'),'Settings lost after refresh');
 findings.settings_persisted=true;
 // Exercise browser navigation, not only in-page tabs.
 const history=await send('Page.getNavigationHistory');const dashboardEntry=history.entries[history.currentIndex];
 await nav('/home');await send('Page.navigateToHistoryEntry',{entryId:dashboardEntry.id});await waitPath('/dashboard');
 await waitFor(()=>js('document.getElementById("sp-home-paid-reward")?.textContent!=="—"'),'Dashboard did not recover after browser Back');
 findings.back_navigation_recovers=true;
 const base='/api/ecorecycle/';
 const pickup=await api(base+'request_pickup',user.token,{category:'Computers',item_description:'Final lost-response payment',weight_kg:1,pickup_address:'Jalan Fixture Final Bandung',contact_phone:'081234567890',latitude:-6.91,longitude:107.61},201);
 await api(base+'assign_collector',officer.token,{tracking_number:pickup.tracking_number});
 for(const status of ['transit','arrived'])await api(base+'pickup_status',officer.token,{tracking_number:pickup.tracking_number,status});
 await api(base+'verify_pickup',officer.token,{pickup_id:pickup.pickup_id,final_weight_kg:1});
 const reward=(await api('/api/administrator/pickup-rewards',administrator.token)).find(row=>row.pickup_id===pickup.pickup_id);
 const proof=join(profile,'final10c-proof.png');const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64'),Buffer.from(randomUUID())]);await writeFile(proof,bytes);
 const reference='FINAL-'+randomUUID();
 await login('administrator@phase1.invalid','/administrator');
 await waitFor(()=>js(`Array.from(document.querySelector('#reward-pickup-id').options).some(o=>o.value===${q(String(pickup.pickup_id))})`),'Payment fixture not listed');
 await js(`(()=>{const f=document.getElementById('reward-payment-form');f.elements.pickup_id.value=${q(String(pickup.pickup_id))};f.elements.amount.value=${q(reward.amount)};f.elements.reference.value=${q(reference)};f.elements.reference.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('reward-payment-confirm').checked=true;f.scrollIntoView();})()`);
 const {root:documentNode}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'#reward-payment-proof'});await send('DOM.setFileInputFiles',{nodeId,files:[proof]});
 await js(`window.finalFetch=window.fetch;window.finalPaymentCalls=0;window.fetch=async(url,options)=>{const response=await finalFetch(url,options);if(String(url).includes('/process_payout')){finalPaymentCalls++;if(response.ok)throw new TypeError('Intentional response loss after commit');}return response;};document.getElementById('reward-payment-form').requestSubmit();void 0`);
 await text('#reward-payment-status','Koneksi terputus');await text('#reward-payment-list',reference);
 const recorded=(await api('/api/administrator/pickup-rewards',administrator.token)).find(row=>row.pickup_id===pickup.pickup_id);assert.equal(recorded.status,'paid');assert.equal(recorded.reference,reference);assert.equal(await js('finalPaymentCalls'),1);
 const retry=new FormData();for(const [k,v] of Object.entries({pickup_id:pickup.pickup_id,amount:reward.amount,reference,confirm_payment:'true'}))retry.set(k,String(v));retry.set('proof',new Blob([bytes],{type:'image/png'}),'proof.png');await api(base+'process_payout',administrator.token,retry,409);
 await capture('payment-lost-response','#reward-payments');
 findings.payment_lost_response_committed_once=true;
 await login(email,'/dashboard');await click('[data-target=reward-user]');await text('[data-reward-list]',pickup.tracking_number);await text('[data-reward-list]','Pembayaran tercatat');
 await capture('user-reward-paid','#reward-user');
 const paths=[['user',email,'/dashboard'],['petugas','collector@phase1.invalid','/petugas'],['admin','admin@phase1.invalid','/admin'],['administrator','administrator@phase1.invalid','/administrator']];
 for(const [role,mail,path] of paths){
  await login(mail,path);await capture(role+'-portal');
  const saved=(await send('Network.getCookies',{urls:[origin]})).cookies.find(c=>c.name==='sampira_session');assert(saved);
  const h=await send('Page.getNavigationHistory');const entry=h.entries[h.currentIndex];
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  if(role==='user'){await click('#sp-account-menu summary');await click('[onclick="logoutUser()"]');}
  else if(role==='petugas')await click('.sidebar [onclick="logoutCollector()"]');
  else await click('form[action="/logout"] button');
  await waitPath('/login');assert(!(await send('Network.getCookies',{urls:[origin]})).cookies.some(c=>c.name==='sampira_session'));
  await api('/api/user/profile',saved.value,undefined,401);
  await send('Page.navigateToHistoryEntry',{entryId:entry.id});await waitPath('/login');
  findings[role+'_logout_cookie_token_and_back_safe']=true;
 }
 await writeFile(join(out,'exploratory-observations.json'),JSON.stringify(findings,null,2));
 console.log('PASS Final 10C exploratory browser: settings validation/persistence, browser Back, lost payment response after commit, User paid state, four-role logout/replay/Back and all five viewport widths.');
 async function capture(name,selector){
  await js('document.fonts.ready');
  for(const width of [1280,1440,768,360,390]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
   if(selector)await js(`document.querySelector(${q(selector)})?.scrollIntoView({block:'start',behavior:'instant'});void 0`);await sleep(180);
   assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
   const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
 }
}
