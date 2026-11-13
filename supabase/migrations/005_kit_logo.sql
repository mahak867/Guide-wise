-- The approved logo, matched against creatives by the logo check (a site path or a PNG data URL).
alter table kit add column if not exists logo text;
