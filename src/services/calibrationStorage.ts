import { CalibrationConfig, Esp32HardwareStatus, FeedstockType, LoadChannel, TelemetryData } from '../types/telemetry'

const STORAGE_KEY = 'padayon_calibration_v4'

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  stoveTempOffset: 0.0,
  stoveTempGain: 1.0,
  stoveOverheatThreshold: 230,
  stoveLowHeatThreshold: 100,

  dhtTempOffset: 0.0,
  dhtHumidityOffset: 0.0,

  // 12V 15Ah SLA profile: 10.0V (0% Cutoff) to 14.6V (100% Full)
  batteryVMin: 10.0,
  batteryVMax: 14.6,
  batteryVoltageGain: 1.1011, // Calibrated for measured 9.56V -> 10.24V actual input
  batteryCutoffPct: 15,

  tegVoltageGain: 1.1679, // Calibrated for measured 11.80V -> 13.10V actual input
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
  esp32?: Esp32HardwareStatus
  timestamp?: number
  source?: TelemetryData['source']
}

/**
 * Returns a completely zeroed / dormant telemetry state representing an offline ESP32
 */
export function getOfflineTelemetry(cal: CalibrationConfig = loadCalibration()): TelemetryData {
  return {
    rawStoveTemp: 0,
    rawColdFaceTemp: 0,
    rawAmbientTemp: 0,
    rawHumidity: 0,
    rawBatteryVoltage: 0,
    rawBatteryCurrent: 0,
    rawTegVoltage: 0,
    rawTegCurrent: 0,
    rawCoPpm: 0,

    vTeg: 0,
    vBat: 0,
    iBat: 0,
    pBat: 0,
    pHarv: 0,
    whTotal: 0,
    whHarv: 0,
    vTegPeak: 0,
    tHot: 0,
    tCold: 0,
    dT: 0,
    tAmb: 0,
    hum: 0,
    hotFault: false,
    coldFault: false,
    hotWhy: '',
    coldWhy: '',
    dhtOk: false,
    ts1Tripped: false,
    relayOn: false,
    stateCode: 0,
    stateName: 'DISCONNECTED',
    stateReason: 'ESP32 not connected - Connect via USB Serial to read sensors',
    forceMode: 0,
    alarmsText: 'none',
    activeAlarms: [],

    stoveTemp: 0,
    coldFaceTemp: 0,
    deltaT: 0,
    ambientTemp: 0,
    humidity: 0,
    batteryVoltage: 0,
    batteryPct: 0,

    isPhysicalCurrent: false,
    batteryCurrentSigned: 0,

    tegVoltage: 0,
    tegCurrent: 0,
    tegPower: 0,
    loadCurrent: 0,
    loadPower: 0,
    netCurrent: 0,

    ambient: {
      tempC: 0,
      humidityPct: 0,
    },
    safety: {
      coPpm: 0,
      coAlert: false,
      thermalFuseTripped: false,
    },
    fuelSystem: {
      hopperServoActive: false,
      feedCycles: 0,
    },
    cooling: {
      fanActive: false,
      fanPwm: 0,
    },
    battery: {
      voltage: 0,
      currentSignedMa: 0,
      socPct: 0,
      chemistry: 'LiFePO4_12V_50Ah',
    },
    loadChannels: [
      { id: 1, name: '12V Critical Light', active: false, sheddable: false, currentMa: 0 },
      { id: 2, name: 'Cold-Side Fan', active: false, sheddable: true, currentMa: 0 },
      { id: 3, name: 'Fuel Feed Servo', active: false, sheddable: true, currentMa: 0 },
      { id: 4, name: '5V/12V AUX Outlets', active: false, sheddable: true, currentMa: 0 },
    ],
    feedstock: 'wood_waste',
    fuelMassKg: 0,
    criticalLoadActive: false,
    auxLoadActive: false,
    auxLockout: true,
    sensorFault: false,
    operatingHours: 0,
    systemHealthPct: 100,
    source: 'offline',
    timestamp: Date.now(),
    esp32: {
      stateCode: 0,
      stateName: 'DISCONNECTED',
      stateReason: 'ESP32 not connected',
      relayClosed: false,
      forceMode: 0,
      uptimeStr: '00:00:00',
      pBatW: 0,
      pHarvW: 0,
      whTotal: 0,
      whHarv: 0,
      vTegPeak: 0,
      hotFault: false,
      coldFault: false,
      hotWhy: '',
      coldWhy: '',
      dhtOk: false,
      ts1Tripped: false,
      overcurrentLatched: false,
      batHot: false,
      vOpenNow: 14.4,
      vCloseNow: 13.6,
      vHardNow: 14.6,
      batTrim: 1.1011,
      tegTrim: 1.1679,
      curTrim: 1.0,
      acsVolts: 0,
      acsZero: 2.5,
      alarmsText: 'none',
      activeAlarms: [],
      note: 'ESP32 Disconnected · Connect USB Serial',
    },
    relays: { dcBus: false, lights: false, fans: false, aux: false },
  }
}

