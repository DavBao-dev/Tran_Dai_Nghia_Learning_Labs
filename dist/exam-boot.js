import {auth,init} from './cloud.js';
await init();window.TDNAccount=auth;
const script=document.createElement('script');script.src='app.js?v=accounts-1';
script.onload=()=>import('./exam-sync.js');document.body.append(script);
