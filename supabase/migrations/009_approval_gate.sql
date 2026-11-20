-- The database itself refuses to mark a draft approved while any violation on it is still open.
-- The API already checks this before approving; the trigger makes it hold for every writer, not only the app.
create or replace function guard_approval() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and exists (select 1 from findings f where f.draft_id = new.id and f.state = 'open' and f.level = 'violation') then
    raise exception 'Approval refused: this draft still has open violations. Fix or dismiss each one with a reason first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists drafts_approval_gate on drafts;
create trigger drafts_approval_gate
  before update of status on drafts
  for each row execute function guard_approval();
