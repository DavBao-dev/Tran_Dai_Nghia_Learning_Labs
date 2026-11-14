-- Run in Supabase SQL editor as postgres. No service key is needed in the browser.
revoke create on schema public from public,anon,authenticated;
create table public.members (
 id uuid primary key references auth.users on delete cascade,
 email text not null, display_name text not null default '',
 status text not null default 'pending' check(status in ('pending','active','blocked')),
 role text not null default 'student' check(role in ('student','admin')),
 created_at timestamptz not null default now()
);
create function public.new_member() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.members(id,email,display_name) values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''));
 return new;
end $$;
create trigger on_new_member after insert on auth.users for each row execute function public.new_member();
create function public.is_active() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from members where id=auth.uid() and status='active') $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from members where id=auth.uid() and status='active' and role='admin') $$;
create table public.lessons (
 id text primary key, title text not null check(length(title)<=300),
 drive_id text not null check(drive_id ~ '^[A-Za-z0-9_-]+$'),
 mime text not null, folder text not null default '', session_no integer,
 sort_order integer not null default 0, hidden boolean not null default false,
 updated_at timestamptz not null default now()
);
create index lessons_order on public.lessons(sort_order,id);
create index lessons_session on public.lessons(session_no,sort_order,id);
create table public.sessions (id integer primary key, title text not null check(length(title)<=300));
alter table public.sessions enable row level security;
create policy sessions_read on public.sessions for select to authenticated using(public.is_active());
create policy sessions_admin on public.sessions for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on public.sessions from anon,authenticated;
grant select,insert,update,delete on public.sessions to authenticated;
create table public.workspaces (
 user_id uuid not null references public.members on delete cascade,
 scope text not null check(scope in ('lesson','exam')), item_id text not null check(length(item_id)<=150),
 payload jsonb not null default '{}', revision integer not null default 1,
 updated_at timestamptz not null default now(), primary key(user_id,scope,item_id)
);
alter table public.members enable row level security;
alter table public.lessons enable row level security;
alter table public.workspaces enable row level security;
create policy members_read on public.members for select to authenticated using(id=auth.uid() or public.is_admin());
create policy lessons_read on public.lessons for select to authenticated using(public.is_active() and (not hidden or public.is_admin()));
create policy lessons_admin on public.lessons for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy works_read on public.workspaces for select to authenticated using(user_id=auth.uid() and public.is_active());
-- Writes go through RPCs only, so neither role nor revision/quota can be bypassed.
revoke all on public.members,public.lessons,public.workspaces from anon,authenticated;
grant select on public.members,public.workspaces to authenticated;
grant select,insert,update,delete on public.lessons to authenticated;
create function public.set_member_status(member_id uuid, new_status text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if new_status not in ('pending','active','blocked') then raise exception 'INVALID_STATUS'; end if;
 if member_id=auth.uid() then raise exception 'CANNOT_BLOCK_SELF'; end if;
 update members set status=new_status where id=member_id and role<>'admin';
end $$;
create function public.save_workspace(p_scope text,p_item text,p_payload jsonb,p_revision integer)
returns public.workspaces language plpgsql security definer set search_path=public as $$
declare old public.workspaces; saved public.workspaces; total bigint; bytes bigint;
begin
 if not public.is_active() then raise exception 'FORBIDDEN'; end if;
 -- Serialize all writes of one account, including first insert and quota checks.
 perform 1 from members where id=auth.uid() for update;
 select * into old from workspaces where user_id=auth.uid() and scope=p_scope and item_id=p_item;
 if coalesce(old.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 bytes:=octet_length(p_payload::text);
 if bytes>1048576 then raise exception 'WORKSPACE_TOO_LARGE'; end if;
 select coalesce(sum(octet_length(payload::text)),0) into total from workspaces where user_id=auth.uid();
 if total-coalesce(octet_length(old.payload::text),0)+bytes>10485760 then raise exception 'ACCOUNT_QUOTA'; end if;
 insert into workspaces(user_id,scope,item_id,payload,revision) values(auth.uid(),p_scope,p_item,p_payload,1)
 on conflict(user_id,scope,item_id) do update set payload=excluded.payload,revision=workspaces.revision+1,updated_at=now()
 returning * into saved;
 return saved;
end $$;
revoke all on function public.new_member(),public.set_member_status(uuid,text),public.save_workspace(text,text,jsonb,integer) from public;
grant execute on function public.set_member_status(uuid,text),public.save_workspace(text,text,jsonb,integer) to authenticated;
revoke all on function public.is_active(),public.is_admin() from public;
grant execute on function public.is_active(),public.is_admin() to authenticated;
-- After the intended owner has signed in once, run manually as postgres:
-- update public.members set role='admin',status='active' where email='davidtuber710@gmail.com';
