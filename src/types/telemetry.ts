export type Lang = 'en' | 'fil'

export type TabId = 'overview' | 'sensors' | 'calibration' | 'logs'

export type DataSource = 'simulated' | 'serial' | 'bluetooth' | 'network' | 'manual'

export type ConnectionStatus = 'standby' | 'connecting' | 'connected' | 'disconnected' | 'error'

export type FeedstockType = 'wood_waste' | 'coconut_husk' | 'unassigned'

export interface LoadChannel {
  id: 1 | 2 | 3 | 4
  name: string
  active: boolean
  sheddable: boolean
  currentMa: number
}

export interface TelemetryData {
  // Raw measurements (ADC / Bus raw)
  rawStoveTemp: number
  rawColdFaceTemp?: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawBatteryCurrent?: number
  rawTegVoltage: number
  rawTegCurrent: number
  rawCoPpm?: number

  // Calibrated measurements
  stoveTemp: number        // °C (MAX31855 Thermocouple hot junction)
  coldFaceTemp: number     // °C (Water-cooled heatsink cold face)
  deltaT: number           // °C (Computed: stoveTemp - coldFaceTemp)
  ambientTemp: number      // °C (DHT22 Ambient dry-bulb)
  humidity: number         // % (DHT22 Relative Humidity)
  batteryVoltage: number   // VDC
  batteryPct: number       // 0 - 100%
  
  // Electrical current modeling (INA219 Shunt)
  isPhysicalCurrent: boolean // Flag indicating whether battery current is measured via INA219 physical shunt
  batteryCurrentSigned: number // Signed A: (+) Net Charging, (-) Net Discharging
  
  tegVoltage: number       // VDC
  tegCurrent: number       // A
  tegPower: number         // W (V * I)
  loadCurrent: number      // A
  loadPower: number        // W
  netCurrent: number       // A (tegCurrent - loadCurrent)

  // Subsystem 1: Ambient & Environment (DHT22)
  ambient: {
    tempC: number
    humidityPct: number
  }

  // Subsystem 2: Site Safety & Alarm (MQ-7 & GPIO)
  safety: {
    coPpm: number
    coAlert: boolean
    thermalFuseTripped: boolean
  }

  // Subsystem 3: Automated Fuel Feed (Hopper Servo)
  fuelSystem: {
    hopperServoActive: boolean
    feedCycles: number
  }

  // Subsystem 4: Cold-Side Water Fan (PWM Controlled)
  cooling: {
    fanActive: boolean
    fanPwm: number
  }

  // Subsystem 5: Storage (12V 50Ah LiFePO4 with BMS)
  battery: {
    voltage: number
    currentSignedMa: number
    socPct: number
    chemistry: 'LiFePO4_12V_50Ah'
  }

  // Subsystem 6: 4-Channel Load Controller
  loadChannels: [
    LoadChannel, // Channel 1: 12V LED Critical Light (Non-sheddable)
    LoadChannel, // Channel 2: Cold-Side Water Fan (Sheddable)
    LoadChannel, // Channel 3: Hopper Fuel Feed Servo (Sheddable)
    LoadChannel  // Channel 4: 5V USB Charging Ports (Sheddable)
  ]

  // Two-Tier Load Management & Safety Interlocks
  criticalLoadActive: boolean // Always true / guarded (Primary 12V LED lighting, non-sheddable)
  auxLoadActive: boolean      // Secondary Auxiliary Load active (Fans, Servo, 5V USB)
  auxLockout: boolean         // True if battery cutoff prevents secondary activation
  
  // Relays / Bus Actuators
  relays: {
    dcBus: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }

  // Research & Field Trial Metadata (Chapter 4)
  feedstock: FeedstockType
  runId: string
  fuelMassKg: number

  // Diagnostics & System runtime metrics
  sensorFault?: boolean
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

  // LiFePO4 Voltage Curve Profile: 10.0V (0% Cutoff) to 14.6V (100% Full)
  batteryVMin: number
  batteryVMax: number
  batteryVoltageGain: number
  batteryCutoffPct: number

  tegCurrentZeroOffset: number
  tegCurrentGain: number

  // CO Alert Threshold (MQ-7 PPM)
  coAlertThresholdPpm?: number

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
  reconnectAttempts?: number
  isAutoReconnecting?: boolean
  sensorFault?: boolean
  rawLogs: Array<{ id: string; timestamp: string; type: 'in' | 'out' | 'sys' | 'err'; text: string }>
}

export interface TelemetryPoint {
  time: string
  timestamp: number
  stoveTemp: number
  coldFaceTemp: number
  deltaT: number
  ambientTemp: number
  humidity: number
  batteryPct: number
  batteryVoltage: number
  batteryCurrentSigned: number
  tegVoltage: number
  tegCurrent: number
  tegPower: number
  loadPower: number
  criticalLoadActive: boolean
  auxLoadActive: boolean
  auxLockout: boolean
  feedstock: FeedstockType
  runId: string
  coPpm?: number
  sensorFault?: boolean
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