/**
 * Apply calibration formulas and physical models to raw sensor inputs
 */
export function applyCalibration(
  raw: RawTelemetryInput,
  cal: CalibrationConfig
): TelemetryData {
  const isOffline = raw.source === 'offline'
  if (isOffline) {
    return getOfflineTelemetry(cal)
  }

  const isLiveHardware = raw.source === 'esp32' || Boolean(raw.esp32)
  const esp32Data = raw.esp32

  // If not live hardware and raw values are zero/missing, return offline zeros
  if (!isLiveHardware && (!raw.rawBatteryVoltage || raw.rawBatteryVoltage <= 0.1)) {
    return getOfflineTelemetry(cal)
  }

  // 1. Stove Temperature (°C): MAX31855 Thermocouple hot junction
  const safeRawStove = Number.isFinite(raw.rawStoveTemp) ? raw.rawStoveTemp : 0
  const stoveTemp = isLiveHardware && esp32Data?.tHot !== undefined
    ? (esp32Data.hotFault ? 0 : esp32Data.tHot)
    : Math.round(((safeRawStove * cal.stoveTempGain) + cal.stoveTempOffset) * 10) / 10

  // 2. DHT22 Ambient Temperature & Humidity
  const safeRawAmbient = Number.isFinite(raw.rawAmbientTemp) ? raw.rawAmbientTemp : 0
  const safeRawHumidity = Number.isFinite(raw.rawHumidity) ? raw.rawHumidity : 0
  const ambientTemp = isLiveHardware && esp32Data?.tAmb !== undefined
    ? (esp32Data.dhtOk === false ? 0 : esp32Data.tAmb)
    : Math.round((safeRawAmbient + cal.dhtTempOffset) * 10) / 10
  const humidity = isLiveHardware && esp32Data?.hum !== undefined
    ? (esp32Data.dhtOk === false ? 0 : esp32Data.hum)
    : Math.min(100, Math.max(0, Math.round(safeRawHumidity + cal.dhtHumidityOffset)))

  // 3. Cold Face Temperature (Water-Cooled Heatsink) & Seebeck Delta T
  const safeColdFace = Number.isFinite(raw.rawColdFaceTemp)
    ? (raw.rawColdFaceTemp as number)
    : Math.round((ambientTemp + 1.2) * 10) / 10
  const coldFaceTemp = isLiveHardware && esp32Data?.tCold !== undefined
    ? (esp32Data.coldFault ? 0 : esp32Data.tCold)
    : safeColdFace
  const deltaT = isLiveHardware && (esp32Data?.hotFault || esp32Data?.coldFault)
    ? 0
    : isLiveHardware && esp32Data?.dT !== undefined
    ? esp32Data.dT
    : Math.max(0, Math.round((stoveTemp - coldFaceTemp) * 10) / 10)

  // 4. Battery Voltage & SoC (%): 12V 15Ah SLA Profile
  // When connected to ESP32, safeRawBattV is already trimmed in firmware (e.g. 10.24V)
  const safeRawBattV = Number.isFinite(raw.rawBatteryVoltage) ? raw.rawBatteryVoltage : 0
  const batteryVoltage = isLiveHardware
    ? Math.round(safeRawBattV * 100) / 100
    : Math.round((safeRawBattV * cal.batteryVoltageGain) * 100) / 100
  const vMin = Math.min(cal.batteryVMin, cal.batteryVMax - 1.0)
  const vMax = Math.max(cal.batteryVMax, vMin + 1.0)
  const batteryPctRaw = batteryVoltage >= 6.0 ? ((batteryVoltage - vMin) / (vMax - vMin)) * 100 : 0
  const batteryPct = Math.min(100, Math.max(0, Math.round(batteryPctRaw)))

  // 5. TEG Current & Voltage & Power
  // When connected to ESP32, safeRawTegV (e.g. 13.10V) and safeRawTegI (e.g. 1.18A) are already trimmed in firmware
  const safeRawTegI = Number.isFinite(raw.rawTegCurrent) ? raw.rawTegCurrent : 0
  const safeRawTegV = Number.isFinite(raw.rawTegVoltage) ? raw.rawTegVoltage : 0
  const tegCurrent = isLiveHardware
    ? Math.max(0, Math.round(safeRawTegI * 100) / 100)
    : Math.max(0, Math.round((safeRawTegI - cal.tegCurrentZeroOffset) * cal.tegCurrentGain * 100) / 100)
  const tegVoltageGain = cal.tegVoltageGain ?? 1.1679
  const tegVoltage = isLiveHardware
    ? Math.round(safeRawTegV * 100) / 100
    : Math.max(0, Math.round(safeRawTegV * tegVoltageGain * 100) / 100)
  const tegPower = isLiveHardware && esp32Data?.pHarvW !== undefined
    ? esp32Data.pHarvW
    : Math.round(tegVoltage * tegCurrent * 10) / 10

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

    // Direct ESP32 Hardware Truth fields
    vTeg: tegVoltage,
    vBat: batteryVoltage,
    iBat: isLiveHardware && esp32Data?.iBat !== undefined ? esp32Data.iBat : (raw.rawBatteryCurrent !== undefined ? raw.rawBatteryCurrent : tegCurrent),
    pBat: isLiveHardware && esp32Data?.pBatW !== undefined ? esp32Data.pBatW : Math.round(batteryVoltage * tegCurrent * 10) / 10,
    pHarv: isLiveHardware && esp32Data?.pHarvW !== undefined ? esp32Data.pHarvW : tegPower,
    whTotal: esp32Data?.whTotal ?? 0,
    whHarv: esp32Data?.whHarv ?? 0,
    vTegPeak: esp32Data?.vTegPeak ?? tegVoltage,
    tHot: stoveTemp,
    tCold: coldFaceTemp,
    dT: deltaT,
    tAmb: ambientTemp,
    hum: humidity,
    hotFault: esp32Data?.hotFault ?? false,
    coldFault: esp32Data?.coldFault ?? false,
    hotWhy: esp32Data?.hotWhy ?? 'ok',
    coldWhy: esp32Data?.coldWhy ?? 'ok',
    dhtOk: esp32Data?.dhtOk ?? true,
    ts1Tripped: esp32Data?.ts1Tripped ?? safety.thermalFuseTripped,
    relayOn: esp32Data?.relayClosed ?? isBusOn,
    stateCode: esp32Data?.stateCode ?? (isBusOn ? 1 : 4),
    stateName: esp32Data?.stateName ?? (isBusOn ? 'CHARGING' : 'FORCED OFF'),
    stateReason: esp32Data?.stateReason ?? (isBusOn ? 'charging allowed, relay closed' : 'charging forced OFF'),
    forceMode: esp32Data?.forceMode ?? 0,
    alarmsText: esp32Data?.alarmsText ?? 'none',
    activeAlarms: esp32Data?.activeAlarms ?? [],
    rawBat: safeRawBattV,
    rawTeg: safeRawTegV,
    rawI: safeRawTegI,
    acsVolts: esp32Data?.acsVolts ?? 2.5,
    acsZero: esp32Data?.acsZero ?? 2.5,
    batTrim: esp32Data?.batTrim ?? cal.batteryVoltageGain,
    tegTrim: esp32Data?.tegTrim ?? (cal.tegVoltageGain ?? 1.1679),
    curTrim: esp32Data?.curTrim ?? cal.tegCurrentGain,
    vOpenNow: esp32Data?.vOpenNow ?? 14.4,
    vCloseNow: esp32Data?.vCloseNow ?? 13.6,
    vHardNow: esp32Data?.vHardNow ?? 14.6,
    inaOk: false,

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
      dcBus: esp32Data ? esp32Data.relayClosed : isBusOn,
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
    esp32: raw.esp32,
    timestamp: raw.timestamp || Date.now(),
    source: raw.source || 'simulated',
  }
}

