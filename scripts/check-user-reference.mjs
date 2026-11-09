import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkUserReference(ctx) {
    const {send,js,nav,login,click,text,waitFor,profile}=ctx;
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||join(profile,'user-reference');
    await mkdir(out,{recursive:true});
    await nav('/login');
    assert.equal(await js('location.origin'),'http://127.0.0.1:18081','Fixture only.');
    if(process.env.SAMPIRA_TEST_EDUCATION_LAYOUT_ONLY==='1'){const {checkEducationLayout}=await import('./check-education-layout.mjs');await checkEducationLayout(ctx);return;}
    if(process.env.SAMPIRA_TEST_CITY_DATASETS_ONLY==='1'){const {checkCityDatasets}=await import('./check-city-datasets.mjs');await checkCityDatasets(ctx);return;}
    if(process.env.SAMPIRA_TEST_HOME_LOCATION_ONLY==='1'){const {checkHomeLocation}=await import('./check-home-location.mjs');await checkHomeLocation(ctx);return;}
    if(process.env.SAMPIRA_TEST_FACILITY_COMMUNITY_ONLY==='1'){const {checkFacilityCommunity}=await import('./check-facility-community.mjs');await checkFacilityCommunity(ctx);return;}
    if(process.env.SAMPIRA_TEST_MULTI_CATEGORY_ONLY==='1') {
        const q=JSON.stringify;
        async function api(path,body,expected=200,key){return js(`(async()=>{const r=await portalFetch(${q('/api/ecorecycle/'+path)},{method:${q(body?'POST':'GET')},headers:{'Content-Type':'application/json',...${q(key?{'Idempotency-Key':key}:{})}},...${body?`{body:JSON.stringify(${q(body)})}`:'{}'}});const result=await r.json();if(r.status!==${expected})throw Error('API '+r.status+' '+result.message);return result.data;})()`);}
        await login('owner@phase1.invalid','/dashboard');await waitFor(()=>js('document.readyState==="complete"'),'Ready');
        const items=[{category:'Computers',weight_kg:2},{category:'Small Gadgets',weight_kg:1}];
        const estimate=await api('estimate_reward',{category:'Computers',weight_kg:2,items:JSON.stringify(items)});
        assert.equal(estimate.items.length,2);assert.equal(estimate.weight_kg,3);
        const sum=key=>estimate.items.reduce((total,row)=>total+row[key],0);
        assert.equal(estimate.total_estimate,sum('eco_reward'));assert.equal(estimate.processing_fee,sum('processing_fee'));
        await api('estimate_reward',{items:JSON.stringify([items[0],items[0]])},400);
        await api('estimate_reward',{items:JSON.stringify([{category:'Computers',weight_kg:-1}])},400);
        await js(`document.querySelector('[data-target="setor-sampah"]')?.click();void 0`);
        await click('.category-helper-card[data-category="Computers"]');
        await js(`(()=>{for(const input of document.querySelectorAll('[data-item-category]')){input.value=input.dataset.itemCategory==='Computers'?2:1;input.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('form-request-title').value='Dua kategori satu penjemputan';document.getElementById('form-item-description').value='Komputer dan gadget sudah dipisahkan dengan rapi.';})()`);
        try{await waitFor(()=>js('multiCategoryBackendReady'),'Multi-category preview');}catch(error){console.log(await js('JSON.stringify({items:pickupItems(),preview:document.getElementById("preview-net-reward").textContent})'));throw error;}
        assert.equal(await js('document.querySelectorAll(".category-helper-card[aria-pressed=true]").length'),2);
        assert.equal(await js('Number(document.getElementById("form-waste-weight").value)'),3);
        await shots('multi-category-form');
        await click('#pickup-request-form .wizard-next');await waitFor(()=>js('document.querySelector("#pickup-latitude")?.value'),'Map ready');
        await click('#pickup-request-form .wizard-next');
        await js(`document.getElementById('form-pickup-address').value='Jalan Fixture Bandung Nomor 12';document.getElementById('form-donor-phone').value='081234567890';document.getElementById('pickup-request-form').requestSubmit();void 0`);
        await text('.swal2-title','Permohonan Berhasil!');await click('.swal2-confirm');
        await waitFor(()=>js('document.getElementById("tracking-timeline-container").style.display==="block"'),'Created detail');
        const tracking=await js('document.getElementById("track-disp-number").textContent');
        let detail=await api('pickup_status?tracking_number='+encodeURIComponent(tracking));
        assert.equal(detail.items.length,2);assert.equal(detail.weight_kg,3);assert.equal(detail.eco_reward,estimate.total_estimate);
        await shots('multi-category-detail');
        const base={category:'Computers',weight_kg:3,item_description:'Rincian dua kategori fixture',pickup_address:'Jalan Fixture Bandung 12',contact_phone:'081234567890',items:JSON.stringify(items)};
        const key=await js('crypto.randomUUID()');const replay=await api('request_pickup',base,201,key);const again=await api('request_pickup',base,200,key);assert.equal(replay.pickup_id,again.pickup_id);
        await api('request_pickup',{...base,items:JSON.stringify([{category:'Computers',weight_kg:1},{category:'Small Gadgets',weight_kg:2}])},409,key);
        await api('update_pickup',{...base,tracking_number:tracking,items:JSON.stringify(items)});
        await login('collector@phase1.invalid','/petugas');await api('assign_collector',{tracking_number:tracking});
        for(const status of ['transit','arrived'])await api('pickup_status',{tracking_number:tracking,status});
        await api('verify_pickup',{pickup_id:detail.id,final_weight_kg:3},400);
        const sql=statement=>execFileSync(process.env.SAMPIRA_TEST_MYSQL,['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','sampira_phase1_test','-e',statement],{encoding:'utf8',windowsHide:true});
        sql("CREATE TRIGGER qa_multi_rollback BEFORE INSERT ON pickup_rewards FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture rollback';");
        try{await api('verify_pickup',{pickup_id:detail.id,final_weight_kg:3,items:JSON.stringify(items)},500);}finally{sql('DROP TRIGGER qa_multi_rollback');}
        const rolledBack=await api('pickup_status?tracking_number='+encodeURIComponent(tracking));assert.equal(rolledBack.status,'arrived');assert.equal(rolledBack.final_weight_kg,null);assert(rolledBack.items.every(row=>!row.final_weight_kg));

        await js(`viewActiveMission(${q(tracking)});void 0`);await waitFor(()=>js('globalActiveMission?.status==="arrived"'),'Officer detail');
        await js(`recordActualWeight(${detail.id});void 0`);await waitFor(()=>js('Boolean(document.getElementById("actual-item-0"))'),'Category weighing');
        await shots('multi-category-weighing');await click('.swal2-confirm');await text('.swal2-title','Berat aktual tercatat');await click('.swal2-confirm');
        await api('verify_pickup',{pickup_id:detail.id,final_weight_kg:3,items:JSON.stringify(items)},409);
        await login('owner@phase1.invalid','/dashboard');detail=await api('pickup_status?tracking_number='+encodeURIComponent(tracking));
        assert.equal(detail.status,'completed');assert.equal(detail.final_weight_kg,3);assert.equal(detail.final_eco_reward,estimate.total_estimate);assert(detail.items.every(row=>row.final_weight_kg>0));
        const rewards=await js('portalFetch("/api/user/rewards").then(r=>r.json()).then(r=>r.data)');assert.equal(rewards.filter(row=>row.pickup_id===detail.id).length,1);
        const legacy=await api('request_pickup',{...base,items:undefined},201);assert(legacy.pickup_id);
        const ownerId=detail.user_id;
        await login('administrator@phase1.invalid','/administrator');await waitFor(()=>js('document.readyState==="complete"'),'Administrator ready');await js('location.hash="p9-accounts";void 0');
        await waitFor(()=>js(`Boolean(document.querySelector('[data-account-edit="${ownerId}"]'))`),'Account list');await click(`[data-account-edit="${ownerId}"]`);
        assert.equal(await js('document.querySelector(".p9-dialog [name=role]").readOnly'),true);await shots('account-role-readonly');await click('.p9-dialog [data-dialog-close]');
        const forbidden=await js(`portalFetch('/api/administrator/accounts/'+${ownerId},{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',is_active:true,expected_role:'user',expected_active:true,reason:'Perubahan role harus ditolak.'})}).then(r=>r.status)`);assert.equal(forbidden,403);
        await click(`[data-account-edit="${ownerId}"]`);await js(`(()=>{const f=document.querySelector('.p9-dialog form');f.elements.is_active.value='false';f.elements.reason.value='Nonaktifkan akun sintetis setelah QA.';f.requestSubmit();})()`);await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Activation change');
        const changed=await js(`portalFetch('/api/administrator/accounts').then(r=>r.json()).then(r=>r.data.find(row=>row.id===${ownerId}))`);assert.equal(changed.role,'user');assert.equal(changed.is_active,false);

        console.log('PASS multi-category: User UI one request, estimates/items/totals, idempotent retry/conflict, edit, category weighing UI, duplicate prevention and User reward readback.');return;
        async function shots(name){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Overflow '+name);const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
    }
    if(process.env.SAMPIRA_TEST_ACCOUNT_ROLE_ONLY==='1') {
        await login('administrator@phase1.invalid','/administrator');
        await waitFor(()=>js('document.readyState==="complete"'),'Ready');
        await js('location.hash="p9-accounts";void 0');
        await waitFor(()=>js('Boolean(document.querySelector("#p9-accounts [data-account-edit]:not([disabled])"))'),'Account list');
        const target=await js('Number(document.querySelector("#p9-accounts [data-account-edit]:not([disabled])").dataset.accountEdit)');
        await click('#p9-accounts [data-account-edit]:not([disabled])');
        assert.equal(await js('document.querySelector(".p9-dialog [name=role]").readOnly'),true);
        const before=await js('document.querySelector(".p9-dialog [name=role]").value');
        const denied=await js(`portalFetch('/api/administrator/accounts/'+${target},{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:${JSON.stringify('admin')},is_active:true,expected_role:${JSON.stringify(before)},expected_active:true,reason:'Percobaan perubahan role sintetis.'})}).then(r=>r.status)`);
        assert.equal(denied,403);
        const row=await js('portalFetch("/api/administrator/accounts").then(r=>r.json()).then(r=>r.data.find(a=>a.id==='+target+'))');assert.equal(row.role,before);
        console.log('PASS Administrator role read-only and forged role update forbidden.');return;
    }
    if(process.env.SAMPIRA_TEST_PICKUP_DETAIL_ONLY==='1') {
        await login('owner@phase1.invalid','/dashboard');
        await waitFor(()=>js('document.readyState==="complete"'),'User ready');
        const pickup=await js(`portalFetch('/api/ecorecycle/request_pickup',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({item_description:'Kertas untuk didaur ulang',category:'Computers',weight_kg:2,pickup_address:'Jalan Fixture Bandung Nomor 12',contact_phone:'081234567890',latitude:-6.91,longitude:107.61})}).then(async r=>{if(r.status!==201)throw Error('Pickup fixture');return(await r.json()).data;})`);
        await js(`openTrackingDetail(${JSON.stringify(pickup.tracking_number)});void 0`);
        await waitFor(()=>js('document.getElementById("tracking-timeline-container").style.display==="block"'),'Detail unavailable');
        assert.equal(await js('getComputedStyle(document.getElementById("tracking-search-form")).display'),'none');
        assert.equal(await js('document.getElementById("workspace-label").textContent'),'Detail Penjemputan');
        await text('#track-disp-number',pickup.tracking_number);
        await text('#track-timeline-list','Perkembangan permintaan');
        await waitFor(()=>js('Boolean(document.querySelector("#user-tracking-location .leaflet-container"))'),'Location map');
        for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await sleep(250);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Detail overflow');const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,'pickup-detail-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}
        await click('.ref-detail-back');assert(await js('document.getElementById("riwayat-payout").classList.contains("active")'));
        console.log('PASS Pickup detail: existing API data, hidden tracking form, history navigation, location map, status history, 1280/390 no overflow.');return;
    }
    if(process.env.SAMPIRA_TEST_MAPS_READER_ONLY==='1') {
        const q=JSON.stringify;
        await login('owner@phase1.invalid','/dashboard');
        const ids=[];
        for(let i=0;i<3;i++)ids.push(await js(`(async()=>{const f=new FormData();for(const[k,v]of Object.entries({category:'tps',title:'Peta QA '+${i},description:'Pemeriksaan fasilitas untuk fixture visual.',address:'Jalan Fixture Bandung 12',latitude:'-6.915',longitude:'107.615'}))f.set(k,v);const r=await portalFetch('/api/ecorecycle/facility-reports',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:f});if(r.status!==201)throw Error('Fixture report');return(await r.json()).data;})()`));
        await login('admin@phase1.invalid','/admin');
        await waitFor(()=>js('document.readyState==="complete"'),'Ready');
        for(const row of ids)await js(`portalFetch('/api/ecorecycle/facility-reports/'+${row.id}+'/verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved',version:${row.version}})}).then(r=>{if(!r.ok)throw Error('Approve '+r.status)})`);
        await click('.sp-admin-nav [aria-controls="admin-operation-map"]');
        await waitFor(()=>js('document.querySelectorAll("#admin-operation-map .sp-map-marker").length===3'),'Admin pins');
        assert.equal(await js('getComputedStyle(document.querySelector("#admin-operation-map .sp-map-layout")).display'),'block');
        await shots('admin-map');
        await click('.sp-admin-nav [aria-controls="admin-analytics"]');await text('[data-analytics-state]','Diperbarui');
        await waitFor(()=>js('Boolean(document.querySelector("[data-grid-table] [data-chart-key=cell-0]"))'),'Aggregate chart');
        assert.equal(await js('Number(document.querySelector("[data-chart-key=reports]").dataset.chartValue)'),3);
        assert.equal(await js('Number(document.querySelector("[data-chart-key=cell-0]").dataset.chartValue)'),3);
        await shots('admin-charts');
        // A real draft is published through the existing CMS API in the fixture only.
        await js(`(async()=>{const r=await portalFetch('/api/ecorecycle/education/manage/articles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Panduan membaca lingkungan',slug:'qa-reading-layout',category:'pemilahan-sampah',summary:'Panduan singkat menjaga lingkungan dari rumah.',body:'Mulai dari rumah.\\n\\n### Pisahkan sampah\\n\\nSimpan bahan daur ulang dalam kondisi bersih.',sources:['https://www.epa.gov/recycle']})});if(!r.ok)throw Error('Article '+r.status);const d=(await r.json()).data;window.qaArticle=d;})()`);
        const article=await js('window.qaArticle');
        await js(`portalFetch('/api/ecorecycle/education/manage/articles/'+${article.id}+'/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'published',version:${article.version}})}).then(r=>{if(!r.ok)throw Error('Publish '+r.status)})`);
        await login('administrator@phase1.invalid','/administrator');
        await waitFor(()=>js('document.readyState==="complete"'),'Administrator ready');
        await js('location.hash="p9-system-grid";void 0');
        await waitFor(()=>js('Boolean(document.querySelector("#p9-system-grid .leaflet-container"))'),'Administrator map');
        await text('[data-grid-state]','1 sel ditampilkan');
        assert.equal(await js('document.querySelectorAll("#p9-system-grid .leaflet-interactive").length'),2);
        await waitFor(()=>js('[...document.querySelectorAll("#p9-system-grid .leaflet-tile")].every(i=>i.complete&&i.naturalWidth>0)'),'Map tiles did not load');
        await shots('administrator-map');
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
        await click('#system-menu-toggle');assert.equal(await js('document.getElementById("system-menu-toggle").getAttribute("aria-expanded")'),'true');
        await shots('administrator-navigation');
        await nav('/assets/education.html?artikel=qa-reading-layout');await text('.sp-reader-article','Pisahkan sampah');
        await shots('article');
        await login('owner@phase1.invalid','/dashboard');
        await waitFor(()=>js('document.readyState==="complete"'),'User ready');
        await click('[data-target="edukasi"]');
        await waitFor(()=>js('Boolean(document.querySelector("#edukasi a[href*=qa-reading-layout]"))'),'User education');
        await click('#edukasi a[href*=qa-reading-layout]');
        await text('[data-reference-reader] .sp-article-body','Pisahkan sampah');
        assert.equal(await js('getComputedStyle(document.querySelector("[data-reference-reader] .sp-article-body")).whiteSpace'),'normal');
        await shots('user-reader');
        await click('[data-reference-reader]>button');assert.equal(await js('Boolean(document.querySelector("dialog[open][data-reference-reader]"))'),false);
        console.log('PASS Admin map/pins, API-backed count and regional charts, Administrator Leaflet aggregation and mobile navigation, public reader 1280/390.');
        return;
        async function shots(name){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});}
    }
    if(process.env.SAMPIRA_TEST_ADMIN_SIDEBAR_ONLY==='1') {
        await login('admin@phase1.invalid','/admin');
        await waitFor(()=>js('document.readyState==="complete"'),'Admin not ready');
        const views=await js('[...document.querySelectorAll(".sp-admin-nav button")].map(b=>b.getAttribute("aria-controls"))');
        assert.equal(views.length,6);
        for(const id of views){
            await click(`.sp-admin-nav [aria-controls="${id}"]`);
            await waitFor(()=>js(`!document.getElementById(${JSON.stringify(id)}).hidden`),'Navigation '+id);
            assert.equal(await js('document.querySelectorAll(".sp-admin-nav [aria-pressed=true]").length'),1);
        }
        await click('.sp-admin-nav [aria-controls="admin-overview"]');
        for(const width of [1280,390]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
            if(width===390){
                assert.equal(await js('getComputedStyle(document.getElementById("admin-sidebar-body")).display'),'none');
                await click('#admin-menu-toggle');
                assert.equal(await js('document.getElementById("admin-menu-toggle").getAttribute("aria-expanded")'),'true');
            }
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Sidebar overflow');
            assert.equal(await js(`getComputedStyle(document.querySelector('.sp-admin-nav')).gridTemplateColumns.trim().split(' ').filter(Boolean).length`),1,'Sidebar must remain a single column');
            assert(await js('document.querySelector(".sp-admin-account form").getAttribute("action")==="/logout"'));
            await sleep(200);
            const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});
            await writeFile(join(out,`admin-sidebar-${width}.jpg`),Buffer.from(shot.data,'base64'));
        }
        await click('.sp-admin-nav [aria-controls="education-cms"]');
        assert.equal(await js('document.getElementById("admin-menu-toggle").getAttribute("aria-expanded")'),'false');
        await click('#admin-menu-toggle');
        await js('document.getElementById("admin-menu-toggle").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');
        assert.equal(await js('document.getElementById("admin-menu-toggle").getAttribute("aria-expanded")'),'false');
        console.log('PASS Admin sidebar: six menus, active state, logout form, mobile toggle/close/Escape, 1280/390 no overflow.');
        return;
    }
    if(process.env.SAMPIRA_TEST_EDUCATION_CMS_PHOTOS==='1'){
        const {checkEducationCMSPhotos}=await import('./check-education-cms-photos.mjs');await checkEducationCMSPhotos(ctx);return;
    }
    if(process.env.SAMPIRA_TEST_ADMINISTRATOR_REFRESH_ONLY==='1') {
        const {checkAdministratorRefresh}=await import('./check-administrator-refresh.mjs');await checkAdministratorRefresh(ctx);return;
    }
    if(process.env.SAMPIRA_TEST_ADMIN_REFRESH_ONLY==='1') {
        const {checkAdminRefresh}=await import('./check-admin-refresh.mjs');await checkAdminRefresh(ctx);return;
    }
    if(process.env.SAMPIRA_TEST_COLLECTOR_TASKS_ONLY==='1') {
        const {checkCollectorTasks}=await import('./check-collector-tasks.mjs');await checkCollectorTasks(ctx);return;
    }
    if(process.env.SAMPIRA_TEST_COLLECTOR_OVERVIEW_ONLY==='1') {
        await login('owner@phase1.invalid','/dashboard');
        const pickup=await js(`portalFetch('/api/ecorecycle/request_pickup',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({item_description:'Pickup pengujian dashboard Petugas',category:'Computers',weight_kg:2,pickup_address:'Jalan Fixture Bandung Nomor 12',contact_phone:'081234567890',latitude:-6.91,longitude:107.61})}).then(async r=>{if(r.status!==201)throw Error('Pickup fixture failed');return (await r.json()).data;})`);
        await login('collector@phase1.invalid','/petugas');
        await text('[data-collector-summary] [data-analytics-state]','Diperbarui');
        await waitFor(()=>js('document.getElementById("collector-queue-count").textContent.includes("tugas")'),'Pickup queue failed');
        const analytics=await js('portalFetch("/api/analytics").then(r=>r.json()).then(r=>r.data)');
        for(const key of ['completed_pickups','active_facility_tasks','in_progress_pickups','completed_facility_tasks'])assert.equal(await js(`Number(document.querySelector('[data-collector-metric="${key}"]').textContent.replace(/\D/g,''))`),analytics[key]);
        assert.equal(await js('document.getElementById("stat-profit").textContent'),'—','Fabricated commission');
        await captureCollector('dashboard');
        await js(`document.querySelector('[data-tracking="${pickup.tracking_number}"]').click();void 0`);
        await text('.swal2-title','Ambil Tugas Penjemputan');await click('.swal2-confirm');
        await text('.swal2-title','Tugas Diambil!');await click('.swal2-confirm');
        await waitFor(()=>js(`Boolean(document.querySelector('[data-mission="${pickup.tracking_number}"]'))`),'Claim did not create assigned task');
        await js('switchView("dashboard");void 0');
        await click('#collector-refresh');
        await waitFor(()=>js('!document.getElementById("collector-refresh").disabled'),'Refresh remained disabled');
        await text('[data-collector-summary] [data-analytics-state]','Diperbarui');
        const active=await js('portalFetch("/api/analytics").then(r=>r.json()).then(r=>r.data.in_progress_pickups)');
        assert.equal(await js('Number(document.querySelector("[data-collector-metric=in_progress_pickups]").textContent)'),active);
        // Select the newly claimed fixture, whose address is known; legacy seed rows may have no address.
        await js('viewActiveMission('+JSON.stringify(pickup.tracking_number)+')');
        await js('switchView("dashboard");void 0');
        await js('openActiveMission();void 0');
        await waitFor(()=>js('document.getElementById("view-active-mission").classList.contains("active")'),'Detail shortcut failed');
        await text('#mission-dest','Jalan Fixture Bandung Nomor 12');
        await js('switchView("dashboard");void 0');
        await click('#view-dashboard .sp-field-shortcut button');
        assert(await js('document.getElementById("view-operations").classList.contains("active")'));
        await waitFor(()=>js('document.querySelector("#view-operations .sp-map-layout output").textContent.includes("lokasi dimuat")'),'Operational map did not load');
        await js('switchView("dashboard");window.collectorRealFetch=window.fetch;window.fetch=(url,options)=>String(url).includes("list_pickups?type=petugas")?Promise.resolve(new Response(JSON.stringify({status:"success",data:[]}),{status:200,headers:{"Content-Type":"application/json"}})):collectorRealFetch(url,options);void 0');
        await click('#collector-refresh');await text('#upcoming-task-list','Tidak ada antrean pickup tersedia');
        assert.equal(await js('document.getElementById("collector-queue-count").textContent'),'0 tugas');
        await captureCollector('empty');
        await click('.collector-queue-empty button');assert(await js('document.getElementById("view-facility").classList.contains("active")'));
        await js('switchView("dashboard");window.fetch=(url,options)=>String(url).includes("list_pickups?type=petugas")?Promise.resolve(new Response(JSON.stringify({status:"error"}),{status:503,headers:{"Content-Type":"application/json"}})):collectorRealFetch(url,options);void 0');
        await click('#collector-refresh');await text('#collector-load-status','belum dapat dimuat');
        assert.equal(await js('document.getElementById("stat-packages").textContent'),'—');
        await js('window.fetch=collectorRealFetch;void 0');await click('#collector-retry');
        await waitFor(()=>js('document.getElementById("collector-data-state").hidden'),'Retry failed');
        await writeFile(join(out,'collector-results.json'),JSON.stringify({real_statistics:true,claim:true,refresh:true,mission_detail:true,map_navigation:true,empty_state:true,error_retry:true,no_fabricated_commission:true,viewports:[1440,1280,390]},null,2));
        console.log('PASS Petugas overview: scoped API metrics, real claim, refresh, mission/map shortcuts, empty/error recovery and responsive screenshots.');return;
        async function captureCollector(name) {
            for(const width of [1440,1280,390]) {
                await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
                await js('window.scrollTo({top:0,behavior:"instant"});void 0');await sleep(150);
                if(name==='empty') {await js('document.querySelector("#view-dashboard .layout-grid").scrollIntoView({block:"start",behavior:"instant"});void 0');await sleep(100);}
                assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Petugas overflow '+width);
                const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'collector-'+name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
            }
            await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
        }
    }
    if(process.env.SAMPIRA_TEST_USER_EDUCATION_ONLY==='1'||process.env.SAMPIRA_TEST_PUBLIC_EDUCATION_ONLY==='1') {
        await login('admin@phase1.invalid','/admin');
        await js(`(async()=>{const path='/api/ecorecycle/education/manage/articles';for(let i=0;i<8;i++){const r=await portalFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'education-ui-fixture-'+i,title:'Panduan lingkungan fixture '+i,summary:'Panduan sintetis untuk pengujian halaman Edukasi SAMPIRA.',body:'Pisahkan sampah dari sumbernya. Konten ini hanya digunakan pada database fixture pengujian.',category:i%2?'pengomposan':'pemilahan-sampah',sources:['https://www.epa.gov/recycle']})});if(r.status!==201)throw Error('Fixture article creation failed');const row=(await r.json()).data;const p=await portalFetch(path+'/'+row.id+'/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:row.version,status:'published'})});if(!p.ok)throw Error('Fixture publication failed');}})()`);
        if(process.env.SAMPIRA_TEST_PUBLIC_EDUCATION_ONLY==='1') {
            const page='/assets/education.html';
            if(process.env.SAMPIRA_TEST_EDUCATION_PHOTOS_ONLY==='1'){
                await login('owner@phase1.invalid','/dashboard');await click('.hub-tab[data-target="edukasi"]');
                await waitFor(()=>js('document.querySelectorAll("#edukasi .sp-article-photo img").length===6'),'User photo covers missing');
                await capturePublic('user-catalog');await click('#edukasi .sp-article-card h3 a');
                await waitFor(()=>js('document.querySelectorAll("[data-reference-reader] .sp-article-photo-detail img").length===2'),'User detail photographs missing');
                await capturePublic('user-reader');await click('[data-reference-reader] button');
            }
            await nav(page);await waitFor(()=>js('document.querySelectorAll("#education-results .sp-article-card").length===6'),'Public catalog unavailable');
            if(process.env.SAMPIRA_TEST_EDUCATION_PHOTOS_ONLY==='1')await waitFor(()=>js('[...document.querySelectorAll("#education-results .sp-article-photo img")].length===6&&[...document.querySelectorAll("#education-results .sp-article-photo img")].every(img=>img.complete&&img.naturalWidth>0)'),'Public cover photo failed');
            assert.equal(await js('document.getElementById("education-back").getAttribute("href")'),'/home');assert(await js('!document.querySelector(".sp-public-header")&&document.getElementById("education-back").textContent.trim()===""'));assert.equal(await js('document.querySelector("#education-pages [aria-current]").textContent'),'1');await capturePublic('catalog');
            const catalogStyle=await js('JSON.stringify([getComputedStyle(document.querySelector(".sp-education-hero")).backgroundColor,getComputedStyle(document.querySelector(".sp-article-card")).borderRadius,getComputedStyle(document.querySelector(".education-back")).width])');
            await click('#education-pages a:last-child');await text('#education-reader [role=status]','Halaman 2');assert.equal(await js('document.querySelectorAll("#education-results .sp-article-card").length'),2);assert.equal(await js('document.querySelector("#education-pages [aria-current]").textContent'),'2');assert.equal(await js('document.getElementById("education-next").getAttribute("aria-disabled")'),'true');
            assert.equal(await js('JSON.stringify([getComputedStyle(document.querySelector(".sp-education-hero")).backgroundColor,getComputedStyle(document.querySelector(".sp-article-card")).borderRadius,getComputedStyle(document.querySelector(".education-back")).width])'),catalogStyle);await capturePublic('catalog-page-2');
            await click('#education-prev');await text('#education-reader [role=status]','Halaman 1');
            await js('document.querySelector(".sp-filter [name=category]").value="pengomposan";document.querySelector(".sp-filter").requestSubmit();void 0');
            await waitFor(()=>js('document.querySelectorAll("#education-results .sp-article-card").length===4'),'Category filter failed');
            await click('#education-results h3 a');await waitFor(()=>js('Boolean(document.querySelector(".sp-reader-article h1"))'),'Reader unavailable');
            assert.equal(await js('new URL(document.getElementById("education-back").href).pathname'),page);assert(await js('document.querySelector(".sp-reader-article a").href.startsWith("https://")'));assert(await js('!document.querySelector(".sp-public-header")&&document.getElementById("education-back").textContent.trim()===""&&getComputedStyle(document.querySelector(".education-reading-header")).backgroundColor==="rgb(23, 76, 60)"'));await capturePublic('reader');
            if(process.env.SAMPIRA_TEST_EDUCATION_PHOTOS_ONLY==='1')assert.equal(await js('document.querySelectorAll(".sp-reader-article .sp-article-photo-detail img").length'),2);
            const articleURL=await js('location.pathname+location.search');await nav(articleURL);await waitFor(()=>js('Boolean(document.querySelector(".sp-reader-article h1"))'),'Direct reader unavailable');
            await click('#education-back');await text('#education-reader [role=status]','Halaman 1');
            await js('document.querySelector(".sp-filter [name=q]").value="noarticlexyz";document.querySelector(".sp-filter").requestSubmit();void 0');await text('#education-reader [role=status]','Tidak ada artikel');await capturePublic('empty');
            await writeFile(join(out,'public-education-results.json'),JSON.stringify({catalog:true,pagination:true,category:true,reader_sources:true,back_links:true,direct_article:true,empty_search:true,viewports:[1280,390]},null,2));
            console.log('PASS public education: catalog, paging, category/search, reader/source links, direct detail/back and responsive screenshots.');return;
            async function capturePublic(name){for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await js('window.scrollTo({top:0,behavior:"instant"});void 0');await sleep(160);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));}await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
        }
        await login('owner@phase1.invalid','/dashboard');
        await click('.hub-tab[data-target="edukasi"]');
        await waitFor(()=>js('document.querySelectorAll("#edukasi .sp-article-card").length===6'),'Education articles failed to load on navigation');
        assert(await js('!document.querySelector("#edukasi .sp-education-feature").hidden'));
        await click('#edukasi [data-next]');await text('#edukasi [role=status]','Menampilkan 7–8');
        assert.equal(await js('document.querySelectorAll("#edukasi .sp-article-card").length'),2);
        await click('#edukasi [data-prev]');await text('#edukasi [role=status]','Menampilkan 1–6');
        await click('#edukasi [data-category="pengomposan"]');await text('#edukasi [role=status]','Menampilkan 1–4');
        assert(await js('document.querySelector("#edukasi .sp-education-feature").hidden'),'Filtered results kept stale feature');
        await click('#edukasi [data-category=""]');await text('#edukasi [role=status]','Menampilkan 1–6');
        await js('document.getElementById("education-search-input").value="notfoundxyz";document.querySelector("#edukasi form").requestSubmit();void 0');
        await text('#edukasi [role=status]','Tidak ada artikel');
        assert.equal(await js('document.querySelectorAll("#edukasi .sp-article-card").length'),0);
        await js('document.getElementById("education-search-input").value="";window.eduFetch=window.fetch;window.fetch=(url,options)=>String(url).includes("/education/articles?")?Promise.resolve(new Response(JSON.stringify({message:"Layanan edukasi sementara gagal."}),{status:503,headers:{"Content-Type":"application/json"}})):eduFetch(url,options);document.querySelector("#edukasi form").requestSubmit();void 0');
        await text('#edukasi [role=status]','Layanan edukasi sementara gagal.');
        await js('window.fetch=eduFetch;document.querySelector("#edukasi form").requestSubmit();void 0');
        await text('#edukasi [role=status]','Menampilkan 1–6');
        await click('#edukasi .sp-article-card h3 a');
        await waitFor(()=>js('Boolean(document.querySelector("[data-reference-reader] h2"))'),'Article reader did not open');
        await click('[data-reference-reader] button');
        for(const width of [1280,390]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
            for(const [name,selector] of [['top','#edukasi'],['articles','#edukasi .sp-education-list-heading']]) {
                await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'});void 0`);await sleep(180);
                assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Education overflow '+width);
                const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'education-'+name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
            }
        }
        await writeFile(join(out,'education-results.json'),JSON.stringify({navigation_load:true,published_fixture_articles:8,pagination:true,category_filter:true,search_empty:true,error_recovery:true,reader:true,viewports:[1280,390]},null,2));
        console.log('PASS User education: actual CMS publications, automatic load, categories, pagination, empty/error recovery, article reader and 1280/390px.');
        return;
    }
    if(process.env.SAMPIRA_TEST_USER_WIZARD_ONLY==='1' || process.env.SAMPIRA_TEST_USER_CAMERA_ONLY==='1' || process.env.SAMPIRA_TEST_USER_ESTIMATE_ONLY==='1') {
        const {checkUserFormSteps}=await import('./check-user-form-steps.mjs');
        await checkUserFormSteps(ctx);return;
    }
    if(process.env.SAMPIRA_TEST_REPORT_ENTRY_ONLY==='1') {
        await login('owner@phase1.invalid','/dashboard');
        await click('.hub-tab[data-target="laporan-fasilitas"]');
        await waitFor(()=>js('!document.getElementById("facility-form-view").hidden'),'Sidebar must open report form directly');
        assert(await js('document.getElementById("facility-list-view").hidden'));
        await js('document.getElementById("facility-title").value="TPS pengujian navigasi langsung";void 0');
        await click('.hub-tab[data-target="beranda"]');
        await click('.hub-tab[data-target="laporan-fasilitas"]');
        assert.equal(await js('document.getElementById("facility-title").value'),'TPS pengujian navigasi langsung');
        await js(`(()=>{const f=document.getElementById('facility-form');f.elements.description.value='Kondisi TPS membutuhkan pemeriksaan dari petugas.';f.elements.address.value='Jalan Fixture Bandung Nomor 10';f.elements.category.value='tps';f.requestSubmit();})()`);
        await text('#facility-success','Laporan tercatat.');
        await text('#facility-detail','TPS pengujian navigasi langsung');
        await click('.hub-tab[data-target="riwayat-payout"]');
        await click('#riwayat-payout [data-report-view="list"]');
        await waitFor(()=>js('!document.getElementById("facility-list-view").hidden'),'History must open the report list');
        await text('#facility-list','TPS pengujian navigasi langsung');
        assert(await js('document.getElementById("facility-form-view").hidden'));
        for(const width of [1280,390]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<600});
            if(width<600){await click('#mobileMenuToggle');}
            await click('.hub-tab[data-target="laporan-fasilitas"]');
            await waitFor(()=>js('!document.getElementById("facility-form-view").hidden'),'Form entry missing '+width);
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'));
            if(width<600)assert.equal(await js('document.getElementById("mobileMenuToggle").getAttribute("aria-expanded")'),'false');
            await js('document.fonts.ready');await sleep(180);
            const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'direct-report-form-'+width+'.png'),Buffer.from(shot.data,'base64'));
        }
        console.log('PASS direct facility entry: sidebar desktop/mobile -> form, draft retained, real submit -> detail, history -> list, no overflow.');
        return;
    }
    if(process.env.SAMPIRA_TEST_USER_REFERENCE_FORM_CHECK==='1') {
        const {checkFacilityBrowser}=await import('./check-phase3-frontend.mjs');
        const readyNav=async path=>{await nav(path);await waitFor(()=>js('document.readyState==="complete"'),'Fixture page scripts not loaded: '+path,30000);};
        try { await checkFacilityBrowser({...ctx,nav:readyNav}); }
        catch(error) {
            await writeFile(join(out,'form-diagnostic.json'),JSON.stringify(await js('({url:location.href,ready:document.readyState,message:document.querySelector(".auth-error")?.textContent})'),null,2));
            const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'form-diagnostic.png'),Buffer.from(shot.data,'base64'));
            throw error;
        }
    }
    if(process.env.SAMPIRA_TEST_USER_REFERENCE_FULL==='1') {
        const {checkFacilityBrowser}=await import('./check-phase3-frontend.mjs');
        const {checkHandlingBrowser}=await import('./check-phase4-frontend.mjs');
        const {checkPhase9Frontend,checkPhase9Finalization}=await import('./check-phase9-frontend.mjs');
        const {checkPhase10CFinal}=await import('./check-phase10c-final.mjs');
        await checkFacilityBrowser(ctx);
        await checkHandlingBrowser(ctx);
        await checkPhase9Frontend(ctx);
        await checkPhase9Finalization(ctx);
        await checkPhase10CFinal(ctx);
    }
    // Actual CMS fixture content, never substituted for a production article.
    await login('admin@phase1.invalid','/admin');
    await js(`(async()=>{const path='/api/ecorecycle/education/manage/articles';const response=await portalFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'reference-education-fixture',title:'Panduan memilah sampah rumah tangga',summary:'Konten sintetis untuk pengujian tampilan User.',body:'Pisahkan sampah sejak sumbernya. Materi ini hanya fixture pengujian.',category:'pemilahan-sampah',sources:['https://www.epa.gov/recycle']})});if(response.status!==201)throw Error('Fixture article failed');const row=(await response.json()).data;const published=await portalFetch(path+'/'+row.id+'/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:row.version,status:'published'})});if(!published.ok)throw Error('Fixture publication failed');})()`);
    await login('owner@phase1.invalid','/dashboard');
    await waitFor(()=>js('document.querySelector("#metric-active-pickups").textContent!=="—"'),'User data not loaded');
    const layout=[];
    for(const [tab,name] of [['beranda','beranda'],['setor-sampah','penjemputan'],['laporan-fasilitas','pelaporam'],['riwayat-payout','riwayat'],['poin-voucher','voucher'],['reward-user','reward'],['edukasi','edukasi'],['pengaturan','pengaturan']]) {
        await click('.hub-tab[data-target="'+tab+'"]');
        if(tab==='laporan-fasilitas')await waitFor(()=>js('Boolean(document.querySelector("#facility-form-view:not([hidden])"))'),'Report form not visible');
        if(tab==='pengaturan')await waitFor(()=>js('Boolean(document.getElementById("settings-name").value)'),'Profile not loaded');
        if(tab==='riwayat-payout')assert.equal(await js('getComputedStyle(document.querySelector("#riwayat-payout .sp-history-switch [aria-current]")).color'),'rgb(12, 59, 46)','Active history label must remain readable.');
        if(tab==='edukasi') {
            await text('#edukasi .sp-portal-articles','Panduan memilah');
            const contrast=await js(`(()=>{const luminance=color=>{const c=color.match(/\\d+/g).slice(0,3).map(n=>{n=Number(n)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const root=document.querySelector('#edukasi .sp-education-feature');const fg=luminance(getComputedStyle(root.querySelector('p')).color),bg=luminance(getComputedStyle(root).backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);})()`);
            assert(contrast>=4.5,'Education feature text contrast '+contrast);
        }
        if(tab==='poin-voucher')await text('[data-wallet-state]','Saldo sesuai');
        await js('document.fonts.ready');await sleep(300);
        for(const width of [1440,1280,768,390,360]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
            await js('window.scrollTo({top:0,behavior:"instant"});void 0');await sleep(120);
            const boxes=await js(`({page:document.documentElement.scrollWidth,viewport:innerWidth,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width,header:document.querySelector('.user-topbar').getBoundingClientRect().height,font:getComputedStyle(document.body).fontFamily,main:document.querySelector('main').getBoundingClientRect().width})`);
            assert(boxes.page<=width+2,name+' overflow '+width+' '+JSON.stringify(boxes));
            assert.equal(boxes.sidebar,256);assert.equal(boxes.header,width>992?64:56);
            assert(boxes.font.includes('Plus Jakarta Sans'));layout.push({view:name,width,...boxes});
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    }
    await click('.hub-tab[data-target="edukasi"]');
    await text('#edukasi .sp-portal-articles','Panduan memilah');
    await click('#edukasi .sp-portal-articles article a');
    await text('[data-reference-reader] .sp-article-body','Materi ini hanya fixture');
    assert.equal(await js('location.pathname'),'/dashboard','Article detail must preserve the User shell.');
    assert(await js('document.querySelector("[data-reference-reader] a[target=_blank]").rel.includes("noreferrer")'));
    await click('[data-reference-reader]>button');
    await click('.hub-tab[data-target="reward-user"]');
    await click('#reward-user [data-analytics-retry]');
    await text('[data-reward-summary] [data-analytics-state]','Diperbarui');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
    await click('#mobileMenuToggle');
    assert.equal(await js('document.querySelector("#mobileMenuToggle").getAttribute("aria-expanded")'),'true');
    assert.equal(await js('document.querySelectorAll(".sidebar .sidebar-item[data-target]").length'),8);
    await click('.sidebar [data-target="pengaturan"]');
    assert.equal(await js('document.querySelector("#mobileMenuToggle").getAttribute("aria-expanded")'),'false');
    await click('#sp-account-menu summary');
    assert(await js('document.getElementById("sp-account-menu").open'));
    await js('document.getElementById("sp-account-menu").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');
    assert(!await js('document.getElementById("sp-account-menu").open'));
    await writeFile(join(out,'layout-observations.json'),JSON.stringify(layout,null,2));
    console.log('PASS User reference: eight pages, real API data, shared 256px sidebar/64px header, all five viewport widths.');
}
