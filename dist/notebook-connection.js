'use strict';
window.TDNNotebookConnection=(()=>{
  let cached=null,pending=null;
  const local=url=>url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  async function probe(base,token){const control=new AbortController(),timer=setTimeout(()=>control.abort(),1600);try{const response=await fetch(base+'/api/notebook/health',{headers:token?{Authorization:'Bearer '+token}:{},signal:control.signal,cache:'no-store'});if(!response.ok)return null;const info=await response.json();return info.app==='tdn-ai-workspace'&&info.notebook===true&&info.api_version===1?base:null;}catch{return null;}finally{clearTimeout(timer);}}
  async function find(token=''){
    const current=new URL(window.location.origin);if(!local(current))throw Error('Mở bản localhost để chạy Python. Bản online chỉ soạn thảo notebook.');
    if(cached&&cached.token===token&&Date.now()-cached.checked<30000)return cached.base;
    if(pending)return pending;
    pending=(async()=>{
      const save=base=>{cached={base,token,checked:Date.now()};try{localStorage.setItem('tdn-notebook-base',base);}catch{}return base;};
      const same=await probe(current.origin,token);if(same)return save(same);
      const candidates=new Set();try{const old=new URL(localStorage.getItem('tdn-notebook-base'));if(local(old))candidates.add(old.origin);}catch{}
      const port=Number(current.port)||80;for(let step=1;step<=10&&port+step<=65535;step++)candidates.add('http://'+current.hostname+':'+(port+step));
      candidates.delete(current.origin);const results=await Promise.all([...candidates].map(base=>probe(base,token)));const ready=results.find(Boolean);if(ready)return save(ready);
      throw Error('Giao diện đang dùng backend cũ hoặc kernel chưa chạy. Mở Chay-AI-Local.cmd phiên bản mới; launcher sẽ tự chọn cổng và kiểm tra Python. Không cần đóng giao diện hiện tại.');
    })();try{return await pending;}finally{pending=null;}
  }
  function invalidate(){cached=null;}
  return {find,invalidate};
})();
