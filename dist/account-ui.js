import {auth,init,active,admin,login,logout,refreshMember} from './cloud.js';
const button=document.createElement('button');button.className='button account';button.textContent='Đăng nhập';document.querySelector('.topbar').append(button);
const dialog=document.createElement('dialog');dialog.className='admin';document.body.append(dialog);
function el(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function action(text,fn){const b=el('button',text);b.type='button';b.className='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{b.disabled=false;}};return b;}
export const ready=init().then(()=>{button.textContent=auth.user?(auth.member?.display_name||auth.user.email):'Đăng nhập';return auth;});
button.onclick=async()=>{await ready;dialog.replaceChildren(el('h2','Tài khoản'),action('Đóng',()=>dialog.close()));
 if(!auth.configured){dialog.append(el('p',auth.error||'Chưa kết nối Supabase. Quản trị viên cần hoàn tất bước cài đặt tài khoản.'));}
 else if(!auth.user)dialog.append(action('Đăng nhập Google',login));
 else{
 dialog.append(el('p',auth.user.email),el('p',({pending:'Tài khoản đang chờ admin duyệt.',active:'Tài khoản đang hoạt động.',blocked:'Tài khoản đã bị khóa.'})[auth.member?.status]||'Không đọc được quyền tài khoản.'));
 dialog.append(action('Kiểm tra trạng thái',async()=>{await refreshMember();location.reload();}),action('Đăng xuất',logout));
 if(admin())dialog.append(action('Quản lý thành viên và học liệu',async()=>{const {mountAdmin}=await import('./learning-admin.js');await mountAdmin(dialog);}));
 }dialog.showModal();};
