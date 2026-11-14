import {auth,active} from './cloud.js';
import {Draft,cleanPayload} from './sync-store.js';
if(active()){
 const api=window.TDNExam,bar=document.createElement('div');bar.className='exam-cloud';bar.style.cssText='padding:8px;display:flex;gap:8px;align-items:center;background:#172233;color:#c8d7ee;font-size:12px';
 const status=document.createElement('span');status.textContent='Đang mở bài làm cloud…';bar.append(status);
 const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;bar.append(b);return b;};
 bar.style.flexShrink='0';bar.style.flexWrap='wrap';document.querySelector('main').prepend(bar);let draft,ticket=0,loading=false;
 const completed=document.createElement('input');completed.type='checkbox';const completeLabel=document.createElement('label');completeLabel.textContent='Hoàn thành ';completeLabel.append(completed);bar.append(completeLabel);
 const payload=()=>({...api.payload(),completed:completed.checked});
 completed.onchange=()=>window.dispatchEvent(new Event('tdn-exam-dirty'));
 const conflicts=document.createElement('span');conflicts.hidden=true;
 const apply=p=>{const was=loading;loading=true;completed.checked=!!p.completed;api.apply(p);last=JSON.stringify(payload());loading=was;};
 const resolve=async local=>{try{apply(await draft.resolve(local));conflicts.hidden=true;}catch(e){report('Không lưu được bản xung đột · Hãy xuất file trước: '+e.message);}};
 const local=button('Giữ bản máy',()=>void resolve(true));
 const remote=button('Dùng bản cloud',()=>void resolve(false));
 bar.append(conflicts);conflicts.append(local,remote);
 let last='';
 const report=text=>{status.textContent=text;conflicts.hidden=!draft?.conflict;};
 button('Lưu cloud',()=>void draft?.flush());
 button('Nhập bài làm trên thiết bị này',async()=>{if(!confirm('Nhập code của bài đang mở từ dữ liệu local cũ? Chat sẽ không được đưa lên cloud.'))return;try{const raw=JSON.parse(localStorage.getItem('tdn-ai-workspace-v2')||'null')?.workspaces?.[api.id()];if(!raw)throw Error('Không tìm thấy bài local cũ.');api.apply({files:raw.files,activeFile:raw.activeFile});draft.change(api.payload());await draft.flush();}catch(e){report(e.message);}});
 async function open(){
  const version=++ticket;loading=true;api.lock(true);if(draft){void draft.flush();draft.close();}const item=api.id(),d=new Draft('exam',item,report);draft=d;
  try{const p=await d.open();if(ticket!==version){d.close();return;}completed.checked=!!p.completed;if(p.files)apply(p);report(d.conflict?'Xung đột · Chọn bản cần giữ':d.entry.dirty?'Bản máy chưa đồng bộ':'Đã mở bài làm');void d.flush();}
  catch(e){report(e.message);}finally{if(ticket===version){last=JSON.stringify(payload());loading=false;api.lock(false);}}
 }
 window.addEventListener('tdn-exam-dirty',()=>{if(!loading&&draft?.item===api.id()){const p=payload(),raw=JSON.stringify(p);if(raw!==last){last=raw;draft.change(p);}}});
 window.addEventListener('tdn-exam-selected',()=>void open());
 window.addEventListener('pagehide',()=>draft?.checkpoint());void open();
}
