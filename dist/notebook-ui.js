'use strict';
window.TDNNotebookUI=(()=>{
  const $=s=>document.querySelector(s),core=window.TDNCore;
  let documentModel=null,owner=null,path='',selected=0,running=false,version=0,highlightTimer;
  const button=(label,action,title=label)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.onclick=action;return b;};
  function commit(){if(!documentModel||!owner)return;owner.files[path]=JSON.stringify(documentModel,null,2);if(owner===state){$('#codeEditor').value=owner.files[path];$('#dirty').style.opacity='1';schedulePersist();}}
  function refreshHighlight(input,pre){pre.innerHTML=core.highlight(input.value)+'\n';pre.scrollTop=input.scrollTop;pre.scrollLeft=input.scrollLeft;}
  function autoSize(input){input.style.height='auto';input.style.height=Math.max(72,Math.min(540,input.scrollHeight))+'px';}
  function renderOutputs(cell,root){
    root.replaceChildren();for(const out of (cell.outputs||[]).slice(-30)){if(out.output_type==='stream'||out.output_type==='error'||out.data?.['text/plain']){const text=out.output_type==='error'?(out.traceback||[out.ename+': '+out.evalue]).join('\n'):out.output_type==='stream'?out.text:out.data['text/plain'];const pre=document.createElement('pre');pre.className=out.output_type==='error'?'cell-error':'cell-result';pre.textContent=Array.isArray(text)?text.join(''):String(text||'');root.append(pre);}
      const png=out.data?.['image/png'];if(typeof png==='string'&&png.length<3000000&&/^[A-Za-z0-9+/=\s]+$/.test(png)){const img=document.createElement('img');img.src='data:image/png;base64,'+png.replace(/\s/g,'');img.alt='Kết quả biểu đồ';img.loading='lazy';root.append(img);}}
  }
  function render(){
    window.TDNCodeAssist?.close();
    const root=$('#notebookCells');root.replaceChildren();if(!documentModel)return;
    documentModel.cells.forEach((cell,index)=>{
      const section=document.createElement('section');section.className='nb-cell'+(index===selected?' selected':'');section.dataset.cell=index;
      const bar=document.createElement('div');bar.className='cell-toolbar';const type=document.createElement('select');type.setAttribute('aria-label','Loại ô '+(index+1));for(const value of ['code','markdown','raw']){const opt=document.createElement('option');opt.value=value;opt.textContent=value==='code'?'Code':value==='markdown'?'Markdown':'Raw';opt.selected=value===cell.cell_type;type.append(opt);}type.onchange=()=>{if(running)return;const replacement=core.cell(type.value,core.sourceOf(cell));documentModel.cells[index]=replacement;commit();render();};
      const count=document.createElement('span');count.className='execution-count';count.textContent=cell.cell_type==='code'?'['+(cell.execution_count??' ')+']':String(index+1);bar.append(count,type);
      if(cell.cell_type==='code')bar.append(button('▶ Chạy',()=>run(index),'Chạy ô · Shift+Enter'));
      bar.append(button('↑',()=>move(index,-1),'Di chuyển lên'),button('↓',()=>move(index,1),'Di chuyển xuống'),button('×',()=>{if(running)return;if(core.sourceOf(cell).trim()&&!confirm('Xóa ô '+(index+1)+'?'))return;documentModel.cells.splice(index,1);if(!documentModel.cells.length)documentModel.cells.push(core.cell('code'));selected=Math.max(0,index-1);commit();render();},'Xóa ô'));
      const layer=document.createElement('div');layer.className='cell-source source-layer';const pre=document.createElement('pre');pre.className='syntax-highlight';pre.setAttribute('aria-hidden','true');const input=document.createElement('textarea');input.className='syntax-input';input.dataset.language=cell.cell_type;input.value=core.sourceOf(cell);input.spellcheck=false;input.setAttribute('aria-label','Nội dung ô '+(index+1));input.setAttribute('autocapitalize','off');input.setAttribute('autocomplete','off');
      const preview=document.createElement('div');preview.className='markdown-preview';preview.hidden=cell.cell_type!=='markdown';if(!preview.hidden)preview.innerHTML=core.markdown(input.value);
      const update=()=>{cell.source=input.value.split(/(?<=\n)/);if(cell.cell_type==='code'){cell.execution_count=null;cell.outputs=[];section.querySelector('.cell-output')?.replaceChildren();section.classList.add('cell-edited');}commit();autoSize(input);clearTimeout(highlightTimer);highlightTimer=setTimeout(()=>{refreshHighlight(input,pre);if(!preview.hidden)preview.innerHTML=core.markdown(input.value);},65);};
      input.oninput=update;input.onfocus=()=>{selected=index;root.querySelectorAll('.nb-cell').forEach(e=>e.classList.toggle('selected',Number(e.dataset.cell)===index));};input.onscroll=()=>{pre.scrollTop=input.scrollTop;pre.scrollLeft=input.scrollLeft;};
      input.onkeydown=e=>{if(e.key==='Tab'){e.preventDefault();input.setRangeText('    ',input.selectionStart,input.selectionEnd,'end');update();}if(e.key==='Enter'&&e.shiftKey&&cell.cell_type==='code'){e.preventDefault();run(index);}};
      layer.append(pre,input);section.append(bar,layer,preview);const output=document.createElement('div');output.className='cell-output';renderOutputs(cell,output);section.append(output);root.append(section);refreshHighlight(input,pre);requestAnimationFrame(()=>autoSize(input));
    });
    $('#notebookCount').textContent=documentModel.cells.length+' ô';updateControls();
  }
  function updateControls(){$('#runAllCells').disabled=running;$('#addCodeCell').disabled=running;$('#addMarkdownCell').disabled=running;$('#resetKernel').disabled=running;$('#notebookCells').querySelectorAll('button,select,textarea').forEach(el=>el.disabled=running);}
  function move(index,direction){if(running)return;const target=index+direction;if(target<0||target>=documentModel.cells.length)return;[documentModel.cells[index],documentModel.cells[target]]=[documentModel.cells[target],documentModel.cells[index]];selected=target;commit();render();}
  function add(kind){if(running||documentModel.cells.length>=300)return;const index=Math.min(documentModel.cells.length,selected+1);documentModel.cells.splice(index,0,core.cell(kind));selected=index;commit();render();$('#notebookCells').querySelector('[data-cell="'+index+'"] textarea')?.focus();}
  function executionURL(){const hostname=window.location.hostname;if(!['localhost','127.0.0.1'].includes(hostname))throw Error('Chạy ô Python ở bản local. Bản online chỉ soạn thảo và tải notebook.');return '/api/notebook/execute';}
  async function executeCell(index,lease){
    const cell=documentModel.cells[index];if(cell.cell_type!=='code')return true;
    const code=core.sourceOf(cell);const files=Object.fromEntries(Object.entries(owner.files).filter(([name])=>!name.endsWith('.ipynb')));
    const base=await window.TDNNotebookConnection.find(gatewayToken);
    const response=await fetch(base+'/api/notebook/execute',{method:'POST',headers:{'Content-Type':'application/json',...(gatewayToken?{Authorization:'Bearer '+gatewayToken}:{})},body:JSON.stringify({problem_id:currentProblem.id,code,files})});
    if(!response.ok){let message=response.status===404||response.status===405?'Khởi động lại Chay-AI-Local.cmd để nạp backend notebook mới.':'Không chạy được ô Python ('+response.status+').';if(![404,405].includes(response.status)){try{const data=await response.json();message=data.error||message;}catch{}}window.TDNNotebookConnection.invalidate();throw Error(message);}
    const result=await response.json();if(lease!==version)return false;cell.execution_count=result.execution_count;cell.outputs=result.outputs||[];
    if(result.files)for(const [name,content] of Object.entries(result.files))if(validName(name)&&typeof content==='string'){owner.files[name]=content;if(name==='description.md')descriptionDirty=true;}
    commit();renderTree();render();$('#kernelStatus').textContent=result.ok?'Python local · Sẵn sàng':'Python local · Ô bị lỗi';return result.ok;
  }
  async function run(index,all=false){if(running)return;window.TDNCodeAssist?.close();let failingIndex=index;try{executionURL();}catch(error){toast(error.message);return;}running=true;const lease=version;updateControls();$('#kernelStatus').textContent='Python local · Đang chạy…';
    try{if(all){for(let i=0;i<documentModel.cells.length;i++){failingIndex=i;if(!await executeCell(i,lease)||lease!==version)break;}}else await executeCell(index,lease);}
    catch(error){if(lease===version){toast(error.message);$('#kernelStatus').textContent='Python local · Chưa kết nối';const target=documentModel.cells[failingIndex];if(target&&target.cell_type==='code'){target.outputs=[{output_type:'error',ename:'KernelConnectionError',evalue:error.message,traceback:[error.message]}];commit();render();}}}
    finally{if(lease===version){running=false;updateControls();persist();}}
  }
  function open(){window.TDNCodeAssist?.close();version++;running=false;owner=state;path=state.activeFile;documentModel=null;const notebook=path.endsWith('.ipynb');$('#notebookView').hidden=!notebook;$('#plainEditor').hidden=notebook;$('#convertNotebook').hidden=!path.endsWith('.py');$('#notebookError').hidden=true;
    if(notebook){try{documentModel=core.parseNotebook(owner.files[path]);selected=0;render();$('#kernelStatus').textContent='Python local · Chưa chạy';}catch(error){$('#notebookView').hidden=true;$('#plainEditor').hidden=false;$('#notebookError').hidden=false;$('#notebookError').textContent=error.message+' Có thể sửa JSON bên dưới; nội dung tệp được giữ nguyên.';}}
    else refreshPlain();
  }
  function refreshPlain(){const input=$('#codeEditor'),pre=$('#codeHighlight');if(!input||!pre)return;pre.innerHTML=core.highlight(input.value)+'\n';pre.scrollTop=input.scrollTop;pre.scrollLeft=input.scrollLeft;}
  $('#addCodeCell').onclick=()=>add('code');$('#addMarkdownCell').onclick=()=>add('markdown');$('#runAllCells').onclick=()=>run(0,true);
  $('#resetKernel').onclick=async()=>{if(running)return;try{executionURL();const base=await window.TDNNotebookConnection.find(gatewayToken);const response=await fetch(base+'/api/notebook/reset',{method:'POST',headers:{'Content-Type':'application/json',...(gatewayToken?{Authorization:'Bearer '+gatewayToken}:{})},body:JSON.stringify({problem_id:currentProblem.id})});if(!response.ok)throw Error('Không khởi động lại được kernel.');$('#kernelStatus').textContent='Python local · Đã reset';toast('Đã xóa biến trong kernel Python.');}catch(error){toast(error.message);}};
  $('#convertNotebook').onclick=()=>{const target=state.activeFile==='baseline.py'?'notebook.ipynb':state.activeFile.replace(/\.py$/,'.ipynb');if(!Object.hasOwn(state.files,target))state.files[target]=JSON.stringify(core.fromPython(state.files[state.activeFile]),null,2);openFile(target,true);};
  $('#downloadNotebook').onclick=()=>{commit();download(path,owner.files[path],'application/x-ipynb+json');};
  $('#codeEditor').addEventListener('input',()=>{clearTimeout(highlightTimer);highlightTimer=setTimeout(refreshPlain,65);});$('#codeEditor').addEventListener('scroll',()=>{const input=$('#codeEditor'),pre=$('#codeHighlight');pre.scrollTop=input.scrollTop;pre.scrollLeft=input.scrollLeft;},{passive:true});
  $('#notebookCells').addEventListener('click',e=>{const link=e.target.closest('[data-open]');if(link)openFile(link.dataset.open);});
  return {open,refreshPlain,sourceContext:()=>documentModel?documentModel.cells.filter(cell=>cell.cell_type==='code').map(core.sourceOf).join('\n\n'):'',isNotebook:()=>state.activeFile.endsWith('.ipynb')&&documentModel!==null,commit};
})();
