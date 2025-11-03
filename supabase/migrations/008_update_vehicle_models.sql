-- Update all vehicle models to 'MG4 Electric'
-- This migration sets the correct model name for all vehicles in the fleet

UPDATE vehicles
SET
  model = 'MG4 Electric',
  updated_at = now()
WHERE model IS NULL OR model = 'Unknown Model' OR model = '';

-- Set a default model for any future vehicles if model is not provided
ALTER TABLE vehicles
ALTER COLUMN model SET DEFAULT 'MG4 Electric';
