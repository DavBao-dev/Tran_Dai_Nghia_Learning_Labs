export function zipFiles(files){
 const encoder=new TextEncoder(),chunks=[],central=[];let offset=0;
 function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return (crc^0xffffffff)>>>0;}
 for(const [name,content] of Object.entries(files)){const path=encoder.encode(name),data=encoder.encode(content),crc=crc32(data),local=new Uint8Array(30+path.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);local.set(path,30);chunks.push(local,data);const c=new Uint8Array(46+path.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,path.length,true);w.setUint32(42,offset,true);c.set(path,46);central.push(c);offset+=local.length+data.length;}
 const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,central.reduce((s,c)=>s+c.length,0),true);ev.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
}
const reserved=new Set(['start-jupyterlab.py','mo-jupyterlab.cmd','requirements-jupyterlab.txt','huong-dan.md','sitecustomize.py','usercustomize.py']);
const safeName=name=>typeof name==='string'&&name.length<=180&&/^[\p{L}\p{N}_. /-]+$/u.test(name)&&!name.split('/').some(s=>['','..','.'].includes(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))&&!reserved.has(name.split('/')[0].toLowerCase());
export function problemFiles(problem,cloud={},runtime={}){
 const files={...problem.files};files['description.md']??=window.TDNCore.descriptionFor(problem);
 files['notebook.ipynb']??=JSON.stringify(window.TDNCore.fromPython(files['baseline.py']||''),null,2);
 for(const name of cloud.deletedFiles||[])if(safeName(name))delete files[name];
 for(const [name,value] of Object.entries(cloud.files||{})){
  if(typeof value==='string'&&safeName(name))files[name]=value;
 }
 return {...files,...runtime};
}
