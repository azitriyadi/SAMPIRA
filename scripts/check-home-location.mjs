import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkHomeLocation({send,js,login,click,text,waitFor,profile,password}){
    const origin=await js('location.origin');assert.equal(origin,'http://127.0.0.1:18081');
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    await login('owner@phase1.invalid','/dashboard');await waitFor(()=>js('document.readyState==="complete"'),'Ready');
    const report=await js(`(async()=>{const f=new FormData();for(const[k,v]of Object.entries({category:'tps',title:'TPS bersama di Beranda',description:'Fasilitas perlu diperiksa oleh petugas terkait.',address:'Jalan Fixture Bandung 12',latitude:'-6.913',longitude:'107.615'}))f.set(k,v);const c=document.createElement('canvas');c.width=c.height=20;const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));f.set('photo',new File([blob],'facility.png',{type:'image/png'}));const r=await portalFetch('/api/ecorecycle/facility-reports',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:f});if(r.status!==201)throw Error('Report');return(await r.json()).data;})()`);
    const email='home-'+randomUUID()+'@fixture.invalid';const registered=await fetch(origin+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Warga Beranda fixture',email,password})});assert.equal(registered.status,201);
    await login(email,'/dashboard');await waitFor(()=>js('document.readyState==="complete"'),'Second User ready');
    assert.equal(await js('document.querySelectorAll("#beranda .facility-community").length'),0);
    await click('[data-target="laporan-fasilitas"]');
    const card=`#laporan-fasilitas [data-community-report="${report.id}"]`;
    await text(card,'TPS bersama di Beranda');assert.equal(await js('document.querySelectorAll(".community-filter").length'),0);
    await click(card+' [data-confirm-affected]');await text(card,'2 akun terdampak');await capture('facility-community-bottom','.facility-community');
    assert(await js(`(()=>{const r=document.getElementById('laporan-fasilitas');return [...r.children].indexOf(r.querySelector('.facility-community'))>[...r.children].indexOf(document.getElementById('facility-form-view'));})()`));
    await click(card+' [data-community-detail]');await text('.community-detail-dialog','Fasilitas perlu diperiksa');
    await waitFor(()=>js('Boolean(document.querySelector(".community-detail-dialog img")?.naturalWidth)'),'Shared report photo');
    await waitFor(()=>js('Boolean(document.querySelector(".community-detail-dialog .leaflet-container"))'),'Shared facility map');
    assert.equal(await js(`portalFetch('/api/ecorecycle/facility-reports/${report.id}').then(r=>r.status)`),404);
    assert.equal(await js(`portalFetch('/api/ecorecycle/facility-reports/${report.id}/photo').then(r=>r.status)`),404);
    const shared=await js(`portalFetch('/api/ecorecycle/facility-reports/community/detail/${report.id}').then(r=>r.json()).then(r=>r.data)`);assert(shared.photo_url.includes('/community/'));assert.equal(shared.latitude,-6.913);
    for(const key of ['reporter_id','reviewed_by','verification_note','assignment','internal_note','contact_phone'])assert.equal(Object.hasOwn(shared,key),false,key+' leak');
    await capture('shared-facility-detail','.community-detail-dialog');await click('.community-detail-dialog .community-detail-top button');
    await waitFor(()=>js('document.querySelectorAll(".community-detail-dialog").length===0'),'Detail closed');

    await click('[data-sp-user-tab="laporan-fasilitas"][data-report-view="list"]');
    assert.equal(await js('document.getElementById("facility-list-view").hidden'),false);
    await click('[data-target="laporan-fasilitas"]');
    assert.equal(await js('document.getElementById("facility-list-view").hidden'),true);
    assert.equal(await js('document.querySelectorAll("#laporan-fasilitas .facility-community").length'),1);
    await waitFor(()=>js('!document.getElementById("facility-form-view").hidden'),'Direct report form');
    assert.equal(await js('document.getElementById("facility-form-back").hidden'),true);
    assert.equal(await js('document.querySelector("#facility-form .wizard-previous").hidden'),true);
    await capture('facility-first-step-controls','#facility-form .sp-report-controls');
    await js(`window.addressFetch=window.fetch;window.reverseMode='success';window.reverseCalls=[];window.gpsPoint=[-6.913,107.615];Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(callback){callback({coords:{latitude:gpsPoint[0],longitude:gpsPoint[1],accuracy:10}})}}});window.fetch=async(url,options)=>{const u=new URL(url,location.href);if(u.hostname!=='photon.komoot.io'||!u.pathname.startsWith('/reverse'))return addressFetch(url,options);reverseCalls.push({lat:u.searchParams.get('lat'),lon:u.searchParams.get('lon')});const mode=reverseMode;if(mode==='failure')return new Response('{}',{status:503});if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,900));return new Response(JSON.stringify({features:[{properties:{name:'Lokasi '+u.searchParams.get('lat'),street:'Jalan Contoh',housenumber:'14',district:'Kelurahan QA',city:'Bandung',state:'Jawa Barat',country:'Indonesia'}}]}),{status:200,headers:{'Content-Type':'application/json'}});};void 0`);
    await js(`document.querySelector('#facility-form [name=category][value=tps]').checked=true;document.getElementById('facility-title').value='Fasilitas alamat otomatis';document.getElementById('facility-description').value='Kondisi fasilitas membutuhkan pemeriksaan petugas.';void 0`);
    assert.equal(await js('document.querySelector(".facility-community").hidden'),false);
    await click('#facility-form .wizard-next');assert.equal(await js('document.querySelector(".facility-community").hidden'),true);
    assert.equal(await js('document.querySelector("#facility-form .wizard-previous").hidden'),false);
    await capture('facility-second-step-controls','#facility-form .sp-report-controls');
    await click('#facility-form .wizard-previous');assert.equal(await js('document.querySelector(".facility-community").hidden'),false);
    await click('#facility-form .wizard-next');await click('#facility-location-picker .location-actions button');
    await click('#facility-form .wizard-next');assert.equal(await js('document.getElementById("facility-form").dataset.wizardStep'),'2');
    await ready('facility');const address=await js('document.getElementById("facility-address").value');assert(address.includes('Jalan Contoh 14'));assert(address.includes('Bandung'));
    await click('#facility-form .wizard-next');assert.equal(await js('document.querySelector(".facility-community").hidden'),true);await capture('facility-auto-address','#report-address');
    await js('document.getElementById("facility-form").requestSubmit();void 0');await text('#facility-success','Laporan tercatat');
    await click('[data-target="setor-sampah"]');await waitFor(()=>js('Boolean(document.getElementById("pickup-latitude"))'),'Pickup picker');
    await js(`document.getElementById('form-request-title').value='Pickup alamat otomatis';document.getElementById('form-item-description').value='Gadget dipisahkan untuk penjemputan oleh petugas.';void 0`);
    await click('#pickup-request-form .wizard-next');await js('gpsPoint=[-6.914,107.616];void 0');await click('#pickup-location-picker .location-actions button');await ready('pickup');
    assert((await js('document.getElementById("form-pickup-address").value')).includes('Lokasi -6.914'));
    // Click the map itself: the same shared hook must update the address after a pin move.
    await js(`(()=>{const el=document.querySelector('#pickup-location-picker .leaflet-container'),r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*.65,clientY:r.top+r.height*.55}));})()`);await ready('pickup');
    await js('reverseMode="slow";gpsPoint=[-6.915,107.617];void 0');await click('#pickup-location-picker .location-actions button');await sleep(600);
    await js('reverseMode="success";gpsPoint=[-6.916,107.618];void 0');await click('#pickup-location-picker .location-actions button');await ready('pickup');await sleep(1000);
    assert((await js('document.getElementById("form-pickup-address").value')).includes('Lokasi -6.916'),'Stale reverse response overwrote latest point');
    await js('reverseMode="slow";gpsPoint=[-6.917,107.619];void 0');await click('#pickup-location-picker .location-actions button');await sleep(600);
    await js(`const addressField=document.getElementById('form-pickup-address');addressField.value='Alamat koreksi manual Jalan Bandung Nomor 15';addressField.dispatchEvent(new Event('input',{bubbles:true}));void 0`);await sleep(1700);
    assert.equal(await js('document.getElementById("form-pickup-address").value'),'Alamat koreksi manual Jalan Bandung Nomor 15');
    await js('reverseMode="failure";gpsPoint=[-6.918,107.620];void 0');await click('#pickup-location-picker .location-actions button');
    await waitFor(()=>js('document.querySelector("#pickup-location-picker [data-address-state=error]")'),'Address error state');assert.equal(await js('document.getElementById("form-pickup-address").value'),'');
    await js('reverseMode="success";gpsPoint=[-6.919,107.621];void 0');await click('#pickup-location-picker .location-actions button');await ready('pickup');
    await click('#pickup-request-form .wizard-next');await js('document.getElementById("form-donor-phone").value="081234567890";void 0');await capture('pickup-auto-address','.ref-contact-grid');
    await js('document.getElementById("pickup-request-form").requestSubmit();void 0');await text('.swal2-title','Permohonan Berhasil');await click('.swal2-confirm');
    await text('#user-tracking-location','Jalan Contoh 14');
    await js('window.fetch=addressFetch;void 0');
    const adminLogin=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@phase1.invalid',password})});const admin=(await adminLogin.json()).data;
    const deny=await fetch(origin+'/api/ecorecycle/facility-reports/'+report.id+'/verification',{method:'POST',headers:{Authorization:'Bearer '+admin.token,'Content-Type':'application/json'},body:JSON.stringify({status:'rejected',version:report.version,note:'Skenario penolakan sintetis fixture.'})});assert.equal(deny.status,200);
    for(const path of ['/community/detail/'+report.id,'/community/photo/'+report.id]){assert.equal(await js(`portalFetch('/api/ecorecycle/facility-reports'+${JSON.stringify(path)}).then(r=>r.status)`),404);const anon=await fetch(origin+'/api/ecorecycle/facility-reports'+path);assert.equal(anon.status,401);}

    await writeFile(join(out,'home-location-results.json'),JSON.stringify({facility_feed_below_form:true,shared_detail_photo_map:true,rejected_photo_revocation:true,no_large_search_form:true,direct_facility_form:true,community_confirmation:true,pickup_and_facility_gps_autofill:true,map_click_autofill:true,pending_navigation_block:true,stale_response_guard:true,manual_edit_guard:true,error_no_fake_address:true,real_fixture_submissions:true,viewports:[1280,390]},null,2));
    console.log('PASS facility feed below form, shared detail/photo/map privacy and rejection, direct report form, automatic addresses on both forms, map/GPS, race/manual/error handling, real submissions and 1280/390 layouts.');
    async function ready(prefix){await waitFor(()=>js(`Boolean(document.querySelector('#${prefix}-location-picker [data-address-state=ready]'))`),'Address ready '+prefix);}
    async function capture(name,selector){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});void 0`);await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow');const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
}
