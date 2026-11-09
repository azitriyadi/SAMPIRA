import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkPhase10BSecurity({send,js,login,click,text,waitFor,profile,password,exceptions}) {
 const origin=await js('location.origin');assert.equal(origin,'http://127.0.0.1:18081');
 const out=join(process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile,'phase10b');await mkdir(out,{recursive:true});
 const q=JSON.stringify, findings={};
 async function call(path,token,body,expected=200,headers={},method){
  const response=await fetch(origin+path,{method:method||(body?'POST':'GET'),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual'});
  const raw=await response.text();let payload;try{payload=JSON.parse(raw);}catch{payload={message:raw};}
  if(expected!==null)assert.equal(response.status,expected,path+' '+payload.message);
  return {data:payload.data,status:response.status,message:payload.message,retry:response.headers.get('Retry-After'),cookie:response.headers.get('Set-Cookie')};
 }
 const auth=async email=>(await call('/api/auth/login',null,{email,password})).data;
 const [owner,officer,administrator,admin]=await Promise.all(['owner','collector','administrator','admin'].map(role=>auth(role+'@phase1.invalid')));
 const sql=statement=>execFileSync(process.env.SAMPIRA_TEST_MYSQL,['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','sampira_phase1_test','-N','-B','-e',statement],{encoding:'utf8',windowsHide:true}).trim();
 const epoch=Number(sql('SELECT UNIX_TIMESTAMP()'));
 const base='/api/ecorecycle/';
 const beforeWallet=(await call('/api/user/contributions',owner.token)).data;
 const pickup=(await call(base+'request_pickup',owner.token,{item_description:'Security boundary '+randomUUID(),category:'Computers',weight_kg:20,pickup_address:'Jalan Security Fixture Bandung',contact_phone:'081234567890',latitude:-6.91,longitude:107.61},201,{'Idempotency-Key':randomUUID()})).data;
 await call(base+'assign_collector',officer.token,{tracking_number:pickup.tracking_number});
 for(const status of ['transit','arrived'])await call(base+'pickup_status',officer.token,{tracking_number:pickup.tracking_number,status});
 await call(base+'verify_pickup',officer.token,{pickup_id:pickup.pickup_id,final_weight_kg:2});
 const wallet=(await call('/api/user/contributions',owner.token)).data;
 assert.equal(wallet.balance-beforeWallet.balance,20,'Credit must use actual 2kg, not estimated 20kg');
 assert.equal(wallet.lifetime_points-beforeWallet.lifetime_points,20);
 await call(base+'verify_pickup',officer.token,{pickup_id:pickup.pickup_id,final_weight_kg:2},409);
 assert.equal(Number(sql(`SELECT COUNT(*) FROM point_entries WHERE source_key='pickup:${pickup.pickup_id}'`)),1);
 const creditId=Number(sql(`SELECT id FROM point_entries WHERE source_key='pickup:${pickup.pickup_id}'`));
 const entry=(await call('/api/user/points',owner.token)).data.find(e=>e.id===creditId);
 assert(entry,'Point credit must identify this pickup');
 findings.point_credit_time_utc=Math.abs(Date.parse(entry.created_at)/1000-epoch)<90;
 const exploit='<img src=x onerror="window.phase10bXSS=1">';
 const voucherBody={name:exploit,description:exploit,category:'simulasi',point_cost:1,stock:2,active:true,valid_from:new Date(Date.now()-3600000).toISOString(),valid_until:new Date(Date.now()+86400000).toISOString()};
 const voucher=(await call('/api/administrator/vouchers',administrator.token,voucherBody)).data;
 const key=randomUUID();const receipt=(await call('/api/vouchers/'+voucher.id+'/redeem',owner.token,null,201,{'Idempotency-Key':key,'X-Expected-Point-Cost':'1'},'POST')).data;
 const issued=(await call('/api/user/vouchers',owner.token)).data.find(e=>e.id===receipt.id);
 findings.voucher_issue_time_utc=Math.abs(Date.parse(issued.created_at)/1000-Number(sql('SELECT UNIX_TIMESTAMP()')))<90;
 const auditRows=(await call('/api/administrator/contribution-audit',administrator.token)).data;
 if(auditRows){const e=auditRows.find(row=>row.action==='voucher_redeem'&&row.entity_id===receipt.id);assert(e);findings.audit_time_utc=Math.abs(Date.parse(e.created_at)/1000-Number(sql('SELECT UNIX_TIMESTAMP()')))<90;}
 else throw Error('Audit fixture route missing');
 assert.equal((await call('/api/user/contributions',owner.token)).data.balance,wallet.balance-1);
 await call('/api/vouchers/'+voucher.id+'/redeem',owner.token,null,200,{'Idempotency-Key':key,'X-Expected-Point-Cost':'1'},'POST');
 assert.equal((await call('/api/user/contributions',owner.token)).data.balance,wallet.balance-1);
 const otherMail=randomUUID()+'@security.invalid';await call('/api/auth/register',null,{name:'Other security fixture',email:otherMail,password},201);const other=await auth(otherMail);
 const originalProfile=(await call('/api/user/profile',owner.token)).data;
 const savedProfile=(await call('/api/user/profile',other.token,{user_id:owner.id,name:'Security profile fixture',phone:'081234567890',address:'Jalan Security Fixture Bandung',payout_method:'bank',payout_account_name:'Synthetic User',payout_account_number:'12345678'})).data;
 assert.equal(savedProfile.id,other.id,'Profile write must use session ownership, never body user_id');
 assert.equal(savedProfile.payout_account_number,'12345678');
 assert(!('password' in savedProfile)&&!('token' in savedProfile),'Profile must not expose credentials');
 assert.deepEqual((await call('/api/user/profile',owner.token)).data,originalProfile,'Another account must remain unchanged');
 await call('/api/user/profile',other.token,{name:'Security profile fixture',payout_method:'unsupported'},400);
 await call('/api/user/profile',other.token,{name:'Security profile fixture',payout_method:'bank'},400);
 assert(!(await call('/api/user/vouchers',other.token)).data.some(e=>e.code===issued.code));
 for(const actor of [owner,officer,admin])await call('/api/administrator/vouchers',actor.token,null,403);
 const scoped=await call('/api/user/contributions?user_id='+owner.id,other.token,null,null);assert([200,400].includes(scoped.status));if(scoped.status===200)assert.equal(scoped.data.balance,0,'Owner override must never expose another wallet');
 await call('/api/analytics?user_id='+owner.id,other.token,null,400);
 await call('/api/analytics/facility-grid',owner.token,null,403);
 await call('/api/administrator/vouchers',null,voucherBody,403,{Cookie:'sampira_session='+administrator.token,Origin:'https://untrusted.invalid','Sec-Fetch-Site':'cross-site'});
 for(const query of ['limit=-1','limit=1&limit=100','before=1%20OR%201=1'])await call('/api/vouchers?'+query,owner.token,null,400);
 const injection=await call('/api/vouchers/1%20OR%201=1/redeem',owner.token,null,400,{'Idempotency-Key':randomUUID()},'POST');
 assert(!/(SQLSTATE|SELECT |mysql|token_digest)/i.test(injection.message),'Validation must not expose database details');
 const cookie=(await call('/api/auth/login',null,{email:'owner@phase1.invalid',password})).cookie;
 assert(cookie.includes('HttpOnly')&&cookie.includes('SameSite=Lax')&&cookie.includes('Path=/'),'Session cookie attributes missing');
 const rowsBefore=sql('SELECT COUNT(*) FROM pickups');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64');
 for(const [filename,data] of [['proof.txt',png],['proof.png',Buffer.from('<svg onload=alert(1)>')],['proof.jpg',png],['proof.png',Buffer.alloc(5*1024*1024+1)]]){
  const form=new FormData();for(const [k,v] of Object.entries({category:'Computers',item_description:'Invalid upload fixture',weight_kg:2,pickup_address:'Jalan Security Fixture Bandung',contact_phone:'081234567890'}))form.set(k,String(v));
  form.set('photo',new Blob([data],{type:'image/png'}),filename);await call(base+'request_pickup',owner.token,form,400,{'Idempotency-Key':randomUUID()});
 }
 assert.equal(sql('SELECT COUNT(*) FROM pickups'),rowsBefore,'Rejected uploads must not create pickups');
 await call('/uploads/..%5C.env',owner.token,null,404);
 // No script execution from voucher text when traversing Administrator -> User.
 await login('owner@phase1.invalid','/dashboard');await click('[data-target=poin-voucher]');await text('[data-catalog]',exploit);
 assert.equal(await js('window.phase10bXSS'),undefined);assert.equal(await js('document.querySelectorAll("[data-catalog] img").length'),0);
 // Role changes are forbidden; revoke the existing fixture Admin through activation only.
 await call('/api/administrator/accounts/'+owner.id,administrator.token,{role:'admin',is_active:true,expected_role:'user',expected_active:true,reason:'Synthetic escalation must be denied'},403,{},'PATCH');
 await login('admin@phase1.invalid','/admin');await click('[aria-controls=admin-analytics]');await text('#admin-analytics [data-analytics-state]','Diperbarui');
 await call('/api/administrator/accounts/'+admin.id,administrator.token,{role:'admin',is_active:false,expected_role:'admin',expected_active:true,reason:'Revoke fixture admin for security test'},200,{},'PATCH');
 const previousErrors=exceptions.length;
 await click('#admin-analytics [data-analytics-retry]');await text('#admin-analytics','Sesi berakhir');
 await js('window.dispatchEvent(new Event("sampira:cash-updated"));void 0');await sleep(200);
 findings.no_refresh_exception_after_revocation=exceptions.length===previousErrors;
 assert.equal(await js('Boolean(document.querySelector("#admin-analytics [data-analytics-values]"))'),false);
 await capture('revoked-session');
 await call('/api/administrator/accounts/'+admin.id,administrator.token,{role:'admin',is_active:true,expected_role:'admin',expected_active:false,reason:'Restore fixture admin after revocation'},200,{},'PATCH');
 // Deliberately bounded login attempts against the isolated server, never 8080.
 const attempts=[];for(let i=0;i<35;i++)attempts.push(await call('/api/auth/login',null,{email:'owner@phase1.invalid',password:'intentionally-wrong'},null));
 findings.login_throttled=attempts.some(r=>r.status===429&&Number(r.retry)>0);
 const spoof=await call('/api/auth/login',null,{email:'owner@phase1.invalid',password:'intentionally-wrong'},null,{'X-Forwarded-For':'192.0.2.99'});
 findings.forwarded_header_cannot_bypass=spoof.status===429;
 assert(attempts.every(r=>[401,429].includes(r.status)));
 await writeFile(join(out,'security-observations.json'),JSON.stringify({findings,ledger_epoch:epoch,point_created_at:entry.created_at,voucher_created_at:issued.created_at,login_statuses:attempts.map(r=>r.status)},null,2));
 console.log('Phase 10B boundary observations: '+JSON.stringify(findings));
 assert(Object.values(findings).every(Boolean),'New security/boundary failures: '+Object.entries(findings).filter(([,ok])=>!ok).map(([name])=>name).join(', '));
 console.log('PASS Phase 10B: UTC transaction histories, private voucher scope, XSS rendering, CSRF/RBAC, revoked-session refresh and bounded login throttle.');
 async function capture(name){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<500});const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}-${width}.png`),Buffer.from(shot.data,'base64'));}}
}
