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
