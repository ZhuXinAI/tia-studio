ALTER TABLE app_providers ADD COLUMN is_built_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_providers ADD COLUMN icon TEXT;
ALTER TABLE app_providers ADD COLUMN official_site TEXT;
