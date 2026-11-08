import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkAdministratorRefresh({send,js,nav,login,click,text,waitFor,profile}) {
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||profile;await mkdir(out,{recursive:true});
    const post=(path,body)=>js(`portalFetch(${JSON.stringify('/api/ecorecycle/'+path)},{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(${JSON.stringify(body)})}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.message);return result.data;})`);
    await login('owner@phase1.invalid','/dashboard');
    const pickup=await post('request_pickup',{category:'Computers',item_description:'Pickup QA pembayaran Administrator',weight_kg:2,pickup_address:'Jalan Fixture Bandung',contact_phone:'081234567890'});
    await login('collector@phase1.invalid','/petugas');
    await post('assign_collector',{tracking_number:pickup.tracking_number});
    for(const status of ['transit','arrived'])await post('pickup_status',{tracking_number:pickup.tracking_number,status});
    await post('verify_pickup',{pickup_id:pickup.pickup_id,final_weight_kg:2});
    await login('administrator@phase1.invalid','/administrator');
    const pending=await js(`portalFetch('/api/administrator/pickup-rewards').then(r=>r.json()).then(r=>r.data.find(row=>row.pickup_id===${Number(pickup.pickup_id)}))`);assert(pending);
    await waitFor(()=>js('document.querySelector("[data-metric=total_pickups]").textContent!=="—"'),'Summary unavailable');
    const menus=['sp-system-metrics','p9-system','p9-accounts','p9-voucher-admin','p9-audit','p9-system-grid','content-view','system-payments'];
    const open=async id=>{await js(`location.hash=${JSON.stringify(id)};void 0`);await waitFor(()=>js(`!document.getElementById(${JSON.stringify(id)}).hidden`),'Menu unavailable '+id);};
    for(const id of menus){
        await open(id);assert.equal(await js('document.querySelectorAll("#sp-system-main>section:not([hidden]),#sp-system-main>.view-section:not([hidden])").length'),1);
        assert.equal(await js('document.querySelector(".sp-system-nav [aria-current=page]").hash'),'#'+id);
        if(id==='p9-system')await text('#p9-system [data-analytics-state]','Diperbarui');
        if(['p9-accounts','p9-voucher-admin','p9-audit'].includes(id))await waitFor(()=>js(`!document.querySelector('#${id} [aria-busy]') && Boolean(document.querySelector('#${id} [data-list-state]'))`),'List unavailable '+id);
        if(id==='p9-system-grid')await waitFor(()=>js('!document.querySelector("#p9-system-grid [data-grid-state]")?.textContent.includes("Memuat")'),'Grid unavailable');
        await capture(id);
    }
    await open('p9-accounts');
    await js('document.querySelector("#p9-accounts [data-list-search]").value="no-account-found-xyz";document.querySelector("#p9-accounts [data-list-search]").dispatchEvent(new Event("input"));void 0');
    await text('#p9-accounts [data-list-items]','Belum ada data');
    await js('document.querySelector("#p9-accounts [data-list-search]").value="";document.querySelector("#p9-accounts [data-list-search]").dispatchEvent(new Event("input"));void 0');
    await click('#p9-accounts [data-account-edit]:not([disabled])');await text('.p9-dialog[open]','Kelola akun');await capture('account-dialog','.p9-dialog[open]');await click('.p9-dialog [data-dialog-close]');
    await open('p9-voucher-admin');await click('[data-voucher-new]');
    await js(`(()=>{const f=document.querySelector('.p9-dialog form');for(const[k,v]of Object.entries({name:'Voucher QA Administrator',category:'simulasi',description:'Data sintetis untuk pemeriksaan tampilan Administrator.',point_cost:100,stock:4,valid_from:'2026-01-01T00:00',valid_until:'2030-01-01T00:00'}))f.elements[k].value=v;f.elements.active.checked=true;})()`);
    await capture('voucher-dialog','.p9-dialog[open]');await click('.p9-dialog [type=submit]');
    await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Voucher save failed');await text('#p9-voucher-admin tbody','Voucher QA Administrator');await capture('p9-voucher-admin');
    await click('#p9-voucher-admin [data-voucher-edit]');await js('document.querySelector(".p9-dialog [name=stock]").value="7";void 0');await click('.p9-dialog [type=submit]');await waitFor(()=>js('!document.querySelector(".p9-dialog[open]")'),'Voucher edit failed');
    const vouchers=await js('portalFetch("/api/administrator/vouchers").then(r=>r.json()).then(r=>r.data)');assert.equal(vouchers.find(row=>row.name==='Voucher QA Administrator').stock,7);
    await open('p9-audit');await click('#p9-audit [data-list-retry]');await text('#p9-audit tbody','Voucher QA Administrator');await capture('p9-audit');
    await open('content-view');
    await js('document.getElementById("announcement-title").value="Pengumuman QA Administrator";document.getElementById("announcement-message").value="Informasi sintetis untuk pemeriksaan publikasi fixture.";document.getElementById("announcement-form").requestSubmit();void 0');
    await text('#announcement-admin-list','Pengumuman QA Administrator');
    if(await js('Boolean(document.querySelector(".swal2-confirm"))'))await click('.swal2-confirm');
    await capture('content-view');
    await open('system-payments');
    assert.equal(await js('document.querySelector("#reward-payment-form [name=reference]").minLength'),6);
    await js('document.querySelector("#reward-payment-form [name=reference]").value="BCA BRI WELL";document.querySelector("#reward-payment-form [name=reference]").dispatchEvent(new Event("input"));void 0');
    await text('#reward-payment-status','Spasi tidak diperbolehkan');
    await js(`(async()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,800,500);ctx.fillStyle='#174c3c';ctx.font='30px sans-serif';ctx.fillText('BUKTI SINTETIS - FIXTURE QA',40,120);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'bukti-fixture.png',{type:'image/png'}));const input=document.getElementById('reward-payment-proof');input.files=dt.files;input.dispatchEvent(new Event('change'));document.getElementById('reward-pickup-id').value=${JSON.stringify(String(pickup.pickup_id))};document.getElementById('reward-payment-amount').value=${JSON.stringify(String(pending.amount))};const ref=document.getElementById('reward-payment-reference');ref.value='ADMIN-UI-QA-001';ref.dispatchEvent(new Event('input'));document.getElementById('reward-payment-confirm').checked=true;document.getElementById('reward-payment-form').requestSubmit();})()`);
    await text('#reward-payment-status','Pembayaran eksternal tercatat');
    const rewards=await js('portalFetch("/api/administrator/pickup-rewards").then(r=>r.json()).then(r=>r.data)');assert.equal(rewards.find(row=>row.pickup_id===pickup.pickup_id).status,'paid');await capture('system-payments');
    await send('Page.navigate',{url:await js('location.origin')+'/administrator#p9-voucher-admin'});await waitFor(()=>js('!document.getElementById("p9-voucher-admin").hidden'),'Deep link failed');await text('#p9-voucher-admin tbody','Voucher QA Administrator');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});await click('#system-menu-toggle');
    assert.equal(await js('document.getElementById("system-menu-toggle").getAttribute("aria-expanded")'),'true');
    await click('.sp-system-nav a[href="#p9-system"]');await text('#p9-system [data-analytics-state]','Diperbarui');
    assert.equal(await js('document.getElementById("system-menu-toggle").getAttribute("aria-expanded")'),'false');
    await login('owner@phase1.invalid','/dashboard');
    const ownRewards=await js('portalFetch("/api/user/rewards").then(r=>r.json()).then(r=>r.data)');assert.equal(ownRewards.find(row=>row.pickup_id===pickup.pickup_id).payment_status,'paid');
    await writeFile(join(out,'administrator-results.json'),JSON.stringify({menus:8,one_panel_per_menu:true,summary:true,statistics:true,account_search_dialog:true,voucher_create_edit:true,audit:true,announcement_publication:true,payment_validation:true,payment_fixture_paid:true,user_reward_readback:true,deep_link:true,mobile_navigation:true,viewports:[1280,390]},null,2));
    console.log('PASS Administrator refresh: eight menus, actual voucher create/edit and announcement publication, account search/dialog, audit, payment validation, navigation and responsive captures.');
    async function capture(name,selector='#'+name){
        for(const width of [1280,390]){
            await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await js('window.scrollTo({top:0,behavior:"instant"});void 0');await sleep(160);
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
            const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:55});await writeFile(join(out,name+'-'+width+'.jpg'),Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    }
}
