import {auth,active} from './cloud.js';
import {readCache,writeCache} from './draft-cache.js';
export const byteSize=v=>new TextEncoder().encode(JSON.stringify(v)).length;
export function cleanPayload(value){
 const p=structuredClone(value);delete p.messages;delete p.submissions;
 if(p.files)for(const [name,raw] of Object.entries(p.files))if(name.endsWith('.ipynb')){
  const n=JSON.parse(raw);for(const c of n.cells||[]){delete c.attachments;if(c.cell_type==='code'){c.outputs=[];c.execution_count=null;}}
  p.files[name]=JSON.stringify(n);
 }
 return p;
}
export class Draft {
 constructor(scope,item,onStatus=()=>{}){this.scope=scope;this.item=item;this.status=onStatus;this.user=auth.user?.id;this.key=`tdn-draft:${this.user}:${scope}:${item}`;this.timer=null;this.saving=null;this.closed=false;this.entry={payload:{},revision:0,dirty:false,seq:0};this.online=()=>{if(!this.closed)void this.flush()};window.addEventListener('online',this.online);}
 checkpoint(){const value=structuredClone(this.entry);this.cached=writeCache(this.key,value).catch(()=>{this.status('Bộ nhớ máy đầy · Hãy xuất bài làm');});return this.cached;}
 async open(){
  try{const local=await readCache(this.key);if(local)this.entry=local;}catch{this.status('Không đọc được cache; hãy giữ bản xuất riêng.');}
  if(!active())return this.entry.payload;
  if(globalThis.navigator?.onLine===false){this.status('Đang lưu trên máy · Chờ kết nối mạng');return this.entry.payload;}
  try{
   const {data,error}=await auth.client.from('workspaces').select('payload,revision').eq('user_id',this.user).eq('scope',this.scope).eq('item_id',this.item).maybeSingle();if(error)throw error;
   if(this.entry.dirty){if((data?.revision||0)!==this.entry.revision){this.conflict=data||{payload:{},revision:0};this.status('Xung đột · Chọn bản cần giữ');}else this.status('Bản trên máy chưa đồng bộ');}
   else if(data)this.entry={payload:data.payload,revision:data.revision,dirty:false,seq:0};
   this.checkpoint();
  }catch(e){this.status('Đang lưu trên máy · '+e.message);}
  return this.entry.payload;
 }
 change(payload){if(this.closed)return;this.entry.payload=cleanPayload(payload);this.entry.seq++;this.entry.dirty=true;this.checkpoint();this.status('Đang lưu trên máy');clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),2000);}
 async flush(){
  clearTimeout(this.timer);if(this.closed||!this.entry.dirty||!active()||auth.user?.id!==this.user||this.conflict)return;
  if(this.saving)return this.saving;
  if(byteSize(this.entry.payload)>1000000){this.status('Vượt 1 MB · Giữ bản máy, hãy xuất file');return;}
  const seq=this.entry.seq,payload=structuredClone(this.entry.payload);this.status('Đang lưu…');
  this.saving=(async()=>{try{
   const {data,error}=await auth.client.rpc('save_workspace',{p_scope:this.scope,p_item:this.item,p_payload:payload,p_revision:this.entry.revision});if(error)throw error;
   this.entry.revision=data.revision;if(seq===this.entry.seq)this.entry.dirty=false;
   this.checkpoint();this.status(this.entry.dirty?'Còn thay đổi chưa đồng bộ':'Đã đồng bộ');
  }catch(e){if(e.message?.includes('REVISION_CONFLICT')){
   const {data,error}=await auth.client.from('workspaces').select('payload,revision').eq('user_id',this.user).eq('scope',this.scope).eq('item_id',this.item).maybeSingle();
   if(!error){this.conflict=data||{payload:{},revision:0};this.status('Xung đột · Chọn bản cần giữ');}else this.status('Đang lưu trên máy · '+error.message);
  }else this.status('Đang lưu trên máy · '+e.message);}
  finally{this.saving=null;if(this.entry.dirty&&!this.conflict&&!this.closed&&seq!==this.entry.seq)this.timer=setTimeout(()=>void this.flush(),2000);}})();return this.saving;
 }
 async resolve(useLocal){if(!this.conflict)return;await writeCache(this.key+':conflict:'+Date.now(),structuredClone(this.entry));const remote=this.conflict;this.conflict=null;this.entry.revision=remote.revision;if(!useLocal){this.entry.payload=remote.payload;this.entry.dirty=false;}await this.checkpoint();if(useLocal)void this.flush();return this.entry.payload;}
 close(){clearTimeout(this.timer);this.checkpoint();this.closed=true;window.removeEventListener('online',this.online);}
}
