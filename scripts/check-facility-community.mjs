import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkFacilityCommunity({send,js,login,click,text,waitFor,profile,password}){
    const origin=await js('location.origin');assert.equal(origin,'http://127.0.0.1:18081');
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    const base='/api/ecorecycle/facility-reports',q=JSON.stringify;
    async function api(path,actor,body,expected=200,method){
        const response=await fetch(origin+path,{method:method||(body?'POST':'GET'),headers:{...(actor?{Authorization:'Bearer '+actor.token}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
        const result=await response.json();assert.equal(response.status,expected,path+' '+result.message);return result.data;
    }
    const auth=email=>api('/api/auth/login',null,{email,password});
    const owner=await auth('owner@phase1.invalid'),admin=await auth('admin@phase1.invalid'),officer=await auth('collector@phase1.invalid');
    const secondEmail='community-'+randomUUID()+'@fixture.invalid',thirdEmail='community-'+randomUUID()+'@fixture.invalid';
    for(const email of [secondEmail,thirdEmail])await api('/api/auth/register',null,{name:'Warga terdampak fixture',email,password},201);
    const second=await auth(secondEmail),third=await auth(thirdEmail);
    await login('owner@phase1.invalid','/dashboard');await waitFor(()=>js('document.readyState==="complete"'),'Ready');
    async function create(title){return js(`(async()=>{const form=new FormData();for(const[k,v]of Object.entries({category:'tps',title:${q(title)},description:'Catatan privat fixture: fasilitas memerlukan perbaikan.',address:'Jalan Fasilitas Bersama Bandung 12',latitude:'-6.915',longitude:'107.615'}))form.set(k,v);const c=document.createElement('canvas');c.width=c.height=20;const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));form.set('photo',new File([blob],'private.png',{type:'image/png'}));const r=await portalFetch(${q(base)},{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:form});const result=await r.json();if(r.status!==201)throw Error(result.message);return result.data;})()`);}
    const report=await create('TPS warga terdampak bersama'),closed=await create('Fasilitas penanganan selesai'),rejected=await create('Laporan tersembunyi sesudah ditolak'),revised=await create('Laporan untuk pemeriksaan revisi');
    assert.equal(report.affected_count,1);
    await api(base+'/community',null,undefined,401);
    const publicPage=await api(base+'/community',second);
    const shared=publicPage.items.find(item=>item.id===report.id);assert(shared);assert.equal(shared.status,'pending');
    for(const key of ['reporter_id','reviewed_by','verification_note','description','latitude','longitude','photo_url','request_key'])assert.equal(Object.hasOwn(shared,key),false,key+' leaked');
    await api(base+'/'+report.id,second,undefined,404);await api(base+'/'+report.id+'/photo',second,undefined,404);
    await api(base+'/'+report.id+'/affected',null,{},401);await api(base+'/'+report.id+'/affected',admin,{},403);await api(base+'/'+report.id+'/affected',officer,{},403);
    const mine=await api(base+'/'+report.id+'/affected',owner,{});assert.equal(mine.affected_count,1);
    await login(secondEmail,'/dashboard');await waitFor(()=>js('document.readyState==="complete"'),'Second User ready');await click('[data-target="laporan-fasilitas"]');
    const selector=`[data-community-report="${report.id}"]`;
    await text(selector,'TPS warga terdampak bersama');await click(selector+' [data-confirm-affected]');await text(selector,'2 akun terdampak');
    assert.equal(await js(`document.querySelector(${q(selector+' [data-confirm-affected]')}).disabled`),true);
    await js("document.querySelector('.facility-community').scrollIntoView({block:'start'});void 0");await shots('community-confirmed');
    const responses=await Promise.all(Array.from({length:5},()=>api(base+'/'+report.id+'/affected',second,{user_id:third.id})));assert(responses.every(row=>row.affected_count===2));
    const race=await Promise.all(Array.from({length:4},()=>api(base+'/'+report.id+'/affected',third,{})));assert(race.every(row=>row.affected_count===3));
    const original=await api(base+'/'+report.id,owner);assert.equal(original.version,1);assert.equal(original.status,'pending');assert.equal(original.affected_count,3);
    const sql=statement=>execFileSync(process.env.SAMPIRA_TEST_MYSQL,['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','sampira_phase1_test','-N','-B','-e',statement],{encoding:'utf8',windowsHide:true}).trim();
    assert.equal(sql('SELECT COUNT(*) FROM facility_report_affected WHERE report_id='+report.id),'2');
    sql("CREATE TRIGGER community_rollback BEFORE INSERT ON facility_report_affected FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback'");
    try{await api(base+'/'+closed.id+'/affected',second,{},500);}finally{sql('DROP TRIGGER community_rollback');}
    assert.equal((await api(base+'/'+closed.id,owner)).affected_count,1);
    await api(base+'/'+revised.id+'/affected',third,{});
    await api(base+'/'+revised.id+'/verification',admin,{version:1,status:'revision_required',note:'Perjelas lokasi dan kondisi fasilitas.'});
    const revision=new FormData();for(const[k,v]of Object.entries({version:'2',category:'tps',title:'Laporan fasilitas dengan rincian diperbarui',description:'Rincian kondisi fasilitas yang sudah diperjelas.',address:'Jalan Fasilitas Bersama Bandung Nomor 14'}))revision.set(k,v);
    sql("CREATE TRIGGER community_revision_rollback BEFORE INSERT ON facility_report_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture revision rollback'");
    try{await api(base+'/'+revised.id,owner,revision,500,'PUT');}finally{sql('DROP TRIGGER community_revision_rollback');}
    assert.equal((await api(base+'/'+revised.id,owner)).affected_count,2);
    assert.equal((await api(base+'/'+revised.id,owner,revision,200,'PUT')).affected_count,1);
    assert.equal((await api(base+'/community',third)).items.find(row=>row.id===revised.id).confirmed_by_me,false);

    await api(base+'/'+rejected.id+'/verification',admin,{version:rejected.version,status:'rejected',note:'Laporan sintetis tidak valid.'});
    assert(!(await api(base+'/community',second)).items.some(row=>row.id===rejected.id));await api(base+'/'+rejected.id+'/affected',second,{},404);
    await login('admin@phase1.invalid','/admin');await waitFor(()=>js('document.readyState==="complete"'),'Admin ready');await click('[data-open-verification]');await text('#facility-list','3 akun terdampak');
    await js(`(()=>{const row=[...document.querySelectorAll('#facility-list tr')].find(row=>row.textContent.includes(${q(report.tracking_number)}));row.querySelector('button').click();})()`);
    await text('#facility-detail','3 (termasuk pelapor)');await shots('admin-affected-detail');
    await api(base+'/'+report.id+'/verification',admin,{version:report.version,status:'approved'});
    await api(base+'/'+report.id+'/handling/assignment',admin,{version:0,petugas_id:officer.id});
    const handling=await api(base+'/'+report.id+'/handling',officer);assert.equal(handling.affected_count,3);
    await login('collector@phase1.invalid','/petugas');await waitFor(()=>js('document.readyState==="complete"'),'Officer ready');await click('.sidebar-item[data-open-handling]');await text('#view-facility','3 akun terdampak');await shots('officer-affected-list');
    await js(`(()=>{const card=[...document.querySelectorAll('#view-facility .facility-card')].find(card=>card.textContent.includes(${q(report.tracking_number)}));card.querySelector('button').click();})()`);
    await text('#view-facility','Masalah yang dilaporkan');await text('#view-facility','3 akun terdampak');await shots('officer-affected-detail');
    await api(base+'/'+closed.id+'/verification',admin,{version:closed.version,status:'approved'});await api(base+'/'+closed.id+'/handling/assignment',admin,{version:0,petugas_id:officer.id});
    await api(base+'/'+closed.id+'/affected',third,{});
    sql("UPDATE facility_handling SET status='completed',public_result='Hasil penanganan sintetis untuk fixture.' WHERE report_id="+closed.id);
    assert.equal((await api(base+'/'+closed.id+'/affected',third,{})).affected_count,2);
    await api(base+'/'+closed.id+'/affected',second,{},409);
    const hidden=await api(base+'/community',second);assert.equal(hidden.items.find(row=>row.id===closed.id).can_confirm,false);
    const pageStatements=Array.from({length:21},(_,i)=>`INSERT INTO facility_reports (tracking_number,reporter_id,request_key,category,title,description,address,status,version,created_at,updated_at) VALUES ('FAC-PAGE-${String(i).padStart(19,'0')}',${owner.id},'${randomUUID()}','tps','Paging community ${i}','Fixture pagination','Jalan Fixture Bandung','pending',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6));`).join('');sql(pageStatements);
    const page1=await api(base+'/community?q=Paging%20community',second);assert.equal(page1.items.length,20);assert(page1.next_before_id);
    const page2=await api(base+'/community?q=Paging%20community&before_id='+page1.next_before_id,second);assert.equal(page2.items.length,1);assert.equal(page2.next_before_id,null);assert(!page1.items.some(row=>row.id===page2.items[0].id));
    await api(base+'/community?category=invalid',second,undefined,400);await api(base+'/community?before_id=-1',second,undefined,400);
    const csrf=await fetch(origin+base+'/'+report.id+'/affected',{method:'POST',headers:{Authorization:'Bearer '+second.token,Origin:'https://untrusted.invalid'}});assert.equal(csrf.status,403);
    await writeFile(join(out,'community-results.json'),JSON.stringify({immediate_pending_visibility:true,projection_privacy:true,private_detail_photo_isolated:true,one_confirmation_per_account:true,concurrent_retry:true,reporter_included_once:true,spoofed_user_ignored:true,verification_unchanged:true,rollback:true,rejected_hidden:true,closed_confirmation_blocked:true,admin_count:true,officer_count:true,csrf:true,viewports:[1280,390]},null,2));
    console.log('PASS community reports: User confirmation UI, unique concurrent counts, private projection/photo ownership, rollback, closed/rejected/RBAC/CSRF guards, Admin/Petugas counts and desktop/mobile.');
    async function shots(name){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
}
