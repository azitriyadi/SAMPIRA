import {sequential} from './test-sequence.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkEducationLayout({send,js,login,click,text,nav,waitFor,profile}){
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    await login('admin@phase1.invalid','/admin');
    await js(`(async()=>{for(let i=1;i<=8;i++){const base='/api/ecorecycle/education/manage/articles';const r=await portalFetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:'education-layout-'+i,title:'Panduan lingkungan '+i,summary:'Panduan praktis pemilahan sampah untuk lingkungan yang lebih bersih.',body:'Pisahkan sampah sesuai jenisnya. Simpan sampah pada wadah yang sesuai sebelum dibawa ke fasilitas pengelolaan.',category:'panduan-sampira',sources:[]})});if(r.status!==201)throw Error('Seed article '+r.status);const a=(await r.json()).data;const p=await portalFetch(base+'/'+a.id+'/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:a.version,status:'published'})});if(!p.ok)throw Error('Publish fixture '+p.status);}})()`);
    await login('owner@phase1.invalid','/dashboard');
    await waitFor(()=>js('document.querySelector(".sp-hero-visual img").naturalWidth>0'),'Home photo loaded');
    assert((await js('getComputedStyle(document.querySelector(".sp-hero-visual"),"::after").backgroundImage')).includes('linear-gradient'));
    await capture('home-gradient','.sp-welcome-banner');
    await click('[data-target="edukasi"]');await waitFor(()=>js('document.querySelectorAll(".sp-portal-articles .sp-article-card").length===6'),'Portal first page');
    await waitFor(()=>js('document.querySelectorAll(".city-summary>div").length===2'),'Compact dataset');
    assert(await js('document.querySelector(".sp-education-feature").hidden'));
    await capture('education-user-page1','#edukasi');
    const style=await js('getComputedStyle(document.querySelector(".sp-portal-articles .sp-article-card")).borderRadius');
    await click('#edukasi [data-next]');await text('.sp-education-page','2');await waitFor(()=>js('document.querySelectorAll(".sp-portal-articles .sp-article-card").length===2'),'Portal second page');
    assert(await js('document.querySelector(".sp-education-feature").hidden'));assert.equal(await js('getComputedStyle(document.querySelector(".sp-portal-articles .sp-article-card")).borderRadius'),style);
    await capture('education-user-page2','#edukasi');await click('#edukasi [data-prev]');await text('.sp-education-page','1');
    let firstStyle;
    await sequential([1,2], async (page) => {
        await nav('/assets/education.html?page='+page+'&ui=education-unified-19');await waitFor(()=>js('document.querySelectorAll("#education-results .sp-article-card").length>0'),'Public page '+page);
        const current=await js('({heading:document.querySelector(".sp-education-hero h1").textContent,radius:getComputedStyle(document.querySelector(".sp-article-card")).borderRadius,background:getComputedStyle(document.querySelector(".sp-education-hero")).backgroundColor})');
        if(firstStyle){ assert.deepEqual(current,firstStyle); }else { firstStyle=current; }
        assert.equal(await js('document.querySelector("#education-pages [aria-current]").textContent'),String(page));
        await capture('education-public-page'+page,'.sp-public-container');
    });
    await click('#education-results h3 a');await waitFor(()=>js('document.querySelector(".sp-reader-article")'),'Article detail');await text('.education-reading-header','Panduan lingkungan');
    await capture('education-reader','.sp-reader-article');
    console.log('PASS education portal/public pages1/2: same layout, working next/previous and article detail, compact dataset, home gradient, desktop/mobile.');
    await writeFile(join(out,'education-layout-results.json'),JSON.stringify({portal_pages:[1,2],public_pages:[1,2],same_layout:true,reader:true,compact_dataset:true,gradient:true,viewports:[1280,390]},null,2));
    async function capture(name,selector){await sequential([1280,390], async (width) => {await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await js(`document.querySelector('${selector}').scrollIntoView({block:'start'});void 0`);await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow');const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
}
