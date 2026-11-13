-- Guidewise Round 2 schema. Single open demo workspace (no sign-in for judges).
create table if not exists kit (
  id int primary key default 1 check (id = 1),
  name text not null default 'PrepPath Academy',
  version int not null default 1,
  palette jsonb not null default '[]',
  disclaimers jsonb not null default '[]',
  contacts jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table if not exists rules (
  id text primary key,
  kind text not null check (kind in ('code','judgment')),
  category text not null,
  title text not null,
  description text not null default '',
  severity text not null default 'major' check (severity in ('critical','major','minor')),
  status text not null default 'advisory' check (status in ('advisory','enforced')),
  source text not null default 'brand',
  risk text not null default 'low' check (risk in ('low','high')),
  config jsonb not null default '{}',
  tests jsonb not null default '[]',
  last_test jsonb,
  precedent jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists facts (
  id text primary key,
  kind text not null default 'fact' check (kind in ('fact','student')),
  statement text not null,
  value numeric,
  keywords jsonb not null default '[]',
  evidence text not null default '',
  owner text not null default '',
  valid_from date,
  valid_until date,
  disclosure text not null default '',
  disclosure_keywords jsonb not null default '[]',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  content_type text not null default 'social',
  text text not null,
  intent jsonb not null default '{}',
  status text not null default 'draft',
  risk_tier text,
  risk_reasons jsonb not null default '[]',
  version int not null default 1,
  kit_version int not null default 1,
  author text not null default 'Riya',
  mode text not null default 'rules-only',
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts(id) on delete cascade,
  draft_version int not null default 1,
  rule_id text not null,
  fact_id text,
  check_type text not null,
  severity text not null,
  level text not null default 'violation',
  risk text not null default 'low',
  quote text not null,
  message text not null,
  rule_text text not null default '',
  fix text,
  fix_note text,
  fix_status text not null default 'none',
  state text not null default 'open',
  dismiss_reason text,
  resolved_by text,
  precedent jsonb,
  created_at timestamptz not null default now()
);
create index if not exists findings_draft_idx on findings(draft_id);

create table if not exists events (
  id bigint generated always as identity primary key,
  draft_id uuid references drafts(id) on delete cascade,
  actor text not null,
  role text not null,
  action text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists events_draft_idx on events(draft_id);

create table if not exists versions (
  id bigint generated always as identity primary key,
  draft_id uuid not null references drafts(id) on delete cascade,
  version int not null,
  text text not null,
  note text not null default '',
  at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts(id) on delete cascade,
  text_hash text not null,
  approved_text text not null,
  kit_version int not null,
  findings_summary jsonb not null default '{}',
  approver text not null,
  approver_role text not null,
  at timestamptz not null default now()
);

-- Open demo workspace: the app has no sign-in in Round 2, so the anon role may read and write.
do $$
declare t text;
begin
  foreach t in array array['kit','rules','facts','drafts','findings','events','versions','receipts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists demo_open on %I', t);
    execute format('create policy demo_open on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant all on %I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to anon, authenticated;
