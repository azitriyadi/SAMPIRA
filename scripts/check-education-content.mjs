import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadEducationContent, importEducation, educationAPI} from './import-education-content.mjs';

export async function checkEducationContent({send,js,nav,login,click,text,waitFor,profile,password}) {
    await nav('/login');
    const origin = await js('location.origin');
    assert.equal(origin, 'http://127.0.0.1:18081', 'Fixture origin only.');
    const articles = await loadEducationContent();
    const q = JSON.stringify, manage = '/api/ecorecycle/education/manage/articles', publicPath = '/api/ecorecycle/education/articles';
    const auth = await fetch(origin + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'admin@phase1.invalid',password})});
    assert.equal(auth.status, 200);
    const token = (await auth.json()).data.token;
    const api = (path,method,body) => educationAPI(origin,token,path,method,body);
    const out = process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS || join(profile,'education-content');
    await mkdir(out,{recursive:true});
    const sql = query => execFileSync(process.env.SAMPIRA_TEST_MYSQL,
        ['--no-defaults','--protocol=tcp','-h','127.0.0.1','-P','13316','-u','root','-N','-B','sampira_phase1_test'],
        {input:query,encoding:'utf8'}).trim();
    const tables = sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME NOT IN ('education_articles','auth_sessions') ORDER BY TABLE_NAME").split(/\r?\n/);
    const fingerprint = () => sql('CHECKSUM TABLE ' + tables.join(',') + ' EXTENDED');
    const baseline = fingerprint();
    const existing = await api(manage,'POST',{slug:'editorial-existing',title:'Artikel editorial existing',summary:'Artikel milik editor harus tetap utuh.',body:'Jangan mengubah isi artikel editorial ini.',category:'daur-ulang',sources:[]});
    const draftPlan = await importEducation({origin,token,articles});
    assert(draftPlan.every(row => row.action === 'would-create'));
    assert.equal((await api(manage+'?limit=50')).items.length,1,'Dry run must not mutate.');
    const first = await importEducation({origin,token,articles,apply:true});
    assert.equal(first.filter(row => row.action === 'created' && row.status === 'draft').length,10);
    assert.equal((await api(publicPath)).items.length,0,'Drafts must remain private.');
    for (const article of articles) assert.equal((await fetch(origin+publicPath+'/'+article.slug)).status,404);
    const drafts = await Promise.all(first.map(row => api(manage+'/'+row.id)));
    const replay = await importEducation({origin,token,articles,apply:true,publish:true});
    assert(replay.every(row => row.action === 'skipped-identical' && row.status === 'draft'),'Existing drafts must not be published by replay.');
    assert.deepEqual(await Promise.all(first.map(row => api(manage+'/'+row.id))),drafts,'Replay must not touch versions/timestamps.');

    await login('admin@phase1.invalid','/admin');
    await click('[aria-controls="education-cms"]');
    await text('#education-cms [role=status]','Halaman 1');
    // Review and publish all curated drafts using the real Admin CMS controls.
    for (const article of articles) {
        await js(`document.querySelector('#education-filters [name=q]').value=${q(article.title)};document.getElementById('education-filters').requestSubmit();void 0`);
        await text('#education-cms tbody',article.title);
        await click('#education-cms tbody button');
        await waitFor(() => js(`document.querySelector('#education-editor [name=slug]').value===${q(article.slug)}`),'Wrong CMS article');
        assert.equal(await js('document.querySelector("#education-editor [name=category]").value'),article.category);
        assert.equal(await js('document.querySelector("#education-editor [name=body]").value'),article.body);
        await capture('admin-draft-'+article.slug);
        await click('[data-publication="published"]');
        await click('#education-confirmation button');
        await text('#education-editor [role=status]','Tersimpan · Terbit');
        await click('#education-close');
    }
    for (const [index,article] of articles.entries()) {
        const current = await api(manage+'/'+first[index].id);
        assert.equal(current.status,'published');
        assert(current.published_at);
        const detail = await api(publicPath+'/'+article.slug);
        for (const key of ['title','slug','summary','category','body','sources']) assert.deepEqual(detail[key],article[key]);
    }
    const published = await Promise.all(first.map(row => api(manage+'/'+row.id)));
    assert((await importEducation({origin,token,articles,apply:true,publish:true})).every(row=>row.action==='skipped-identical'));
    assert.deepEqual(await Promise.all(first.map(row=>api(manage+'/'+row.id))),published);
    assert.deepEqual(await api(manage+'/'+existing.id),existing,'Existing unrelated article unchanged.');
    const automatic = await importEducation({origin,token,articles:[{...articles[0],slug:'publish-import-fixture'}],apply:true,publish:true});
    assert.equal(automatic[0].status,'published');
    const automaticDetail = await api(manage+'/'+automatic[0].id);
    await api(manage+'/'+automaticDetail.id+'/publication','POST',{version:automaticDetail.version,status:'archived'});
    // A colliding editorial slug must be preserved even with --publish.
    const changed = await api(manage+'/'+existing.id,'PUT',{...articles[0],slug:existing.slug,body:'Isi editor berbeda dan wajib dipertahankan.',version:existing.version});
    const conflict = await importEducation({origin,token,articles:[{...articles[0],slug:existing.slug}],apply:true,publish:true});
    assert.equal(conflict[0].action,'skipped-editorial-conflict');
    assert.deepEqual(await api(manage+'/'+existing.id),changed);
    await assert.rejects(api(manage,'POST',{...articles[0],slug:'xss-invalid',body:'Teks <script>alert(1)</script> tidak boleh masuk.'}),error=>error.status===400);
    await assert.rejects(api(manage,'POST',{...articles[0],slug:'url-invalid',sources:['javascript:alert(1)']}),error=>error.status===400);

    await login('owner@phase1.invalid','/dashboard');
    await click('[data-target="edukasi"]');
    await text('#edukasi [role=status]','Menampilkan 1–6 artikel');
    await capture('user-catalog');
    await click('#edukasi [data-next]');
    await text('#edukasi [role=status]','Menampilkan 7–10 artikel');
    await capture('user-catalog-page2');
    await click('#edukasi [data-prev]');
    await text('#edukasi [role=status]','Menampilkan 1–6 artikel');
    await click('#edukasi [data-category="bank-sampah"]');
    await text('#edukasi .sp-portal-articles',articles[3].title);
    assert.equal(await js('document.querySelectorAll("#edukasi .sp-portal-articles article").length'),1);
    await click('#edukasi [data-category=""]');
    await js(`document.querySelector('#edukasi form [name=q]').value='Kang Pisman';document.querySelector('#edukasi form').requestSubmit();void 0`);
    await text('#edukasi .sp-portal-articles',articles[7].title);
    // Open through real User navigation, then inspect every public detail.
    await click('#edukasi .sp-portal-articles article a');
    await text('.sp-reader-article h1',articles[7].title);
    for (const article of articles) {
        await nav('/assets/education.html?artikel='+article.slug);
        await text('.sp-reader-article h1',article.title);
        assert.equal(await js('document.querySelector(".sp-article-body").textContent'),article.body,'Unicode/paragraph/source attribution must survive rendering.');
        assert.equal(await js('document.querySelectorAll(".sp-article-body script,.sp-article-body img,.sp-article-body iframe").length'),0);
        const links = await js(`Array.from(document.querySelectorAll('.sp-reader-article li a')).map(a=>({href:a.href,rel:a.rel,target:a.target}))`);
        assert.deepEqual(links.map(link=>link.href),article.sources.map(url=>new URL(url).href));
        assert(links.every(link=>link.rel.includes('noopener')&&link.rel.includes('noreferrer')));
        await capture('detail-'+article.slug);
    }
    // Exercise the anchor click without fetching/researching the supplied external source.
    const clicked = await js(`new Promise(resolve=>{const a=document.querySelector('.sp-reader-article li a');a.addEventListener('click',event=>{event.preventDefault();resolve(a.href);},{once:true});a.click();})`);
    assert.equal(clicked,articles[9].sources[0]);
    assert.equal(fingerprint(),baseline,'Content import must not alter other business tables.');
    const findings={articles:10,created_as_drafts:10,published_via_admin_ui:10,source_urls:18,
        repeat_import_unchanged:true,editorial_collision_preserved:true,draft_visibility:true,
        user_navigation_category_search_pagination:true,unicode_body_attribution_exact:true,
        unsafe_markup_url_rejected:true,source_click:true,other_business_tables_unchanged:true,
        viewports:[1280,390]};
    await writeFile(join(out,'content-results.json'),JSON.stringify(findings,null,2));
    console.log('PASS curated education: 10 drafts, Admin UI publication, User catalog/details/sources, repeat/conflict safety, XSS validation, Unicode and desktop/mobile; other business tables unchanged.');

    async function capture(name) {
        for (const width of [1280,390]) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
            await js('document.fonts.ready');
            await new Promise(resolve=>setTimeout(resolve,120));
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
            const shot=await send('Page.captureScreenshot',{format:'png'});
            await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    }
}
