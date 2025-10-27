# MTC iSmart - Vehicle Management System

A Next.js application for monitoring and controlling MG iSmart vehicles via MQTT.

## Features

- Real-time vehicle monitoring via MQTT
- Vehicle control (lock/unlock, climate, charging)
- Supabase integration for telemetry storage
- Real-time updates using Supabase Realtime
- Docker Compose setup for MQTT broker and gateway

## Architecture

- **Next.js 16** - Frontend and API routes
- **Mosquitto MQTT Broker** - Message broker for vehicle communication
- **SAIC Python MQTT Gateway** - Connects to MG iSmart API
- **Supabase** - Database and real-time subscriptions
- **shadcn/ui** - UI components

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Supabase account
- MG iSmart account

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
# Copy example files
cp .env.example .env.local
cp .env.mg.example .env.mg

# Edit with your credentials
nano .env.local  # Add Supabase credentials
nano .env.mg     # Add MG iSmart credentials
```

### 3. Set Up Database

```bash
# Run Supabase migration
./supabase/run-migration.sh
```

### 4. Configure MQTT Broker

```bash
# Generate MQTT user passwords
cd docker/mosquitto/config
mosquitto_passwd -c passwd mg_gateway
mosquitto_passwd passwd mtc_app
mosquitto_passwd passwd mtc_ingest

# Generate TLS certificates (for production)
# See docker/mosquitto/README.md for details
```

### 5. Start Services

```bash
# Start MQTT broker and gateway
docker-compose up -d

# Start Next.js dev server
npm run dev

# In another terminal, start ingestion service
npm run ingest
```

## Development

```bash
# Start dev server
npm run dev

# Start MQTT ingestion service
npm run ingest

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
mtc-ismart/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── vehicle/       # Vehicle command APIs
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main dashboard
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── theme-provider.tsx
│   └── vehicle-dashboard.tsx
├── hooks/                 # Custom React hooks
│   ├── use-toast.ts
│   └── use-vehicle.ts
├── lib/                   # Utility functions
│   ├── supabase.ts
│   └── utils.ts
├── server/                # Server-side services
│   ├── ingest.ts         # MQTT ingestion service
│   └── mqtt-client.ts    # MQTT client wrapper
├── supabase/             # Database migrations
│   └── migrations/
├── docker/               # Docker configuration
│   └── mosquitto/
├── docker-compose.yml    # Docker services
└── .env.local           # Environment variables
```

## API Routes

### GET /api/vehicle/status

Get vehicle status

```bash
# Get all vehicles
curl http://localhost:3000/api/vehicle/status

# Get specific vehicle
curl http://localhost:3000/api/vehicle/status?vin=YOUR_VIN
```

### POST /api/vehicle/lock

Lock or unlock vehicle

```bash
curl -X POST http://localhost:3000/api/vehicle/lock \
  -H "Content-Type: application/json" \
  -d '{"vin":"YOUR_VIN","locked":true}'
```

### POST /api/vehicle/climate

Control climate

```bash
curl -X POST http://localhost:3000/api/vehicle/climate \
  -H "Content-Type: application/json" \
  -d '{"vin":"YOUR_VIN","action":"on","temperature":22}'
```

### POST /api/vehicle/charge

Control charging

```bash
# Start charging
curl -X POST http://localhost:3000/api/vehicle/charge \
  -H "Content-Type: application/json" \
  -d '{"vin":"YOUR_VIN","action":"start"}'

# Stop charging
curl -X POST http://localhost:3000/api/vehicle/charge \
  -H "Content-Type: application/json" \
  -d '{"vin":"YOUR_VIN","action":"stop"}'

# Set target SoC
curl -X POST http://localhost:3000/api/vehicle/charge \
  -H "Content-Type: application/json" \
  -d '{"vin":"YOUR_VIN","action":"setTarget","targetSoc":80}'
```

## Production Deployment

See [docker/mosquitto/README.md](docker/mosquitto/README.md) for production MQTT setup.

### Environment Configuration

For production, update the following:

1. **MQTT Broker**: Use TLS with proper certificates
2. **Domains**: mqtt.masstransit.hk, api.masstransit.hk
3. **Supabase**: Production credentials with RLS enabled
4. **SAIC API**: Test both EU and AU endpoints for your region

## Credits

Built with:
- [SAIC Python MQTT Gateway](https://github.com/SAIC-iSmart-API/saic-python-mqtt-gateway)
- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [shadcn/ui](https://ui.shadcn.com/)
