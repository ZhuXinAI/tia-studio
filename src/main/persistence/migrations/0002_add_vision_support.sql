-- Add supports_vision column to app_providers table
ALTER TABLE app_providers ADD COLUMN supports_vision INTEGER NOT NULL DEFAULT 0;
