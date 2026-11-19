-- Campaign review: documents reviewed together with the caption and creatives (landing page, brochure, email).
alter table drafts add column if not exists assets jsonb not null default '[]';
