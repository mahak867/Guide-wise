-- 011: close the tables to the public key. Only the server, using the secret service-role key, can read or write them.
-- Before this, every table except members and org_invites had a demo_open policy that let anyone holding the public
-- (anon) key read and write any row directly, bypassing the server's role checks.
-- Kept unchanged: row-level security on every table; members (own_rows for signed-in users) and org_invites (closed);
-- execute grants on the 010 functions (workspace_claimed stays callable by anon).
-- Requires SUPABASE_SERVICE_ROLE_KEY on the server first (see src/lib/db.ts). Rollback: docs/ROLLBACK_011.sql.
do $$
declare t text;
begin
  foreach t in array array['ai_cache', 'api_keys', 'drafts', 'events', 'facts', 'findings', 'kit', 'receipts', 'rules', 'versions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists demo_open on %I', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence events_id_seq, versions_id_seq from anon, authenticated;
