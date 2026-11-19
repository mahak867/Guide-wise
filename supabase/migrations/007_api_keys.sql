-- Round 3: API keys for the REST API and the MCP server. Only a SHA-256 hash of each key is stored.
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  ws text not null,
  name text not null,
  prefix text not null,
  hash text not null unique,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_ws on api_keys (ws);
alter table api_keys enable row level security;
drop policy if exists demo_open on api_keys;
create policy demo_open on api_keys for all to anon, authenticated using (true) with check (true);
grant all on api_keys to anon, authenticated;
