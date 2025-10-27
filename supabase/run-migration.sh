#!/bin/bash

# Run Supabase migration directly against the database
# Usage: ./supabase/run-migration.sh

set -e

# Load environment variables
source .env.local

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "Error: psql is not installed"
    echo "Install with: brew install postgresql (macOS) or apt-get install postgresql-client (Ubuntu)"
    exit 1
fi

# Run migration
echo "Running migration 001_vehicle_schema.sql..."
psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/001_vehicle_schema.sql

echo "Migration completed successfully!"
