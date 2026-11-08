import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkUserReference(ctx) {
    const {send,js,nav,login,click,text,waitFor,profile}=ctx;
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||join(profile,'user-reference');
    await mkdir(out,{recursive:true});
    await nav('/login');
    assert.equal(await js('location.origin'),'http://127.0.0.1:18081','Fixture only.');
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
    if(process.env.SAMPIRA_TEST_USER_EDUCATION_ONLY==='1') {
        await login('admin@phase1.invalid','/admin');
        await js(`(async()=>{const path='/api/ecorecycle/education/manage/articles';for(let i=0;i<8;i++){const r=await portalFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'education-ui-fixture-'+i,title:'Panduan lingkungan fixture '+i,summary:'Panduan sintetis untuk pengujian halaman Edukasi SAMPIRA.',body:'Pisahkan sampah dari sumbernya. Konten ini hanya digunakan pada database fixture pengujian.',category:i%2?'pengomposan':'pemilahan-sampah',sources:['https://www.epa.gov/recycle']})});if(r.status!==201)throw Error('Fixture article creation failed');const row=(await r.json()).data;const p=await portalFetch(path+'/'+row.id+'/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:row.version,status:'published'})});if(!p.ok)throw Error('Fixture publication failed');}})()`);
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
        await click('#edukasi .sp-article-card a');
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
