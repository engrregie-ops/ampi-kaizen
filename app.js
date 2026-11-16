(() => {
  const $ = id => document.getElementById(id);
  const fields = ['ideaNo','ideaDate','personName','department','workArea','currentProcess','improvement','benefits'];
  const categories = ['Process Improvement','Cost Savings','Quality','Poka-Yoke','Safety','5S'];
  const muda = ['Over-processing','Over-production','Inventory','Motion','Defects','Waiting','Transportation'];
  const TABLE = 'kaizen_records';
  const ATTACHMENTS = 'kaizen_attachments';
  const BUCKET = 'kaizen-photos';
  let photos = [], editingId = null, toastTimer, supabase = null, currentUser = null;

  const today = () => new Date().toISOString().slice(0,10);
  const toast = message => { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3200); };
  const selected = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
  const setChecks = (name,values=[]) => document.querySelectorAll(`input[name="${name}"]`).forEach(x=>x.checked=values.includes(x.value));
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const configReady = () => { const c=window.AMPI_SUPABASE_CONFIG||{}; return c.url && !c.url.includes('YOUR-PROJECT-REF') && c.publishableKey && !c.publishableKey.includes('REPLACE_WITH'); };

  function initClient(){
    if(!configReady() || !window.supabase?.createClient){ $('setupNotice').hidden=false; $('connectionStatus').innerHTML='<i></i> Not configured'; $('authBtn').disabled=true; $('saveBtn').disabled=true; $('saveBottomBtn').disabled=true; $('loadBtn').disabled=true; return false; }
    const c=window.AMPI_SUPABASE_CONFIG;
    supabase=window.supabase.createClient(c.url,c.publishableKey);
    $('setupNotice').hidden=true;
    return true;
  }
  function nextNumber(){
    const n=Number(localStorage.getItem('ampi_kaizen_last_number')||0)+1;
    return `KZN-${String(n).padStart(4,'0')}`;
  }
  function syncPreview(){
    fields.forEach(id=>{const target=document.querySelector(`[data-out="${id}"]`);if(target){let value=$(id).value||'';if(id==='ideaDate'&&value){const [y,m,d]=value.split('-');value=`${m}/${d}/${y}`}target.textContent=value;}});
    $('outCategories').innerHTML=categories.map(v=>checkMarkup(v,selected('category').includes(v))).join('');
    $('outMuda').innerHTML=muda.map(v=>checkMarkup(v,selected('muda').includes(v))).join('');
    $('paperPhotoGrid').innerHTML=photos.map(p=>`<img src="${p.data}" alt="${escapeHtml(p.name)}">`).join('');
    $('paperAttachments').style.display=photos.length?'block':'none';
  }
  function checkMarkup(value,checked){return `<span class="paper-check ${checked?'checked':''}"><i></i>${escapeHtml(value)}</span>`;}
  function renderPhotos(){
    $('photoCount').textContent=photos.length;
    $('photoList').innerHTML=photos.length?photos.map((p,i)=>`<div class="photo-item"><img src="${p.data}" alt=""><div><strong>${escapeHtml(p.name)}</strong><small>${p.size?`${(p.size/1024).toFixed(0)} KB`:'Cloud attachment'}</small></div><button class="remove-photo" data-remove="${i}" aria-label="Remove photo">✕</button></div>`).join(''):'<div class="empty-photos">No photos attached yet.</div>';
    syncPreview();
  }
  function getData(){const d={};fields.forEach(id=>d[id]=$(id).value);d.category=selected('category');d.muda=selected('muda');return d;}
  function setData(d){
    $('ideaNo').value=d.ideaNo||d.idea_no||''; $('ideaDate').value=d.ideaDate||d.idea_date||today();
    $('personName').value=d.personName||d.employee_name||''; $('department').value=d.department||''; $('workArea').value=d.workArea||d.work_area||'';
    $('currentProcess').value=d.currentProcess||d.current_process||''; $('improvement').value=d.improvement||d.suggested_improvement||''; $('benefits').value=d.benefits||'';
    setChecks('category',d.category||[]); setChecks('muda',d.muda||[]);
    photos=Array.isArray(d.photos)?d.photos:[]; renderPhotos(); syncPreview();
  }
  function resetForm(){
    $('kaizenForm').reset(); photos=[]; editingId=null; $('ideaNo').value=nextNumber(); $('ideaDate').value=today(); renderPhotos(); syncPreview();
    $('previewSection').classList.remove('visible'); $('saveBtn').textContent='Save record';
  }
  async function ensureProfile(user){
    if(!user)return;
    const {data,error}=await supabase.from('employee_profiles').select('id').eq('id',user.id).maybeSingle();
    if(error){console.warn('Profile lookup:',error.message);return;}
    if(!data){const {error:insertError}=await supabase.from('employee_profiles').insert({id:user.id,email:user.email||'',full_name:user.user_metadata?.full_name||user.user_metadata?.name||'',role:'employee'});if(insertError)console.warn('Profile creation:',insertError.message);}
  }
  async function updateAuthUI(){
    if(!supabase)return;
    const {data:{session}}=await supabase.auth.getSession(); currentUser=session?.user||null;
    if(currentUser) await ensureProfile(currentUser);
    $('authBtn').hidden=!!currentUser; $('signOutBtn').hidden=!currentUser;
    $('userLabel').textContent=currentUser?(currentUser.email||'Signed in'):'';
    $('connectionStatus').innerHTML=`<i></i> ${currentUser?'Connected · Cloud sync':'Connected · Sign in required'}`;
    $('saveBtn').disabled=!currentUser; $('saveBottomBtn').disabled=!currentUser; $('loadBtn').disabled=!currentUser;
  }
  async function signIn(){
    if(!supabase)return;
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});
    if(error)toast(`Google sign-in failed: ${error.message}`);
  }
  async function signOut(){const {error}=await supabase.auth.signOut();if(error){toast(error.message);return;}currentUser=null;await updateAuthUI();toast('Signed out.');}
  async function makeIdeaNumber(){
    const {data,error}=await supabase.from(TABLE).select('idea_no').order('created_at',{ascending:false}).limit(200);
    if(error){$('ideaNo').value=nextNumber();return;}
    const nums=(data||[]).map(r=>Number(String(r.idea_no||'').match(/(\d+)$/)?.[1]||0));
    const next=Math.max(0,...nums)+1; localStorage.setItem('ampi_kaizen_last_number',String(next)); $('ideaNo').value=`KZN-${String(next).padStart(4,'0')}`;
  }
  async function uploadPhotos(recordId){
    for(const p of photos){
      if(p.storage_path)continue;
      if(!p.file){continue;}
      const safeName=p.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${currentUser.id}/${recordId}/${crypto.randomUUID()}-${safeName}`;
      const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,p.file,{contentType:p.file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:rowError}=await supabase.from(ATTACHMENTS).insert({record_id:recordId,storage_path:path,file_name:p.name,uploaded_by:currentUser.id});
      if(rowError)throw rowError;
      p.storage_path=path; p.file=null;
    }
  }
  async function save(){
    if(!currentUser){toast('Please sign in with Google before saving.');return;}
    const d=getData();
    if(!d.personName.trim()){$('personName').focus();toast('Please enter the employee name.');return;}
    if(!d.ideaDate){$('ideaDate').focus();toast('Please select the date.');return;}
    $('saveBtn').disabled=true; $('saveBottomBtn').disabled=true;
    try{
      const payload={idea_no:d.ideaNo,idea_date:d.ideaDate,employee_name:d.personName,department:d.department,work_area:d.workArea,current_process:d.currentProcess,suggested_improvement:d.improvement,benefits:d.benefits,category:d.category,muda:d.muda,updated_at:new Date().toISOString()};
      let recordId=editingId;
      if(recordId){
        const {error}=await supabase.from(TABLE).update(payload).eq('id',recordId); if(error)throw error;
      }else{
        const {data,error}=await supabase.from(TABLE).insert({...payload,created_by:currentUser.id}).select('id').single(); if(error)throw error; recordId=data.id; editingId=recordId;
      }
      await uploadPhotos(recordId);
      toast(`Record ${d.ideaNo} saved to Supabase.`); $('saveBtn').textContent='Update record';
      await makeIdeaNumberAfterSave(d.ideaNo);
    }catch(e){console.error(e);toast(`Save failed: ${e.message||'Check Supabase table and Storage policies.'}`);}
    finally{$('saveBtn').disabled=false;$('saveBottomBtn').disabled=false;}
  }
  async function makeIdeaNumberAfterSave(savedNo){
    const n=Number(String(savedNo).match(/(\d+)$/)?.[1]||0); if(n) localStorage.setItem('ampi_kaizen_last_number',String(Math.max(n,Number(localStorage.getItem('ampi_kaizen_last_number')||0))));
  }
  async function renderRecords(){
    if(!currentUser){toast('Sign in first to view shared records.');return;}
    $('recordsList').innerHTML='<p class="empty-photos">Loading shared records…</p>';
    $('recordsDialog').showModal();
    const {data,error}=await supabase.from(TABLE).select('id,idea_no,idea_date,employee_name,department,work_area,created_at').order('created_at',{ascending:false}).limit(100);
    if(error){$('recordsList').innerHTML=`<p class="empty-photos">Could not load records: ${escapeHtml(error.message)}</p>`;return;}
    $('recordsList').innerHTML=data.length?data.map(r=>`<div class="record-row"><div><strong>${escapeHtml(r.idea_no||'Untitled')}</strong><small>${escapeHtml(r.employee_name||'')} · ${escapeHtml(r.idea_date||'')} · ${escapeHtml(r.department||'')}</small></div><div class="record-actions"><button data-load="${r.id}">Open</button></div></div>`).join(''):'<p class="empty-photos">No shared KAIZEN records yet.</p>';
  }
  async function loadRecord(id){
    const {data:r,error}=await supabase.from(TABLE).select('*').eq('id',id).single();
    if(error){toast(`Could not open record: ${error.message}`);return;}
    const {data:att,error:attError}=await supabase.from(ATTACHMENTS).select('*').eq('record_id',id);
    photos=[];
    if(!attError&&att){for(const a of att){const {data:signed}=await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path,3600);if(signed?.signedUrl)photos.push({name:a.file_name||'Photo',data:signed.signedUrl,storage_path:a.storage_path});}}
    setData({idea_no:r.idea_no,idea_date:r.idea_date,employee_name:r.employee_name,department:r.department,work_area:r.work_area,current_process:r.current_process,suggested_improvement:r.suggested_improvement,benefits:r.benefits,category:r.category,muda:r.muda,photos});
    editingId=r.id; $('recordsDialog').close(); $('previewSection').classList.remove('visible'); $('saveBtn').textContent='Update record'; toast(`${r.idea_no} loaded from cloud.`); window.scrollTo({top:0,behavior:'smooth'});
  }
  async function addFiles(fileList){
    const files=[...fileList].filter(f=>f.type.startsWith('image/'));
    for(const file of files){if(photos.length>=12){toast('Maximum of 12 photos per record.');break;}if(file.size>8*1024*1024){toast(`${file.name} is over 8 MB and was skipped.`);continue;}const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});photos.push({name:file.name,size:file.size,data,file});}
    renderPhotos(); toast(files.length?'Photo attachment(s) added.':'No supported image selected.');
  }
  async function exportPNG(){
    syncPreview();const node=$('printArea');try{if(document.fonts?.ready)await document.fonts.ready;const clone=node.cloneNode(true);clone.style.transform='none';clone.style.margin='0';const serialized=new XMLSerializer().serializeToString(clone);const css=[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('')}catch{return ''}}).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1748" height="2480" viewBox="0 0 559.37 793.70"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${serialized}</div></foreignObject></svg>`;const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1748;canvas.height=2480;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(b=>{if(!b){toast('PNG export failed. Try Print A5 instead.');return;}const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${$('ideaNo').value||'KAIZEN'}-form.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('High-resolution PNG exported.');},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);toast('PNG export could not render this browser content. Use Print A5.');};img.src=url;}catch(e){toast('PNG export failed in this browser. Use Print A5.');}
  }

  $('kaizenForm').addEventListener('input',syncPreview);$('kaizenForm').addEventListener('change',syncPreview);
  $('saveBtn').addEventListener('click',save);$('saveBottomBtn').addEventListener('click',save);
  $('newBtn').addEventListener('click',async()=>{resetForm();if(currentUser)await makeIdeaNumber();window.scrollTo({top:0,behavior:'smooth'});});
  $('clearBtn').addEventListener('click',()=>{if(confirm('Clear all entered fields and remove attached photos? Unsaved changes will be lost.'))resetForm();});
  $('previewBtn').addEventListener('click',()=>{$('previewSection').classList.add('visible');syncPreview();$('previewSection').scrollIntoView({behavior:'smooth'});});
  $('hidePreviewBtn').addEventListener('click',()=>$('previewSection').classList.remove('visible'));
  $('printBtn').addEventListener('click',()=>{syncPreview();$('previewSection').classList.add('visible');window.print();});$('pngBtn').addEventListener('click',exportPNG);
  $('galleryInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});$('cameraInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
  $('photoList').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b){photos.splice(Number(b.dataset.remove),1);renderPhotos();}});
  $('loadBtn').addEventListener('click',renderRecords);$('closeDialog').addEventListener('click',()=>$('recordsDialog').close());
  $('recordsList').addEventListener('click',e=>{const b=e.target.closest('[data-load]');if(b)loadRecord(b.dataset.load);});
  $('authBtn').addEventListener('click',signIn);$('signOutBtn').addEventListener('click',signOut);

  resetForm();
  if(initClient()){
    updateAuthUI();
    supabase.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;setTimeout(updateAuthUI,0);if(currentUser)makeIdeaNumber();});
  }
})();
