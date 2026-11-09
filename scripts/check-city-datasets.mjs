import {sequential} from './test-sequence.mjs';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkCityDatasets({send,js,login,click,text,waitFor,profile}){
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.cityFetch=window.fetch;window.cityFail=true;window.fetch=(url,options)=>{if(String(url).includes('/assets/data/bandung-waste.json')&&window.cityFail){window.cityFail=false;return Promise.reject(Error('Fixture connection failure'));}return window.cityFetch(url,options);};`});
    await login('owner@phase1.invalid','/dashboard');
    await click('[data-target="edukasi"]');await text('[data-city-summary] .city-state','Dataset belum dapat dimuat');await click('[data-city-summary] button');
    await waitFor(()=>js('document.querySelectorAll(".city-summary>div").length===2'),'User city summary');
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});
    const dataset=await js('fetch("/assets/data/bandung-waste.json").then(r=>r.json())');
    assert.equal(dataset.production.rows,72);assert.equal(dataset.handling.rows,108);assert.equal(Object.hasOwn(dataset,'banks'),false);
    assert(!JSON.stringify(dataset).includes('Coblong'));assert(!JSON.stringify(dataset).includes('nama_pengelola'));
    await capture('city-user-summary','[data-city-summary]');
    await click('.city-explore>summary');await waitFor(()=>js('document.querySelectorAll(".city-card").length===2'),'User charts');
    await text('.city-explore .city-warning','m³/hari');
    await sequential([['admin@phase1.invalid','/admin','[aria-controls="admin-analytics"]'],['administrator@phase1.invalid','/administrator','.sp-system-nav a[href="#p9-system"]']], async ([email,path,control]) => {
        await login(email,path);await click(control);await waitFor(()=>js('document.querySelectorAll(".city-card").length===2'),'City charts '+email);
        await sequential(['production','handling'], async (key) => {
            const root=`[data-city-dataset="${key}"]`;const latest=Object.keys(dataset[key].years).at(-1);
            const actual=await js(`Array.from(document.querySelectorAll('${root} > div > .city-chart > .city-bars li')).map(el=>Number(el.dataset.cityValue))`);
            // Compare every plotted value, independent of visual sort order.
            assert.deepEqual(actual.sort((a,b)=>a-b),Object.values(dataset[key].years[latest]).sort((a,b)=>a-b));
            const first=Object.keys(dataset[key].years)[0];await js(`(()=>{const s=document.querySelector('${root} select');s.value='${first}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
            await text(root+' .city-card-total',first);await click(root+' .city-trend>summary');assert.equal(await js(`document.querySelectorAll('${root} .city-trend .city-bars li').length`),Object.keys(dataset[key].years).length);
            await click(root+' .city-chart details>summary');assert(await js(`document.querySelector('${root} table tbody').rows.length>0`));
        });
        await capture(email.startsWith('admin@')?'city-admin':'city-administrator','.city-data');
    });
    await writeFile(join(out,'city-results.json'),JSON.stringify({roles:['user','admin','administrator'],rows:[72,108],retry:true,year_filters:true,plotted_values_match:true,tables:true,trends:true,scope_and_unit_warning:true,viewports:[1280,390]},null,2));
    console.log('PASS city datasets: User/Admin/Administrator, retry, exact plotted values, year filters, tables, trends, scope/units, 1280/390 overflow.');
    async function capture(name,selector){await sequential([1280,390], async (width) => {await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await js(`document.querySelector('${selector}').scrollIntoView({block:'start'});void 0`);await sleep(180);assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow');const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));});await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});}
}
