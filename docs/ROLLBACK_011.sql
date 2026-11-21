-- Rollback for supabase/migrations/011_close_public.sql: re-opens the tables to the public key exactly as before 011
-- (all privileges for anon and authenticated, and the demo_open policy). members and org_invites are not touched.
do $$
declare t text;
begin
  foreach t in array array['ai_cache', 'api_keys', 'drafts', 'events', 'facts', 'findings', 'kit', 'receipts', 'rules', 'versions'] loop
    execute format('grant all on %I to anon, authenticated', t);
    execute format('drop policy if exists demo_open on %I', t);
    execute format('create policy demo_open on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
grant usage, select, update on sequence events_id_seq, versions_id_seq to anon, authenticated;
