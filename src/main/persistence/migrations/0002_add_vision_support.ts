export const ADD_VISION_SUPPORT_MIGRATION_SQL = `
-- Add supports_vision column to app_providers table
ALTER TABLE app_providers ADD COLUMN supports_vision INTEGER NOT NULL DEFAULT 0;
`
