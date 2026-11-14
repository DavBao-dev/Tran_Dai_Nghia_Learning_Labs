import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated;`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/001_learning.sql',import.meta.url),'utf8'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
for(let i=1;i<=23;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[id(i),'user'+i+'@test.invalid']);
await db.exec(`update public.members set status='active';update public.members set role='admin' where id='${id(1)}';update public.members set status='pending' where id='${id(23)}';`);
async function as(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);`);}
async function fail(sql,args,pattern){await assert.rejects(db.query(sql,args),pattern);}
await as(2);assert.equal((await db.query('select * from members')).rows.length,1);
await fail("update members set role='admin' where id=$1",[id(2)],/permission denied/);
await fail('select set_member_status($1,$2)',[id(3),'blocked'],/FORBIDDEN/);
const save=(item,payload={},revision=0)=>db.query('select * from save_workspace($1,$2,$3,$4)',['lesson',item,payload,revision]);
let a=await save('session-1',{files:{'main.py':'print(42)'}});assert.equal(a.rows[0].revision,1);
await fail('select save_workspace($1,$2,$3,$4)',['lesson','session-1',{},0],/REVISION_CONFLICT/);
await fail("insert into workspaces(user_id,scope,item_id,payload) values($1,'lesson','b','{}')",[id(2)],/permission denied/);
await as(3);assert.equal((await db.query('select * from workspaces')).rows.length,0);
await as(1);await db.query('select set_member_status($1,$2)',[id(2),'blocked']);
await as(2);assert.equal((await db.query('select * from workspaces')).rows.length,0);await assert.rejects(save('blocked'),/FORBIDDEN/);
await as(23);await assert.rejects(save('pending'),/FORBIDDEN/);
await as(3);await assert.rejects(save('huge',{text:'x'.repeat(1048576)}),/WORKSPACE_TOO_LARGE/);
for(let i=0;i<10;i++)await save('quota-'+i,{text:'x'.repeat(1000000)});
await assert.rejects(save('quota-over',{text:'x'.repeat(1000000)}),/ACCOUNT_QUOTA/);
await as(1);await db.exec("insert into sessions values(1,'Python');insert into lessons(id,title,drive_id,mime,hidden) values('a','Visible','a','video/mp4',false),('b','Hidden','b','video/mp4',true)");
await as(4);assert.equal((await db.query('select * from lessons')).rows.length,1);assert.equal((await db.query("update lessons set hidden=false where id='b'")).affectedRows,0);
await db.exec('reset role;set role anon');await fail('select * from workspaces',[],/permission denied/);
const start=performance.now();
for(let n=4;n<23;n++){await as(n);await save('session-test',{files:{'main.py':'print('+n+')'}});const r=await db.query('select * from workspaces');assert.equal(r.rows.length,1);assert.equal(r.rows[0].user_id,id(n));}
console.log('PASS PostgreSQL RLS: isolation, pending/blocked, no role escalation, hidden resources, RPC revision and quota.');
console.log('19 account write/read cycles (local WASM database, not hosted load test):',Math.round(performance.now()-start),'ms');
await db.close();