export function generateCppCalibrationHeader(cal: CalibrationConfig): string {
  return `// Calibration constants for thesis.ino (ESP32 Biomass Gasifier + TEG Charger)
#ifndef PADAYON_CALIBRATION_H
#define PADAYON_CALIBRATION_H

// Voltage dividers & trims (saved in ESP32 Preferences "cal" via commands B / G / I / X)
const float K_BAT                  = (47.0f + 10.0f) / 10.0f;  // GPIO32 battery divider (x5.7)
const float BAT_TRIM               = ${cal.batteryVoltageGain.toFixed(4)}f;
const float K_TEG                  = (150.0f + 10.0f) / 10.0f; // GPIO33 TEG divider (x16.0)
const float TEG_TRIM               = ${(cal.tegVoltageGain ?? 1.1679).toFixed(4)}f;
const float ACS_K                  = (10.0f + 15.0f) / 15.0f;  // GPIO35 ACS712-5A divider
const float CUR_TRIM_DEFAULT       = ${cal.tegCurrentGain.toFixed(4)}f;

// 12V 15Ah SLA charge protection limits (at 25 C, -18 mV/C temp compensation)
const float V_BAT_OPEN             = 14.40f;
const float V_BAT_CLOSE            = 13.60f;
const float V_BAT_HARD             = ${cal.batteryVMax.toFixed(2)}f;
const float V_BAT_LOW_WARN         = ${cal.batteryVMin.toFixed(2)}f;

// Thermal & safety alarm limits
const float HOT_ALARM_C            = ${cal.stoveOverheatThreshold.toFixed(1)}f;
const float COLD_ALARM_C           = 60.0f;
const float CAL_STOVE_OFFSET       = ${cal.stoveTempOffset.toFixed(2)}f;
const float CAL_STOVE_GAIN         = ${cal.stoveTempGain.toFixed(4)}f;
const float CAL_DHT_TEMP_OFFSET    = ${cal.dhtTempOffset.toFixed(2)}f;
const float CAL_DHT_HUMID_OFFSET   = ${cal.dhtHumidityOffset.toFixed(2)}f;

#endif
`
}
