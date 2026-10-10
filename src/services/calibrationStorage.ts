import { CalibrationConfig, FeedstockType, LoadChannel, TelemetryData } from '../types/telemetry'

const STORAGE_KEY = 'padayon_calibration_v3'

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  stoveTempOffset: 0.0,
  stoveTempGain: 1.0,
  stoveOverheatThreshold: 230,
  stoveLowHeatThreshold: 100,

  dhtTempOffset: 0.0,
  dhtHumidityOffset: 0.0,

  // 12V 50Ah LiFePO4 profile: 10.0V (0% Cutoff) to 14.6V (100% Full)
  batteryVMin: 10.0,
  batteryVMax: 14.6,
  batteryVoltageGain: 1.0,
  batteryCutoffPct: 15,

  tegCurrentZeroOffset: 0.0,
  tegCurrentGain: 1.0,

  coAlertThresholdPpm: 50,

  lastUpdated: Date.now(),
}

export function loadCalibration(): CalibrationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CALIBRATION, ...parsed }
    }
  } catch (err) {
    console.warn('Failed to load calibration from localStorage', err)
  }
  return { ...DEFAULT_CALIBRATION }
}

export function saveCalibration(config: CalibrationConfig): void {
  try {
    const updated = { ...config, lastUpdated: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to save calibration to localStorage', err)
  }
}

export function resetCalibration(): CalibrationConfig {
  const resetConfig = { ...DEFAULT_CALIBRATION, lastUpdated: Date.now() }
  saveCalibration(resetConfig)
  return resetConfig
}

export interface RawTelemetryInput {
  rawStoveTemp: number
  rawColdFaceTemp?: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawBatteryCurrent?: number
  rawTegVoltage: number
  rawTegCurrent: number
  rawCoPpm?: number
  rawThermalFuseTripped?: boolean
  hopperServoActive?: boolean
  feedCycles?: number
  coolingFanPwm?: number
  channelCurrentsMa?: [number, number, number, number]
  relays: {
    dcBus?: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }
  isPhysicalCurrent?: boolean
  batteryCurrentSigned?: number
  feedstock?: FeedstockType
  runId?: string
  fuelMassKg?: number
  criticalLoadActive?: boolean
  auxLoadActive?: boolean
  auxLockout?: boolean
  sensorFault?: boolean
  operatingHours?: number
  systemHealthPct?: number
  timestamp?: number
  source?: TelemetryData['source']
}

/**
 * Apply calibration formulas and physical models to raw sensor inputs
 */
export function applyCalibration(
  raw: RawTelemetryInput,
  cal: CalibrationConfig
): TelemetryData {
  // 1. Stove Temperature (°C): MAX31855 Thermocouple hot junction
  const safeRawStove = Number.isFinite(raw.rawStoveTemp) ? raw.rawStoveTemp : 25
  const stoveTemp = Math.round(((safeRawStove * cal.stoveTempGain) + cal.stoveTempOffset) * 10) / 10

  // 2. DHT22 Ambient Temperature & Humidity
  const safeRawAmbient = Number.isFinite(raw.rawAmbientTemp) ? raw.rawAmbientTemp : 28.2
  const safeRawHumidity = Number.isFinite(raw.rawHumidity) ? raw.rawHumidity : 64
  const ambientTemp = Math.round((safeRawAmbient + cal.dhtTempOffset) * 10) / 10
  const humidity = Math.min(100, Math.max(0, Math.round(safeRawHumidity + cal.dhtHumidityOffset)))

  // 3. Cold Face Temperature (Water-Cooled Heatsink) & Seebeck Delta T
  const safeColdFace = Number.isFinite(raw.rawColdFaceTemp)
    ? (raw.rawColdFaceTemp as number)
    : Math.round((ambientTemp + 1.2) * 10) / 10
  const coldFaceTemp = safeColdFace
  const deltaT = Math.max(0, Math.round((stoveTemp - coldFaceTemp) * 10) / 10)

  // 4. Battery Voltage & SoC (%): 12V 50Ah LiFePO4 Voltage Curve Profile
  const safeRawBattV = Number.isFinite(raw.rawBatteryVoltage) ? raw.rawBatteryVoltage : 13.2
  const batteryVoltage = Math.round((safeRawBattV * cal.batteryVoltageGain) * 100) / 100
  const vMin = Math.min(cal.batteryVMin, cal.batteryVMax - 1.0)
  const vMax = Math.max(cal.batteryVMax, vMin + 1.0)
  // LiFePO4 non-linear approximation curve
  const batteryPctRaw = ((batteryVoltage - vMin) / (vMax - vMin)) * 100
  const batteryPct = Math.min(100, Math.max(0, Math.round(batteryPctRaw)))

  // 5. TEG Current & Voltage & Power
  const safeRawTegI = Number.isFinite(raw.rawTegCurrent) ? raw.rawTegCurrent : 0
  const safeRawTegV = Number.isFinite(raw.rawTegVoltage) ? raw.rawTegVoltage : 0
  const rawTegCurrentOffset = safeRawTegI - cal.tegCurrentZeroOffset
  const tegCurrent = Math.max(0, Math.round(rawTegCurrentOffset * cal.tegCurrentGain * 100) / 100)
  const tegVoltage = Math.max(0, Math.round(safeRawTegV * 100) / 100)
  const tegPower = Math.round(tegVoltage * tegCurrent * 10) / 10

  // 6. Two-Tier Load Management & Safety Lockout
  const auxLockout = batteryPct <= cal.batteryCutoffPct
  const criticalLoadActive = true // Guarded: Primary critical load (12V LED) is always active
  const isBusOn = raw.relays.dcBus ?? true
  const auxLoadActive = isBusOn && !auxLockout && (raw.relays.fans || raw.relays.aux || Boolean(raw.hopperServoActive))

  // Active Loads Power:
  // Primary Critical Light = 12V * 0.4A = ~4.8W (guarded)
  // Secondary Fans = ~12W (sheddable)
  // Secondary Fuel Feed Servo = ~8W (during pulse, sheddable)
  // Secondary AUX USB = ~5W (sheddable)
  const lightW = 4.8
  const fanW = isBusOn && raw.relays.fans && !auxLockout ? 12.0 : 0
  const servoW = isBusOn && raw.hopperServoActive && !auxLockout ? 7.8 : 0
  const auxW = isBusOn && raw.relays.aux && !auxLockout ? 5.0 : 0
  const loadPower = Math.round((lightW + fanW + servoW + auxW) * 10) / 10
  const loadCurrent = batteryVoltage > 0 ? Math.round((loadPower / batteryVoltage) * 100) / 100 : 0
  const netCurrent = Math.round((tegCurrent - loadCurrent) * 100) / 100

  // 7. Signed Battery Current Channel (INA219 Shunt)
  const isPhysicalCurrent = Boolean(raw.isPhysicalCurrent ?? (raw.rawBatteryCurrent !== undefined))
  const batteryCurrentSigned = Number.isFinite(raw.rawBatteryCurrent)
    ? Math.round((raw.rawBatteryCurrent as number) * 100) / 100
    : netCurrent
  const currentSignedMa = Math.round(batteryCurrentSigned * 1000)

  // 8. Physical Component Suite Subsystems
  // Ambient (DHT22)
  const ambient = {
    tempC: ambientTemp,
    humidityPct: humidity,
  }

  // Safety (MQ-7 & GPIO)
  const safeCoPpm = Number.isFinite(raw.rawCoPpm) ? Math.max(0, Math.round(raw.rawCoPpm as number)) : 14
  const coAlert = safeCoPpm >= (cal.coAlertThresholdPpm ?? 50)
  const thermalFuseTripped = Boolean(raw.rawThermalFuseTripped ?? (stoveTemp >= 310))
  const safety = {
    coPpm: safeCoPpm,
    coAlert,
    thermalFuseTripped,
  }

  // Fuel System (Hopper Servo)
  const hopperServoActive = Boolean(raw.hopperServoActive)
  const feedCycles = raw.feedCycles ?? 16
  const fuelSystem = {
    hopperServoActive,
    feedCycles,
  }

  // Cooling System (Cold-Side Water Fan PWM)
  const fanActive = isBusOn && Boolean(raw.relays.fans) && !auxLockout
  const fanPwm = raw.coolingFanPwm !== undefined
    ? Math.min(255, Math.max(0, raw.coolingFanPwm))
    : (fanActive ? (deltaT > 80 ? 255 : 180) : 0)
  const cooling = {
    fanActive,
    fanPwm,
  }

  // Storage System (12V 50Ah LiFePO4 with BMS)
  const battery = {
    voltage: batteryVoltage,
    currentSignedMa,
    socPct: batteryPct,
    chemistry: 'LiFePO4_12V_50Ah' as const,
  }

  // 4-Channel Load Controller
  const ch1CurrentMa = isBusOn ? Math.round((lightW / batteryVoltage) * 1000) : 0
  const ch2CurrentMa = fanActive ? Math.round((fanW / batteryVoltage) * 1000) : 0
  const ch3CurrentMa = isBusOn && hopperServoActive && !auxLockout ? 650 : 0
  const ch4CurrentMa = isBusOn && raw.relays.aux && !auxLockout ? Math.round((auxW / batteryVoltage) * 1000) : 0

  const loadChannels: [LoadChannel, LoadChannel, LoadChannel, LoadChannel] = [
    {
      id: 1,
      name: '12V LED Critical Light',
      active: isBusOn,
      sheddable: false,
      currentMa: raw.channelCurrentsMa ? raw.channelCurrentsMa[0] : ch1CurrentMa,
    },
    {
      id: 2,
      name: 'Cold-Side Water Fan',
      active: fanActive,
      sheddable: true,
      currentMa: raw.channelCurrentsMa ? raw.channelCurrentsMa[1] : ch2CurrentMa,
    },
    {
      id: 3,
      name: 'Hopper Fuel Feed Servo',
      active: isBusOn && hopperServoActive && !auxLockout,
      sheddable: true,
      currentMa: raw.channelCurrentsMa ? raw.channelCurrentsMa[2] : ch3CurrentMa,
    },
    {
      id: 4,
      name: '5V USB Charging Ports',
      active: isBusOn && Boolean(raw.relays.aux) && !auxLockout,
      sheddable: true,
      currentMa: raw.channelCurrentsMa ? raw.channelCurrentsMa[3] : ch4CurrentMa,
    },
  ]

  return {
    rawStoveTemp: safeRawStove,
    rawColdFaceTemp: safeColdFace,
    rawAmbientTemp: safeRawAmbient,
    rawHumidity: safeRawHumidity,
    rawBatteryVoltage: safeRawBattV,
    rawBatteryCurrent: raw.rawBatteryCurrent,
    rawTegVoltage: safeRawTegV,
    rawTegCurrent: safeRawTegI,
    rawCoPpm: safeCoPpm,

    stoveTemp,
    coldFaceTemp,
    deltaT,
    ambientTemp,
    humidity,
    batteryVoltage,
    batteryPct,
    isPhysicalCurrent,
    batteryCurrentSigned,
    tegVoltage,
    tegCurrent,
    tegPower,
    loadCurrent,
    loadPower,
    netCurrent,

    ambient,
    safety,
    fuelSystem,
    cooling,
    battery,
    loadChannels,

    criticalLoadActive,
    auxLoadActive,
    auxLockout,

    relays: {
      dcBus: isBusOn,
      lights: raw.relays.lights ?? true,
      fans: auxLockout ? false : raw.relays.fans,
      aux: auxLockout ? false : raw.relays.aux,
    },

    feedstock: raw.feedstock || 'unassigned',
    runId: raw.runId || 'RUN-01',
    fuelMassKg: raw.fuelMassKg ?? 1.5,
    sensorFault: Boolean(raw.sensorFault),

    operatingHours: raw.operatingHours ?? 1248,
    systemHealthPct: raw.systemHealthPct ?? 96,
    timestamp: raw.timestamp || Date.now(),
    source: raw.source || 'simulated',
  }
}

/**
 * Generate Arduino/ESP32 C++ snippet for flashing to microcontroller EEPROM/NVS
 */
export function generateCppCalibrationHeader(cal: CalibrationConfig): string {
  return `// Auto-generated calibration header for Padayon Biomass-TEG Prototype (LiFePO4 Profile)
#ifndef PADAYON_CALIBRATION_H
#define PADAYON_CALIBRATION_H

const float CAL_STOVE_OFFSET       = ${cal.stoveTempOffset.toFixed(2)}f;
const float CAL_STOVE_GAIN         = ${cal.stoveTempGain.toFixed(4)}f;
const float CAL_STOVE_OVERHEAT     = ${cal.stoveOverheatThreshold.toFixed(1)}f;
const float CAL_STOVE_LOWHEAT      = ${cal.stoveLowHeatThreshold.toFixed(1)}f;

const float CAL_DHT_TEMP_OFFSET    = ${cal.dhtTempOffset.toFixed(2)}f;
const float CAL_DHT_HUMID_OFFSET   = ${cal.dhtHumidityOffset.toFixed(2)}f;

// 12V 50Ah LiFePO4 Voltage Thresholds
const float CAL_BATT_VMIN          = ${cal.batteryVMin.toFixed(2)}f; // 10.00V (Cutoff)
const float CAL_BATT_VMAX          = ${cal.batteryVMax.toFixed(2)}f; // 14.60V (Absorption/Full)
const float CAL_BATT_VGAIN         = ${cal.batteryVoltageGain.toFixed(4)}f;
const int   CAL_BATT_CUTOFF_PCT    = ${Math.round(cal.batteryCutoffPct)};

const float CAL_TEG_CURR_ZERO      = ${cal.tegCurrentZeroOffset.toFixed(4)}f;
const float CAL_TEG_CURR_GAIN      = ${cal.tegCurrentGain.toFixed(4)}f;

const int   CAL_MQ7_CO_ALERT_PPM   = ${cal.coAlertThresholdPpm ?? 50};

#endif
`
}
