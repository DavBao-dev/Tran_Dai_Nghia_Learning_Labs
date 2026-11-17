import {Window} from 'happy-dom';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const win=new Window({url:'https://tdn.example/'});globalThis.window=win;globalThis.document=win.document;globalThis.location=win.location;globalThis.localStorage=win.localStorage;
globalThis.fetch=async path=>({ok:true,json:async()=>({url:'',publishableKey:''}),text:async()=>fs.readFile(new URL('../dist/'+path,import.meta.url),'utf8')});
const {mount}=await import('../dist/exam-local.js');const root=document.createElement('div');document.body.append(root);await mount(root);
assert.equal(root.querySelectorAll('.exam-local-card').length,5);assert.equal(root.querySelectorAll('iframe').length,0);
assert(root.textContent.includes('JupyterLab thật'));assert(root.textContent.includes('Mo-JupyterLab.cmd'));
assert(root.querySelector('a[href="exam.html"]'));assert.equal(root.querySelectorAll('input[type=file]').length,5);
const downloadCloud=[...root.querySelectorAll('button')].find(x=>x.textContent.includes('Tải bài đã lưu cloud'));await downloadCloud.onclick();assert(root.textContent.includes('Đăng nhập tài khoản đã được duyệt'));
await win.happyDOM.close();console.log('PASS: exam landing has 5 kits, legacy link, backup controls and auth gate; no embedded server/editor runtime.');
