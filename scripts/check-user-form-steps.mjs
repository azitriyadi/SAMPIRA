import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

export async function checkUserFormSteps({send,js,nav,login,click,text,waitFor,profile}) {
    const out=process.env.SAMPIRA_TEST_PHASE6_SCREENSHOTS||join(profile,'user-wizards');await mkdir(out,{recursive:true});
    await login('owner@phase1.invalid','/dashboard');
    const origin=await js('location.origin');assert.equal(origin,'http://127.0.0.1:18081');
    const q=JSON.stringify;
    const field=(id,value)=>js(`(()=>{const input=document.getElementById(${q(id)});input.value=${q(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await js(`window.wizardWrites=[];window.wizardOriginalFetch=window.fetch;window.fetch=async(url,options)=>{const response=await wizardOriginalFetch(url,options);if(options?.method==='POST'&&(/request_pickup$/.test(String(url))||/facility-reports$/.test(String(url)))){const fields=options.body instanceof FormData?Object.fromEntries([...options.body].filter(([,v])=>typeof v==='string')):{};wizardWrites.push({url:String(url),status:response.status,fields,data:(await response.clone().json()).data});}return response;};void 0`);
    const png=join(profile,'wizard-evidence.png');await writeFile(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==','base64'));
    await send('Browser.grantPermissions',{origin,permissions:['geolocation']});
    await send('Emulation.setGeolocationOverride',{latitude:-6.9145432,longitude:107.6098765,accuracy:10});
    const results={};
    for(const kind of ['pickup','facility']) {
        const prefix=kind==='pickup'?'pickup':'facility',form=kind==='pickup'?'#pickup-request-form':'#facility-form';
        const tab=kind==='pickup'?'setor-sampah':'laporan-fasilitas';
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
        await click('.hub-tab[data-target="'+tab+'"]');
        await waitFor(()=>js(`document.querySelector(${q(form)})?.dataset.wizardReady==='true'`),'Wizard not mounted '+kind);
        const current=()=>js(`document.querySelector(${q(form)}).dataset.wizardStep`);
        assert.equal(await current(),'1');
        const navSelector=kind==='pickup'?form+' .ref-form-navigation':'#facility-form-view>.ref-form-navigation';
        assert.equal(await js(`document.querySelector(${q(navSelector)}).querySelectorAll('a,button,[tabindex]').length`),0,'Progress must not be clickable');
        await click(navSelector+' .wizard-indicator:last-child');assert.equal(await current(),'1');
        await click(form+' .wizard-next');assert.equal(await current(),'1','Empty first step advanced');
        const title=kind==='pickup'?'form-request-title':'facility-title',description=kind==='pickup'?'form-item-description':'facility-description';
        await field(title,kind==='pickup'?'Pickup wizard fixture':'TPS wizard fixture');
        await field(description,'abc');await click(form+' .wizard-next');assert.equal(await current(),'1','Short description advanced');
        await field(description,'Foto dan detail sampah untuk pengujian wizard terisolasi.');
        if(kind==='pickup') {
            await field('form-waste-weight','0');await click(form+' .wizard-next');assert.equal(await current(),'1');
            await field('form-waste-weight','2.5');
        } else await js('document.getElementById("facility-form").elements.category.value="tps";void 0');
        const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:kind==='pickup'?'#form-waste-photo':'#facility-photo'});
        await send('DOM.setFileInputFiles',{nodeId,files:[png]});
        if(kind==='facility')await text('#facility-photo-status','Foto siap');
        if(process.env.SAMPIRA_TEST_USER_CAMERA_ONLY==='1') {
            const input=kind==='pickup'?'form-waste-photo':'facility-photo';
            const camera='[data-open-camera="'+input+'"]';
            await waitFor(()=>js(`Boolean(document.querySelector(${q(camera)}))`),'Camera button missing');
            await js(`window.cameraTestStreams=[];window.realCamera=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const s=await realCamera(options);cameraTestStreams.push(s);return s;};void 0`);
            await click(camera);
            await waitFor(()=>js('!document.querySelector("[data-camera-capture]").disabled'),'Camera preview unavailable');
            await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
            await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
            await waitFor(()=>js('!document.querySelector(".user-camera").open'),'Escape did not close camera');
            assert.equal(await js(`document.getElementById(${q(input)}).files[0].name`),'wizard-evidence.png','Cancel replaced gallery photo');
            assert(await js('cameraTestStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'),'Cancel left camera running');
            await js('navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException("Denied","NotAllowedError"));void 0');
            await click(camera);await text(camera+' + p','Akses kamera ditolak');
            assert(!await js('document.querySelector(".user-camera").open'));
            await js('navigator.mediaDevices.getUserMedia=async options=>{const s=await realCamera(options);cameraTestStreams.push(s);return s;};void 0');
            await click(camera);
            await waitFor(()=>js('!document.querySelector("[data-camera-capture]").disabled'),'Camera retry unavailable');
            for(const width of [1280,390]) {
                await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
                await sleep(150);
                const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,kind+'-camera-'+width+'.png'),Buffer.from(shot.data,'base64'));
                assert(await js('document.querySelector(".user-camera").scrollWidth<=document.querySelector(".user-camera").clientWidth+2'),'Camera modal overflow');
            }
            await click('[data-camera-capture]');
            await waitFor(()=>js('!document.querySelector(".user-camera").open'),'Capture did not close camera');
            if(kind==='facility')await text('#facility-photo-status','Foto siap');
            assert(await js(`(()=>{const f=document.getElementById(${q(input)}).files[0];return f.type==='image/jpeg'&&f.name.startsWith('foto-kamera-')&&f.size>100&&f.size<5*1024*1024;})()`),'Camera did not populate canonical photo');
            assert(await js('cameraTestStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'),'Capture left camera running');
            results[kind+'_camera']={gallery_preserved_on_cancel:true,permission_denied_message:true,jpeg_captured:true,tracks_stopped:true};
            await js('navigator.mediaDevices.getUserMedia=realCamera;void 0');
        }
        await capture(kind+'-step1');
        await click(form+' .wizard-next');assert.equal(await current(),'2');
        await waitFor(()=>js(`Boolean(document.querySelector('#${prefix}-location-picker .leaflet-container'))`),'Map not ready');
        await text('#'+prefix+'-location-picker .location-picker-hint','Gunakan lokasi Anda atau seret pin pada peta');
        assert.equal(await js(`document.getElementById('${prefix}-latitude').type`),'hidden');
        assert(await js(`Boolean(document.getElementById('${prefix}-latitude').value)`),'Default coordinate must be automatic');
        const visibleButtons=await js(`Array.from(document.querySelectorAll('#${prefix}-location-picker .location-actions button')).filter(b=>b.getClientRects().length).map(b=>b.textContent)`);
        assert.deepEqual(visibleButtons,['Gunakan Lokasi Saya']);
        assert(!await js(`Boolean(document.querySelector('#${prefix}-location-search')?.children.length)`));
        const before=await js(`document.getElementById('${prefix}-latitude').value`);
        const marker=await js(`(()=>{const el=document.querySelector('#${prefix}-location-picker .location-pin-T');el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:marker.x,y:marker.y});
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:marker.x,y:marker.y,button:'left',clickCount:1});
        for(let i=1;i<=5;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:marker.x+i*8,y:marker.y+i*4,button:'left',buttons:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:marker.x+40,y:marker.y+20,button:'left',clickCount:1});
        await waitFor(()=>js(`document.getElementById('${prefix}-latitude').value!==${q(before)}`),'Dragging marker did not update coordinates');
        await click('#'+prefix+'-location-picker .location-actions button');
        await waitFor(()=>js(`Math.abs(Number(document.getElementById('${prefix}-latitude').value)+6.9145432)<.000001`),'GPS did not auto-fill coordinates');
        await capture(kind+'-step2-map');
        await click(form+' .wizard-next');assert.equal(await current(),'3');
        const address=kind==='pickup'?'form-pickup-address':'facility-address';
        await field(address,'a');await js(`document.querySelector(${q(form)}).requestSubmit();void 0`);assert.equal(await current(),'3');
        assert.equal(await js('wizardWrites.length'),kind==='pickup'?0:1,'Invalid or incomplete form reached API');
        await field(address,'Jalan Fixture Wizard Bandung Nomor 12');
        if(kind==='pickup')await field('form-donor-phone','081234567890');
        await click(form+' .wizard-previous');assert.equal(await current(),'2');
        await click(form+' .wizard-previous');assert.equal(await current(),'1');
        assert.equal(await js(`document.getElementById(${q(title)}).value`),kind==='pickup'?'Pickup wizard fixture':'TPS wizard fixture');
        await click(form+' .wizard-next');await click(form+' .wizard-next');
        await capture(kind+'-step3');
        if(kind==='pickup' && process.env.SAMPIRA_TEST_USER_ESTIMATE_ONLY==='1') {
            const amounts=await js(`['preview-gross-reward','preview-fee','preview-net-reward'].map(id=>Number(document.getElementById(id).textContent.replace(/[^0-9-]/g,'')))`);
            assert(amounts[0]>0);assert.equal(amounts[2],amounts[0]-amounts[1],'Estimate math changed');
            for(const width of [1280,390]) {
                await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
                await js('document.querySelector(".reward-estimate-card").scrollIntoView({block:"center",behavior:"instant"});void 0');await sleep(150);
                assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),'Reward estimate overflow');
                const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'reward-estimate-'+width+'.png'),Buffer.from(shot.data,'base64'));
            }
            results.estimate={arithmetic_preserved:true,desktop_mobile:true};
        }
        await js(`document.querySelector(${q(form)}).requestSubmit();void 0`);
        if(kind==='pickup') {await text('.swal2-title','Permohonan Berhasil');await click('.swal2-confirm');}
        else await text('#facility-success','Laporan tercatat.');
        const write=await js('wizardWrites.at(-1)');assert.equal(write.status,201);
        assert(Math.abs(Number(write.fields.latitude)+6.9145432)<.000001);
        assert(Math.abs(Number(write.fields.longitude)-107.6098765)<.000001);
        const path=kind==='pickup'?'/api/ecorecycle/pickup_status?tracking_number='+encodeURIComponent(write.data.tracking_number):'/api/ecorecycle/facility-reports/'+write.data.id;
        const record=await js(`fetch(${q(path)}).then(r=>r.json()).then(r=>r.data)`);
        if(process.env.SAMPIRA_TEST_USER_CAMERA_ONLY==='1') {
            assert(record.photo_url,'Photo not persisted '+kind);
            const photo=await js(`fetch(${q(record.photo_url)}).then(async r=>({status:r.status,size:(await r.blob()).size}))`);
            assert.equal(photo.status,200);assert(photo.size>100);
        }
        assert(Math.abs(Number(record.latitude)+6.9145432)<.000001,'Stored coordinates differ');
        results[kind]={validation:true,progress_inert:true,steps:3,drag_auto_coordinates:true,gps_auto_coordinates:true,no_confirmation:true,upload_and_submission:true,stored_coordinates:true};
    }
    // Shared picker retains its confirmation workflow when compact is not requested.
    const legacy=await js(`(async()=>{const {mountLocationPicker}=await import('/assets/js/location-map.js?v=user-wizard-1');const host=document.createElement('div');document.body.append(host);const picker=mountLocationPicker(host,{title:'Compatibility fixture',prefix:'compatibility',digits:7});picker.selectPoint(-6.91,107.61);const before=picker.fields();host.querySelector('.location-actions .primary').click();const after=picker.fields();picker.dispose();host.remove();return {before,after};})()`);
    assert.equal(legacy.before,null);assert.equal(legacy.after.latitude,'-6.9100000');results.legacy_picker_confirmation_preserved=true;
    assert.equal(await js('wizardWrites.length'),2,'Premature or duplicate form submission');
    await writeFile(join(out,'wizard-results.json'),JSON.stringify(results,null,2));
    console.log(process.env.SAMPIRA_TEST_USER_CAMERA_ONLY==='1'
        ? 'PASS both User cameras: capture, cancellation, denied permission, stream cleanup, 1280/390px, real photo uploads and readback; wizard/map regression passed.'
        : process.env.SAMPIRA_TEST_USER_ESTIMATE_ONLY==='1'
        ? 'PASS reward estimate arithmetic/layout and both map hints at 1280/390px; wizard, GPS/drag and real submissions passed.'
        : 'PASS both User wizards: validation gates, inert progress, five viewports, drag/GPS auto coordinates, uploads, real submissions and persisted points; legacy picker unchanged.');
    async function capture(name) {
        await js('document.fonts.ready');
        for(const width of ((process.env.SAMPIRA_TEST_USER_CAMERA_ONLY==='1'||process.env.SAMPIRA_TEST_USER_ESTIMATE_ONLY==='1')?[1280,390]:[1440,1280,768,390,360])) {
            await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
            await js(`document.querySelector(${q(name.startsWith('pickup')?'#pickup-request-form .ref-form-navigation':'#facility-form-view>.ref-form-navigation')}).scrollIntoView({block:'start',behavior:'instant'});void 0`);await sleep(150);
            assert(await js('document.documentElement.scrollWidth<=innerWidth+2'),name+' overflow '+width);
            const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
        }
        await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    }
}
