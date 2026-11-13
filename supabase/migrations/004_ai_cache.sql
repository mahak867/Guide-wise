-- Optional: lets the AI answer cache survive server restarts and be shared across instances.
-- Without this table the cache still works in memory.
create table if not exists ai_cache (
  key text primary key,
  task text not null default '',
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table ai_cache enable row level security;
drop policy if exists demo_open on ai_cache;
create policy demo_open on ai_cache for all to anon, authenticated using (true) with check (true);
grant all on ai_cache to anon, authenticated;
