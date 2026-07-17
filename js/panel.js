'use strict';

const editor      = document.getElementById('editor');
const titleInput  = document.getElementById('note-title-input');
const wordCountEl = document.getElementById('word-count');
const charCountEl = document.getElementById('char-count');
const saveDot     = document.getElementById('save-dot');
const saveLabel   = document.getElementById('save-label');
const toastBox    = document.getElementById('toast-box');

let currentNoteId  = null;
let currentNoteUrl = null;
let lastVideoId    = null;      
let saveTimer      = null;

function esc(s){const d=document.createElement('div');d.innerText=String(s??'');return d.innerHTML}
function getActiveTab(){return chrome.tabs.query({active:true,currentWindow:true}).then(t=>t[0])}
function extractVideoId(url){try{const u=new URL(url);if(u.hostname.includes('youtube.com')&&u.pathname==='/watch')return u.searchParams.get('v')||null}catch(_){}return null}
function formatTime(sec){const s=Math.floor(sec),m=Math.floor(s/60),h=Math.floor(m/60);if(h>0)return`${h}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;return`${m}:${String(s%60).padStart(2,'0')}`}
function safeFilename(n){return(n||'notes').replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,80)||'notes'}
function downloadBlob(b,f){const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=f;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000)}
function getEditorTitle(){return titleInput.value.trim()||'Untitled Note'}

function showToast(msg,type='info',ms=3000){const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;toastBox.appendChild(t);if(ms>0)setTimeout(()=>t.remove(),ms);return t}

function openModal({title,bodyHtml,buttons}){
  return new Promise(resolve=>{
    const root=document.getElementById('modal-root');
    root.innerHTML=`<div class="modal-backdrop"><div class="modal-box"><h3>${title}</h3><div class="modal-body">${bodyHtml}</div><div class="modal-actions"></div></div></div>`;
    const actions=root.querySelector('.modal-actions');
    let done=false;const settle=v=>{if(done)return;done=true;root.innerHTML='';resolve(v)};
    buttons.forEach(b=>{const btn=document.createElement('button');btn.className=b.cls||'btn-s';btn.textContent=b.label;btn.addEventListener('click',()=>settle(b.getValue?b.getValue(root):(b.value??null)));actions.appendChild(btn)});
    root.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)settle(null)});
    root.addEventListener('keydown',e=>{if(e.key==='Escape')settle(null)});
    setTimeout(()=>root.querySelector('textarea,input[type="text"]')?.focus(),40);
  });
}
function doConfirm(title,msg,ok='Confirm',cls='btn-d'){
  return openModal({title,bodyHtml:`<p>${msg}</p>`,buttons:[{label:'Cancel',cls:'btn-s',value:false},{label:ok,cls,value:true}]});
}

function updateWordCount(){
  const t=editor.innerText.trim();
  const w=t?t.split(/\s+/).filter(x=>x).length:0;
  wordCountEl.textContent=`${w} words`;
  charCountEl.textContent=`${t.length} chars`;
}

async function persistNote(){
  if(!currentNoteId)return;
  try{
    await saveNote({id:currentNoteId,title:getEditorTitle(),html:editor.innerHTML,url:currentNoteUrl,videoId:currentNoteUrl?extractVideoId(currentNoteUrl):null,lastUpdated:Date.now()});
    saveDot.classList.remove('saving');saveLabel.textContent='Saved';
  }catch(_){saveLabel.textContent='Error'}
}

function scheduleSave(){
  saveDot.classList.add('saving');saveLabel.textContent='Saving…';
  clearTimeout(saveTimer);saveTimer=setTimeout(persistNote,600);
  updateWordCount();
}

let manualNoteOverride = false;

async function switchToNote(id,meta={}){
  clearTimeout(saveTimer);
  if(currentNoteId&&currentNoteId!==id){
    await maybeDiscardOrPersist(currentNoteId);
  }

  currentNoteId=id;currentNoteUrl=meta.url||null;

  let note=await loadNote(id);
  if(!note){
    const t=meta.title||(id==='scratchpad'?'Scratchpad':'Untitled Note');
    note={id,title:t,html:'',url:meta.url||null,videoId:meta.url?extractVideoId(meta.url):null,createdAt:Date.now()};
  }
  if(meta.title&&meta.title!=='Scratchpad'&&note.title!==meta.title&&note.id){
    note.title=meta.title;
  }
  editor.innerHTML=note.html||'';
  titleInput.value=note.title||'';
  updateWordCount();
  saveDot.classList.remove('saving');saveLabel.textContent='Saved';
}

function noteHasContent(html){
  if(!html)return false;
  const d=document.createElement('div');d.innerHTML=html;
  const text=(d.textContent||'').trim();
  if(text.length>0)return true;
  if(d.querySelector('img,table,hr'))return true;
  return false;
}

async function maybeDiscardOrPersist(id){
  if(!id)return;
  if(noteHasContent(editor.innerHTML)){
    await persistNote();
  }else{
    const existing=await loadNote(id);
    if(existing) await deleteNote(id);
  }
}

async function checkActiveVideo(){

  if(!ownTabId)return;
  let tab;
  try{tab=await chrome.tabs.get(ownTabId)}catch(_){return}
  if(!tab?.url)return;
  const onWatch=tab.url.includes('youtube.com/watch');

  if(!onWatch){
    reportPanelClosed();
    window.close();
    return;
  }
  showNoteView();
  const vid=extractVideoId(tab.url);
  const id=vid;
  const title=(tab.title||'').replace(/ - YouTube$/,'').trim();

  if(vid!==lastVideoId){

    lastVideoId=vid;
    manualNoteOverride=false;
    await switchToNote(id,{title,url:tab.url});
  }else if(manualNoteOverride){

    return;
  }else if(id!==currentNoteId){
    await switchToNote(id,{title,url:tab.url});
  }else if((titleInput.value==='YouTube'||titleInput.value==='Untitled Note'||titleInput.value==='')&&title&&title!=='YouTube'){

    titleInput.value=title;
    const note=await loadNote(id);
    if(note&&note.title!==title){
      await saveNote({...note,title});
    }
  }
}

function showInfoView(){
  const info=document.getElementById('info-view'),note=document.getElementById('note-view');
  if(info&&info.classList.contains('hidden')){
    if(currentNoteId){maybeDiscardOrPersist(currentNoteId);currentNoteId=null;lastVideoId=null;}
    info.classList.remove('hidden');
    note.classList.add('hidden');
  }
}
function showNoteView(){
  const info=document.getElementById('info-view'),note=document.getElementById('note-view');
  if(note&&note.classList.contains('hidden')){
    info.classList.add('hidden');
    note.classList.remove('hidden');
  }
}

async function renderNotesList(filter=''){
  const listEl=document.getElementById('notes-list');
  const allNotes=await listNotes();
  const shown=filter?allNotes.filter(n=>(n.title||'').toLowerCase().includes(filter.toLowerCase())):allNotes;
  if(!shown.length){listEl.innerHTML=`<div class="notes-empty">No notes yet.<br>Open a YouTube video to start.</div>`;return}
  listEl.innerHTML='';
  for(const n of shown){
    const when=n.lastUpdated?new Date(n.lastUpdated).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
    const item=document.createElement('div');
    item.className='note-item'+(n.id===currentNoteId?' current':'');
    item.innerHTML=`<div class="ni-info"><div class="ni-title">${esc(n.title||'Untitled')}</div><div class="ni-meta">${when}${n.wordCount?` · ${n.wordCount}w`:''}</div></div><button class="ni-del" title="Delete">🗑️</button>`;
    item.addEventListener('click',async e=>{if(e.target.closest('.ni-del'))return;closeNotesList();manualNoteOverride=true;await switchToNote(n.id,{title:n.title,url:n.url})});
    item.querySelector('.ni-del').addEventListener('click',async e=>{
      e.stopPropagation();
      const ok=await doConfirm('Delete note?',`"${esc(n.title||'Untitled')}" will be permanently deleted.`,'Delete');
      if(!ok)return;await deleteNote(n.id);if(n.id===currentNoteId){currentNoteId=null;await checkActiveVideo()}renderNotesList(document.getElementById('notes-search').value);
    });
    listEl.appendChild(item);
  }
}

function toggleNotesList(){const p=document.getElementById('notes-panel');if(p.classList.contains('hidden')){p.classList.remove('hidden');renderNotesList()}else closeNotesList()}
function closeNotesList(){document.getElementById('notes-panel').classList.add('hidden')}
document.getElementById('notes-list-btn').addEventListener('click',toggleNotesList);
document.getElementById('notes-search').addEventListener('input',e=>renderNotesList(e.target.value));
document.getElementById('new-note-btn').addEventListener('click',async()=>{closeNotesList();manualNoteOverride=true;await switchToNote('note_'+Date.now(),{title:'Untitled Note',url:null})});
document.addEventListener('click',e=>{const p=document.getElementById('notes-panel');if(!p.classList.contains('hidden')&&!p.contains(e.target)&&e.target!==document.getElementById('notes-list-btn'))closeNotesList()});

const ALIGN_CMDS=new Set(['justifyLeft','justifyCenter','justifyRight']);
document.querySelectorAll('.tb[data-cmd]').forEach(btn=>{
  btn.addEventListener('mousedown',e=>{
    e.preventDefault();
    if(ALIGN_CMDS.has(btn.dataset.cmd)){
      SSPEditor.applyAlign(editor,btn.dataset.cmd,scheduleSave);
    }else{
      editor.focus();
      try{document.execCommand(btn.dataset.cmd,false,null)}catch(_){}
      scheduleSave();
    }
    refreshToolbar();
  });
});

document.getElementById('block-sel').addEventListener('change',e=>{
  const v=e.target.value;editor.focus();
  if(v==='pre'){
    try{document.execCommand('insertHTML',false,'<pre contenteditable="true">code</pre><p><br></p>')}catch(_){}
  }else{
    try{document.execCommand('formatBlock',false,`<${v}>`)}catch(_){}
  }
  scheduleSave();e.target.value='p';
});

SSPEditor.createColorTool({
  editor,
  buttonId: 'color-btn',
  popoverId: 'color-popover',
  customInputId: 'color-custom-input',
  swatchSelector: '.color-current',
  onChange: scheduleSave
});

const hlBtn=document.getElementById('hl-btn');
const highlightTool=SSPEditor.createHighlightTool({editor,button:hlBtn,onChange:scheduleSave});

function selectionIsHighlighted(){
  const sel=window.getSelection();
  if(!sel.rangeCount)return false;
  let node=sel.focusNode;
  if(!node)return false;
  if(node.nodeType===3)node=node.parentElement;
  while(node&&node!==editor){
    if(node.tagName==='MARK'&&node.classList.contains('ssp-hl'))return true;
    node=node.parentElement;
  }
  return false;
}

function refreshHighlightBtn(){
  hlBtn.classList.toggle('active',selectionIsHighlighted()||highlightTool.isPaintMode());
}

document.getElementById('code-btn').addEventListener('mousedown',e=>{
  e.preventDefault();
  SSPEditor.wrapInlineCode(editor,scheduleSave);
});

document.getElementById('math-btn').addEventListener('click', () => {
  SSPEditor.insertMath('modal-root', editor, scheduleSave);
});

document.getElementById('checklist-btn').addEventListener('mousedown',e=>{
  e.preventDefault();editor.focus();
  try{document.execCommand('insertHTML',false,`<ul style="list-style:none;padding-left:4px"><li style="list-style:none"><input type="checkbox"> Item</li></ul><p><br></p>`)}catch(_){}
  scheduleSave();
});

editor.addEventListener('click', e => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
    e.target.toggleAttribute('checked');
    scheduleSave();
  }
});

document.getElementById('link-btn').addEventListener('click',()=>{
  SSPEditor.insertLink('modal-root', editor, scheduleSave);
});

document.getElementById('table-btn').addEventListener('click',()=>{
  SSPEditor.insertTable('modal-root', editor, scheduleSave);
});

document.getElementById('hr-btn').addEventListener('mousedown',e=>{e.preventDefault();editor.focus();try{document.execCommand('insertHTML',false,'<hr><p><br></p>')}catch(_){}scheduleSave()});

document.getElementById('img-btn').addEventListener('click',()=>document.getElementById('img-input').click());
document.getElementById('img-input').addEventListener('change',function(){if(this.files[0])readAndInsertImage(this.files[0]);this.value=''});
function readAndInsertImage(file){
  if(!file.type.startsWith('image/')){showToast('Not an image file.','error');return}
  const r=new FileReader();r.onload=e=>insertImageIntoEditor(e.target.result);r.readAsDataURL(file);
}

editor.addEventListener('paste',e=>{
  const items=e.clipboardData?.items||[];
  for(const it of items){if(it.type.startsWith('image/')){e.preventDefault();readAndInsertImage(it.getAsFile());return}}
});

editor.addEventListener('dragover',e=>{e.preventDefault();editor.classList.add('drag-over')});
editor.addEventListener('dragleave',()=>editor.classList.remove('drag-over'));
editor.addEventListener('drop',e=>{editor.classList.remove('drag-over');const f=e.dataTransfer?.files?.[0];if(f?.type.startsWith('image/')){e.preventDefault();readAndInsertImage(f)}});

function refreshToolbar(){

  ['bold','italic','underline','strikeThrough','superscript','subscript',
   'insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight'].forEach(cmd=>{
    const b=document.querySelector(`.tb[data-cmd="${cmd}"]`);
    if(b)try{b.classList.toggle('active',document.queryCommandState(cmd))}catch(_){}
  });
  refreshHighlightBtn();
}
document.addEventListener('selectionchange',()=>{if(document.activeElement===editor||editor.contains(document.activeElement))refreshToolbar()});
editor.addEventListener('input',scheduleSave);
titleInput.addEventListener('input',scheduleSave);

editor.addEventListener('keydown',e=>{
  if(e.key==='Tab'){e.preventDefault();try{document.execCommand(e.shiftKey?'outdent':'indent')}catch(_){}}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();clearTimeout(saveTimer);persistNote().then(()=>showToast('Saved ✓','success',1500))}

  if(e.key==='Backspace'){
    const sel=window.getSelection();
    if(sel&&sel.rangeCount&&sel.isCollapsed){
      const range=sel.getRangeAt(0);
      let node=range.startContainer;

      if(node.nodeType===3&&range.startOffset===0){
        let el=node.parentElement;
        while(el&&el!==editor){
          if(el.tagName==='BLOCKQUOTE'){
            const bqRange=document.createRange();
            bqRange.selectNodeContents(el);
            bqRange.collapse(true);
            if(range.compareBoundaryPoints(Range.START_TO_START,bqRange)===0){
              e.preventDefault();
              try{document.execCommand('formatBlock',false,'p')}catch(_){}
              scheduleSave();
            }
            break;
          }
          el=el.parentElement;
        }
      }
    }
  }
});

function insertImageIntoEditor(dataUrl,timeSec=null,pageUrl=null){
  const wrap=document.createElement('div');wrap.className='ssp-img-wrap';wrap.contentEditable='false';

  if(timeSec!==null&&pageUrl){
    const chip=document.createElement('span');chip.className='ssp-ts';chip.dataset.time=timeSec;chip.textContent=`▶ ${formatTime(timeSec)}`;chip.title='Jump to this moment';
    chip.addEventListener('click',()=>chrome.runtime.sendMessage({action:'SEEK_VIDEO',time:timeSec}));
    wrap.appendChild(chip);
  }

  const img=document.createElement('img');img.src=dataUrl;img.draggable=false;img.style.maxWidth='100%';

  const acts=document.createElement('div');acts.className='ssp-img-actions';
  const cropBtn=document.createElement('button');cropBtn.className='ssp-img-act';cropBtn.textContent='✂️ Crop';
  cropBtn.addEventListener('click',e=>{e.stopPropagation();openCropModal(img)});
  const delBtn=document.createElement('button');delBtn.className='ssp-img-act danger';delBtn.textContent='🗑️';
  delBtn.addEventListener('click',async e=>{e.stopPropagation();const ok=await doConfirm('Delete image?','Remove this image?','Delete');if(ok){wrap.remove();scheduleSave()}});
  acts.append(cropBtn,delBtn);wrap.append(img,acts);

  const sel=window.getSelection();
  if(sel.rangeCount&&editor.contains(sel.getRangeAt(0).commonAncestorContainer)){
    const range=sel.getRangeAt(0);range.collapse(false);range.insertNode(wrap);
  }else{editor.appendChild(wrap)}
  const p=document.createElement('p');p.innerHTML='<br>';wrap.insertAdjacentElement('afterend',p);
  editor.scrollTop=editor.scrollHeight;scheduleSave();
}

document.getElementById('snap-btn').addEventListener('click',async()=>{
  const tab=await getActiveTab();
  if(!tab?.url?.includes('youtube.com/watch')){showToast('Open a YouTube video first.','error');return}
  const st=showToast('Capturing…','info',0);
  chrome.scripting.executeScript({
    target:{tabId:tab.id},
    func:()=>{const v=document.querySelector('video');if(!v||!v.videoWidth)return{error:'No video found.'};const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return{dataUrl:c.toDataURL('image/png'),time:v.currentTime}}
  },results=>{
    st.remove();
    const r=results?.[0]?.result;
    if(chrome.runtime.lastError){showToast('Capture failed.','error');return}
    if(!r){showToast('No result.','error');return}
    if(r.error){showToast(r.error,'error');return}
    insertImageIntoEditor(r.dataUrl,r.time,tab.url);
    showToast('Frame captured ✓','success');
  });
});

let cropImg=null,cropTarget=null,cropSel=null,cropStart=null,cropDrawing=false,cropRafId=null;
const cropModal=document.getElementById('crop-modal');
const cropCanvas=document.getElementById('crop-canvas');
const cropCtx=cropCanvas.getContext('2d');

function toImgCoords(e){
  const r=cropCanvas.getBoundingClientRect();
  const sx=cropCanvas.width/r.width, sy=cropCanvas.height/r.height;
  return{
    x:Math.max(0,Math.min(cropCanvas.width, (e.clientX-r.left)*sx)),
    y:Math.max(0,Math.min(cropCanvas.height,(e.clientY-r.top )*sy))
  };
}

function drawCrop(){
  cropRafId=null;
  cropCtx.clearRect(0,0,cropCanvas.width,cropCanvas.height);

  if(cropImg)cropCtx.drawImage(cropImg,0,0,cropCanvas.width,cropCanvas.height);
  if(!cropSel||cropSel.w<2||cropSel.h<2)return;

  const{x,y,w,h}=cropSel;

  cropCtx.save();
  cropCtx.fillStyle='rgba(0,0,0,0.55)';
  cropCtx.beginPath();
  cropCtx.rect(0,0,cropCanvas.width,cropCanvas.height);
  cropCtx.rect(x,y,w,h);
  cropCtx.fill('evenodd');
  cropCtx.restore();

  cropCtx.save();
  cropCtx.strokeStyle='#5b6ef5';
  cropCtx.lineWidth=Math.max(1,cropCanvas.width/500);
  cropCtx.setLineDash([6,4]);
  cropCtx.strokeRect(x,y,w,h);
  cropCtx.setLineDash([]);
  cropCtx.restore();

  const hs=Math.max(5,Math.min(12,cropCanvas.width/70));
  cropCtx.fillStyle='#5b6ef5';
  [[x,y],[x+w-hs,y],[x,y+h-hs],[x+w-hs,y+h-hs]].forEach(([cx,cy])=>cropCtx.fillRect(cx,cy,hs,hs));

  const lbl=`${Math.round(w)} × ${Math.round(h)}`;
  const fs=Math.max(10,Math.min(13,cropCanvas.width/55));
  cropCtx.font=`bold ${fs}px monospace`;
  const tw=cropCtx.measureText(lbl).width+10;
  const lx=Math.min(x,cropCanvas.width-tw-4);
  const ly=y>=fs+12?y-fs-4:y+h+fs+4;
  cropCtx.fillStyle='rgba(8,10,20,0.85)';
  cropCtx.beginPath();if(cropCtx.roundRect)cropCtx.roundRect(lx,ly-fs,tw,fs+6,3);else cropCtx.rect(lx,ly-fs,tw,fs+6);cropCtx.fill();
  cropCtx.fillStyle='#fff';cropCtx.fillText(lbl,lx+5,ly);
}

function scheduleCropDraw(){if(!cropRafId)cropRafId=requestAnimationFrame(drawCrop)}

function openCropModal(imgEl){
  cropTarget=imgEl;cropSel=null;cropStart=null;cropDrawing=false;
  const img=new Image();
  img.onload=()=>{
    cropImg=img;

    const MAX=1600;
    let w=img.naturalWidth,h=img.naturalHeight;
    if(w>MAX){h=Math.round(h*(MAX/w));w=MAX}
    if(h>MAX){w=Math.round(w*(MAX/h));h=MAX}
    cropCanvas.width=w;cropCanvas.height=h;
    drawCrop();
    cropModal.classList.remove('hidden');
    document.getElementById('crop-info').textContent=`${img.naturalWidth}×${img.naturalHeight} — drag to select`;
  };
  img.onerror=()=>showToast('Cannot load image.','error');
  img.src=imgEl.src;
}

function closeCropModal(){cropModal.classList.add('hidden');cropImg=null;cropTarget=null;cropSel=null;cropDrawing=false}

document.getElementById('crop-cancel').addEventListener('click',closeCropModal);
document.getElementById('crop-reset').addEventListener('click',()=>{cropSel=null;cropStart=null;drawCrop();document.getElementById('crop-info').textContent='Draw a selection on the image'});
document.addEventListener('keydown',e=>{if(!cropModal.classList.contains('hidden')){if(e.key==='Escape')closeCropModal();if(e.key==='Enter')applyCrop()}});

cropCanvas.addEventListener('pointerdown',e=>{
  e.preventDefault();
  cropDrawing=true;
  try{cropCanvas.setPointerCapture(e.pointerId)}catch(_){}
  const pt=toImgCoords(e);
  cropStart={x:pt.x,y:pt.y};
  cropSel={x:pt.x,y:pt.y,w:0,h:0};
});

cropCanvas.addEventListener('pointermove',e=>{
  if(!cropDrawing||!cropStart)return;
  const pt=toImgCoords(e);
  cropSel={
    x:Math.min(cropStart.x,pt.x),
    y:Math.min(cropStart.y,pt.y),
    w:Math.abs(pt.x-cropStart.x),
    h:Math.abs(pt.y-cropStart.y)
  };
  scheduleCropDraw();
  document.getElementById('crop-info').textContent=`Selected: ${Math.round(cropSel.w)}×${Math.round(cropSel.h)}`;
});

function endCropDrag(e){
  if(!cropDrawing)return;
  cropDrawing=false;
  try{cropCanvas.releasePointerCapture(e.pointerId)}catch(_){}
}
cropCanvas.addEventListener('pointerup',endCropDrag);
cropCanvas.addEventListener('pointercancel',endCropDrag);

document.getElementById('crop-apply').addEventListener('click',applyCrop);

function applyCrop(){
  if(!cropSel||cropSel.w<5||cropSel.h<5){showToast('Draw a selection first.','error');return}
  if(!cropImg||!cropTarget)return;

  const sx=cropImg.naturalWidth/cropCanvas.width;
  const sy=cropImg.naturalHeight/cropCanvas.height;
  const cx=Math.round(cropSel.x*sx);
  const cy=Math.round(cropSel.y*sy);
  const cw=Math.round(cropSel.w*sx);
  const ch=Math.round(cropSel.h*sy);

  if(cw<2||ch<2){showToast('Too small.','error');return}

  const out=document.createElement('canvas');out.width=cw;out.height=ch;
  out.getContext('2d').drawImage(cropImg,cx,cy,cw,ch,0,0,cw,ch);
  cropTarget.src=out.toDataURL('image/png');
  closeCropModal();scheduleSave();
  showToast(`Cropped ${cw}×${ch} ✓`,'success');
}

const exportBtn=document.getElementById('export-btn');
const exportMenu=document.getElementById('export-menu');
exportBtn.addEventListener('click',e=>{e.stopPropagation();exportMenu.classList.toggle('hidden')});
document.addEventListener('click',e=>{if(!exportMenu.contains(e.target)&&e.target!==exportBtn)exportMenu.classList.add('hidden')});

exportMenu.querySelectorAll('[data-export]').forEach(b=>{
  b.addEventListener('click',()=>{exportMenu.classList.add('hidden');const k=b.dataset.export;
    if(k==='pdf')exportPDF();else if(k==='word')exportWord();else if(k==='markdown')exportMarkdown();
    else if(k==='text')exportText();else if(k==='backup')backupAll();
  });
});

document.getElementById('restore-btn').addEventListener('click',()=>{exportMenu.classList.add('hidden');document.getElementById('restore-input').click()});
document.getElementById('restore-input').addEventListener('change',async function(){const f=this.files[0];this.value='';if(!f)return;try{const p=JSON.parse(await f.text());const{noteCount}=await importAllData(p);showToast(`Restored ${noteCount} notes ✓`,'success');renderNotesList()}catch(_){showToast('Invalid file.','error')}});

async function exportPDF(){
  const t=showToast('Creating PDF…','info',0);

  let html=editor.innerHTML
    .replace(/<div class="ssp-img-actions"[\s\S]*?<\/div>/gi,'')
    .replace(/ contenteditable="[^"]*"/gi,'');

  const title=getEditorTitle();
  const fullHtml=`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#111;background:#fff;margin:0;padding:0}
h1{font-size:22px;border-bottom:1px solid #ddd;padding-bottom:5px;margin:14px 0 7px}
h2{font-size:18px;margin:12px 0 6px}h3{font-size:15px;margin:10px 0 5px}
p{margin:5px 0}ul,ol{margin:6px 0 6px 20px}li{margin:2px 0}
blockquote{border-left:3px solid #6d5acd;padding:3px 12px;color:#555;font-style:italic;margin:8px 0}
pre{background:#f5f5f5;padding:10px;border-radius:4px;font-family:monospace;font-size:12px;margin:8px 0;white-space:pre-wrap}
code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px;color:#c0392b}
table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}
th{background:#f4f2fc;font-weight:600}img{max-width:100%;height:auto;border-radius:4px;margin:6px 0;page-break-inside:avoid}
a{color:#4060cc}hr{border:0;border-top:1px solid #ccc;margin:12px 0}
.ssp-ts{background:#e8f0fe;color:#4060cc;padding:2px 8px;border-radius:10px;font-size:11px;font-family:monospace;display:inline-block;margin-bottom:4px}
span[style*="background-color"]{border-radius:2px;padding:0 2px}
</style></head><body>
<div style="border-bottom:2px solid #5b6ef5;padding-bottom:6px;margin-bottom:16px">
<h1 style="border:0;margin:0;font-size:24px">${esc(title)}</h1>
<div style="font-size:11px;color:#888;margin-top:3px">Exported ${new Date().toLocaleString()} · StudySnap Pro</div>
</div>
${html}</body></html>`;

  try{
    await html2pdf().from(fullHtml,'string').set({
      margin:[0.5,0.5,0.6,0.5],filename:`${safeFilename(title)}.pdf`,
      image:{type:'jpeg',quality:0.95},
      html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},
      jsPDF:{unit:'in',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['avoid-all','css']}
    }).save();
    showToast('PDF saved ✓','success');
  }catch(e){console.error('[PDF]',e);showToast('PDF failed.','error')}
  finally{t.remove()}
}

function exportWord(){
  const title=getEditorTitle();

  const clone=editor.cloneNode(true);
  clone.querySelectorAll('.ssp-img-actions,.ssp-ts').forEach(el=>el.remove());
  clone.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));

  clone.querySelectorAll('.ssp-img-wrap').forEach(wrap=>{
    wrap.style.cssText='display:block;margin:10pt 0;page-break-inside:avoid;';
    const img=wrap.querySelector('img');
    if(img){
      img.style.cssText='width:100%;max-width:468pt;height:auto;display:block;border:none;';
      img.removeAttribute('draggable');
    }
  });

  clone.querySelectorAll('table').forEach(t=>{
    t.style.cssText='border-collapse:collapse;width:100%;margin:8pt 0;';
    t.querySelectorAll('td,th').forEach(cell=>{
      cell.style.border='1pt solid #bbb';
      cell.style.padding='5pt 7pt';
    });
    t.querySelectorAll('th').forEach(th=>{ th.style.background='#f0eefc'; th.style.fontWeight='bold'; });
  });

  const content=clone.innerHTML;

  const h=`<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1{size:8.5in 11in;margin:1in 1in 1in 1in;mso-header-margin:.5in;mso-footer-margin:.5in;mso-paper-source:0;}
div.WordSection1{page:WordSection1;}
body{font-family:Calibri,Arial,sans-serif;font-size:12pt;line-height:1.5;color:#111;margin:0;padding:0;}
p{margin:3pt 0;mso-margin-top-alt:auto;mso-margin-bottom-alt:auto;}
h1{font-size:18pt;font-weight:bold;margin:12pt 0 6pt;border-bottom:1pt solid #ccc;padding-bottom:3pt;}
h2{font-size:14pt;font-weight:bold;margin:10pt 0 5pt;}
h3{font-size:12pt;font-weight:bold;margin:8pt 0 4pt;}
ul,ol{margin:6pt 0 6pt 18pt;padding:0;}
li{margin:2pt 0;}
blockquote{border-left:3pt solid #6d5acd;padding-left:10pt;margin:8pt 0;color:#444;font-style:italic;}
pre{font-family:'Courier New',monospace;font-size:10pt;background:#f5f5f5;padding:8pt;border:1pt solid #ddd;margin:8pt 0;white-space:pre-wrap;display:block;}
code{font-family:'Courier New',monospace;font-size:10pt;background:#f0f0f0;padding:0 3pt;}
table{border-collapse:collapse;width:100%;margin:8pt 0;}
th{background:#f0eefc;font-weight:bold;padding:5pt 7pt;border:1pt solid #bbb;text-align:left;}
td{padding:5pt 7pt;border:1pt solid #bbb;}
img{max-width:468pt;width:auto;height:auto;display:block;mso-wrap-style:square;}
.ssp-img-wrap{margin:10pt 0;display:block;page-break-inside:avoid;}
a{color:#4060cc;}
hr{border:0;border-top:1pt solid #ccc;margin:10pt 0;}
mark,.ssp-hl{background:#fde68a;}
</style></head>
<body><div class='WordSection1'>
<p style='border-bottom:2pt solid #5b6ef5;padding-bottom:4pt;margin-bottom:3pt;'><span style='font-size:20pt;font-weight:bold;'>${esc(title)}</span></p>
<p style='color:#888;font-size:9pt;margin-bottom:12pt;'>Exported ${new Date().toLocaleString()} &middot; StudySnap Pro</p>
${content}
</div></body></html>`;

  downloadBlob(new Blob(['﻿',h],{type:'application/msword'}),`${safeFilename(title)}.doc`);
  showToast('Word doc saved ✓','success');
}

function htmlToMd(node){
  let o='';
  for(const c of node.childNodes){
    if(c.nodeType===3){o+=c.textContent;continue}
    if(c.nodeType!==1)continue;
    const tag=c.tagName.toLowerCase(),inner=htmlToMd(c).trim();
    switch(tag){
      case'h1':o+=`\n# ${inner}\n\n`;break;case'h2':o+=`\n## ${inner}\n\n`;break;case'h3':o+=`\n### ${inner}\n\n`;break;
      case'p':o+=`${inner}\n\n`;break;
      case'strong':case'b':o+=`**${inner}**`;break;case'em':case'i':o+=`_${inner}_`;break;
      case's':case'strike':o+=`~~${inner}~~`;break;case'u':o+=`<u>${inner}</u>`;break;
      case'code':o+=`\`${c.textContent}\``;break;case'pre':o+=`\`\`\`\n${c.textContent.trim()}\n\`\`\`\n\n`;break;
      case'blockquote':o+=`> ${inner}\n\n`;break;
      case'ul':for(const li of c.querySelectorAll(':scope>li'))o+=`- ${htmlToMd(li).trim()}\n`;o+='\n';break;
      case'ol':[...c.querySelectorAll(':scope>li')].forEach((li,i)=>{o+=`${i+1}. ${htmlToMd(li).trim()}\n`});o+='\n';break;
      case'a':o+=`[${inner}](${c.getAttribute('href')})`;break;
      case'img':o+=`\n![image](embedded)\n\n`;break;
      case'hr':o+=`\n---\n\n`;break;case'br':o+='\n';break;
      case'table':{const rows=[...c.querySelectorAll('tr')];rows.forEach((row,ri)=>{const cells=[...row.querySelectorAll('th,td')].map(c=>htmlToMd(c).trim());o+='| '+cells.join(' | ')+' |\n';if(ri===0)o+='| '+cells.map(()=>'---').join(' | ')+' |\n'});o+='\n';break}
      default:o+=inner;
    }
  }
  return o;
}

function exportMarkdown(){
  const title=getEditorTitle();
  const md=`# ${title}\n\n> Exported ${new Date().toLocaleDateString()} · StudySnap Pro\n\n${htmlToMd(editor).replace(/\n{3,}/g,'\n\n').trim()}\n`;
  downloadBlob(new Blob([md],{type:'text/markdown;charset=utf-8'}),`${safeFilename(title)}.md`);
  showToast('Markdown saved ✓','success');
}

function exportText(){
  const title=getEditorTitle();
  downloadBlob(new Blob([`${title}\n${'='.repeat(Math.min(title.length,60))}\n\n${editor.innerText.trim()}\n`],{type:'text/plain;charset=utf-8'}),`${safeFilename(title)}.txt`);
  showToast('Text file saved ✓','success');
}

async function backupAll(){
  const data=await exportAllData();
  downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`studysnap-backup-${new Date().toISOString().slice(0,10)}.json`);
  showToast(`${data.notes.length} notes backed up ✓`,'success');
}

const settingsDrawer=document.getElementById('settings-drawer');
const settingsOverlay=document.getElementById('settings-overlay');
document.getElementById('settings-btn').addEventListener('click',()=>{settingsDrawer.classList.remove('hidden');settingsOverlay.classList.remove('hidden');listNotes().then(n=>{document.getElementById('stat-notes').textContent=n.length;document.getElementById('stat-words').textContent=n.reduce((s,x)=>s+(x.wordCount||0),0).toLocaleString()});renderToolbarToolSettings()});
document.getElementById('settings-close').addEventListener('click',closeSettings);
settingsOverlay.addEventListener('click',closeSettings);
function closeSettings(){settingsDrawer.classList.add('hidden');settingsOverlay.classList.add('hidden')}

async function applyTheme(t){document.documentElement.setAttribute('data-theme',t);document.querySelectorAll('.th-o').forEach(b=>b.classList.toggle('active',b.dataset.theme===t));await setSetting('theme',t)}
document.querySelectorAll('.th-o').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.theme)));

editor.style.fontSize='15px';

function applyDocFontSize(px){
  editor.style.fontSize=px+'px';
  document.querySelectorAll('.fsize-preset').forEach(b=>b.classList.toggle('active',+b.dataset.px===px));
}
document.querySelectorAll('.fsize-preset').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    const px=+btn.dataset.px;
    applyDocFontSize(px);
    await setSetting('docFontSize',px);
  });
});

async function applyToolbarConfig() {
  await SSPEditor.applyToolbarVisibility('panel');
}

function renderToolbarToolSettings() {
  const container = document.getElementById('toolbar-tools-settings');
  if (!container) return;
  SSPEditor.renderToolbarSettings(container, applyToolbarConfig);
}

document.getElementById('font-select').addEventListener('change',async e=>{
  const map={serif:'"Crimson Pro",Georgia,serif',sans:'Inter,sans-serif',mono:'"JetBrains Mono",monospace'};
  editor.style.fontFamily=map[e.target.value]||'';await setSetting('fontFamily',e.target.value);
});

document.getElementById('spellcheck-toggle').addEventListener('change',function(){editor.spellcheck=this.checked});

document.getElementById('clear-note-btn').addEventListener('click',async()=>{const ok=await doConfirm('Clear note?','All content will be deleted.','Clear');if(!ok)return;editor.innerHTML='<p><br></p>';await persistNote();updateWordCount();closeSettings();showToast('Cleared','success')});

document.getElementById('backup-btn').addEventListener('click',()=>{closeSettings();backupAll()});
document.getElementById('restore-btn2').addEventListener('click',()=>{closeSettings();document.getElementById('restore-input2').click()});
document.getElementById('restore-input2').addEventListener('change',async function(){const f=this.files[0];this.value='';if(!f)return;try{const p=JSON.parse(await f.text());const{noteCount}=await importAllData(p);showToast(`Restored ${noteCount} notes ✓`,'success');renderNotesList()}catch(_){showToast('Invalid file.','error')}});

document.getElementById('delete-all-btn').addEventListener('click',async()=>{
  const ok=await doConfirm('Delete ALL notes?','This cannot be undone.','Delete Everything');
  if(!ok)return;
  const all=await listNotes();for(const n of all)await deleteNote(n.id);
  const allGrp=await listGroups();for(const g of allGrp)await deleteGroup(g.id);
  currentNoteId=null;closeSettings();await checkActiveVideo();showToast('All notes and categories deleted.','success')
});

document.getElementById('history-btn').addEventListener('click',()=>chrome.runtime.sendMessage({action:'OPEN_HISTORY_PAGE'}));
document.getElementById('info-history-btn')?.addEventListener('click',()=>chrome.runtime.sendMessage({action:'OPEN_HISTORY_PAGE'}));

let ownTabId = null;

document.addEventListener('DOMContentLoaded',async()=>{
  await initDB();
  const theme=await getSetting('theme','dark');applyTheme(theme);
  await applyToolbarConfig();
  const ff=await getSetting('fontFamily','serif');
  const fm={serif:'"Crimson Pro",Georgia,serif',sans:'Inter,sans-serif',mono:'"JetBrains Mono",monospace'};
  editor.style.fontFamily=fm[ff]||fm.serif;
  const fsel=document.getElementById('font-select');if(fsel)fsel.value=ff;

  const tab=await getActiveTab();
  ownTabId = tab?.id ?? null;
  if(ownTabId) chrome.runtime.sendMessage({action:'PANEL_OPENED',tabId:ownTabId}).catch(()=>{});

  const docFontSize=await getSetting('docFontSize',15);
  applyDocFontSize(docFontSize);

  await checkActiveVideo();
  setInterval(checkActiveVideo,2000);
});

function reportPanelClosed(){
  if(ownTabId) chrome.runtime.sendMessage({action:'PANEL_CLOSED',tabId:ownTabId}).catch(()=>{});
}
window.addEventListener('beforeunload',()=>{clearTimeout(saveTimer);if(currentNoteId){if(noteHasContent(editor.innerHTML)){persistNote()}else{loadNote(currentNoteId).then(existing=>{if(existing)deleteNote(currentNoteId)})}}reportPanelClosed()});
window.addEventListener('pagehide',reportPanelClosed);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'PING_PANEL') { sendResponse(true); return true; }
  if (msg.action === 'CLOSE_PANEL_REQUEST' && (!msg.tabId || msg.tabId===ownTabId)) {
    reportPanelClosed();
    window.close();
  }
});
