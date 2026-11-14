import {auth,init,active} from './cloud.js';
import {Draft} from './sync-store.js';
const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn)=>{const b=node('button',label,'button');b.type='button';b.onclick=fn;return b;};
let root,request,draft,selected=null,currentPayload={},generation=0,page=0,query='',mounted=false,searchTimer;
let list,viewer,editor,notes,link,complete,status,conflicts,resources,resourcePage=0,cells,assist,mode,rightPane,chooser;
function report(text){status.textContent=text;conflicts.hidden=!draft?.conflict;}
function snapshot(){return {files:{[mode.value==='notebook'?'notebook.ipynb':'main.py']:mode.value==='notebook'?JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python3',display_name:'Python 3',language:'python'}},cells:cells.map(c=>({cell_type:c.kind,metadata:{},source:c.text,...(c.kind==='code'?{outputs:[],execution_count:null}:{})}))}):cells[0]?.text||''},notes:notes.value,notebookUrl:link.value,completed:complete.checked};}
function changed(){if(!draft)return;try{currentPayload=snapshot();draft.change(currentPayload);}catch(e){report(e.message);}}
function setPayload(p={}){
 currentPayload=p;const file=p.files?.['notebook.ipynb'];mode.value=file?'notebook':'python';
 if(file){const d=window.TDNCore.parseNotebook(file);cells=d.cells.map(c=>({kind:c.cell_type==='markdown'?'markdown':'code',text:window.TDNCore.sourceOf(c)}));}
 else cells=[{kind:'code',text:p.files?.['main.py']||'# Viết code Python của bạn tại đây\n'}];
 if(!cells.length)cells=[{kind:'code',text:''}];notes.value=p.notes||'';link.value=p.notebookUrl||'';complete.checked=!!p.completed;drawCells();
}
function drawCells(){
 editor.replaceChildren();cells.forEach((cell,index)=>{
  const box=node('section','','study-cell'),bar=node('div','','study-tools');
  if(mode.value==='notebook'){
   const kind=document.createElement('select');for(const k of ['code','markdown']){const o=node('option',k);o.value=k;kind.append(o);}kind.value=cell.kind;kind.onchange=()=>{cell.kind=kind.value;changed();drawCells();};bar.append(kind,button('↑',()=>{if(index){[cells[index-1],cells[index]]=[cells[index],cells[index-1]];changed();drawCells();}}),button('↓',()=>{if(index<cells.length-1){[cells[index+1],cells[index]]=[cells[index],cells[index+1]];changed();drawCells();}}),button('Xóa ô',()=>{if(cells.length>1){cells.splice(index,1);changed();drawCells();}}));
  }
  const overlay=node('div','','study-code'),pre=node('pre','','study-highlight'),area=document.createElement('textarea');area.value=cell.text;area.spellcheck=false;area.setAttribute('aria-label','Mã Python ô '+(index+1));
  const paint=()=>{pre.innerHTML=cell.kind==='code'?window.TDNCore.highlight(area.value+'\n'):window.TDNCore.escape(area.value+'\n');area.style.height=Math.min(650,Math.max(180,(area.value.split('\n').length+1)*23))+'px';};
  area.oninput=()=>{cell.text=area.value;paint();changed();};area.onscroll=()=>{pre.scrollTop=area.scrollTop;pre.scrollLeft=area.scrollLeft;};
  const hints=node('div','','study-hints');hints.hidden=true;
  area.onkeydown=e=>{
   if(e.key==='Escape')hints.hidden=true;
   if(e.key==='Tab'){e.preventDefault();area.setRangeText('    ',area.selectionStart,area.selectionEnd,'end');area.dispatchEvent(new Event('input'));}
   if(assist.checked&&e.ctrlKey&&e.code==='Space'){e.preventDefault();hints.replaceChildren();for(const s of ['nn.Linear(in_features=, out_features=, bias=True)','import pandas as pd','import numpy as np','from sklearn.model_selection import train_test_split'])hints.append(button(s,()=>{area.setRangeText(s,area.selectionStart,area.selectionEnd,'end');area.dispatchEvent(new Event('input'));hints.hidden=true;area.focus();}));hints.hidden=false;}
  };
  paint();overlay.append(pre,area);box.append(bar,overlay,hints);editor.append(box);
 });
}
async function sessions(){
 const version=generation;list.textContent='Đang tải…';
 let q=auth.client.from('sessions').select('*',{count:'exact'}).order('id').range(page*30,page*30+29).abortSignal(request.signal);
 if(query)q=/^\d+$/.test(query.trim())?q.eq('id',Number(query)):q.ilike('title','%'+query.replace(/[%_*(),.]/g,'').slice(0,80)+'%');
 const {data,error,count}=await q;if(version!==generation||!mounted)return;if(error){list.textContent=error.message;return;}
 list.replaceChildren();for(const row of data)list.append(button(`Buổi ${row.id} · ${row.title}`,()=>void select(row).catch(e=>report(e.message))));
 list.append(button('←',()=>{if(page){page--;void sessions();}}),node('span',` ${page+1} / ${Math.max(1,Math.ceil(count/30))} `),button('→',()=>{if((page+1)*30<count){page++;void sessions();}}),button('Tài liệu chưa phân loại',()=>void select({id:0,title:'Chưa phân loại'}).catch(e=>report(e.message))));
}
async function loadResources(){
 const version=generation,item=selected;resources.textContent='Đang tải học liệu…';let q=auth.client.from('lessons').select('*',{count:'exact'}).order('sort_order').order('id').range(resourcePage*30,resourcePage*30+29).abortSignal(request.signal);
 q=item.id?q.eq('session_no',item.id):q.is('session_no',null);
 const {data,error,count}=await q;if(!mounted||version!==generation||selected!==item)return;
 if(error){resources.textContent=error.message;return;}
 resources.replaceChildren();for(const file of data)resources.append(button(file.title,()=>openResource(file)));
 if(!data.length)resources.append(node('p','Chưa có học liệu được ghép với buổi này.'));
 resources.append(button('← Tài liệu',()=>{if(resourcePage){resourcePage--;void loadResources();}}),node('span',`${resourcePage+1}/${Math.max(1,Math.ceil(count/30))}`),button('Tài liệu →',()=>{if((resourcePage+1)*30<count){resourcePage++;void loadResources();}}));
}
function openResource(file){viewer.replaceChildren();const url='https://drive.google.com/file/d/'+encodeURIComponent(file.drive_id);const a=node('a','Mở trên Drive ↗','button');a.href=url+'/view';a.target='_blank';a.rel='noopener noreferrer';viewer.append(a,node('p','Nếu khung yêu cầu quyền truy cập, mở Drive và đăng nhập bằng tài khoản được chia sẻ.'));
 if(/^(video\/|application\/pdf|application\/vnd.google-apps)/.test(file.mime)){const frame=document.createElement('iframe');frame.title=file.title;frame.src=url+'/preview';frame.allow='fullscreen';viewer.append(frame);}
 else viewer.append(node('p','Tải hoặc mở tài liệu trên Drive để xem định dạng này.'));
}
async function select(row){
 const id=++generation;rightPane.inert=true;notes.disabled=true;complete.disabled=true;
 if(draft){await draft.flush();draft.close();}if(!mounted||id!==generation)return;
 selected=row;resourcePage=0;viewer.replaceChildren();report('Đang mở buổi '+row.id);
 const d=new Draft('lesson','session-'+row.id,report);draft=d;const p=await d.open();if(id!==generation||!mounted){d.close();return;}
 setPayload(p);rightPane.inert=false;notes.disabled=false;complete.disabled=false;chooser.open=false;chooser.querySelector('summary').textContent='Buổi '+row.id+' · '+row.title;conflicts.hidden=!d.conflict;report(d.conflict?'Xung đột · Chọn bản cần giữ':d.entry.dirty?'Bản máy chưa đồng bộ':'Đã mở buổi '+row.id);void d.flush();await loadResources();
}
function download(){const p=snapshot(),filename=Object.keys(p.files)[0],blob=new Blob([p.files[filename]],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='buoi-'+(selected?.id||'draft')+'-'+filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export async function mount(container){
 root=container;await init();root.replaceChildren();if(!active()){root.append(node('h2','Vừa Học Vừa Code'),node('p',!auth.configured?'Chưa cấu hình tài khoản. Gallery và Learning Lab vẫn dùng được.':auth.user?'Tài khoản cần được admin duyệt để mở khu vực này.':'Đăng nhập Google ở thanh đầu trang để lưu bài làm và học cùng code.'));return;}
 mounted=true;generation++;request=new AbortController();await import('./notebook-core.js');if(!mounted)return;
 const toolbar=node('div','','study-tools'),search=document.createElement('input');search.placeholder='Tìm trong syllabus';search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=search.value;page=0;chooser.open=true;void sessions();},200);};
 toolbar.append(search,button('Tải lại danh sách',()=>void sessions()));
 const syllabus=node('a','Syllabus ↗','button');syllabus.href='https://docs.google.com/spreadsheets/d/1DubppuvJggRWD8GDYrZy6DakNv4VfeQw5oM2k1YJxnY/edit';syllabus.target='_blank';syllabus.rel='noopener noreferrer';toolbar.append(syllabus);
 const mobile=node('div','','study-mobile');mobile.append(button('Học liệu',()=>root.dataset.panel='lesson'),button('Code',()=>root.dataset.panel='code'));root.dataset.panel='lesson';
 const layout=node('div','','study-layout'),left=node('section','','study-left'),right=node('section','','study-right'),divider=node('div','','study-divider');divider.setAttribute('role','separator');divider.setAttribute('aria-label','Đổi độ rộng hai khung');divider.tabIndex=0;
 const width=x=>layout.style.setProperty('--left',Math.max(25,Math.min(70,x))+'%');divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);};divider.onpointermove=e=>{if(divider.hasPointerCapture(e.pointerId)){const r=layout.getBoundingClientRect();width((e.clientX-r.left)/r.width*100);}};divider.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width(parseFloat(layout.style.getPropertyValue('--left')||'48')+(e.key==='ArrowLeft'?-3:3));}};
 list=node('div','','study-list');chooser=node('details','','study-chooser');chooser.open=true;chooser.append(node('summary','Chọn buổi học'),list);resources=node('div','','study-resources');viewer=node('div','','study-viewer');notes=document.createElement('textarea');notes.disabled=true;notes.placeholder='Ghi chú riêng';notes.setAttribute('aria-label','Ghi chú riêng');notes.oninput=changed;complete=document.createElement('input');complete.type='checkbox';complete.disabled=true;complete.onchange=changed;const label=node('label','Đánh dấu hoàn thành ');label.append(complete);left.append(chooser,resources,viewer,label,notes);
 status=node('p','Chọn một buổi để bắt đầu','status');conflicts=node('div');conflicts.hidden=true;const resolve=async local=>{try{setPayload(await draft.resolve(local));conflicts.hidden=true;report(local?'Đang lưu bản máy…':'Đã dùng bản cloud; bản cũ được giữ trên thiết bị.');}catch(e){report('Không lưu được bản xung đột · Hãy xuất file trước: '+e.message);}};conflicts.append(button('Giữ bản máy',()=>void resolve(true)),button('Dùng bản cloud',()=>void resolve(false)));
 mode=document.createElement('select');for(const [value,title] of [['python','Python'],['notebook','Notebook']]){const o=node('option',title);o.value=value;mode.append(o);}mode.onchange=()=>{if(mode.value==='python')cells=[{kind:'code',text:cells.map(c=>c.kind==='code'?c.text:c.text.split('\n').map(l=>'# '+l).join('\n')).join('\n\n')}];changed();drawCells();};
 assist=document.createElement('input');assist.type='checkbox';const assistLabel=node('label','Gợi ý (Ctrl+Space) ');assistLabel.append(assist);
 const file=document.createElement('input');file.type='file';file.accept='.py,.ipynb';file.setAttribute('aria-label','Nhập Python hoặc notebook');file.onchange=async()=>{try{const f=file.files[0];if(!f||f.size>1000000)throw Error('File tối đa 1 MB.');const text=await f.text();setPayload({...snapshot(),files:{[f.name.endsWith('.ipynb')?'notebook.ipynb':'main.py']:text}});changed();}catch(e){report(e.message);}};
 const tools=node('div','','study-tools');tools.append(mode,assistLabel,button('+ Code',()=>{if(cells.length>=300)return report('Tối đa 300 ô.');mode.value='notebook';cells.push({kind:'code',text:''});changed();drawCells();}),button('+ Markdown',()=>{if(cells.length>=300)return;mode.value='notebook';cells.push({kind:'markdown',text:''});changed();drawCells();}),button('Lưu ngay',()=>void draft?.flush()),button('Xuất file',download),file);
 link=document.createElement('input');link.type='url';link.placeholder='Link Colab/Kaggle riêng cho buổi này';link.setAttribute('aria-label','Notebook Colab hoặc Kaggle');link.oninput=changed;
 const external=node('div','','study-tools');external.append(link,button('Mở notebook riêng ↗',()=>{try{const u=new URL(link.value);if(u.protocol!=='https:'||!['colab.research.google.com','www.kaggle.com','kaggle.com'].includes(u.hostname)||u.username||u.password)throw Error('Dùng link HTTPS Colab hoặc Kaggle.');window.open(u.href,'_blank','noopener,noreferrer');}catch(e){report(e.message);}}));
 editor=node('div','','study-editor');rightPane=right;right.append(tools,node('p','Soạn tại đây; xuất/nhập .ipynb để chạy trên Colab hoặc Kaggle.','muted'),external,status,conflicts,editor);layout.append(left,divider,right);root.append(toolbar,mobile,layout);setPayload();right.inert=true;
 await sessions();
}
export function unmount(){mounted=false;generation++;request?.abort();clearTimeout(searchTimer);viewer?.replaceChildren();if(draft){void draft.flush();draft.close();draft=null;}root?.replaceChildren();selected=null;}
window.addEventListener('pagehide',()=>draft?.checkpoint());
document.addEventListener('visibilitychange',()=>{if(document.hidden){draft?.checkpoint();viewer?.replaceChildren();}});
