-- AI-written fixes are marked so they get the stricter re-test.
alter table findings add column if not exists origin text;
