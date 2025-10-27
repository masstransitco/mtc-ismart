# Mosquitto MQTT Broker Setup

## Initial Setup

### 1. Generate MQTT User Passwords

```bash
# Install mosquitto tools if not installed
# macOS: brew install mosquitto
# Ubuntu: apt-get install mosquitto-clients

# Create password file with users
cd docker/mosquitto/config
mosquitto_passwd -c passwd mg_gateway
mosquitto_passwd passwd mtc_app
mosquitto_passwd passwd mtc_ingest
```

### 2. Generate TLS Certificates

For production, use proper TLS certificates from Let's Encrypt or Cloudflare Origin Certificates.

For development/testing, you can generate self-signed certificates:

```bash
cd docker/mosquitto/certs

# Generate CA
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/C=HK/ST=HongKong/L=HongKong/O=MTC/CN=MTC-CA"

# Generate Server Certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/C=HK/ST=HongKong/L=HongKong/O=MTC/CN=mqtt.masstransit.hk"

# Sign with CA
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out server.crt -days 3650

# Set permissions
chmod 644 server.crt ca.crt
chmod 600 server.key ca.key
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env.mg.example .env.mg

# Edit with your credentials
nano .env.mg
```

### 4. Start Services

```bash
# Start Mosquitto and Gateway
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

## Testing MQTT Connection

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -p 8883 --cafile docker/mosquitto/certs/ca.crt \
  -u mtc_app -P your_password -t '#' -v

# Test publish
mosquitto_pub -h localhost -p 8883 --cafile docker/mosquitto/certs/ca.crt \
  -u mtc_app -P your_password -t 'test/topic' -m 'Hello MQTT'
```

## Production Deployment

1. Update `docker-compose.yml` to use production certificates
2. Configure Cloudflare DNS: mqtt.masstransit.hk → your server IP
3. Set up Cloudflare Origin Certificate or Let's Encrypt
4. Update MQTT_URI in `.env.mg` to use TLS: `mqtts://mqtt.masstransit.hk:8883`
5. Configure firewall to allow port 8883
6. Enable Docker restart policies

## Troubleshooting

### Check Mosquitto logs
```bash
docker-compose logs mosquitto
```

### Check Gateway logs
```bash
docker-compose logs mg-ismart-gateway
```

### Test broker connectivity
```bash
docker exec -it mtc-mqtt-broker mosquitto_sub -t '$SYS/#' -v
```
