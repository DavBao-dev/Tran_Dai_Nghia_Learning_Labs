import {ready as accountReady} from './account-ui.js';
let studyModule;
const $=s=>document.querySelector(s);
const local=['127.0.0.1','localhost'].includes(location.hostname)&&location.protocol==='http:';
const params=new URLSearchParams(location.search),port=params.get('gatewayPort');
const api=local&&port&&/^\d{1,5}$/.test(port)&&Number(port)>0&&Number(port)<65536?'http://127.0.0.1:'+Number(port):location.origin;
let built=[],custom=[],catalogPromise,view='',topic='',page=0,searchTimer,labModule,examFrame,blobUrl,readerRequest,noticeTimer,torchFrame;
const retiringFrames=new Map();
function startTorch(){
 if(torchFrame||document.hidden)return;
 const frame=document.createElement('iframe');frame.title='TorchViz 3D · Trực quan hóa mô hình';frame.src='torchviz/index.html';frame.allow='fullscreen';torchFrame=frame;$('#torchvizMount').append(frame);
}
function stopTorch(){
 const frame=torchFrame;if(!frame)return;torchFrame=null;frame.hidden=true;
 const win=frame.contentWindow;const timer=setTimeout(()=>{retiringFrames.delete(win);frame.remove();},700);retiringFrames.set(win,{frame,timer});win?.postMessage({type:'tdn-stop-3d'},location.origin);
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 if(event.data?.type==='tdn-3d-stopped'){const entry=retiringFrames.get(event.source);if(entry){clearTimeout(entry.timer);entry.frame.remove();retiringFrames.delete(event.source);}}
 if(event.source===torchFrame?.contentWindow&&event.data?.type==='tdn-exit-3d')location.hash='gallery';
});
const PAGE_SIZE=9;
const glyphs=[
'<path d="M25 75L65 53 105 66 150 28 190 17" fill="none" stroke="currentColor" stroke-width="2"/><path d="M25 15V82H190" fill="none" stroke="currentColor" opacity=".3"/><g fill="currentColor"><circle cx="65" cy="53" r="4"/><circle cx="105" cy="66" r="4"/><circle cx="150" cy="28" r="4"/></g>',
'<g fill="none" stroke="currentColor" opacity=".45"><path d="M45 22L105 16 165 35M45 22L105 50 165 35M45 50L105 16M45 50L105 50 165 70M45 78L105 50M45 78L105 84 165 70M105 84L165 35"/></g><g fill="currentColor"><circle cx="45" cy="22" r="7"/><circle cx="45" cy="50" r="7"/><circle cx="45" cy="78" r="7"/><circle cx="105" cy="16" r="7"/><circle cx="105" cy="50" r="7"/><circle cx="105" cy="84" r="7"/><circle cx="165" cy="35" r="7"/><circle cx="165" cy="70" r="7"/></g>',
'<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M47 23L105 8 163 23 105 40Z"/><path d="M47 23V63L105 86 163 63V23M105 40V86M47 43L105 64 163 43" opacity=".6"/><path d="M77 15L135 32V75M133 15L77 32V75" opacity=".4"/></g>',
'<g stroke="currentColor" fill="none" stroke-width="1.5"><rect x="53" y="12" width="106" height="78" rx="6"/><path d="M77 33H138M77 50H138M77 67H116" opacity=".6"/></g>'
];
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,5000);}
async function jsonFetch(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),options.body?30000:4000);
 try{const response=await fetch(api+path,{...options,signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...($('#adminKey').value?{Authorization:'Bearer '+$('#adminKey').value}:{})}});const data=await response.json();if(!response.ok)throw Error(data.error||'Không kết nối được Gallery.');return data;}
 catch(e){if(e.name==='AbortError')throw Error('Gateway chưa phản hồi. Mở lại launcher bản mới.');throw e;}finally{clearTimeout(timer);}
}
function all(){return [...built,...custom];}
async function loadCatalog(){
 if(!catalogPromise)catalogPromise=fetch('learning/catalog.json').then(r=>{if(!r.ok)throw Error('Không tải được thư viện VAIO.');return r.json();}).then(data=>{built=data;return data;}).catch(e=>{catalogPromise=null;throw e;});
 return catalogPromise;
}
async function refreshCustom(){
 if(!local)return;
 try{const data=await jsonFetch('/api/learning/catalog');custom=data.items;$('#galleryStatus').textContent='';if(view==='gallery')renderGallery();renderCustom();}
 catch(e){$('#galleryStatus').textContent='17 tài liệu VAIO có sẵn. Muốn thêm tài liệu, hãy chạy launcher mới trên máy local.';}
}
function topics(){const names=[...new Set(all().map(i=>i.topic))].sort();$('#topics').replaceChildren();for(const name of ['',...names]){const b=document.createElement('button');b.textContent=name||'Tất cả';b.setAttribute('aria-pressed',String(topic===name));b.onclick=()=>{topic=name;page=0;renderGallery();};$('#topics').append(b);}$('#topicOptions').replaceChildren(...names.map(name=>{const o=document.createElement('option');o.value=name;return o;}));}
function size(bytes){return bytes>=1e6?(bytes/1e6).toFixed(1)+' MB':Math.ceil(bytes/1000)+' KB';}
function card(item,index){
 const el=document.createElement('article');el.className='card';el.dataset.topic=item.topic;
 const art=document.createElement('div');art.className='card-art';art.setAttribute('aria-hidden','true');const n=['Machine Learning','Deep Learning','Toán nền tảng','Ôn thi'].indexOf(item.topic);art.innerHTML='<svg viewBox="0 0 210 100">'+glyphs[n<0?index%4:n]+'</svg>';
 const tag=document.createElement('span');tag.className='tag';tag.textContent=item.kind.toUpperCase();art.append(tag);
 const body=document.createElement('div');body.className='card-body';const label=document.createElement('span');label.className='card-topic';label.textContent=item.topic;
 const h=document.createElement('h2');h.textContent=item.title;const p=document.createElement('p');p.textContent=item.summary;
 const foot=document.createElement('div');foot.className='card-footer';const small=document.createElement('small');small.textContent=item.source+' · '+size(item.bytes);
 const button=document.createElement('button');button.textContent=item.kind==='html'?'Khám phá ↗':'Mở tài liệu ↗';button.setAttribute('aria-label','Mở '+item.title);button.onclick=()=>openReader(item);
 foot.append(small,button);body.append(label,h,p,foot);el.append(art,body);return el;
}
function renderGallery(){
 topics();const query=$('#search').value.trim().toLocaleLowerCase('vi'),format=$('#format').value;
 const list=all().filter(i=>(!topic||i.topic===topic)&&(!format||i.kind===format)&&(!query||[i.title,i.summary,i.topic,i.originalName].join(' ').toLocaleLowerCase('vi').includes(query)));
 const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages-1);
 $('#cards').replaceChildren(...list.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(card));
 if(!list.length){const p=document.createElement('p');p.className='empty';p.textContent='Chưa có tài liệu phù hợp. Thử từ khóa hoặc chủ đề khác.';$('#cards').append(p);}
 $('#count').textContent=list.length+' tài liệu';$('#pageCount').textContent=(page+1)+' / '+pages;$('#prev').disabled=page===0;$('#next').disabled=page===pages-1;
}
async function switchView(next){
 if(!['exam','lab','gallery','study'].includes(next))next='gallery';view=next;
 document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==next);document.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view===next)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(next!=='study')studyModule?.unmount();
 if(next!=='lab'){labModule?.pause?.();stopTorch();}
 if(next==='exam'&&!examFrame){examFrame=document.createElement('iframe');examFrame.title='Môi trường thi AI';examFrame.src='exam.html'+location.search;$('#examMount').append(examFrame);}
 try{
  if(next==='study'){await accountReady;if(view!=='study')return;studyModule=await import('./study.js');if(view==='study')await studyModule.mount($('#studyMount'));}
  if(next==='gallery'){await loadCatalog();if(view!=='gallery')return;renderGallery();void refreshCustom();}
  if(next==='lab'){startTorch();await loadCatalog();if(view!=='lab')return;$('#labResources').replaceChildren(...built.filter(i=>i.kind==='html'&&/cnn_interactive|gan_interactive|transformer|chain-rule|linear-regression-pytorch|decision tree classification/.test(i.originalName)).map(card));}
 }catch(e){notice(e.message);}
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.view;});window.addEventListener('hashchange',()=>switchView(location.hash.slice(1)));
$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=0;renderGallery();},120);};$('#format').onchange=()=>{page=0;renderGallery();};
$('#prev').onclick=()=>{page--;renderGallery();};$('#next').onclick=()=>{page++;renderGallery();};
function cleanReader(){readerRequest?.abort();readerRequest=null;$('#readerBody').replaceChildren();if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null;}}
$('#closeReader').onclick=()=>$('#reader').close();$('#reader').addEventListener('close',cleanReader);
async function openReader(item){
 cleanReader();const controller=new AbortController();readerRequest=controller;$('#readerTitle').textContent=item.title;$('#readerMeta').textContent=item.source+' / '+item.topic;$('#readerBody').textContent='Đang mở tài liệu…';$('#download').hidden=true;
 if(!$('#reader').open)$('#reader').showModal();
 try{
  const url=item.custom?api+item.url:item.url;const response=await fetch(url,{signal:controller.signal,headers:item.custom&&$('#adminKey').value?{Authorization:'Bearer '+$('#adminKey').value}:{}});if(!response.ok)throw Error('Không đọc được tài liệu. Kiểm tra gateway hoặc mã truy cập.');
  const blob=await response.blob();if(controller.signal.aborted)return;
  blobUrl=URL.createObjectURL(blob);$('#download').href=blobUrl;$('#download').download=item.originalName;$('#download').hidden=false;$('#readerBody').replaceChildren();
  if(item.kind==='html'||item.kind==='pdf'){
   const frame=document.createElement('iframe');frame.title=item.title;frame.referrerPolicy='no-referrer';
   if(item.kind==='html'){frame.setAttribute('sandbox','allow-scripts allow-downloads');const text=await blob.text();if(controller.signal.aborted)return;frame.srcdoc=text;}
   else frame.src=blobUrl;$('#readerBody').append(frame);
  }else{
   const text=await blob.text();if(controller.signal.aborted)return;
   if(item.kind==='md'){await import('./notebook-core.js');if(controller.signal.aborted)return;const article=document.createElement('article');article.className='markdown-document';article.innerHTML=window.TDNCore.markdown(text);$('#readerBody').append(article);}
   else {const pre=document.createElement('pre');pre.textContent=text;$('#readerBody').append(pre);if(item.link&&/^https:\/\//.test(item.link)){const a=document.createElement('a');a.href=item.link;a.target='_blank';a.rel='noopener noreferrer';a.className='button link-resource';a.textContent='Mở bài trắc nghiệm ở tab mới ↗';$('#readerBody').append(a);}}
  }
 }catch(e){if(e.name!=='AbortError')$('#readerBody').textContent=e.message;}
}
$('#manage').onclick=()=>{if(!local)return notice('Thêm tài liệu trên bản local bằng Chay-AI-Local.cmd.');$('#adminStatus').textContent='';$('#admin').showModal();void refreshCustom();};$('#closeAdmin').onclick=()=>$('#admin').close();
function renderCustom(){const container=$('#customList div');container.replaceChildren();for(const item of custom){const row=document.createElement('div');row.className='custom-row';const span=document.createElement('span');span.textContent=item.title;const b=document.createElement('button');b.textContent='Xóa';b.onclick=async()=>{if(!confirm('Xóa tài liệu bổ sung “'+item.title+'”?'))return;b.disabled=true;try{await jsonFetch('/api/learning/delete',{method:'POST',body:JSON.stringify({id:item.id})});await refreshCustom();}catch(e){notice(e.message);b.disabled=false;}};row.append(span,b);container.append(row);}if(!custom.length)container.textContent='Chưa có tài liệu bổ sung.';}
$('#uploadForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,file=form.elements.file.files[0];if(!file)return;
 if(file.size>12*1024*1024){$('#adminStatus').textContent='Tệp tối đa 12 MB.';return;}
 $('#saveDocument').disabled=true;$('#adminStatus').textContent='Đang lưu tài liệu…';
 try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Không đọc được tệp.'));reader.readAsDataURL(file);});
 await jsonFetch('/api/learning/add',{method:'POST',body:JSON.stringify({title:form.elements.title.value,topic:form.elements.topic.value,summary:form.elements.summary.value,filename:file.name,data})});
 form.elements.title.value='';form.elements.summary.value='';form.elements.file.value='';$('#adminStatus').textContent='Đã lưu. Tài liệu xuất hiện trong Gallery.';await refreshCustom();
 }catch(e){$('#adminStatus').textContent=e.message;}finally{$('#saveDocument').disabled=false;}
};
$('#quickLabs').addEventListener('toggle',async event=>{if(event.currentTarget.open){try{labModule=await import('./learning/lab.js?v=1');labModule.mount($('#labMount'));}catch(e){notice(e.message);}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){labModule?.pause?.();stopTorch();if($('#reader').open)$('#reader').close();}else if(view==='lab')startTorch();});
void switchView(location.hash.slice(1)||'gallery');
