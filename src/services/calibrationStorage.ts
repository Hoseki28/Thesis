import { CalibrationConfig, TelemetryData } from '../types/telemetry'

const STORAGE_KEY = 'padayon_calibration_v2'

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  stoveTempOffset: 0.0,
  stoveTempGain: 1.0,
  stoveOverheatThreshold: 230,
  stoveLowHeatThreshold: 100,

  dhtTempOffset: 0.0,
  dhtHumidityOffset: 0.0,

  batteryVMin: 11.4,
  batteryVMax: 12.6,
  batteryVoltageGain: 1.0,
  batteryCutoffPct: 20,

  tegCurrentZeroOffset: 0.0,
  tegCurrentGain: 1.0,

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

/**
 * Apply calibration formulas to raw sensor inputs
 */
export function applyCalibration(
  raw: {
    rawStoveTemp: number
    rawAmbientTemp: number
    rawHumidity: number
    rawBatteryVoltage: number
    rawTegVoltage: number
    rawTegCurrent: number
    relays: {
      dcBus?: boolean
      lights: boolean
      fans: boolean
      aux: boolean
    }
    operatingHours?: number
    systemHealthPct?: number
    timestamp?: number
    source?: TelemetryData['source']
  },
  cal: CalibrationConfig
): TelemetryData {
  // 1. Stove Temperature (°C): (Raw * Gain) + Offset
  const stoveTemp = Math.round(((raw.rawStoveTemp * cal.stoveTempGain) + cal.stoveTempOffset) * 10) / 10

  // 2. DHT11 Ambient Temperature & Humidity
  const ambientTemp = Math.round((raw.rawAmbientTemp + cal.dhtTempOffset) * 10) / 10
  const humidity = Math.min(100, Math.max(0, Math.round(raw.rawHumidity + cal.dhtHumidityOffset)))

  // 3. Battery Voltage & SoC (%)
  const batteryVoltage = Math.round((raw.rawBatteryVoltage * cal.batteryVoltageGain) * 100) / 100
  const vMin = Math.min(cal.batteryVMin, cal.batteryVMax - 0.5)
  const vMax = Math.max(cal.batteryVMax, vMin + 0.5)
  const batteryPctRaw = ((batteryVoltage - vMin) / (vMax - vMin)) * 100
  const batteryPct = Math.min(100, Math.max(0, Math.round(batteryPctRaw)))

  // 4. TEG Current & Voltage & Power
  // Tare zero-drift: (rawCurrent - zeroOffset) * gain
  const rawTegCurrentOffset = raw.rawTegCurrent - cal.tegCurrentZeroOffset
  const tegCurrent = Math.max(0, Math.round(rawTegCurrentOffset * cal.tegCurrentGain * 100) / 100)
  const tegVoltage = Math.max(0, Math.round(raw.rawTegVoltage * 100) / 100)
  const tegPower = Math.round(tegVoltage * tegCurrent * 10) / 10

  // 5. Active Loads Power
  // Light is typically 12V * 0.4A = ~4.8W, Fans are ~12V * 1.0A = ~12W
  const isBusOn = raw.relays.dcBus ?? true
  const lightW = isBusOn && raw.relays.lights ? 4.8 : 0
  const fanW = isBusOn && raw.relays.fans ? 12.0 : 0
  const auxW = isBusOn && raw.relays.aux ? 5.0 : 0
  const loadPower = Math.round((lightW + fanW + auxW) * 10) / 10
  const loadCurrent = batteryVoltage > 0 ? Math.round((loadPower / batteryVoltage) * 100) / 100 : 0
  const netCurrent = Math.round((tegCurrent - loadCurrent) * 100) / 100

  return {
    rawStoveTemp: raw.rawStoveTemp,
    rawAmbientTemp: raw.rawAmbientTemp,
    rawHumidity: raw.rawHumidity,
    rawBatteryVoltage: raw.rawBatteryVoltage,
    rawTegVoltage: raw.rawTegVoltage,
    rawTegCurrent: raw.rawTegCurrent,

    stoveTemp,
    ambientTemp,
    humidity,
    batteryVoltage,
    batteryPct,
    tegVoltage,
    tegCurrent,
    tegPower,
    loadCurrent,
    loadPower,
    netCurrent,

    relays: {
      dcBus: raw.relays.dcBus ?? true,
      lights: raw.relays.lights,
      fans: raw.relays.fans,
      aux: raw.relays.aux,
    },
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
  return `// Auto-generated calibration header for Padayon Biomass-TEG Prototype
#ifndef PADAYON_CALIBRATION_H
#define PADAYON_CALIBRATION_H

const float CAL_STOVE_OFFSET       = ${cal.stoveTempOffset.toFixed(2)}f;
const float CAL_STOVE_GAIN         = ${cal.stoveTempGain.toFixed(4)}f;
const float CAL_STOVE_OVERHEAT     = ${cal.stoveOverheatThreshold.toFixed(1)}f;
const float CAL_STOVE_LOWHEAT      = ${cal.stoveLowHeatThreshold.toFixed(1)}f;

const float CAL_DHT_TEMP_OFFSET    = ${cal.dhtTempOffset.toFixed(2)}f;
const float CAL_DHT_HUMID_OFFSET   = ${cal.dhtHumidityOffset.toFixed(2)}f;

const float CAL_BATT_VMIN          = ${cal.batteryVMin.toFixed(2)}f;
const float CAL_BATT_VMAX          = ${cal.batteryVMax.toFixed(2)}f;
const float CAL_BATT_VGAIN         = ${cal.batteryVoltageGain.toFixed(4)}f;
const int   CAL_BATT_CUTOFF_PCT    = ${Math.round(cal.batteryCutoffPct)};

const float CAL_TEG_CURR_ZERO      = ${cal.tegCurrentZeroOffset.toFixed(4)}f;
const float CAL_TEG_CURR_GAIN      = ${cal.tegCurrentGain.toFixed(4)}f;

#endif
`
}
