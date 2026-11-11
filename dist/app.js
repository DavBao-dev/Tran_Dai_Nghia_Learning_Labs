'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'tdn-ai-workspace-v2';
const catalog = [...window.TDN_PROBLEMS];
const emptyWork = p => ({files:{...p.files},activeFile:'notebook.ipynb',messages:[],submissions:[]});
let database={current:'sentiment',workspaces:{},customProblems:[]}, storageAvailable=true;
function cleanWork(raw, definition){
  const result=emptyWork(definition);
  if(!raw || typeof raw!=='object')return result;
  const entries=Object.entries(raw.files||{}).filter(([n,c])=>validName(n)&&typeof c==='string'&&c.length<=2e6);
  if(entries.length)result.files=Object.fromEntries(entries);
  result.activeFile=Object.hasOwn(result.files,raw.activeFile)?raw.activeFile:Object.keys(result.files)[0];
  if(Array.isArray(raw.messages))result.messages=raw.messages.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-100);
  if(Array.isArray(raw.submissions))result.submissions=raw.submissions.filter(s=>s&&typeof s.name==='string'&&typeof s.csv==='string'&&Number.isFinite(s.rows)&&!isNaN(Date.parse(s.time))).slice(0,100);
  if(!Object.hasOwn(result.files,'notebook.ipynb')){result.files['notebook.ipynb']=JSON.stringify(window.TDNCore.fromPython(result.files['baseline.py']||''),null,2);if(result.activeFile==='baseline.py')result.activeFile='notebook.ipynb';}
  return result;
}
try{
  const saved=JSON.parse(localStorage.getItem(KEY));
  if(saved&&typeof saved==='object'){
    if(Array.isArray(saved.customProblems))for(const raw of saved.customProblems){try{const p=validateProblem(raw);if(!catalog.some(c=>c.id===p.id)){catalog.push(p);database.customProblems.push(p);}}catch{}}
    if(saved.workspaces&&typeof saved.workspaces==='object')for(const p of catalog){if(Object.hasOwn(saved.workspaces,p.id))database.workspaces[p.id]=cleanWork(saved.workspaces[p.id],p);}
    if(catalog.some(p=>p.id===saved.current))database.current=saved.current;
  }else{
    const legacy=JSON.parse(localStorage.getItem('tdn-ai-workspace-v1'));
    if(legacy)database.workspaces.sentiment=cleanWork(legacy,catalog[0]);
  }
}catch{storageAvailable=false;}
let currentProblem=catalog.find(p=>p.id===database.current)||catalog[0];
let state=database.workspaces[currentProblem.id]??=emptyWork(currentProblem);
let context=null,busy=false,conversation=0,collapsed=new Set(),toastTimer,saveTimer,requestController=null;
let apiEndpoint='',gatewayToken='',catalogFilter='Tất cả';
let connectionReady=false,connectionIssue='',connectionVersion=0;
let chatWaitTimer=null,stopRequested=false;
let descriptionDirty=true,historyDirty=true,renderedWorkspace=null,renderedMessages=[],messageWindow=40,editorLineCount=1,gutterFrame=0,saveIdleHandle=null;
try{apiEndpoint=localStorage.getItem('tdn-ai-endpoint')||'';}catch{}
if(window.location.protocol==='http:'&&['127.0.0.1','localhost'].includes(window.location.hostname)){
  const port=new URLSearchParams(window.location.search).get('gatewayPort');
  if(port&&/^\d{1,5}$/.test(port)&&Number(port)>0&&Number(port)<65536){apiEndpoint='http://127.0.0.1:'+Number(port)+'/api/chat';try{localStorage.setItem('tdn-ai-endpoint',apiEndpoint);}catch{}}
}
function validName(name){return typeof name==='string' && name.length<=100 && /^[\p{L}\p{N}_. /-]+$/u.test(name) && !name.startsWith('/') && !name.endsWith('/') && !name.includes('//') && !name.split('/').some(p=>['.','..','__proto__','constructor','prototype'].includes(p));}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function persist(){clearTimeout(saveTimer);if(saveIdleHandle!==null&&window.cancelIdleCallback){window.cancelIdleCallback(saveIdleHandle);saveIdleHandle=null;}try{localStorage.setItem(KEY,JSON.stringify(database));storageAvailable=true;$('.saved').lastChild.textContent=' Đã lưu trên máy';}catch{storageAvailable=false;$('.saved').lastChild.textContent=' Chưa lưu · Hãy tải dự án';toast('Bộ nhớ trình duyệt không khả dụng hoặc đã đầy. Hãy tải dự án để giữ thay đổi.');}}
function schedulePersist(){
  clearTimeout(saveTimer);if(saveIdleHandle!==null&&window.cancelIdleCallback){window.cancelIdleCallback(saveIdleHandle);saveIdleHandle=null;}
  saveTimer=setTimeout(()=>{const save=()=>{saveIdleHandle=null;persist();$('#dirty').style.opacity='0';};if(window.requestIdleCallback)saveIdleHandle=window.requestIdleCallback(save,{timeout:2000});else save();},800);
}
window.addEventListener('pagehide',()=>persist());
function showTab(tab){
  document.body.dataset.tab=tab;$('#menu').hidden=tab!=='code';
  $$('.tab').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-pressed',String(b.dataset.tab===tab));});
  $$('.panel').forEach(p=>p.classList.toggle('active',p.id===tab));$('#sidebar').classList.remove('open');
  if(tab==='description'&&descriptionDirty)renderDescription();
  if(tab==='submissions'&&historyDirty)renderHistory();
  if(tab==='code'){updateLineGutter();window.TDNNotebookUI.refreshPlain();}
}
$$('[data-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$$('[data-nav]').forEach(b=>b.onclick=()=>showTab(b.dataset.nav));
$('#menu').onclick=()=>{if(window.innerWidth<=650)$('#sidebar').classList.toggle('open');else document.body.classList.toggle('explorer-collapsed');};
document.addEventListener('click',e=>{if(window.innerWidth<=650 && !$('#sidebar').contains(e.target) && !$('#menu').contains(e.target))$('#sidebar').classList.remove('open');});
function fileType(name){const ext=name.split('.').pop().toLowerCase();return {py:['PY','Python','py'],csv:['▤','CSV','csv'],md:['M↓','Markdown','md'],json:['{}','JSON','md'],ipynb:['NB','Jupyter Notebook','py'],txt:['≡','Plain text','md']}[ext]||['≡','Plain text','md'];}
function renderTree(){
  const root=Object.create(null);
  for(const path of Object.keys(state.files).sort()){
    const parts=path.split('/');let node=root;
    parts.forEach((p,i)=>{if(i===parts.length-1)node[p]={path};else{node[p]??={children:Object.create(null)};if(!node[p].children)node[p].children=Object.create(null);node=node[p].children;}});
  }
  $('#fileTree').replaceChildren();
  function walk(node,parent,depth=0){
    Object.entries(node).sort(([a,x],[b,y])=>Boolean(y.children)-Boolean(x.children)||a.localeCompare(b)).forEach(([name,item])=>{
      const path=parent?parent+'/'+name:name;
      if(item.children){const b=document.createElement('button');b.className='tree-folder';b.style.paddingLeft=(12+depth*15)+'px';b.textContent=(collapsed.has(path)?'›':'⌄')+'  ▱  '+name;b.setAttribute('aria-expanded',String(!collapsed.has(path)));b.onclick=()=>{collapsed.has(path)?collapsed.delete(path):collapsed.add(path);renderTree();};$('#fileTree').append(b);if(!collapsed.has(path))walk(item.children,path,depth+1);}
      if(item.path){const b=document.createElement('button');b.className='tree-file'+(state.activeFile===item.path?' active':'');b.style.paddingLeft=(27+depth*15)+'px';b.dataset.path=item.path;b.setAttribute('aria-label','Mở '+item.path);const icon=document.createElement('span');icon.textContent=fileType(name)[0];icon.className=fileType(name)[2];b.append(icon,document.createTextNode(name));b.onclick=()=>openFile(item.path);$('#fileTree').append(b);}
    });
  }walk(root,'');
}
function updateLineGutter(){
  if(gutterFrame)return;
  gutterFrame=requestAnimationFrame(()=>{gutterFrame=0;const editor=$('#codeEditor'),gutter=$('#lineNumbers span');
    const top=Math.floor(editor.scrollTop/24),visible=Math.ceil(editor.clientHeight/24)+2;
    const count=Math.max(0,Math.min(visible,editorLineCount-top));
    gutter.textContent=Array.from({length:count},(_,i)=>top+i+1).join('\n');gutter.style.transform='translateY(-'+(editor.scrollTop%24)+'px)';
  });
}
function updateLines(){editorLineCount=($('#codeEditor').value.match(/\n/g)||[]).length+1;$('#lineCount').textContent=editorLineCount+' dòng';updateLineGutter();}
function openFile(path,rebuild=false){if(!Object.hasOwn(state.files,path))return;state.activeFile=path;$('#codeEditor').value=state.files[path];$('#editorFilename').textContent=path.split('/').pop();$('#editorPath').textContent=currentProblem.id+' / '+path;$('#fileLanguage').textContent=fileType(path)[1];$('#codeEditor').scrollTop=0;updateLines();window.TDNNotebookUI.open();if(rebuild)renderTree();else $$('.tree-file').forEach(b=>b.classList.toggle('active',b.dataset.path===path));showTab('code');persist();}
$('#codeEditor').addEventListener('input',()=>{state.files[state.activeFile]=$('#codeEditor').value;if(state.activeFile==='description.md')descriptionDirty=true;updateLines();$('#dirty').style.opacity='1';$('.saved').lastChild.textContent=' Đang lưu…';schedulePersist();});
$('#codeEditor').addEventListener('scroll',updateLineGutter,{passive:true});
window.addEventListener('resize',updateLineGutter,{passive:true});
$('#codeEditor').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const t=e.target,a=t.selectionStart,z=t.selectionEnd;t.setRangeText('    ',a,z,'end');t.dispatchEvent(new Event('input'));}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();persist();toast(storageAvailable?'Đã lưu trên trình duyệt':'Hãy tải dự án để lưu tệp');}});
$('#newFile').onclick=()=>{$('#newFileName').value='';$('#fileError').textContent='';$('#newFileDialog').showModal();$('#newFileName').focus();};
$('#cancelFile').onclick=()=>$('#newFileDialog').close();
$('#newFileForm').onsubmit=e=>{e.preventDefault();const name=$('#newFileName').value.trim();if(!validName(name)){ $('#fileError').textContent='Tên tệp không hợp lệ. Ví dụ: src/model.py';return;}if(Object.hasOwn(state.files,name)||Object.keys(state.files).some(p=>p.startsWith(name+'/')||name.startsWith(p+'/'))){$('#fileError').textContent='Tên này trùng tệp hoặc thư mục hiện có.';return;}state.files[name]=name.endsWith('.ipynb')?JSON.stringify(window.TDNCore.fromPython(''),null,2):'';$('#newFileDialog').close();openFile(name,true);toast('Đã tạo '+name);};
$('#uploadFile').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>2e6)return toast('Tệp quá lớn. Giới hạn nhập tệp là 2 MB.');if(!validName(f.name))return toast('Tên tệp không hợp lệ.');if(Object.keys(state.files).some(p=>p.startsWith(f.name+'/')))return toast('Tên tệp trùng với thư mục hiện có.');if(Object.hasOwn(state.files,f.name)&&!confirm('Thay nội dung tệp '+f.name+'?'))return;try{state.files[f.name]=await f.text();openFile(f.name,true);toast('Đã nhập '+f.name);}catch{toast('Không đọc được tệp này.');}};
function download(name,data,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('#downloadFile').onclick=()=>download(state.activeFile.split('/').pop(),state.files[state.activeFile]);
function renderMessage(m){const el=document.createElement('article');el.className='message '+m.role;const body=document.createElement('div');body.className='message-body';const label=document.createElement('strong');label.textContent=m.role==='user'?'Bạn':'Trợ lý TĐN';body.append(label);if(m.role==='assistant'){const tag=document.createElement('small');tag.textContent=m.model||'AI';body.append(tag);}const text=document.createElement('pre');text.textContent=m.text;body.append(text);if(m.attachment){const chip=document.createElement('small');chip.className='message-file';chip.textContent='▤ '+m.attachment.name;body.append(chip);};el.append(body);return el;}
function renderMessages(){
  $$('#messages .chat-error').forEach(e=>e.remove());
  const visible=state.messages.slice(-messageWindow);
  const appendOnly=renderedWorkspace===state&&renderedMessages.length<=visible.length&&renderedMessages.every((m,i)=>m===visible[i]);
  if(!appendOnly){$$('#messages .message').forEach(m=>m.remove());renderedMessages=[];}
  const fragment=document.createDocumentFragment();for(let i=renderedMessages.length;i<visible.length;i++)fragment.append(renderMessage(visible[i]));
  $('#messages').append(fragment);renderedMessages=visible;renderedWorkspace=state;
  $('#welcome').hidden=state.messages.length>0;$('#olderMessages').hidden=state.messages.length<=messageWindow;
  $('#messages').scrollTop=$('#messages').scrollHeight;
}
$('#olderMessages').onclick=()=>{const box=$('#messages'),height=box.scrollHeight,top=box.scrollTop;messageWindow+=40;renderMessages();box.scrollTop=box.scrollHeight-height+top;};
function endChatWaiting(){clearInterval(chatWaitTimer);chatWaitTimer=null;$('#chatWaiting').hidden=true;}
function beginChatWaiting(mode){
  endChatWaiting();stopRequested=false;const started=Date.now();$('#chatWaiting').hidden=false;
  const update=()=>{const seconds=Math.floor((Date.now()-started)/1000);$('#chatWaitText').textContent=(mode==='reasoning'?'Qwen đang suy luận · ':'Đang chờ AI · ')+seconds+' giây'+(seconds>=10?(mode==='reasoning'?' · Thường chậm hơn chế độ Nhanh.':' · Lần đầu có thể cần nạp model.'):'');};
  update();chatWaitTimer=setInterval(update,1000);
}
$('#stopChat').onclick=()=>{if(requestController){stopRequested=true;requestController.abort();}};
function updateSendButton(){ $('#send').disabled=busy;$('#send').textContent=busy?'Đang chờ':connectionReady?'Gửi':'Kết nối AI'; }
function setConnectionStatus(connected,issue=''){
  connectionReady=connected;connectionIssue=issue;
  $('#chatModelStatus').textContent=connected?'Qwen3-8B · Đã kết nối':'AI chưa sẵn sàng';
  $('#chatModelStatus').className=connected?'pill green':'pill';
  $('#connectionStatus').textContent=connected?'AI đã kết nối · Cấu hình':'Kết nối AI';
  $('#gatewayNotice').hidden=connected;$('#gatewayNoticeText').textContent=issue||'Chưa kết nối server AI.';updateSendButton();
}
function connectionDialog(){ $('#apiEndpoint').value=apiEndpoint;$('#gatewayToken').value=gatewayToken;$('#connectionFeedback').textContent=connectionIssue;$('#connectionDialog').showModal(); }
$('#connectionStatus').onclick=connectionDialog;$('#configureGateway').onclick=connectionDialog;
$('#closeConnection').onclick=()=>$('#connectionDialog').close();
async function verifyConnection(value=apiEndpoint,token=gatewayToken){
  const version=++connectionVersion;
  try{const result=await window.TDNTransport.probe(value,token);if(version!==connectionVersion)return null;setConnectionStatus(true);return result;}
  catch(error){if(version===connectionVersion)setConnectionStatus(false,error.message);throw error;}
}
$('#connectionForm').onsubmit=async e=>{
  e.preventDefault();const value=$('#apiEndpoint').value.trim(),token=$('#gatewayToken').value.trim();
  $('#saveConnection').disabled=true;$('#connectionFeedback').textContent='Đang kiểm tra gateway và model…';
  try{const result=await verifyConnection(value,token);if(!result)return;apiEndpoint=value;gatewayToken=token;try{localStorage.setItem('tdn-ai-endpoint',value);}catch{}$('#connectionDialog').close();toast('Đã kết nối model. Bạn có thể gửi tin nhắn.');$('#prompt').focus();}
  catch(error){$('#connectionFeedback').textContent=error.message;}
  finally{$('#saveConnection').disabled=false;}
};
$('#gatewayNotice a').hidden=['localhost','127.0.0.1'].includes(window.location.hostname);
void verifyConnection().catch(()=>{});
function attach(){context={name:state.activeFile,content:state.files[state.activeFile]};$('#contextChip').hidden=false;$('#contextChip').replaceChildren(document.createTextNode('▤ '+context.name));const b=document.createElement('button');b.type='button';b.textContent='×';b.setAttribute('aria-label','Bỏ tệp đính kèm');b.onclick=()=>{context=null;$('#contextChip').hidden=true;};$('#contextChip').append(b);$('#prompt').focus();}
$('#attachContext').onclick=attach;
try{$('#chatMode').value=localStorage.getItem('tdn-chat-mode')==='fast'?'fast':'reasoning';}catch{}
$('#chatMode').onchange=()=>{try{localStorage.setItem('tdn-chat-mode',$('#chatMode').value);}catch{}};
$('#chatForm').onsubmit=async e=>{
  e.preventDefault();const text=$('#prompt').value.trim();if(!text||busy)return;
  if(!connectionReady){connectionDialog();return;}
  if(text.length>6000)return toast('Giới hạn mỗi tin nhắn là 6.000 ký tự.');
  const ownConversation=conversation,attachment=context,workspace=state,mode=$('#chatMode').value;
  if(attachment&&attachment.content.length>12000)return toast('Tệp đính kèm tối đa 12.000 ký tự. Hãy chọn đoạn code ngắn hơn.');
  workspace.messages.push({role:'user',text,attachment:attachment?{...attachment}:null});workspace.messages=workspace.messages.slice(-100);
  $('#prompt').value='';context=null;$('#contextChip').hidden=true;busy=true;$('#send').disabled=true;$('#send').textContent='…';persist();renderMessages();
  const controller=new AbortController();requestController=controller;beginChatWaiting(mode);const timer=setTimeout(()=>controller.abort(),180000);
  try{
    const response=await fetch(window.TDNTransport.endpoint(apiEndpoint),{method:'POST',headers:{'Content-Type':'application/json',...(gatewayToken?{'Authorization':'Bearer '+gatewayToken}:{})},body:JSON.stringify({mode,problem:{id:currentProblem.id,title:currentProblem.title,goal:state.files['description.md']||currentProblem.goal,metric:currentProblem.metric},messages:window.TDNTransport.chatHistory(workspace.messages)}),signal:controller.signal});
    const body=await window.TDNTransport.readChat(response);
    if(conversation!==ownConversation)return;
    workspace.messages.push({role:'assistant',text:body.content+(body.truncated?'\n\n⚠ Phản hồi đã chạm giới hạn độ dài; code có thể chưa hoàn chỉnh. Hãy chia nhỏ yêu cầu.':''),model:body.model||'Qwen3-8B'});setConnectionStatus(true);
  }catch(error){
    if(conversation!==ownConversation)return;
    const interrupted=stopRequested&&error.name==='AbortError';
    if(!interrupted&&!['BUSY','GENERATION_LIMIT'].includes(error.code))setConnectionStatus(false,error.message);
    const message=interrupted?'Đã dừng chờ phản hồi. Model có thể tiếp tục xử lý yêu cầu đã gửi.':error.name==='AbortError'?'Chờ quá 180 giây. Hãy kiểm tra server model.':error.message||'Lỗi kết nối';
    toast(message);const el=document.createElement('div');el.className='feedback chat-error'+(interrupted?'':' error');el.textContent=message+' Tin nhắn của bạn vẫn được giữ trong lịch sử.';$('#messages').append(el);$('#messages').scrollTop=$('#messages').scrollHeight;return;
  }finally{clearTimeout(timer);if(conversation===ownConversation){endChatWaiting();busy=false;updateSendButton();requestController=null;persist();}}
  renderMessages();$('#prompt').focus();
};
$('#prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chatForm').requestSubmit();}};
$$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;$('#chatForm').requestSubmit();});
$('#clearChat').onclick=()=>{conversation++;endChatWaiting();messageWindow=40;requestController?.abort();state.messages=[];busy=false;updateSendButton();context=null;$('#contextChip').hidden=true;persist();renderMessages();$('#prompt').focus();};
$('#problemDescription').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openFile(b.dataset.open);if(e.target.closest('#goSubmit'))showTab('submissions');});

