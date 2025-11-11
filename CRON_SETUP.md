# Trip Processing Cron Job Setup

## Overview

Automated trip segmentation using Vercel Cron to call the PostgreSQL `derive_trips()` function incrementally.

## Configuration

### Vercel Cron Schedule

- **Path**: `/api/cron/process-trips`
- **Schedule**: `0 */6 * * *` (Every 6 hours)
- **Runs at**: 00:00, 06:00, 12:00, 18:00 UTC (08:00, 14:00, 20:00, 02:00 HKT)

### Required Environment Variable

Add to Vercel project:

```bash
# Generate a random secret
openssl rand -base64 32

# Add to Vercel (use printf to avoid newlines!)
printf "YOUR_GENERATED_SECRET" | vercel env add CRON_SECRET production
```

**IMPORTANT**: This secret protects the endpoint from unauthorized access.

## How It Works

1. **Vercel Cron** triggers the endpoint every 6 hours
2. **API endpoint** (`/api/cron/process-trips/route.ts`) authenticates the request
3. For each vehicle:
   - Calls PostgreSQL function `derive_trips(vin, since_ts)`
   - Processes last 24 hours of telemetry by default
   - Uses v1.1 jitter-aware algorithm with adaptive thresholds
4. Returns summary of trips created per vehicle

## API Endpoint Details

### Authentication

The endpoint requires authentication via:
- **Authorization header**: `Bearer YOUR_SECRET`
- **Query parameter**: `?secret=YOUR_SECRET`

Vercel Cron automatically includes the correct authorization when calling scheduled endpoints.

### Query Parameters

- `hours` (optional): Hours to look back (default: 24)
- `vin` (optional): Process specific VIN only (default: all vehicles)
- `secret` (optional): Authentication token (alternative to header)

### Response Format

```json
{
  "success": true,
  "summary": {
    "total_vehicles": 5,
    "successful": 5,
    "failed": 0,
    "total_trips_created": 12,
    "avg_duration_ms": 1234.5
  },
  "results": [
    {
      "vin": "LSJWH4092PN070118",
      "success": true,
      "trips_created": 3,
      "duration_ms": 1150
    }
  ],
  "since": "2025-11-10T16:00:00.000Z",
  "processedAt": "2025-11-11T16:00:00.000Z"
}
```

## Manual Testing

Test the endpoint locally or in production:

```bash
# Set your secret
export CRON_SECRET="your-secret-here"

# Test locally (start dev server first)
curl "http://localhost:3000/api/cron/process-trips?secret=$CRON_SECRET"

# Test in production
curl "https://mtc.air.zone/api/cron/process-trips?secret=$CRON_SECRET"

# Process specific VIN
curl "https://mtc.air.zone/api/cron/process-trips?secret=$CRON_SECRET&vin=LSJWH4092PN070118"

# Process last 48 hours
curl "https://mtc.air.zone/api/cron/process-trips?secret=$CRON_SECRET&hours=48"
```

## Monitoring

### Check Cron Execution

1. **Vercel Dashboard**:
   - Go to Project Settings → Crons
   - View execution history and logs

2. **Function Logs**:
   - View logs in Vercel dashboard under "Functions"
   - Look for `[CRON]` prefixed messages

3. **Database Verification**:
   ```sql
   -- Check recent trip creation
   SELECT
     DATE(created_at) as creation_date,
     COUNT(*) as trips_created,
     COUNT(DISTINCT vin) as vehicles
   FROM trips
   WHERE created_at >= NOW() - INTERVAL '24 hours'
   GROUP BY DATE(created_at)
   ORDER BY creation_date DESC;
   ```

## Deployment Checklist

- [x] Create API endpoint at `/app/api/cron/process-trips/route.ts`
- [x] Add cron configuration to `vercel.json`
- [ ] Generate and add `CRON_SECRET` to Vercel environment variables
- [ ] Deploy to Vercel (push to main branch)
- [ ] Verify cron is registered in Vercel dashboard
- [ ] Test endpoint manually with secret
- [ ] Monitor first automated execution

## Troubleshooting

### Cron Not Running

1. Check Vercel dashboard → Crons to verify schedule is registered
2. Ensure you're on a Vercel plan that supports Cron (Pro or Enterprise)
3. Check function logs for errors

### Authentication Failures

1. Verify `CRON_SECRET` is set in Vercel environment variables
2. Ensure no trailing newlines in the secret (use `printf` not `echo`)
3. Redeploy after adding environment variables

### Function Timeouts

If processing 24 hours times out:
- Reduce `hours` parameter to 12 or 6
- Run cron more frequently (every 3 hours instead of 6)
- Consider processing VINs in batches

### No Trips Created

1. Check if telemetry data exists for the time range
2. Verify `derive_trips()` function exists in database
3. Check function returns aren't being suppressed by conflict handling
4. Review trip segmentation parameters (min duration, distance)

## Alternative: Manual Processing

If you need to process a backlog or specific time range, use the Python script:

```bash
# Process all vehicles since Oct 28
python3 scripts/process-trips.py

# Or modify the script to change the `since_date` parameter
```

## Future Improvements

- Add daily jitter computation cron (`compute_daily_jitter()`)
- Email/Slack notifications on processing failures
- Metrics dashboard for trip processing statistics
- Incremental processing with last-processed-timestamp tracking
