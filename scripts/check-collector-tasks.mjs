import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkCollectorTasks({send,js,login,click,text,waitFor,profile}) {
    const sectionsOnly=process.env.SAMPIRA_TEST_COLLECTOR_SECTIONS_ONLY==='1';
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    const q=JSON.stringify, root='#view-facility', base='/api/ecorecycle/facility-reports';
    const read=path=>js(`portalFetch(${q(path)}).then(async r=>{if(!r.ok)throw Error('Fixture read '+r.status);return (await r.json()).data;})`);
    const post=(path,body)=>js(`portalFetch(${q(path)},{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(${q(body)})}).then(async r=>{if(!r.ok)throw Error('Fixture write '+r.status);return (await r.json()).data;})`);
    const clickText=(selector,label)=>js(`(()=>{const b=[...document.querySelectorAll(${q(selector)})].find(el=>el.textContent.trim()===${q(label)});if(!b)throw Error('Missing action '+${q(label)});b.click();})()`);
    await login('collector@phase1.invalid','/petugas');const officer=await js('portalUser("petugas")');
    await login('owner@phase1.invalid','/dashboard');
    const pickup=await post('/api/ecorecycle/request_pickup',{item_description:'Pickup pengujian tampilan tugas Petugas',category:'Computers',weight_kg:2,pickup_address:'Jalan Uji Petugas Bandung Nomor 12',contact_phone:'081234567890',latitude:-6.91,longitude:107.61});
    const report=await js(`(async()=>{const form=new FormData();for(const [k,v]of Object.entries({category:'tps',title:'TPS pengujian tampilan Petugas',description:'Kontainer membutuhkan pemeriksaan dan perbaikan pengunci.',address:'Jalan Uji Fasilitas Bandung Nomor 12',latitude:'-6.92',longitude:'107.62'}))form.set(k,v);const r=await portalFetch(${q(base)},{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:form});if(r.status!==201)throw Error('Report fixture failed');return(await r.json()).data;})()`);
    const handling=base+'/'+report.id+'/handling';
    await login('admin@phase1.invalid','/admin');
    await post(base+'/'+report.id+'/verification',{status:'approved',version:report.version});
    const unassigned=await read(handling);await post(handling+'/assignment',{version:unassigned.version,petugas_id:officer.id});
    await login('collector@phase1.invalid','/petugas');
    await waitFor(()=>js(`Boolean(document.querySelector('[data-tracking="${pickup.tracking_number}"]'))`),'Pickup unavailable');
    await click('[data-tracking="'+pickup.tracking_number+'"]');await text('.swal2-title','Ambil Tugas Penjemputan');await click('.swal2-confirm');
    await text('.swal2-title','Tugas Diambil!');await click('.swal2-confirm');await text('#mission-resi',pickup.tracking_number);
    await text('#mission-dest','Jalan Uji Petugas Bandung');
    assert.equal(await js('document.getElementById("mission-contact").getAttribute("href")'),'https://wa.me/6281234567890');
    assert.equal(await js('document.querySelectorAll("#mission-progress button,#mission-progress a").length'),0,'Progress must not bypass API');
    await waitFor(()=>js('Boolean(document.querySelector("#mission-location .leaflet-container"))'),'Mission map missing');
    await text('#mission-coordinates','-6.91, 107.61');
    await text('#mission-route-action button','Petunjuk Rute');
    await text('#mission-map-gps button','Lokasi Saya');
    assert(!await js('document.querySelector("#mission-location .location-route-options").open'),'Advanced route controls should start collapsed');
    const origin=await js('location.origin');await send('Browser.grantPermissions',{origin,permissions:['geolocation']});
    await send('Emulation.setGeolocationOverride',{latitude:-6.915,longitude:107.615,accuracy:10});
    await js('document.querySelector(".mission-map-panel").scrollIntoView({block:"center",behavior:"instant"});void 0');await sleep(150);
    await click('#mission-map-gps button');await text('#mission-location .location-panel>.location-status','Lokasi perangkat diterima');
    assert.equal(await js('document.getElementById("origin-pickup-latitude").value'),'-6.9150000');
    await text('#mission-location .leaflet-popup-content','Lokasi donor:');
    assert.equal(await js('getComputedStyle(document.querySelector("#mission-location .leaflet-tile-pane")).filter'),'none');
    await sleep(200);
    assert(await js('(()=>{const m=document.querySelector("#mission-location .location-map").getBoundingClientRect(),p=document.querySelector("#mission-location .leaflet-popup").getBoundingClientRect();return p.top>=m.top;})()'),'Donor popup clipped above map');
    await capture('pickup-active','#view-active-mission');
    await capture('pickup-map-actions','.mission-map-panel');
    if(sectionsOnly) {
        await js('switchView("operations");void 0');
        await waitFor(()=>js('document.querySelectorAll("#view-operations .sp-map-marker").length>=2'),'Operational pins missing');
        assert.equal(await js('getComputedStyle(document.querySelector("#view-operations .leaflet-tile-pane")).filter'),'none');
        assert.equal(await js('document.querySelector("#view-operations [data-operation-filter]").getClientRects().length'),0);
        assert.equal(await js('document.querySelectorAll("[data-map-legend] .sp-status-legend").length'),1);
        await capture('sections-map','#view-operations');
        await js('viewActiveMission('+q(pickup.tracking_number)+')');await text('#mission-resi',pickup.tracking_number);
    }
    for(const status of ['transit','arrived']) {
        await click('#mission-btn');await text('.swal2-title','Konfirmasi Perubahan Status');await click('.swal2-confirm');
        await text('.swal2-html-container','Status misi berhasil diperbarui');
        await waitFor(()=>js('!document.querySelector(".swal2-popup")'),'Status dialog did not close');
        await waitFor(()=>js(`Boolean(document.querySelector('[data-mission="${pickup.tracking_number}"]'))`),'Assigned task missing');
        await click('[data-mission="'+pickup.tracking_number+'"]');
        await waitFor(()=>js(`document.getElementById('mission-status').dataset.status===${q(status)}`),'Status badge not updated');
        assert.equal((await read('/api/ecorecycle/pickup_status?tracking_number='+pickup.tracking_number)).status,status);
    }
    await click('#mission-btn');await text('.swal2-title','Berat aktual di hub');
    await js('document.getElementById("swal2-input").value="2.5";void 0');await click('.swal2-confirm');
    await text('.swal2-title','penjemputan selesai');await click('.swal2-confirm');
    const complete=await read('/api/ecorecycle/pickup_status?tracking_number='+pickup.tracking_number);assert.equal(complete.status,'completed');assert.equal(Number(complete.final_weight_kg),2.5);
    if(sectionsOnly) {
        await waitFor(()=>js('document.getElementById("collector-history-count").textContent.includes("1")'),'History not refreshed');
        await js('switchView("history");void 0');await text('#history-table-body',pickup.tracking_number);await text('#history-table-body','2,5 kg');
        await capture('sections-history','#view-history');
        await js('switchView("earnings");void 0');assert.equal(await js('document.getElementById("earnings-total").textContent'),'—');await text('#earnings-weight','2,5 kg');
        await capture('sections-earnings','#view-earnings');
        await click('.collector-work-summary button');assert(await js('document.getElementById("view-history").classList.contains("active")'));
        await js('switchView("profile");void 0');await text('#collector-profile-email','collector@phase1.invalid');
        await capture('sections-profile','#view-profile');
    }
    await click('.sidebar [data-open-handling]');await text(root+' .facility-cards','TPS pengujian tampilan Petugas');
    await text(root+' .facility-cards','Tugas baru');await text(root+' .facility-cards','Periksa kondisi fasilitas di lokasi.');
    await capture('facility-list',root);
    await js(`(()=>{const s=document.querySelector('${root} .facility-filters select');s.value='completed';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await text(root+' .facility-toolbar output','Belum ada laporan');
    await js(`(()=>{const s=document.querySelector('${root} .facility-filters select');s.value='assigned';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await text(root+' .facility-cards','TPS pengujian tampilan Petugas');
    await click(root+' .facility-card button');await text(root+' .collector-facility-detail','Detail penanganan');
    await waitFor(()=>js(`Boolean([...document.querySelectorAll('${root} .handling-actions button')].find(b=>b.textContent==='Mulai asesmen'))`),'Assessment action missing');
    await capture('facility-detail',root+' .collector-facility-detail');
    await act('Mulai asesmen',{});
    const png=join(profile,'collector-evidence.png');await writeFile(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64'));
    await act('Catat hasil pemeriksaan',{condition:'Pengunci pintu kontainer rusak.',assessment:'Perlu penggantian pengunci.',public_note:'Pemeriksaan telah dilaksanakan.'},png);
    const history=await read(handling+'/history');const assessment=history.items.find(e=>e.action==='record_assessment');assert(assessment.has_photo);
    if(await js(`Boolean(document.querySelector('${root} .collector-history-group'))`))await click(root+' .collector-history-group>summary');
    await clickText(root+' .handling-timeline button','Tampilkan foto bukti');
    await waitFor(()=>js(`Boolean(document.querySelector('${root} .handling-photo-frame img')?.naturalWidth)`),'Evidence did not load');
    await act('Catat tindakan',{action_taken:'Pengunci diganti dan diuji.'});
    await act('Serahkan hasil',{result:'Kontainer kembali dapat digunakan dengan baik.'});
    assert.equal((await read(handling)).status,'resolution_submitted');
    await login('admin@phase1.invalid','/admin');const submitted=await read(handling);
    await post(handling+'/review',{version:submitted.version,decision:'complete',public_note:'Hasil perbaikan telah divalidasi.'});
    await login('collector@phase1.invalid','/petugas');await click('.sidebar [data-open-handling]');
    await text(root+' .facility-cards','TPS pengujian tampilan Petugas');await click(root+' .facility-card button');
    await waitFor(()=>js(`document.querySelector('${root} .collector-facility-detail').textContent.includes('Selesai')`),'Completed task missing');
    assert.equal(await js(`document.querySelectorAll('${root} .handling-actions button').length`),0,'Closed task has mutable controls');
    await clickText(root+' .collector-facility-detail>.facility-actions button','Kembali ke daftar');
    await text(root+' .facility-cards','disetujui Admin');await text(root+' .facility-card button','Lihat hasil');
    await capture('facility-completed',root);
    const legacy=await js(`(async()=>{const {mountLocationDetail}=await import('/assets/js/location-map.js?v=collector-tasks-2');const host=document.createElement('div');document.body.append(host);window.legacyMapDispose=mountLocationDetail(host,{title:'Compatibility',point:{latitude:-6.91,longitude:107.61},address:'Fixture Bandung',navigation:{authorize:async()=>{throw Error('Fixture authorization denied');}}});window.legacyMapHost=host;const labels=[...host.querySelectorAll('.location-actions button')].map(b=>b.textContent);host.querySelector('.location-actions button:last-child').click();return labels;})()`);
    assert.deepEqual(legacy,['Gunakan Lokasi Saya','Lihat Rute','Buka di Google Maps']);
    await waitFor(()=>js('legacyMapHost.textContent.includes("Fixture authorization denied")'),'Default authorization check bypassed');
    await js('legacyMapDispose();legacyMapHost.remove();void 0');
    if(sectionsOnly) {
        await js('switchView("profile");void 0');await click('.collector-profile-actions .btn-primary');
        await waitFor(()=>js('location.pathname==="/login"'),'Profile logout failed');
    }
    await writeFile(join(out,'task-results.json'),JSON.stringify({pickup_claim:true,transit_arrived_completed:true,actual_weight:2.5,whatsapp_from_valid_phone:true,progress_not_clickable:true,mission_map:true,facility_filters:true,assessment_with_photo:true,photo_readback:true,progress_resolution:true,admin_completion:true,closed_task_readonly:true,viewports:[1440,1280,390]},null,2));
    console.log('PASS Petugas task UI: real pickup lifecycle/weight, map/contact, facility filters, assessment photo, progress/submission and Admin completion; responsive views.');

    async function act(label,values,photo) {
        await waitFor(()=>js(`Boolean([...document.querySelectorAll('${root} .handling-actions button')].find(b=>b.textContent===${q(label)}))`),'Action missing '+label);
        await clickText(root+' .handling-actions button',label);
        await waitFor(()=>js('Boolean(document.querySelector(".handling-dialog[open]"))'),'Action dialog missing');
        await js(`(()=>{const f=document.querySelector('.handling-dialog[open] form');for(const[k,v]of Object.entries(${q(values)})){const input=f.elements.namedItem(k);if(!input)throw Error('Missing field '+k+' in '+f.closest('dialog').getAttribute('aria-label'));input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
        if(photo) {
            const {root:dom}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:dom.nodeId,selector:'.handling-dialog[open] input[type=file]'});
            await send('DOM.setFileInputFiles',{nodeId,files:[photo]});
            await capture('facility-assessment-dialog','.handling-dialog');
        }
        await click('.handling-dialog[open] button[type=submit]');
        await waitFor(()=>js('!document.querySelector(".handling-dialog[open]")'),'Save failed '+label);
        await text(root+' .facility-notice','Perubahan tersimpan');
    }
    async function capture(name,selector) {
        if(sectionsOnly && !name.startsWith('sections-') && name!=='facility-detail')return;
        for(const width of (sectionsOnly?[1280,390]:[1440,1280,390])) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
            await js(`document.querySelector(${q(selector)}).scrollIntoView({block:'start',behavior:'instant'});void 0`);await sleep(180);
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
            const shot=await send('Page.captureScreenshot',sectionsOnly?{format:'jpeg',quality:65}:{format:'png'});await writeFile(join(out,name+'-'+width+(sectionsOnly?'.jpg':'.png')),Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    }
}
