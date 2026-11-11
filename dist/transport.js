'use strict';
// The static website has no inference API. Only local hosting may use a relative route.
window.TDNTransport=(()=>{
  const localHosts=new Set(['localhost','127.0.0.1']);
  function failure(code,message){return Object.assign(new Error(message),{code});}
  function endpoint(value,origin=window.location.origin){
    const base=new URL(origin),raw=value.trim();
    if(!raw){if(localHosts.has(base.hostname))return new URL('/api/chat',base).href;throw failure('SETUP_REQUIRED','Bản online chưa có server AI. Nhập địa chỉ gateway GPU hoặc mở bản local.');}
    let url;try{url=new URL(raw);}catch{throw failure('INVALID_ENDPOINT','Địa chỉ gateway không hợp lệ.');}
    if(url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/api/chat'))throw failure('INVALID_ENDPOINT','Dùng URL gateway kết thúc bằng /api/chat, không chứa mật khẩu hoặc mã truy cập.');
    const localHttp=url.protocol==='http:'&&localHosts.has(url.hostname);
    if(url.protocol!=='https:'&&!localHttp)throw failure('INVALID_ENDPOINT','Gateway online phải dùng HTTPS.');
    if(base.protocol==='https:'&&localHttp)throw failure('LOCAL_ONLY','Để dùng GPU trên máy, mở http://127.0.0.1:5173 sau khi chạy start-local.ps1. Bản HTTPS không tự kết nối sang HTTP local.');
    return url.href;
  }
  async function json(response){if(!/application\/json/i.test(response.headers.get('content-type')||''))throw failure('NOT_GATEWAY','Địa chỉ này đang phục vụ trang web, không phải gateway AI. Kiểm tra URL /api/chat.');return response.json();}
  async function probe(value,token='',origin=window.location.origin){
    const url=endpoint(value,origin),health=new URL(url);health.pathname=health.pathname.replace(/\/chat$/,'/health');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(health,{headers:token?{Authorization:'Bearer '+token}:{},signal:controller.signal,cache:'no-store'});
      if(response.status===401||response.status===403)throw failure('AUTH_REQUIRED','Gateway từ chối truy cập. Kiểm tra mã gateway và origin được phép.');
      if([404,405].includes(response.status))throw failure('NOT_GATEWAY','Không tìm thấy API kiểm tra gateway. Host giao diện không chạy model AI.');
      const data=await json(response);
      if(!response.ok||data.ready!==true)throw failure('MODEL_NOT_READY',typeof data.error==='string'?data.error:'Gateway đã chạy nhưng model chưa sẵn sàng. Chạy start-local.ps1 hoặc kiểm tra Ollama.');
      if(typeof data.model!=='string'||!data.model)throw failure('NOT_GATEWAY','Phản hồi kiểm tra gateway không hợp lệ.');
      return {url,model:data.model};
    }catch(error){if(error.code)throw error;throw failure('UNREACHABLE',error.name==='AbortError'?'Gateway không phản hồi trong 8 giây.':'Không kết nối được gateway. Kiểm tra server, HTTPS và cấu hình CORS.');}
    finally{clearTimeout(timer);}
  }
  async function readChat(response){
    if(response.status===429)throw failure('BUSY','AI đang xử lý yêu cầu trước. Đợi một lát rồi gửi lại.');
    if([404,405].includes(response.status))throw failure('NOT_GATEWAY','URL chat chưa trỏ đến gateway AI. Host giao diện không nhận yêu cầu chạy model.');
    const data=await json(response);
    if(!response.ok)throw failure(data.code==='GENERATION_LIMIT'?'GENERATION_LIMIT':'CHAT_ERROR',typeof data.error==='string'?data.error:'Gateway trả lỗi '+response.status);
    if(typeof data.content!=='string'||!data.content.trim())throw failure('BAD_RESPONSE','Gateway chưa trả về câu trả lời hợp lệ.');return data;
  }
  function chatHistory(messages){
    const result=[];let pending=null;
    const item=m=>({role:m.role,content:m.text,attachment:m.attachment||null});
    for(const message of messages){if(message.role==='user')pending=message;else if(message.role==='assistant'&&pending){result.push(item(pending),item(message));pending=null;}}
    if(pending)result.push(item(pending));return result.slice(-11);
  }
  return {endpoint,probe,readChat,chatHistory};
})();
