import mqtt, { MqttClient } from 'mqtt'

let mqttClient: MqttClient | null = null

export interface MqttConfig {
  brokerUrl: string
  username: string
  password: string
  clientId?: string
}

export function getMqttClient(config: MqttConfig): MqttClient {
  if (mqttClient && mqttClient.connected) {
    return mqttClient
  }

  const options: mqtt.IClientOptions = {
    username: config.username,
    password: config.password,
    clientId: config.clientId || `mtc-ismart-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    rejectUnauthorized: config.brokerUrl.startsWith('mqtts://'),
  }

  mqttClient = mqtt.connect(config.brokerUrl, options)

  mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected to ${config.brokerUrl}`)
  })

  mqttClient.on('error', (error) => {
    console.error('[MQTT] Connection error:', error)
  })

  mqttClient.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...')
  })

  mqttClient.on('close', () => {
    console.log('[MQTT] Connection closed')
  })

  return mqttClient
}

export function disconnectMqtt(): void {
  if (mqttClient) {
    mqttClient.end()
    mqttClient = null
  }
}

export function publishCommand(
  client: MqttClient,
  vin: string,
  command: string,
  payload: string | object
): Promise<void> {
  return new Promise((resolve, reject) => {
    // SAIC gateway expects topic format: saic/{user}/vehicles/{vin}/{command}
    // Get SAIC user from environment (same as gateway config)
    const saicUser = process.env.SAIC_USER || 'system@air.city'
    const topic = `saic/${saicUser}/vehicles/${vin}/${command}`
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload)

    client.publish(topic, message, { qos: 1 }, (error) => {
      if (error) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, error)
        reject(error)
      } else {
        console.log(`[MQTT] Published to ${topic}:`, message)
        resolve()
      }
    })
  })
}

export function subscribeToTopics(
  client: MqttClient,
  topics: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe(topics, { qos: 1 }, (error) => {
      if (error) {
        console.error('[MQTT] Subscription error:', error)
        reject(error)
      } else {
        console.log('[MQTT] Subscribed to topics:', topics)
        resolve()
      }
    })
  })
}
