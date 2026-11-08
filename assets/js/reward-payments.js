(() => {
    const form = document.getElementById('reward-payment-form');
    const select = document.getElementById('reward-pickup-id');
    const status = document.getElementById('reward-payment-status');
    const list = document.getElementById('reward-payment-list');
    const proofInput = document.getElementById('reward-payment-proof');
    const preview = document.getElementById('reward-proof-preview');
    const referenceInput = form.elements.namedItem('reference');
    const amountInput = form.elements.namedItem('amount');
    const referenceMessage = 'Referensi transfer harus 6–100 karakter, diawali huruf/angka, dan hanya berisi huruf, angka, titik (.), garis bawah (_), garis miring (/), atau tanda hubung (-). Spasi tidak diperbolehkan.';
    const amountMessage = 'Nominal harus berupa angka, maksimal 13 digit dan 2 angka desimal. Gunakan titik untuk desimal, tanpa pemisah ribuan.';
    function validatePaymentInput(input) {
        const rule = input===referenceInput ? /^[A-Za-z0-9][A-Za-z0-9._/-]{5,99}$/ : /^[0-9]{1,13}(\.[0-9]{1,2})?$/;
        const message = rule.test(input.value.trim()) ? '' : input===referenceInput ? referenceMessage : amountMessage;
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', String(Boolean(message)));
        if(message)status.textContent=message;
        else if(status.textContent===referenceMessage||status.textContent===amountMessage)status.textContent='';
        return !message;
    }
    for(const input of [referenceInput,amountInput])input.addEventListener('input',()=>validatePaymentInput(input));
    let submitting = false, ended = false, preparedFile, preparedPromise, previewURL;
    const errorMessages = {401:'Sesi berakhir. Silakan masuk kembali.',403:'Pencatatan pembayaran hanya untuk Administrator dengan sesi yang sah.',409:'Status, nominal, referensi, atau bukti sudah berubah/digunakan. Periksa riwayat terbaru.',413:'Bukti terlalu besar. Pilih gambar hingga 5 MB untuk dioptimalkan.',500:'Pencatatan belum dapat dipastikan. Periksa riwayat pembayaran sebelum mencoba lagi.'};
    async function readResponse(response) {
        const result = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(errorMessages[response.status] || (response.status===400 && result?.message) || 'Layanan pembayaran belum dapat merespons. Periksa riwayat sebelum mencoba lagi.');
            error.status=response.status;throw error;
        }
        if (!result?.data) throw new Error('Respons pembayaran tidak lengkap. Periksa riwayat sebelum mencoba lagi.');
        return result;
    }
    function clearPreview() {if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;if(preview){preview.hidden=true;preview.removeAttribute('src');}}
    function prepareProof(file) {
        if(file===preparedFile)return preparedPromise;
        preparedFile=file;
        preparedPromise=(async()=>{
            if(!file?.size)throw new Error('Bukti pembayaran wajib diunggah.');
            if(file.size>5*1024*1024)throw new Error('Bukti pembayaran maksimal 5 MB.');
            const {prepareHandlingPhoto}=await import('./handling-photo.js');
            const optimized=await prepareHandlingPhoto(file);
            return optimized===file?file:new File([optimized],'bukti-pembayaran.jpg',{type:optimized.type,lastModified:file.lastModified});
        })();return preparedPromise;
    }
    proofInput.addEventListener('change',async()=>{
        const file=proofInput.files[0];clearPreview();if(!file)return;
        try{const proof=await prepareProof(file);if(ended||proofInput.files[0]!==file)return;
            if(preview){previewURL=URL.createObjectURL(proof);preview.src=previewURL;preview.hidden=false;}
            status.textContent=proof===file?'Bukti siap. Periksa nominal, penerima, dan keterbacaan bukti.':'Bukti dioptimalkan menjadi JPEG maksimal 750 KiB. Periksa keterbacaan pratinjau sebelum mencatat; file asli tidak diubah.';
        }catch(error){status.textContent=error.message;}
    });

    async function refresh() {
        const response = await portalFetch('/api/administrator/pickup-rewards');
        const {data} = await readResponse(response);
        if(ended)return;
        const selected=select.value;
        select.replaceChildren();
        list.replaceChildren();
        for (const row of data) {
            const caption = row.tracking_number + ' · Rp ' + row.amount;
            const li = document.createElement('li');
            li.textContent = caption + (row.status === 'paid' ? ' · Pembayaran tercatat' : ' · Pending');
            if (row.status === 'pending') {
                select.add(new Option(caption, row.pickup_id));
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'sp-button sp-button--quiet';
                cancel.dataset.voidReward = row.pickup_id;
                cancel.textContent = 'Batalkan kewajiban';
                li.append(' · ', cancel);
            }
            if (row.status === 'paid') {
                li.append(' · Referensi '+row.reference+' · '+new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(row.paid_at))+' WIB'+(row.paid_by?' · Pelaksana #'+row.paid_by:''));
                const proof = document.createElement('a');
                proof.href = '/api/administrator/pickup-rewards/' + row.pickup_id + '/proof';
                proof.textContent = 'Unduh bukti';
                li.append(' · ', proof);
            }
            list.append(li);
        }
        if(Array.from(select.options).some(option=>option.value===selected))select.value=selected;
        form.hidden = select.options.length === 0;
        if (!data.length) status.textContent = 'Belum ada kewajiban reward.';
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if(submitting||ended)return;
        if(!validatePaymentInput(referenceInput)||!validatePaymentInput(amountInput)){form.reportValidity();return;}
        submitting=true;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const body = new FormData(form);
            const proof=await prepareProof(proofInput.files[0]);
            if(ended)return;
            body.set('proof',proof,proof.name);
            if (form.querySelector('#reward-payment-confirm').checked) body.set('confirm_payment', 'true');
            const response = await portalFetch('/api/ecorecycle/process_payout', {method: 'POST', body});
            const result = await readResponse(response);
            form.reset();
            clearPreview();preparedFile=preparedPromise=null;
            status.textContent = result.message;
            await refresh();
            window.dispatchEvent(new Event('sampira:cash-updated'));
        } catch (error) {
            status.textContent = error instanceof TypeError ? 'Koneksi terputus; pencatatan belum dapat dipastikan. Periksa riwayat sebelum mencoba lagi.' : error.message;
            if(!ended&&(error instanceof TypeError||error.status>=500||error.status===409))await refresh().catch(()=>{});
        } finally {
            submitting=false;
            button.disabled = false;
        }
    });
    refresh().catch(error => { status.textContent = error.message; });
    window.addEventListener('sampira:cash-updated', () => {
        refresh().catch(error => { status.textContent = error.message; });
    });
    window.addEventListener('pagehide',clearPreview);
    window.addEventListener('sampira:session-ended',()=>{ended=true;clearPreview();form.reset();form.hidden=true;select.replaceChildren();list.replaceChildren();});
})();
