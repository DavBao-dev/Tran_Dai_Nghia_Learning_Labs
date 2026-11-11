import React from 'react';
import {createRoot} from 'react-dom/client';
import './src/index.css';
import TorchVizWorkspace from './src/components/workspace/TorchVizWorkspace';
import {useStore} from './src/store/useStore';
import {workerService} from './src/lib/workerService';
const KEY='tdn-torchviz-draft-v1';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved.code==='string'&&typeof saved.shape==='string')useStore.setState({code:saved.code,shapeInput:saved.shape});}catch{}
let timer:ReturnType<typeof setTimeout>;
const save=()=>{try{const s=useStore.getState();localStorage.setItem(KEY,JSON.stringify({code:s.code,shape:s.shapeInput}));}catch{}};
useStore.subscribe((s,p)=>{if(s.code!==p.code||s.shapeInput!==p.shapeInput){clearTimeout(timer);timer=setTimeout(save,350);}});
window.addEventListener('pagehide',()=>{save();workerService.terminate();});
const root=createRoot(document.getElementById('root')!);
let mounted=true;
const stop=()=>{save();if(mounted){root.unmount();mounted=false;}workerService.terminate();};
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='tdn-stop-3d'){stop();parent.postMessage({type:'tdn-3d-stopped'},location.origin);}});
root.render(<TorchVizWorkspace onBackToLanding={()=>parent.postMessage({type:'tdn-exit-3d'},location.origin)}/>);