$('#askBaseline').onclick=()=>{showTab('chat');$('#prompt').value='Gợi ý một baseline để bắt đầu';$('#chatForm').requestSubmit();};
['#guide','#workspaceInfo','#settings'].forEach(s=>$(s).onclick=()=>$('#infoDialog').showModal());$('#closeInfo').onclick=()=>$('#infoDialog').close();
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell!==''||afterQuote)throw Error('CSV chứa dấu ngoặc kép không hợp lệ.');quoted=true;}
    else if(c===','){row.push(cell);cell='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';afterQuote=false;}
    else{if(afterQuote&&!/\s/.test(c))throw Error('CSV chứa ký tự sau dấu ngoặc kép đóng.');if(!afterQuote)cell+=c;}
  }
  if(quoted)throw Error('CSV có dấu ngoặc kép chưa đóng.');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function validateSubmission(text,problem=currentProblem,workspace=state){
  const rows=parseCSV(text);if(rows.length<2)throw Error('Tệp cần có tiêu đề và ít nhất một dòng dự đoán.');const header=rows.shift().map(v=>v.trim());if(header.length!==2||header[0]!=='id'||header[1]!==problem.target)throw Error('Tiêu đề phải là id,'+problem.target+' theo đúng thứ tự.');
  const test=parseCSV(workspace.files['data/test.csv']||'');if(test.length<2||test[0][0].trim()!=='id')throw Error('Không đọc được danh sách ID từ data/test.csv. Hãy kiểm tra tệp dữ liệu.');const ids=new Set(test.slice(1).map(r=>r[0].trim()));if(ids.size!==test.length-1)throw Error('data/test.csv có ID trùng nhau.');const seen=new Set();
  rows.forEach((r,i)=>{if(r.length!==2)throw Error('Dòng '+(i+2)+' phải có đúng 2 cột.');const [id,label]=r.map(v=>v.trim());if(!ids.has(id))throw Error('ID '+id+' không có trong data/test.csv.');if(seen.has(id))throw Error('ID '+id+' bị trùng.');if(problem.labels){if(!problem.labels.includes(label))throw Error('Nhãn tại ID '+id+' phải thuộc: '+problem.labels.join(', '));}else{if(!label||!Number.isFinite(Number(label))||(problem.minValue!==undefined&&Number(label)<problem.minValue))throw Error('Giá trị tại ID '+id+' phải là số hữu hạn'+(problem.minValue!==undefined?' ≥ '+problem.minValue:'.'));}seen.add(id);});
  if(seen.size!==ids.size)throw Error('Thiếu dự đoán cho '+(ids.size-seen.size)+' ID trong test.csv.');return rows.length;
}
function renderHistory(){historyDirty=false;const root=$('#submissionHistory');root.replaceChildren();$('#submissionCount').textContent=state.submissions.length;if(!state.submissions.length){const e=document.createElement('div');e.className='history-empty';e.textContent='Chưa có bài nộp. Bắt đầu với lời giải đầu tiên của bạn.';root.append(e);return;}state.submissions.forEach(s=>{const row=document.createElement('div');row.className='submission-row';const detail=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small');name.textContent=s.name;meta.textContent=new Date(s.time).toLocaleString('vi-VN')+' · '+s.rows+' dự đoán';detail.append(name,meta);const badge=document.createElement('span');badge.className='pill green';badge.textContent='Hợp lệ · Chưa chấm';const button=document.createElement('button');button.className='text-button';button.textContent='↧';button.setAttribute('aria-label','Tải lại '+s.name);button.onclick=()=>download(s.name,s.csv,'text/csv;charset=utf-8');row.append(detail,badge,button);root.append(row);});}
async function submitFile(file){
  if(!file)return;const workspace=state,problem=currentProblem,box=$('#submissionFeedback');
  try{
    if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Vui lòng chọn tệp .csv.');
    if(file.size>2e6)throw Error('Tệp vượt giới hạn 2 MB.');
    const csv=await file.text(),rows=validateSubmission(csv,problem,workspace);
    workspace.submissions.unshift({name:file.name,csv,rows,time:new Date().toISOString()});workspace.submissions=workspace.submissions.slice(0,100);persist();
    if(state===workspace){renderHistory();box.className='feedback success';box.textContent='✓ CSV hợp lệ: '+rows+' dự đoán. Đã lưu lịch sử cục bộ; chưa tính điểm '+problem.metric+'.';}
    else toast('Đã lưu bài nộp cho '+problem.title);
  }catch(error){if(state===workspace){box.className='feedback error';box.textContent=error.message;}else toast(problem.title+': '+error.message);}
}
$('#chooseSubmission').onclick=()=>$('#submissionInput').click();$('#submissionInput').onchange=e=>{submitFile(e.target.files[0]);e.target.value='';};
const drop=$('#dropZone');['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragging');}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragging');}));drop.addEventListener('drop',e=>submitFile(e.dataTransfer.files[0]));
$('#sampleSubmission').onclick=()=>{try{const rows=parseCSV(state.files['data/test.csv']);if(rows.length<2)throw Error();download('sample_submission.csv','id,'+currentProblem.target+'\n'+rows.slice(1).map(r=>r[0]+','+(currentProblem.labels?.[0]||'0')).join('\n')+'\n','text/csv;charset=utf-8');}catch{toast('Không thể tạo mẫu: hãy kiểm tra data/test.csv.');}};
// Build an uncompressed ZIP locally; no files are sent to a server.
function zipFiles(files){
  const encoder=new TextEncoder(),chunks=[],central=[];let offset=0;
  function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
  for(const [name,content] of Object.entries(files)){const path=encoder.encode(name),data=encoder.encode(content),crc=crc32(data);const local=new Uint8Array(30+path.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);local.set(path,30);chunks.push(local,data);const c=new Uint8Array(46+path.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,path.length,true);w.setUint32(42,offset,true);c.set(path,46);central.push(c);offset+=local.length+data.length;}
  const centralSize=central.reduce((s,c)=>s+c.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
$('#export').onclick=()=>{const archive={...state.files};archive['_workspace/chat-history.json']=JSON.stringify(state.messages,null,2);archive['_workspace/submissions.json']=JSON.stringify(state.submissions,null,2);download('tdn-'+currentProblem.id+'-project.zip',zipFiles(archive),'application/zip');toast('Đã xuất dự án, lịch sử chat và bài nộp.');};
function validateProblem(raw){
  if(!raw||typeof raw!=='object'||!/^custom-[a-z0-9-]{1,50}$/.test(raw.id||''))throw Error('ID đề tự tạo phải bắt đầu bằng custom-, chỉ dùng chữ thường, số và dấu gạch ngang.');
  for(const key of ['title','summary','goal','metric','target','category'])if(typeof raw[key]!=='string'||!raw[key].trim()||raw[key].length>3000)throw Error('Thiếu hoặc sai trường '+key+'.');
  if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw.target)||raw.target==='id')throw Error('Tên cột mục tiêu không hợp lệ.');
  if(!raw.files||typeof raw.files!=='object'||Array.isArray(raw.files))throw Error('files phải là một object.');
  const entries=Object.entries(raw.files);if(!entries.length||entries.length>50||entries.some(([n,c])=>!validName(n)||typeof c!=='string'||c.length>200000))throw Error('Tệp của đề không hợp lệ (tối đa 50 tệp, 200.000 ký tự/tệp).');
  for(const [path] of entries)if(entries.some(([other])=>other!==path&&other.startsWith(path+'/')))throw Error('Tên tệp xung đột với thư mục.');
  const files=Object.fromEntries(entries);
  if(!Object.hasOwn(files,'description.md'))files['description.md']=window.TDNCore.descriptionFor({...raw,hint:raw.hint||'Bắt đầu với baseline.',validation:raw.validation||'Tạo tập validation riêng.'});
  if(!Object.hasOwn(files,'notebook.ipynb'))files['notebook.ipynb']=JSON.stringify(window.TDNCore.fromPython(files['baseline.py']||''),null,2);
  if(!Object.hasOwn(files,'data/test.csv')||!Object.hasOwn(files,'baseline.py'))throw Error('Đề cần có baseline.py và data/test.csv.');
  const test=parseCSV(files['data/test.csv']);if(test.length<2||test[0][0]!=='id')throw Error('test.csv phải có cột đầu tiên là id và ít nhất một dòng.');
  const ids=test.slice(1).map(r=>r[0].trim());if(ids.some(id=>!id)||new Set(ids).size!==ids.length)throw Error('ID trong test.csv phải không rỗng và không trùng.');
  if(raw.labels!==undefined&&(!Array.isArray(raw.labels)||!raw.labels.length||raw.labels.length>100||raw.labels.some(l=>typeof l!=='string'||!l||l.length>50)))throw Error('labels phải là mảng chuỗi nhãn hợp lệ.');
  return {id:raw.id,title:raw.title,summary:raw.summary,goal:raw.goal,metric:raw.metric,target:raw.target,category:raw.category,difficulty:typeof raw.difficulty==='string'?raw.difficulty:'Tùy chỉnh',hint:typeof raw.hint==='string'?raw.hint:'Khám phá dữ liệu và bắt đầu với một baseline đơn giản.',validation:typeof raw.validation==='string'?raw.validation:'Tạo tập validation riêng và kiểm tra rò rỉ dữ liệu.',labels:raw.labels,minValue:Number.isFinite(raw.minValue)?raw.minValue:undefined,files};
}
function renderProblem(){
  $('#currentProblem').textContent=currentProblem.title;$('#problemCategory').textContent=currentProblem.category;$('#projectName').textContent=currentProblem.id;
  $('#submissionColumns').textContent='Hai cột: id, '+currentProblem.target;$('#rankMetric').textContent=currentProblem.metric;
  $('#problemSelect').replaceChildren();catalog.forEach(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.title;option.selected=p.id===currentProblem.id;$('#problemSelect').append(option);});
  $('#problemTotal').textContent=catalog.length;
  descriptionDirty=true;
}
const descriptionRequests=new WeakMap();
async function loadDescription(problem=currentProblem,workspace=state){
  if(Object.hasOwn(workspace.files,'description.md'))return workspace.files['description.md'];
  if(descriptionRequests.has(workspace))return descriptionRequests.get(workspace);
  const task=(async()=>{let text;if(problem.descriptionPath){const response=await fetch(problem.descriptionPath);if(!response.ok)throw Error('Không tải được description.md ('+response.status+').');text=await response.text();}else text=window.TDNCore.descriptionFor(problem);
    if(text.length>200000)throw Error('description.md vượt quá 200.000 ký tự.');
    if(!Object.hasOwn(workspace.files,'description.md'))workspace.files['description.md']=text;
    if(state===workspace){descriptionDirty=true;renderTree();if($('#description').classList.contains('active'))renderDescription();}persist();return workspace.files['description.md'];
  })();descriptionRequests.set(workspace,task);try{return await task;}finally{descriptionRequests.delete(workspace);}
}
function renderDescription(){
  descriptionDirty=false;const root=$('#problemDescription');
  if(Object.hasOwn(state.files,'description.md')){root.innerHTML=window.TDNCore.markdown(state.files['description.md']);return;}
  root.textContent='Đang tải description.md…';const workspace=state;
  void loadDescription().catch(error=>{if(state===workspace){root.textContent=error.message;const retry=document.createElement('button');retry.className='text-button';retry.textContent='Thử tải lại';retry.onclick=renderDescription;root.append(retry);}});
}
$('#editDescription').onclick=async()=>{try{await loadDescription();openFile('description.md');}catch(error){toast(error.message);}};
$('#downloadDescription').onclick=async()=>{try{const text=await loadDescription();download('description.md',text,'text/markdown;charset=utf-8');}catch(error){toast(error.message);}};
function switchProblem(id){
  const problem=catalog.find(p=>p.id===id);if(!problem)return;
  clearTimeout(saveTimer);state.files[state.activeFile]=$('#codeEditor').value;persist();
  conversation++;endChatWaiting();requestController?.abort();busy=false;updateSendButton();$('#prompt').value='';context=null;$('#contextChip').hidden=true;collapsed.clear();
  currentProblem=problem;database.current=id;state=database.workspaces[id]??=emptyWork(problem);
  $('#submissionFeedback').replaceChildren();$('#submissionFeedback').className='';
  $('#editorFilename').textContent=state.activeFile.split('/').pop();$('#editorPath').textContent=id+' / '+state.activeFile;$('#fileLanguage').textContent=fileType(state.activeFile)[1];$('#codeEditor').value=state.files[state.activeFile];messageWindow=40;historyDirty=true;updateLines();window.TDNNotebookUI.open();renderTree();renderMessages();renderProblem();persist();showTab('description');void loadDescription().catch(()=>{});$('#catalogDialog').close();
}
function renderCatalog(){
  const search=$('#problemSearch').value.trim().toLocaleLowerCase('vi');const categories=['Tất cả',...new Set(catalog.map(p=>p.category))];
  $('#catalogFilters').replaceChildren();categories.forEach(c=>{const b=document.createElement('button');b.textContent=c;b.className=c===catalogFilter?'active':'';b.onclick=()=>{catalogFilter=c;renderCatalog();};$('#catalogFilters').append(b);});
  $('#problemCards').replaceChildren();
  const matches=catalog.filter(p=>(catalogFilter==='Tất cả'||p.category===catalogFilter)&&(p.title+' '+p.summary).toLocaleLowerCase('vi').includes(search));
  matches.forEach(p=>{const b=document.createElement('button');b.className='problem-card'+(p.id===currentProblem.id?' selected':'');const top=document.createElement('div');top.className='problem-card-top';const tag=document.createElement('span');tag.className='pill blue';tag.textContent=p.category;const level=document.createElement('small');level.textContent=p.difficulty;top.append(tag,level);const title=document.createElement('h3');title.textContent=p.title;const summary=document.createElement('p');summary.textContent=p.summary;const bottom=document.createElement('div');bottom.className='problem-card-bottom';bottom.textContent=p.metric+' · '+(database.workspaces[p.id]?.submissions.length||0)+' bài nộp';const link=document.createElement('span');link.textContent=p.id===currentProblem.id?'Đang mở ↗':'Bắt đầu ↗';bottom.append(link);b.append(top,title,summary,bottom);b.onclick=()=>switchProblem(p.id);$('#problemCards').append(b);});
  if(!matches.length){const p=document.createElement('p');p.className='catalog-empty';p.textContent='Không tìm thấy bài toán phù hợp.';$('#problemCards').append(p);}
}
$('#problemSelect').onchange=e=>switchProblem(e.target.value);
$('#openCatalog').onclick=()=>{renderCatalog();$('#catalogDialog').showModal();};
$('#workspaceInfo').onclick=()=>{renderCatalog();$('#catalogDialog').showModal();};
$('#closeCatalog').onclick=()=>$('#catalogDialog').close();let searchTimer;$('#problemSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderCatalog,120);};
$('#importProblem').onclick=()=>$('#problemInput').click();
$('#problemInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>2e6)throw Error('Đề JSON tối đa 2 MB.');const p=validateProblem(JSON.parse(await file.text()));if(catalog.some(c=>c.id===p.id))throw Error('ID bài toán đã tồn tại. Đổi id trước khi nhập.');catalog.push(p);database.customProblems.push(p);switchProblem(p.id);toast('Đã thêm bài toán '+p.title);}catch(error){toast(error.message||'Không đọc được đề JSON.');}};
$('#exportProblemTemplate').onclick=()=>{const template={...window.TDN_PROBLEMS[0],id:'custom-bai-toan-moi',title:'Bài toán mới của bạn'};delete template.number;download('tdn-problem-template.json',JSON.stringify(template,null,2),'application/json');};

$('#editorFilename').textContent=state.activeFile.split('/').pop();$('#editorPath').textContent=currentProblem.id+' / '+state.activeFile;$('#codeEditor').value=state.files[state.activeFile];$('#fileLanguage').textContent=fileType(state.activeFile)[1];updateLines();window.TDNNotebookUI.open();renderTree();renderMessages();renderProblem();showTab('code');void loadDescription().catch(()=>{});
if(!storageAvailable){$('.saved').lastChild.textContent=' Chưa lưu · Hãy tải dự án';}

