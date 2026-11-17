import {zipFiles,problemFiles} from './exam-kit.js';
import {auth,init,active} from './cloud.js';
import {Draft,cleanPayload} from './sync-store.js';
const make=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
function save(name,blob){const a=document.createElement('a');a.download=name;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
let loading,runtime;
async function assets(){return loading??=(async()=>{
 await import('./notebook-core.js');await import('./problems.js');
 const entries=await Promise.all(['start-jupyterlab.py','Mo-JupyterLab.cmd','requirements-jupyterlab.txt','HUONG-DAN.md'].map(async name=>{const r=await fetch('jupyter-kit/'+name);if(!r.ok)throw Error('Không tải được launcher. Hãy tải lại trang.');return [name,await r.text()];}));runtime=Object.fromEntries(entries);
})().catch(e=>{loading=null;throw e;});}
export async function mount(root){
 await assets();root.replaceChildren();
 const intro=make('div','','page-heading'),heading=make('div');heading.append(make('p','JUPYTERLAB · CHẠY TRÊN MÁY CỦA BẠN','eyebrow'),make('h1','Môi trường thi'),make('p','Luyện thi bằng JupyterLab thật. Chọn đề, tải bộ bài thi và mở trên máy riêng.','subtitle'));intro.append(heading);root.append(intro);
 const guide=make('section','','exam-guide');guide.append(make('h2','Bắt đầu trong 3 bước'));
 const steps=make('ol');for(const s of ['Tải bộ đề ZIP và giải nén vào thư mục riêng.','Windows: mở Mo-JupyterLab.cmd. macOS/Linux: chạy python3 start-jupyterlab.py trong thư mục vừa giải nén.','JupyterLab mở ở tab riêng: đọc description.md, làm notebook.ipynb, Shift+Enter chạy và Ctrl+S lưu.'])steps.append(make('li',s));
 guide.append(steps,make('p','Cần Python 3.10+. Lần đầu có thể cần Internet để cài thư viện. JupyterLab sử dụng CPU/GPU của từng máy; website không chạy Python thay bạn.','muted'),make('p','Các đề hiện dùng dữ liệu mẫu để luyện thao tác, chưa phải đề thi chính thức.','muted'));root.append(guide);
 const cards=make('div','','exam-local-cards');root.append(cards);
 for(const p of window.TDN_PROBLEMS){
  const card=make('article','','exam-local-card'),status=make('p','','status'),actions=make('div','','study-tools');card.append(make('small',p.category+' · '+p.metric),make('h2',p.title),make('p',p.summary));
  const action=(title,fn)=>{const b=make('button',title,'button');b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};actions.append(b);return b;};
  action('↓ Tải bộ đề JupyterLab',()=>{save('TDN-'+p.id+'-JupyterLab.zip',zipFiles(problemFiles(p,{},runtime)));status.textContent='Đã tải bộ đề. Giải nén trước khi chạy launcher.';});
  action('↓ Tải bài đã lưu cloud',async()=>{await init();if(!active())throw Error('Đăng nhập tài khoản đã được duyệt để tải bài cloud.');const {data,error}=await auth.client.from('workspaces').select('payload').eq('user_id',auth.user.id).eq('scope','exam').eq('item_id',p.id).maybeSingle();if(error)throw error;if(!data)throw Error('Bạn chưa có bản lưu cloud cho đề này.');save('TDN-'+p.id+'-bai-lam-JupyterLab.zip',zipFiles(problemFiles(p,data.payload,runtime)));status.textContent='Đã tải bài cloud và launcher. Hãy giải nén vào thư mục mới.';});
  const input=document.createElement('input');input.type='file';input.accept='.ipynb';input.hidden=true;input.setAttribute('aria-label','Sao lưu notebook '+p.title);card.append(input);
  action('↑ Sao lưu notebook vào tài khoản',async()=>{await init();if(!active())throw Error('Đăng nhập tài khoản đã được duyệt để sao lưu notebook.');input.click();});
  input.onchange=async()=>{const f=input.files[0];input.value='';if(!f)return;let d;
   try{if(f.size>20000000)throw Error('Notebook gốc tối đa 20 MB; bản bỏ output cần dưới 1 MB.');const notebook=window.TDNCore.parseNotebook(await f.text());const cleaned=cleanPayload({files:{'notebook.ipynb':JSON.stringify(notebook)}});
    d=new Draft('exam',p.id,t=>status.textContent=t);const previous=await d.open();if(d.conflict)throw Error('Có bản nháp xung đột. Mở bài làm web cũ để chọn bản cần giữ trước.');
    d.change({...previous,files:{...previous.files,...cleaned.files},activeFile:'notebook.ipynb'});await d.flush();if(d.conflict)throw Error('Bài cloud vừa được sửa ở nơi khác. Bản nhập đã giữ trên máy; mở bài làm web cũ để giải quyết xung đột.');if(d.entry.dirty)throw Error(status.textContent||'Chưa sao lưu được; bản nháp đã giữ trên máy.');status.textContent='Đã sao lưu notebook lên cloud (đã bỏ output).';
   }catch(e){status.textContent=e.message;}finally{d?.close();}
  };
  card.append(actions,status);cards.append(card);
 }
 const legacy=make('a','Chat AI, Description, Submission và bài làm web cũ ↗','button');legacy.href='exam.html'+location.search;legacy.target='_blank';legacy.rel='noopener noreferrer';root.append(make('p','JupyterLab lưu file trên máy. Để chuyển máy, sao lưu notebook ở trên rồi tải bài cloud; không tự đồng bộ thư mục máy tính.','muted'),legacy);
}
