-- Optional accounts and organisations. A workspace with no members is an unclaimed demo workspace, as before.
-- The first person to sign up in a workspace claims it and becomes its manager; invite links add more members.
--
-- Unlike the demo tables, members is closed to direct access: the public (anon) key cannot write it at all, and a
-- signed-in user can read only their own rows. Every change goes through the SECURITY DEFINER functions below, each
-- checking auth.uid() itself, so nobody can make themselves a member or a manager through the REST API.
-- The other tables keep the open demo policy; row-level security per organisation for them is still planned.
-- Apply as one script: create_org_invite and accept_invite below refer to org_invites, created just before them.
create table if not exists members (
  ws text not null,
  user_id uuid not null,
  role text not null check (role in ('creator', 'brand', 'compliance', 'manager')),
  name text not null,
  created_at timestamptz not null default now(),
  primary key (ws, user_id)
);
create index if not exists members_user on members (user_id);
alter table members enable row level security;
drop policy if exists demo_open on members;
drop policy if exists own_rows on members;
revoke all on members from anon, authenticated;
grant select on members to authenticated;
create policy own_rows on members for select to authenticated using (user_id = auth.uid());

-- Whether a workspace belongs to an organisation. Anyone may ask (the server asks before every request).
create or replace function workspace_claimed(p_ws text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where ws = p_ws);
$$;

-- The members of a workspace, only for one of its members (empty otherwise).
create or replace function members_of(p_ws text) returns setof members
language sql stable security definer set search_path = public as $$
  select * from members m
  where m.ws = p_ws and exists (select 1 from members me where me.ws = p_ws and me.user_id = auth.uid())
  order by m.created_at desc;
$$;

-- The caller's own memberships, most recent first.
create or replace function my_workspaces() returns setof members
language sql stable security definer set search_path = public as $$
  select * from members where user_id = auth.uid() order by created_at desc;
$$;

-- Claim a workspace that has no members: the caller becomes its manager. Idempotent for the caller.
create or replace function claim_workspace(p_ws text, p_name text) returns members
language plpgsql security definer set search_path = public as $$
declare r members;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_ws !~ '^[a-z0-9-]{8,48}$' then raise exception 'Not a workspace id.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('gw-claim:' || p_ws));
  select * into r from members where ws = p_ws and user_id = auth.uid();
  if found then return r; end if;
  if exists (select 1 from members where ws = p_ws) then
    raise exception 'This workspace already belongs to an organisation. Ask its manager for an invite link.' using errcode = 'P0409';
  end if;
  insert into members (ws, user_id, role, name) values (p_ws, auth.uid(), 'manager', left(coalesce(nullif(trim(p_name), ''), 'Manager'), 60)) returning * into r;
  return r;
end;
$$;

create or replace function gw_require_manager(p_ws text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not exists (select 1 from members where ws = p_ws and user_id = auth.uid() and role = 'manager') then
    raise exception 'Only a manager can change members.' using errcode = 'P0403';
  end if;
end;
$$;

-- Invites to an organisation's workspace. Closed like members: only the functions below read or write it, so a
-- forged invite (for example an invite_created row written straight into the open events table) cannot add anyone.
-- Unclaimed demo workspaces keep the old events-based join links, which involve no membership.
create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  ws text not null,
  token_hash text not null unique,
  role text not null check (role in ('creator', 'brand', 'compliance', 'manager')),
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table org_invites enable row level security;
revoke all on org_invites from anon, authenticated;

create or replace function create_org_invite(p_ws text, p_token_hash text, p_role text, p_expires timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform gw_require_manager(p_ws);
  if p_role not in ('creator', 'brand', 'compliance', 'manager') then raise exception 'role must be creator, brand, compliance or manager.' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Not a token hash.' using errcode = '22023'; end if;
  insert into org_invites (ws, token_hash, role, expires_at, created_by)
    values (p_ws, p_token_hash, p_role, least(coalesce(p_expires, now() + interval '7 days'), now() + interval '7 days'), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function revoke_org_invite(p_ws text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform gw_require_manager(p_ws);
  update org_invites set revoked = true where ws = p_ws and id = p_id;
end;
$$;

-- Join through an invite link: reads only org_invites. Idempotent: an existing member keeps their role.
create or replace function accept_invite(p_token_hash text, p_name text) returns members
language plpgsql security definer set search_path = public as $$
declare inv org_invites; r members;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into inv from org_invites where token_hash = p_token_hash and not revoked and expires_at > now();
  if not found then raise exception 'This join link is not valid: it may have expired or been revoked.' using errcode = 'P0404'; end if;
  select * into r from members where ws = inv.ws and user_id = auth.uid();
  if found then return r; end if;
  insert into members (ws, user_id, role, name) values (inv.ws, auth.uid(), inv.role, left(coalesce(nullif(trim(p_name), ''), 'Member'), 60)) returning * into r;
  return r;
end;
$$;

-- A workspace keeps at least one manager.
create or replace function set_member_role(p_ws text, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  perform gw_require_manager(p_ws);
  if p_role not in ('creator', 'brand', 'compliance', 'manager') then raise exception 'role must be creator, brand, compliance or manager.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('gw-members:' || p_ws));
  select role into cur from members where ws = p_ws and user_id = p_user;
  if not found then raise exception 'That member was not found.' using errcode = 'P0404'; end if;
  if cur = 'manager' and p_role <> 'manager' and (select count(*) from members where ws = p_ws and role = 'manager') <= 1 then
    raise exception 'A workspace needs at least one manager. Make someone else a manager first.' using errcode = 'P0409';
  end if;
  update members set role = p_role where ws = p_ws and user_id = p_user;
end;
$$;

create or replace function remove_member(p_ws text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  perform gw_require_manager(p_ws);
  perform pg_advisory_xact_lock(hashtext('gw-members:' || p_ws));
  select role into cur from members where ws = p_ws and user_id = p_user;
  if not found then raise exception 'That member was not found.' using errcode = 'P0404'; end if;
  if cur = 'manager' and (select count(*) from members where ws = p_ws and role = 'manager') <= 1 then
    raise exception 'A workspace needs at least one manager. Make someone else a manager first.' using errcode = 'P0409';
  end if;
  delete from members where ws = p_ws and user_id = p_user;
end;
$$;

revoke all on function workspace_claimed(text), members_of(text), my_workspaces(), claim_workspace(text, text),
  accept_invite(text, text), gw_require_manager(text), set_member_role(text, uuid, text), remove_member(text, uuid),
  create_org_invite(text, text, text, timestamptz), revoke_org_invite(text, uuid) from public;
grant execute on function workspace_claimed(text) to anon, authenticated;
grant execute on function members_of(text), my_workspaces(), claim_workspace(text, text), accept_invite(text, text),
  set_member_role(text, uuid, text), remove_member(text, uuid), create_org_invite(text, text, text, timestamptz),
  revoke_org_invite(text, uuid) to authenticated;
