let opening;
const pending=new Map();
function database(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('tdn-account-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function readCache(key){
 await pending.get(key)?.catch(()=>{});
 if(typeof indexedDB==='undefined')return JSON.parse(localStorage.getItem(key)||'null');
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
}
export function writeCache(key,value){
 const task=(pending.get(key)||Promise.resolve()).catch(()=>{}).then(()=>put(key,value));pending.set(key,task);return task.finally(()=>{if(pending.get(key)===task)pending.delete(key);});
}
async function put(key,value){
 if(typeof indexedDB==='undefined'){localStorage.setItem(key,JSON.stringify(value));return;}
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không lưu được bản máy.'));});
}
