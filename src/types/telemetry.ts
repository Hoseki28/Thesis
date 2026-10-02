export type Lang = 'en' | 'fil'

export type TabId = 'overview' | 'sensors' | 'calibration' | 'logs'

export type DataSource = 'simulated' | 'serial' | 'bluetooth' | 'network' | 'manual'

export type ConnectionStatus = 'standby' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TelemetryData {
  // Raw measurements (ADC / Bus raw)
  rawStoveTemp: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawTegVoltage: number
  rawTegCurrent: number

  // Calibrated measurements
  stoveTemp: number        // °C (Core hot junction)
  ambientTemp: number      // °C (Cold sink sync / DHT11)
  humidity: number         // % (DHT11 RH)
  batteryVoltage: number   // VDC
  batteryPct: number       // 0 - 100%
  tegVoltage: number       // VDC
  tegCurrent: number       // A
  tegPower: number         // W (V * I)
  loadCurrent: number      // A
  loadPower: number        // W
  netCurrent: number       // A (tegCurrent - loadCurrent)
  
  // Relays / Bus Actuators
  relays: {
    dcBus: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }

  // System runtime metrics
  operatingHours: number
  systemHealthPct: number

  timestamp: number
  source: DataSource
}

export interface CalibrationConfig {
  stoveTempOffset: number
  stoveTempGain: number
  stoveOverheatThreshold: number
  stoveLowHeatThreshold: number

  dhtTempOffset: number
  dhtHumidityOffset: number

  batteryVMin: number
  batteryVMax: number
  batteryVoltageGain: number
  batteryCutoffPct: number

  tegCurrentZeroOffset: number
  tegCurrentGain: number

  lastUpdated: number
}

export interface HardwareState {
  status: ConnectionStatus
  transport: 'none' | 'serial' | 'bluetooth' | 'websocket' | 'http'
  portInfo: string
  deviceName?: string
  baudRate: number
  packetsReceived: number
  bytesReceived: number
  lastPacketTime: number | null
  lastError: string | null
  latencyMs?: number
  rssi?: number
  rawLogs: Array<{ id: string; timestamp: string; type: 'in' | 'out' | 'sys' | 'err'; text: string }>
}

export interface TelemetryPoint {
  time: string
  timestamp: number
  stoveTemp: number
  ambientTemp: number
  humidity: number
  batteryPct: number
  batteryVoltage: number
  tegPower: number
  loadPower: number
}

export type ScenarioPreset = 'normal' | 'lowHeat' | 'overheat' | 'lowBatt' | 'tegPeak' | 'custom'

export type SystemLogLevel = 'info' | 'warning' | 'error'

export interface SystemLogEntry {
  id: string
  timestamp: string // Strictly YYYY-MM-DD HH:mm (Asia/Manila)
  timestampMs: number
  level: SystemLogLevel
  message: string
  messageFil?: string
  source?: 'system' | 'esp32' | 'threshold' | 'user'
}
