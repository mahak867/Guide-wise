-- Change impact: why an approved draft was sent back for re-approval (the fact or rule change that caused it).
alter table drafts add column if not exists impact jsonb;
