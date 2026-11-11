// On-demand SVG labs. No renderer, model, timers or animation loop required.
export function regressionStep(points,w,b,rate){let dw=0,db=0,loss=0;for(const [x,y] of points){const e=w*x+b-y;loss+=e*e;dw+=2*e*x;db+=2*e;}const n=points.length;return {w:w-rate*dw/n,b:b-rate*db/n,loss:loss/n,dw:dw/n,db:db/n};}
export function convolve(input,kernel){if(input.length!==25||kernel.length!==9)throw Error('Cần ảnh 5×5 và kernel 3×3.');return Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;let sum=0;for(let y=0;y<3;y++)for(let x=0;x<3;x++)sum+=input[(r+y)*5+c+x]*kernel[y*3+x];return sum;});}
export function traceNetwork(source,input){
 if(source.length>4000)throw Error('Tối đa 4.000 ký tự.');let shape=input.split(',').map(v=>Number(v.trim()));
 if(!shape.length||shape.length>3||shape.some(v=>!Number.isInteger(v)||v<1||v>2048))throw Error('Shape gồm 1–3 số nguyên từ 1 đến 2048, không tính batch.');
 const matches=[...source.replace(/#.*$/gm,'').matchAll(/nn\.(\w+)\(([^()]*)\)/g)];if(!matches.length||matches.length>8)throw Error('Nhập 1–8 lớp nn.Linear, ReLU, Conv2d, MaxPool2d, Flatten hoặc Dropout.');
 const layers=[];
 for(const match of matches){const type=match[1];if(type==='Sequential')continue;const before=[...shape],args=match[2].split(',').map(v=>v.trim()).filter(Boolean),named={},pos=[];
  for(const arg of args){const pair=arg.split('=');if(pair.length===2)named[pair[0].trim()]=pair[1].trim();else if(pair.length===1)pos.push(arg);else throw Error('Tham số chưa được hỗ trợ.');}
  const num=(name,index,fallback)=>{const raw=named[name]??pos[index]??fallback;const n=Number(raw);if(!Number.isInteger(n)||n<0||n>2048)throw Error(type+': '+name+' phải là số nguyên 0–2048.');return n;};let params=0;
  const supported={Linear:['in_features','out_features','bias'],Conv2d:['in_channels','out_channels','kernel_size','stride','padding','bias'],MaxPool2d:['kernel_size','stride','padding'],Flatten:[],ReLU:['inplace'],Dropout:['p','inplace']};
  if(supported[type]&&Object.keys(named).some(key=>!supported[type].includes(key)))throw Error(type+': có tham số chưa được mô phỏng trong Lab nhẹ.');
  const maxPos={Linear:3,Conv2d:5,MaxPool2d:3,Flatten:0,ReLU:1,Dropout:2};if(pos.length>(maxPos[type]??0))throw Error(type+': quá nhiều tham số vị trí.');
  if(type==='Linear'){const ins=num('in_features',0),outs=num('out_features',1);if(!ins||!outs||shape.at(-1)!==ins)throw Error('Linear nhận '+ins+' đặc trưng nhưng đầu vào có '+shape.at(-1)+'.');shape[shape.length-1]=outs;params=ins*outs+(named.bias==='False'||pos[2]==='False'?0:outs);}
  else if(type==='Conv2d'){if(shape.length!==3)throw Error('Conv2d cần shape C,H,W.');const cin=num('in_channels',0),cout=num('out_channels',1),k=num('kernel_size',2),s=num('stride',3,1),p=num('padding',4,0);if(cin!==shape[0]||!cout||!k||!s)throw Error('Kiểm tra channels, kernel và stride của Conv2d.');if(named.groups||named.dilation)throw Error('Bản mô phỏng nhẹ chỉ hỗ trợ groups=1 và dilation=1 (bỏ hai tham số này).');shape=[cout,Math.floor((shape[1]+2*p-k)/s+1),Math.floor((shape[2]+2*p-k)/s+1)];params=cout*cin*k*k+(named.bias==='False'?0:cout);}
  else if(type==='MaxPool2d'){if(shape.length!==3)throw Error('MaxPool2d cần shape C,H,W.');const k=num('kernel_size',0),s=num('stride',1,k),p=num('padding',2,0);if(!k||!s)throw Error('Kernel và stride phải lớn hơn 0.');if(named.ceil_mode||named.dilation)throw Error('Chưa hỗ trợ ceil_mode hoặc dilation.');shape=[shape[0],Math.floor((shape[1]+2*p-k)/s+1),Math.floor((shape[2]+2*p-k)/s+1)];}
  else if(type==='Flatten'){if(args.length)throw Error('Dùng nn.Flatten() để gộp mọi chiều ngoài batch.');shape=[shape.reduce((a,b)=>a*b,1)];}
  else if(!['ReLU','Dropout'].includes(type))throw Error('Chưa hỗ trợ nn.'+type+'. Lab này phân tích cấu hình lớp, không chạy Python.');
  if(shape.some(v=>v<=0))throw Error(type+': kích thước đầu ra không hợp lệ.');layers.push({type,input:before,output:[...shape],params});
 }return layers;
}
let host,active='network';const state={network:'nn.Linear(4, 8)\nnn.ReLU()\nnn.Linear(8, 2)',shape:'4',step:0,w:-.5,b:1,rate:.03,iterations:0,pixels:Array.from({length:25},(_,i)=>i%5===2?1:0),kernel:[-1,0,1,-1,0,1,-1,0,1],cell:0,kernelName:'edge'};
const points=[[0,.4],[.5,1.2],[1,1.4],[1.5,2.4],[2,2.7],[2.5,3.6],[3,3.8],[3.5,4.5],[4,5.4]];
const shapeText=a=>'['+a.join(', ')+']';
const $=s=>host.querySelector(s);
const svg=(body,view='0 0 620 360')=>'<svg viewBox="'+view+'" role="img" aria-label="Mô phỏng trực quan">'+body+'</svg>';
export function pause(){} // Draw only in response to user events; nothing runs while inactive.
export function mount(target){host=target;if(host.childElementCount)return;host.innerHTML='<div class="lab-shell"><div class="lab-tabs"><button data-lab="network">01 · Luồng tensor</button><button data-lab="regression">02 · Gradient descent</button><button data-lab="convolution">03 · Convolution</button></div><div class="lab-workspace"><div class="lab-controls"></div><div class="lab-stage"></div></div></div>';host.querySelectorAll('[data-lab]').forEach(b=>b.onclick=()=>{active=b.dataset.lab;render();});render();}
function render(){host.querySelectorAll('[data-lab]').forEach(b=>b.setAttribute('aria-pressed',String(active===b.dataset.lab)));if(active==='network')network();if(active==='regression')regression();if(active==='convolution')convolution();}
function network(){
 $('.lab-controls').innerHTML='<h3>Nhìn vào bên trong mạng</h3><p>Nhập các lớp theo thứ tự trong nn.Sequential. Theo dõi shape và số tham số, lấy cảm hứng từ TorchViz-3D.</p><div class="lab-step"><button id="mlpPreset">MLP mẫu</button><button id="cnnPreset">CNN mẫu</button></div><label>Shape đầu vào · không tính batch<input id="inputShape" aria-label="Shape đầu vào" placeholder="1,28,28"></label><label>Cấu hình các lớp<textarea id="layerSource" spellcheck="false" aria-label="Các lớp nn.Sequential"></textarea></label><button id="visualize" class="primary">Visualize →</button><p class="lab-error" id="netError" role="status"></p>';
 $('#inputShape').value=state.shape;$('#layerSource').value=state.network;
 $('#layerSource').oninput=e=>state.network=e.target.value;$('#inputShape').oninput=e=>state.shape=e.target.value;
 $('#mlpPreset').onclick=()=>{state.network='nn.Linear(4, 8)\nnn.ReLU()\nnn.Linear(8, 2)';state.shape='4';state.step=0;network();};
 $('#cnnPreset').onclick=()=>{state.network='nn.Conv2d(1, 4, 3)\nnn.ReLU()\nnn.MaxPool2d(2)\nnn.Flatten()\nnn.Linear(676, 10)';state.shape='1,28,28';state.step=0;network();};
 $('#visualize').onclick=()=>{state.step=0;drawNetwork();};drawNetwork();
}
function drawNetwork(){try{
 const layers=traceNetwork(state.network,state.shape);state.step=Math.min(state.step,layers.length-1);$('#netError').textContent='';
 let body='';layers.forEach((layer,i)=>{const y=18+i*70,selected=i===state.step,c=selected?'#8bdac9':'#6788b8';if(i)body+='<path d="M175 '+(y-12)+'V'+y+'" stroke="#718db0" stroke-width="2"/>';
 body+='<g><path d="M72 '+y+'h208l12 10H84Z" fill="'+c+'" opacity=".55"/><path d="M280 '+y+'l12 10v43l-12-10Z" fill="'+c+'" opacity=".3"/><rect x="72" y="'+y+'" width="208" height="43" rx="4" fill="'+(selected?'#274c48':'#203047')+'" stroke="'+c+'"/><text x="88" y="'+(y+27)+'" fill="#e0ebf9" font-family="monospace" font-size="14">'+(i+1)+'. '+layer.type+'</text><text x="320" y="'+(y+16)+'" fill="'+c+'" font-family="monospace" font-size="12">'+shapeText(layer.input)+' → '+shapeText(layer.output)+'</text><text x="320" y="'+(y+36)+'" fill="#8296af" font-size="11">'+layer.params.toLocaleString()+' tham số</text></g>';});
 $('.lab-stage').innerHTML=svg(body,'0 0 620 '+Math.max(270,layers.length*70+25))+'<div class="lab-step"><button id="previousLayer">← Lớp trước</button><button id="nextLayer">Lớp tiếp →</button><span class="muted">Từng bước · <b id="layerNumber"></b></span></div><div class="lab-stats"><span>Tổng <strong>'+layers.reduce((a,l)=>a+l.params,0).toLocaleString()+'</strong> tham số</span><span>Output <strong>'+shapeText(layers.at(-1).output)+'</strong></span></div><p class="lab-caption">Chỉ mô phỏng luồng kích thước tensor; không chạy Python hay huấn luyện model. Các lớp được đọc theo thứ tự bạn nhập.</p>';
 $('#layerNumber').textContent=(state.step+1)+' / '+layers.length;$('#previousLayer').disabled=state.step===0;$('#nextLayer').disabled=state.step===layers.length-1;
 $('#previousLayer').onclick=()=>{state.step--;drawNetwork();};$('#nextLayer').onclick=()=>{state.step++;drawNetwork();};
 }catch(e){$('#netError').textContent=e.message;$('.lab-stage').innerHTML='<p class="empty">Chỉnh lại cấu hình rồi bấm Visualize.</p>';}}
function regression(){
 $('.lab-controls').innerHTML='<h3>Để đường thẳng học</h3><p>Model y = wx + b. Điều chỉnh tham số hoặc cập nhật gradient để giảm sai số MSE.</p><label>Trọng số w <output id="wValue"></output><input id="w" type="range" min="-2" max="3" step=".01"></label><label>Bias b <output id="bValue"></output><input id="b" type="range" min="-2" max="3" step=".01"></label><label>Learning rate η<select id="rate"><option value=".01">0.01</option><option value=".03">0.03</option><option value=".08">0.08</option><option value=".25">0.25 · có thể phân kỳ</option></select></label><div><button id="oneStep" class="primary">Học 1 bước</button><button id="tenSteps">Học 10 bước</button><button id="resetFit">Đặt lại</button></div><p id="fitNote" role="status"></p>';
 $('#w').value=state.w;$('#b').value=state.b;$('#rate').value=state.rate;
 for(const key of ['w','b'])$('#'+key).oninput=e=>{state[key]=Number(e.target.value);state.iterations=0;drawRegression();};$('#rate').onchange=e=>state.rate=Number(e.target.value);
 const step=n=>{for(let i=0;i<n;i++){const r=regressionStep(points,state.w,state.b,state.rate);if(!Number.isFinite(r.w)||Math.abs(r.w)>1e5||Math.abs(r.b)>1e5){$('#fitNote').textContent='Đã dừng vì phân kỳ. Giảm learning rate rồi đặt lại.';break;}state.w=r.w;state.b=r.b;state.iterations++;}drawRegression();};$('#oneStep').onclick=()=>step(1);$('#tenSteps').onclick=()=>step(10);$('#resetFit').onclick=()=>{state.w=-.5;state.b=1;state.iterations=0;regression();};drawRegression();
}
function drawRegression(){
 const r=regressionStep(points,state.w,state.b,state.rate),px=x=>60+x*122,py=y=>300-y*40;
 let body='<defs><clipPath id="plotClip"><rect x="58" y="18" width="494" height="303"/></clipPath></defs>';
 for(let i=0;i<=6;i++)body+='<path d="M60 '+py(i)+'H550" stroke="#2c3d50"/><text x="36" y="'+(py(i)+4)+'" fill="#8194ac" font-size="10">'+i+'</text>';
 body+='<path d="M60 20V300H550" stroke="#73859a" fill="none"/><g clip-path="url(#plotClip)">';
 for(const [x,y] of points)body+='<path d="M'+px(x)+' '+py(y)+'V'+py(state.w*x+state.b)+'" stroke="#e5b779" stroke-dasharray="3 4" opacity=".6"/><circle cx="'+px(x)+'" cy="'+py(y)+'" r="5" fill="#b1c8e8"/>';
 body+='<path d="M'+px(0)+' '+py(state.b)+'L'+px(4)+' '+py(4*state.w+state.b)+'" stroke="#87debf" stroke-width="3"/></g><text x="260" y="335" fill="#91a6bf" font-size="12">x · đặc trưng đầu vào</text>';
 $('.lab-stage').innerHTML=svg(body)+'<div class="lab-stats"><span>MSE <strong>'+r.loss.toFixed(4)+'</strong></span><span>Bước <strong>'+state.iterations+'</strong></span><span>∂L/∂w <strong>'+r.dw.toFixed(3)+'</strong></span></div><p class="lab-caption">Đường xanh là dự đoán. Đoạn nét đứt là sai số. Mỗi bước: w ← w − η·∂L/∂w, b ← b − η·∂L/∂b.</p>';
 $('#wValue').textContent=state.w.toFixed(3);$('#bValue').textContent=state.b.toFixed(3);$('#w').value=state.w;$('#b').value=state.b;
}
function convolution(){
 $('.lab-controls').innerHTML='<h3>Một cửa sổ, một đặc trưng</h3><p>Nhấp ô ảnh để bật/tắt pixel. Chọn một ô đầu ra để xem vùng mà kernel đọc.</p><label>Kernel<select id="kernel"><option value="edge">Biên dọc</option><option value="horizontal">Biên ngang</option><option value="blur">Làm mờ trung bình</option><option value="identity">Giữ điểm giữa</option></select></label><div id="kernelValues"></div><p>Stride = 1 · Padding = 0<br>5×5 → kernel 3×3 → output 3×3</p><button id="resetPixels">Khôi phục ảnh</button>';
 $('#kernel').value=state.kernelName;$('#kernel').onchange=e=>{state.kernelName=e.target.value;state.kernel={edge:[-1,0,1,-1,0,1,-1,0,1],horizontal:[-1,-1,-1,0,0,0,1,1,1],blur:Array(9).fill(1/9),identity:[0,0,0,0,1,0,0,0,0]}[e.target.value];drawConvolution();};$('#resetPixels').onclick=()=>{state.pixels=Array.from({length:25},(_,i)=>i%5===2?1:0);drawConvolution();};drawConvolution();
}
function grid(values,columns,action,label){const el=document.createElement('div');el.className='pixel-grid';el.style.gridTemplateColumns='repeat('+columns+', 1fr)';values.forEach((v,i)=>{const b=document.createElement('button');b.textContent=Number.isInteger(v)?v:v.toFixed(2);b.setAttribute('aria-label',label+' hàng '+(Math.floor(i/columns)+1)+' cột '+(i%columns+1)+': '+v);b.style.background=v>0?'#2c665b':v<0?'#5b3d54':'#202d3e';if(action)b.onclick=()=>action(i);else b.disabled=true;el.append(b);});return el;}
function drawConvolution(){const output=convolve(state.pixels,state.kernel);$('.lab-stage').innerHTML='<div class="grid-wrap"><div><h4>Ảnh đầu vào · nhấp để thay đổi</h4><div id="pixels"></div></div><span aria-hidden="true">→</span><div><h4>Feature map · chọn ô</h4><div id="output"></div></div></div><div class="lab-stats" id="convStats"></div><p class="lab-caption" id="convEquation"></p>';
 $('#pixels').append(grid(state.pixels,5,i=>{state.pixels[i]=1-state.pixels[i];drawConvolution();},'Ảnh'));$('#output').append(grid(output,3,i=>{state.cell=i;drawConvolution();},'Output'));
 const row=Math.floor(state.cell/3),col=state.cell%3,terms=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++){const i=(row+y)*5+col+x;$('#pixels').querySelectorAll('button')[i].style.borderColor='#cae8b5';terms.push(state.pixels[i]+'×'+(Number.isInteger(state.kernel[y*3+x])?state.kernel[y*3+x]:'1/9'));}
 $('#output').querySelectorAll('button')[state.cell].style.outline='2px solid #ccebc2';$('#convStats').textContent='Ô ('+(row+1)+', '+(col+1)+') = '+output[state.cell].toFixed(3);$('#convEquation').textContent=terms.join(' + ')+' = '+output[state.cell].toFixed(3);
 $('#kernelValues').replaceChildren(grid(state.kernel,3,null,'Kernel'));
}
