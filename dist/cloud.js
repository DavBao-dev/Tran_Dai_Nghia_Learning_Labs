// Shared auth adapter. No secrets, service-role key, polling or realtime channel.
export const auth={client:null,user:null,member:null,configured:false,error:'',generation:0};
export const active=()=>auth.member?.status==='active';
export const admin=()=>active()&&auth.member?.role==='admin';
export async function refreshMember(){
 if(!auth.user)return;
 const {data,error}=await auth.client.from('members').select('*').eq('id',auth.user.id).single();
 if(error)throw error;auth.member=data;return data;
}
let loading;
export function init(){return loading??=initialize();}
async function initialize(){
 try{
  const r=await fetch('/cloud-config.json',{cache:'no-store'});if(!r.ok)return auth;
  const config=await r.json();if(!config.url||!config.publishableKey)return auth;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url))throw Error('Project URL Supabase không hợp lệ.');
  const {createClient}=await import('./vendor/supabase.js');
  auth.client=createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true},global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}});
  auth.configured=true;
  const {data,error}=await auth.client.auth.getSession();if(error)throw error;
  auth.user=data.session?.user||null;if(auth.user)await refreshMember();
  auth.client.auth.onAuthStateChange((event,session)=>{
   const id=session?.user?.id||null;if(id!==(auth.user?.id||null)){auth.generation++;location.reload();}
  });
 }catch(e){auth.error=e.message;}
 return auth;
}
export async function login(){
 if(!auth.configured)throw Error('Chưa cấu hình Supabase và Google OAuth.');
 const {error}=await auth.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}});if(error)throw error;
}
export async function logout(){const {error}=await auth.client.auth.signOut();if(error)throw error;location.reload();}
export async function rows(table,query={}){
 let q=auth.client.from(table).select('*');for(const [key,value] of Object.entries(query))q=q.eq(key,value);
 const {data,error}=await q;if(error)throw error;return data;
}
