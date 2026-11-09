import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkRewardPayment({send,js,nav,login,click,text,waitFor,profile,password}) {
 const origin=await js('location.origin'),q=JSON.stringify,base='/api/ecorecycle/';
 assert(origin==='http://127.0.0.1:18081','Payments must use isolated fixture');
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'reward-payment');await mkdir(out,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64');
 const large=Buffer.concat([png,Buffer.alloc(1400000)]),file=join(profile,'payment-large.png');await writeFile(file,large);
 async function call(path,token,body,expected,method='POST'){
  const r=await fetch(origin+path,{method:body?method:'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),'Idempotency-Key':randomUUID()},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const data=await r.json();if(expected!==undefined)assert.equal(r.status,expected,path+' '+data.message);return {code:r.status,data:data.data,message:data.message};
 }
 const tokens=await Promise.all(['owner','collector','administrator','admin','second-collector'].map(async role=>(await call('/api/auth/login',null,{email:role+'@phase1.invalid',password},200)).data));
 const [user,officer,administrator,admin,other]=tokens;
 const rewards='/api/administrator/pickup-rewards',payout=base+'process_payout';
 async function pending(){
  const p=(await call(base+'request_pickup',user.token,{category:'Computers',item_description:'Payment fixture '+randomUUID(),weight_kg:2,pickup_address:'Jalan Fixture Reward Bandung',contact_phone:'081234567890'},201)).data;
  await call(base+'assign_collector',officer.token,{tracking_number:p.tracking_number},200);
  for(const status of ['transit','arrived'])await call(base+'pickup_status',officer.token,{tracking_number:p.tracking_number,status},200);
  await call(base+'verify_pickup',officer.token,{pickup_id:p.pickup_id,final_weight_kg:2},200);
  return {...p,...(await call(rewards,administrator.token)).data.find(row=>row.pickup_id===p.pickup_id)};
 }
 const payment=(p,proof=Buffer.concat([png,Buffer.from(randomUUID())]),overrides={})=>{
  const f=new FormData();for(const [key,value] of Object.entries({pickup_id:p.pickup_id,amount:p.amount,reference:'QA-PAY-'+randomUUID(),confirm_payment:'true',...overrides}))f.set(key,String(value));
  if(proof)f.set('proof',new Blob([proof],{type:'image/png'}),'proof.png');return f;
 };
 const exact=await call(payout,administrator.token,payment({pickup_id:10,amount:'260000'},png,{reference:'BCA BRI WELL'}),400);
 await writeFile(join(out,'reference-400.json'),JSON.stringify({pickup_id:10,amount:'260000',reference:'BCA BRI WELL',confirm_payment:'true',status:exact.code,message:exact.message},null,2));
 console.log('Reference 400 reproduction: '+exact.message);
 assert.match(exact.message,/Referensi transfer.*[Ss]pasi/,'Invalid reference must have a specific message');
 for(const amount of ['260000','260000.00'])await call(payout,administrator.token,payment({pickup_id:10,amount},png,{reference:'BCA-BRI-WELL'}),409);
 for(const amount of ['260000,00','2.6e5','-1','260000.001'])assert.match((await call(payout,administrator.token,payment({pickup_id:10,amount},png,{reference:'BCA-BRI-WELL'}),400)).message,/Nominal/);
 assert.match((await call(payout,administrator.token,payment({pickup_id:10,amount:'260000'},png,{reference:'BCA-BRI-WELL',confirm_payment:'on'}),400)).message,/konfirmasi/);
 const p=await pending();
 const raw=await call(payout,administrator.token,payment(p,large));
 assert.equal((await call(rewards,administrator.token)).data.find(row=>row.pickup_id===p.pickup_id).status,'pending');
 await login('administrator@phase1.invalid','/administrator');
 await waitFor(()=>js(`Array.from(document.querySelector('#reward-pickup-id')?.options||[]).some(e=>e.value===${q(String(p.pickup_id))})`),'Payment candidate missing');
 await js(`document.querySelector('#reward-payment-form').scrollIntoView();void 0`);
 await js(`(()=>{const f=document.querySelector('#reward-payment-form');f.elements.pickup_id.value=${q(String(p.pickup_id))};f.elements.amount.value=${q(p.amount)};f.elements.reference.value='UI-PAY-${randomUUID()}';document.querySelector('#reward-payment-confirm').checked=true;})()`);
 const {root:doc}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#reward-payment-proof'});
 await send('DOM.setFileInputFiles',{nodeId,files:[file]});
 await js(`window.paymentRequestCount=0;window.paymentOriginalFetch=window.fetch;window.fetch=(url,options)=>{if(String(url).includes('/process_payout'))paymentRequestCount++;return paymentOriginalFetch(url,options);};const reference=document.querySelector('#reward-payment-reference');reference.value='BCA BRI WELL';reference.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#reward-payment-form').requestSubmit();void 0`);
 assert.equal(await js('paymentRequestCount'),0,'Invalid reference must not send payment');
 assert.match(await js('document.querySelector("#reward-payment-reference").validationMessage'),/Spasi/);
 await text('#reward-payment-status','Spasi tidak diperbolehkan');
 await capture('invalid-reference');
 await js(`(()=>{const reference=document.querySelector('#reward-payment-reference');reference.value='UI-PAY-${randomUUID()}';reference.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#reward-payment-form').requestSubmit();document.querySelector('#reward-payment-form').requestSubmit();})()`);
 await waitFor(()=>js(`!document.querySelector('#reward-payment-form [type=submit]').disabled`),'Payment UI request hung');
 await sleep(400);
 const row=(await call(rewards,administrator.token)).data.find(row=>row.pickup_id===p.pickup_id);
 if(row.status==='paid')assert(Math.abs(Date.parse(row.paid_at)-Date.now())<60000,'Payment timestamp must represent the actual instant, not local time mislabeled UTC');
 const observation={raw_code:raw.code,browser_paid:row.status==='paid',browser_request_count:await js('paymentRequestCount')};
 await writeFile(join(out,'observations.json'),JSON.stringify(observation,null,2));console.log('Reward payment reproduction: '+JSON.stringify(observation));
 await capture('administrator-payment');
 assert.equal(raw.code,413,'Large raw proof must be rejected safely before database write');assert.equal(row.status,'paid','Valid browser proof must be recorded');assert.equal(observation.browser_request_count,1);
 await call(payout,administrator.token,payment(p),409);
 const proofResponse=await fetch(origin+rewards+'/'+p.pickup_id+'/proof',{headers:{Authorization:'Bearer '+administrator.token}});assert.equal(proofResponse.status,200);assert.match(proofResponse.headers.get('content-type'),/image\/jpeg/);assert((await proofResponse.arrayBuffer()).byteLength<=750*1024);
 await call(rewards+'/'+p.pickup_id+'/proof',user.token,undefined,403);
 await call(rewards+'/'+p.pickup_id+'/proof',other.token,undefined,403);
 await call(payout,undefined,payment(p),401);await call(payout,admin.token,payment(p),403);
 const next=await pending();
 await call(payout,administrator.token,payment(next,null),400);await call(payout,administrator.token,payment(next,png,{confirm_payment:'false'}),400);await call(payout,administrator.token,payment(next,png,{reference:'x'}),400);
 await call(payout,administrator.token,payment(next,Buffer.from('<svg>invalid</svg>')),400);
 await call(payout,administrator.token,payment(next,png,{amount:'0.01'}),409);
 const sql=statement=>execFileSync(process.env.SAMPIRA_TEST_MYSQL,['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','sampira_phase1_test','-N','-B','-e',statement],{encoding:'utf8',windowsHide:true}).trim();
 sql("CREATE TRIGGER fixture_payment_failure BEFORE UPDATE ON pickup_rewards FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture database failure'");
 try{await call(payout,administrator.token,payment(next),500);assert.equal(sql(`SELECT CONCAT(status,':',proof IS NULL,':',reference IS NULL,':',paid_by IS NULL) FROM pickup_rewards WHERE pickup_id=${next.pickup_id}`),'pending:1:1:1');}finally{sql('DROP TRIGGER fixture_payment_failure');}
 // User has already opened Reward Saya before another client pays.
 await login('owner@phase1.invalid','/dashboard');await click('[data-target=reward-user]');await text('[data-reward-list]',next.tracking_number);
 const body=payment(next);const race=await Promise.all([call(payout,administrator.token,body),call(payout,administrator.token,body)]);assert.deepEqual(race.map(r=>r.code).sort(),[200,409]);
 await click('[data-target=beranda]');await click('[data-target=reward-user]');
 await waitFor(()=>js(`Array.from(document.querySelectorAll('[data-reward-list] tr')).some(e=>e.innerText.includes(${q(next.tracking_number)})&&e.innerText.includes('Pembayaran tercatat'))`),'User reward status stale after payment');
 await capture('user-paid');
 const record=sql(`SELECT CONCAT(status,':',paid_by,':',paid_at IS NOT NULL,':',OCTET_LENGTH(proof)>0) FROM pickup_rewards WHERE pickup_id=${p.pickup_id}`);assert.equal(record,`paid:${administrator.id}:1:1`);
 await nav('/dashboard');await click('[data-target=reward-user]');await text('[data-reward-list]','Pembayaran tercatat');
 await login('administrator@phase1.invalid','/administrator');
 await click('a[href="#system-payments"]');
 await js(`const filter=document.getElementById('reward-payment-filter');filter.value='paid';filter.dispatchEvent(new Event('change',{bubbles:true}));`);
 await text('#reward-payment-list',row.reference);await text('#reward-payment-list','Pembayaran tercatat');
 console.log('PASS reward payment: 1 MiB packet guard, optimized browser proof, one request on double submit, validation/RBAC, concurrent 200/409, DB rollback, private evidence, User refresh and login persistence.');
 async function capture(name){for(const width of (process.env.SAMPIRA_TEST_FINAL10C==='1'?[1280,1440,768,360,390]:[1280,390])){await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<500});await sleep(150);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}.png`),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});}
}
