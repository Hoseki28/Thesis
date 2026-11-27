import { useState } from 'react'
import { CalibrationStudio } from './CalibrationStudio'
import { HardwareBridge } from '../services/hardwareBridge'
import { CalibrationConfig, Lang, TelemetryData } from '../types/telemetry'
import {
  Sliders,
  IconZap,
  IconRotateCcw,
  IconShield,
  IconVolume2,
  IconActivity,
  IconCheckCircle,
  IconAlertTriangle,
  IconXCircle,
  IconBluetooth,
  IconUsb,
} from './Icons'

type SensorHealthStatus = 'ok' | 'warning' | 'fault' | 'disconnected'

interface SensorHealthItem {
  id: string
  name: string
  pin: string
  detail: string
  status: SensorHealthStatus
}

interface ServiceTabProps {
  telemetry: TelemetryData
  calibration: CalibrationConfig
  lang: Lang
  theme?: 'dark' | 'light'
  bridge?: HardwareBridge | null
  onSaveCalibration: (updated: CalibrationConfig) => void
  onResetDefaults: () => void
  onSendToHardware?: (cal: CalibrationConfig) => Promise<boolean>
}

export function ServiceTab({
  telemetry,
  calibration,
  lang,
  theme = 'dark',
  bridge,
  onSaveCalibration,
  onResetDefaults,
  onSendToHardware,
}: ServiceTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isHardwareConnected =
    telemetry.source === 'hardware' ||
    telemetry.source === 'serial' ||
    telemetry.source === 'bluetooth' ||
    telemetry.source === 'esp32'

  const [cmdFeedback, setCmdFeedback] = useState<string | null>(null)
  const [cmdTone, setCmdTone] = useState<'ok' | 'warn'>('ok')
  const [showAdvancedCal, setShowAdvancedCal] = useState<boolean>(false)

  const showFeedback = (msg: string, tone: 'ok' | 'warn' = 'ok') => {
    setCmdFeedback(msg)
    setCmdTone(tone)
    setTimeout(() => setCmdFeedback(null), 3000)
  }

  const handleCommand = async (action: string, fn: () => Promise<boolean> | void) => {
    if (!bridge || !isHardwareConnected) {
      showFeedback(
        isFil
          ? 'Ikabit muna ang ESP32 bago magpadala ng command.'
          : 'Connect ESP32 first before sending hardware commands.',
        'warn'
      )
      return
    }
    const res = await fn()
    if (res === false) {
      showFeedback(
        isFil
          ? `Hindi naipadala ang ${action}. Suriin ang koneksyon.`
          : `Failed to send ${action}. Check ESP32 connection.`,
        'warn'
      )
      return
    }
    showFeedback(`${action} ${isFil ? 'ipinadala' : 'sent'}`, 'ok')
  }

  // Live ESP32 Sensor & Peripheral Health Diagnostics (verified against ESP32 pin map)
  const vBat = telemetry.vBat ?? telemetry.batteryVoltage ?? 0
  const vTeg = telemetry.vTeg ?? telemetry.tegVoltage ?? 0
  const iBat = telemetry.iBat ?? telemetry.rawTegCurrent ?? 0
  const acsZero = telemetry.acsZero ?? 2.5
  const tHot = telemetry.tHot ?? telemetry.stoveTemp ?? 0
  const tCold = telemetry.tCold ?? telemetry.coldFaceTemp ?? 0
  const tAmb = telemetry.tAmb ?? telemetry.ambientTemp ?? 0
  const hum = telemetry.hum ?? telemetry.humidity ?? 0
  const vOpenNow = telemetry.vOpenNow ?? 14.6
  const relayOn = Boolean(telemetry.relayOn ?? telemetry.relays?.dcBus)
  const dhtOk = telemetry.esp32?.dhtOk !== false
  const stateCode = telemetry.stateCode ?? telemetry.esp32?.stateCode ?? 0
  const battPct =
    stateCode === 0 || vBat < 6.0 || vBat > 16.5
      ? 0
      : Math.min(100, Math.max(0, Math.round(telemetry.batPct ?? telemetry.batteryPct ?? 0)))
  const battBars =
    stateCode === 0 || vBat < 6.0 || vBat > 16.5
      ? 0
      : battPct >= 76
      ? 4
      : battPct >= 50
      ? 3
      : battPct >= 20
      ? 2
      : battPct > 0
      ? 1
      : 0

  const sensorDiagnostics: SensorHealthItem[] = (() => {
    if (!isHardwareConnected) {
      return [
        { id: 'vbat', name: 'Battery V', pin: 'GPIO32', detail: 'Standby', status: 'disconnected' },
        { id: 'vteg', name: 'TEG Input', pin: 'GPIO33', detail: 'Standby', status: 'disconnected' },
        { id: 'acs', name: 'ACS712 5A', pin: 'GPIO35', detail: 'Standby', status: 'disconnected' },
        { id: 'hot_tc', name: 'Hot TC', pin: 'CS GPIO5', detail: 'Standby', status: 'disconnected' },
        { id: 'cold_tc', name: 'Cold TC', pin: 'CS GPIO17', detail: 'Standby', status: 'disconnected' },
        { id: 'dht22', name: 'DHT22 Env', pin: 'GPIO23', detail: 'Standby', status: 'disconnected' },
        { id: 'relay', name: 'Relay M2', pin: 'GPIO14', detail: 'Standby', status: 'disconnected' },
        { id: 'lcd', name: 'LCD & LEDs', pin: 'I2C 21/22', detail: 'Standby', status: 'disconnected' },
      ]
    }

    // 1. Battery Voltage Divider (GPIO32)
    let batStatus: SensorHealthStatus = 'ok'
    let batDetail = `${vBat.toFixed(2)} V`
    if (vBat < 6.0 || vBat > 16.5) {
      batStatus = 'disconnected'
      batDetail = 'No batt'
    } else if (battBars > 0 && battBars <= 2) {
      batStatus = 'warning'
      batDetail = `${vBat.toFixed(2)}V Low`
    } else if (vBat >= vOpenNow) {
      batStatus = 'ok'
      batDetail = `${vBat.toFixed(2)}V Full`
    }

    // 2. TEG Input Divider (GPIO33)
    // Only warn on low TEG (<1.0V) when battery is down to 2 bars or less
    let tegStatus: SensorHealthStatus = 'ok'
    let tegDetail = `${vTeg.toFixed(2)} V`
    if (vTeg > 45.0) {
      tegStatus = 'fault'
      tegDetail = `${vTeg.toFixed(1)}V >45V`
    } else if (vTeg < 1.0 && battBars > 0 && battBars <= 2) {
      tegStatus = 'warning'
      tegDetail = `${vTeg.toFixed(2)}V Low`
    }

    // 3. ACS712-5A Current Sensor (GPIO35)
    let acsStatus: SensorHealthStatus = 'ok'
    let acsDetail = `${iBat.toFixed(2)} A`
    if (Boolean(telemetry.esp32?.overcurrentLatched) || telemetry.stateCode === 6) {
      acsStatus = 'fault'
      acsDetail = `>2.25A Trip`
    } else if (telemetry.inaOk === false) {
      acsStatus = 'fault'
      acsDetail = `Zero ${acsZero.toFixed(2)}V`
    }

    // 4. MAX31855 Hot Thermocouple (CS GPIO5)
    let hotStatus: SensorHealthStatus = 'ok'
    let hotDetail = `${tHot.toFixed(1)} °C`
    if (telemetry.hotFault) {
      hotStatus = 'fault'
      hotDetail = telemetry.hotWhy && telemetry.hotWhy !== 'ok' ? telemetry.hotWhy : 'Probe fault'
    } else if (tHot > 150) {
      hotStatus = 'warning'
      hotDetail = `${tHot.toFixed(0)}°C High`
    }

    // 5. MAX31855 Cold Thermocouple (CS GPIO17)
    let coldStatus: SensorHealthStatus = 'ok'
    let coldDetail = `${tCold.toFixed(1)} °C`
    if (telemetry.coldFault) {
      coldStatus = 'fault'
      coldDetail = telemetry.coldWhy && telemetry.coldWhy !== 'ok' ? telemetry.coldWhy : 'Probe fault'
    } else if (tCold > 60) {
      coldStatus = 'warning'
      coldDetail = `${tCold.toFixed(0)}°C High`
    }

    // 6. DHT22 Ambient Sensor (GPIO23)
    let dhtStatus: SensorHealthStatus = 'ok'
    let dhtDetail = `${tAmb.toFixed(1)}°C · ${Math.round(hum)}%`
    if (!dhtOk) {
      dhtStatus = 'fault'
      dhtDetail = 'No reading'
    } else if (Boolean(telemetry.esp32?.batHot) || telemetry.stateCode === 5 || tAmb >= 40 || tAmb < 0) {
      dhtStatus = 'warning'
      dhtDetail = `${tAmb.toFixed(1)}°C Limit`
    }

    // 7. Charging Relay (GPIO14)
    let relayStatus: SensorHealthStatus = 'ok'
    let relayDetail = relayOn ? 'CLOSED' : 'OPEN'
    if (Boolean(telemetry.esp32?.overcurrentLatched) || telemetry.stateCode === 6) {
      relayStatus = 'fault'
      relayDetail = 'OVERCURRENT'
    } else if (telemetry.stateCode === 5 || telemetry.stateCode === 4) {
      relayStatus = 'warning'
      relayDetail = telemetry.stateName || 'HOLD'
    }

    return [
      { id: 'vbat', name: 'Battery V', pin: 'GPIO32', detail: batDetail, status: batStatus },
      { id: 'vteg', name: 'TEG Input', pin: 'GPIO33', detail: tegDetail, status: tegStatus },
      { id: 'acs', name: 'ACS712 5A', pin: 'GPIO35', detail: acsDetail, status: acsStatus },
      { id: 'hot_tc', name: 'Hot TC', pin: 'CS GPIO5', detail: hotDetail, status: hotStatus },
      { id: 'cold_tc', name: 'Cold TC', pin: 'CS GPIO17', detail: coldDetail, status: coldStatus },
      { id: 'dht22', name: 'DHT22 Env', pin: 'GPIO23', detail: dhtDetail, status: dhtStatus },
      { id: 'relay', name: 'Relay M2', pin: 'GPIO14', detail: relayDetail, status: relayStatus },
      { id: 'lcd', name: 'LCD & LEDs', pin: 'I2C 21/22', detail: 'Online', status: 'ok' },
    ]
  })()

  const faultCount = sensorDiagnostics.filter((s) => s.status === 'fault').length
  const warnCount = sensorDiagnostics.filter((s) => s.status === 'warning' || (isHardwareConnected && s.status === 'disconnected')).length
  const totalIssues = faultCount + warnCount

  const badgeStyle = (status: SensorHealthStatus) => {
    switch (status) {
      case 'ok':
        return isDark
          ? 'bg-emerald-500/15 text-[#00E676] border-emerald-500/35'
          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
      case 'warning':
        return isDark
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/35'
          : 'bg-amber-50 text-amber-700 border-amber-300'
      case 'fault':
        return isDark
          ? 'bg-rose-500/15 text-rose-400 border-rose-500/40'
          : 'bg-rose-50 text-rose-700 border-rose-300'
      default:
        return isDark
          ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
          : 'bg-zinc-100 text-zinc-600 border-zinc-300'
    }
  }

  const badgeLabel = (status: SensorHealthStatus) => {
    if (status === 'ok') return 'OK'
    if (status === 'warning') return 'WARN'
    if (status === 'fault') return 'FAULT'
    return 'OFF'
  }

  const transportLabel = !isHardwareConnected
    ? 'OFFLINE'
    : telemetry.source === 'bluetooth'
    ? 'BLE UART'
    : 'USB SERIAL'

  return (
    <div className="flex flex-col gap-2.5 font-sans">
      <section
        className={`rounded-2xl p-3 border flex flex-col gap-2 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-label="ESP32 Hardware and Sensor Health"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className={`text-xs font-black uppercase tracking-wider leading-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              ESP32 SENSOR HEALTH
            </h2>
            <span className={`text-[9.5px] font-mono block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {!isHardwareConnected
                ? '8 Modules · Offline'
                : totalIssues === 0
                ? '8/8 Modules · All OK'
                : `${faultCount} Fault · ${warnCount} Warning`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Compact Comm Link Pill */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-mono font-bold uppercase ${
                isHardwareConnected
                  ? isDark
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-[#00E676]'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-400'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-600'
              }`}
            >
              {telemetry.source === 'bluetooth' ? (
                <IconBluetooth size={11} className={isDark ? 'text-sky-400' : 'text-sky-700'} />
              ) : (
                <IconUsb
                  size={11}
                  className={
                    isHardwareConnected
                      ? isDark
                        ? 'text-[#00E676]'
                        : 'text-emerald-700'
                      : isDark
                      ? 'text-zinc-400'
                      : 'text-zinc-600'
                  }
                />
              )}
              <span>{transportLabel}</span>
            </span>

            {isHardwareConnected && (
              <button
                type="button"
                onClick={() => handleCommand(isFil ? 'Pin check' : 'Pin check (v)', () => bridge?.sendPinCheck())}
                className={`px-2.5 py-1 rounded-md border text-[9px] font-mono font-bold uppercase cursor-pointer transition-colors min-h-[44px] min-w-[44px] ${
                  isDark
                    ? 'bg-[#0B0F12] border-[#1E242B] text-[#00E676] hover:bg-[#1E242B]'
                    : 'bg-zinc-50 border-zinc-200 text-emerald-700 hover:bg-zinc-100'
                }`}
                title="Send 'v' pin check command to ESP32"
              >
                PIN (v)
              </button>
            )}
          </div>
        </div>

        {/* 2-Column × 4-Row Zero-Scroll Sensor Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {sensorDiagnostics.map((item) => (
            <div
              key={item.id}
              className={`px-2.5 py-2 rounded-xl border flex flex-col gap-1 transition-colors ${
                item.status === 'fault'
                  ? isDark
                    ? 'bg-rose-950/20 border-rose-500/35'
                    : 'bg-rose-50/70 border-rose-200'
                  : item.status === 'warning'
                  ? isDark
                    ? 'bg-amber-950/15 border-amber-500/30'
                    : 'bg-amber-50/70 border-amber-200'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#1E242B]'
                  : 'bg-zinc-50 border-zinc-200/80'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.status === 'ok' && (
                    <IconCheckCircle
                      size={12}
                      className={`${isDark ? 'text-[#00E676]' : 'text-emerald-700'} flex-shrink-0`}
                    />
                  )}
                  {item.status === 'warning' && (
                    <IconAlertTriangle
                      size={12}
                      className={`${isDark ? 'text-amber-400' : 'text-amber-700'} flex-shrink-0`}
                    />
                  )}
                  {item.status === 'fault' && (
                    <IconXCircle
                      size={12}
                      className={`${isDark ? 'text-rose-400' : 'text-rose-700'} flex-shrink-0`}
                    />
                  )}
                  {item.status === 'disconnected' && (
                    <span className={`block w-2.5 h-2.5 rounded-full border-[1.5px] flex-shrink-0 ${isDark ? 'border-zinc-500' : 'border-zinc-500'}`} />
                  )}
                  <span className={`text-[11px] font-bold truncate ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    {item.name}
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[8px] font-mono font-black uppercase leading-none flex-shrink-0 ${badgeStyle(item.status)}`}
                >
                  {badgeLabel(item.status)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 text-[9.5px] font-mono">
                <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>{item.pin}</span>
                <span
                  className={`truncate font-semibold ${
                    item.status === 'fault'
                      ? isDark
                        ? 'text-rose-400'
                        : 'text-rose-700'
                      : item.status === 'warning'
                      ? isDark
                        ? 'text-amber-400'
                        : 'text-amber-700'
                      : isDark
                      ? 'text-zinc-300'
                      : 'text-zinc-700'
                  }`}
                >
                  {item.detail}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className={`rounded-2xl p-3 border flex flex-col gap-2.5 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="hardware-actions-heading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconZap size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            <h3 id="hardware-actions-heading" className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'KONTROL NG HARDWARE (SERIAL)' : 'ESP32 CHARGER COMMANDS'}
            </h3>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
              isHardwareConnected
                ? isDark
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : isDark
                ? 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
                : 'bg-zinc-100 text-zinc-700 border-zinc-300'
            }`}
          >
            {isHardwareConnected ? 'LIVE LINK' : 'STANDBY'}
          </span>
        </div>

        {cmdFeedback && (
          <div
            className={`text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg border animate-fade-in ${
              cmdTone === 'warn'
                ? isDark
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
                : isDark
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
            }`}
          >
            {cmdFeedback}
          </div>
        )}

        {/* Charge Mode Selector ('a', 'c', 'o') */}
        <div className="flex flex-col gap-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
            {isFil ? 'MODO NG CHARGING' : 'CHARGING MODE OVERRIDE'}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Awtomatikong charging' : 'Auto charging', () => bridge?.sendAutoCharging())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 0 || telemetry.forceMode === undefined
                  ? isDark
                    ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                    : 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Awtomatiko' : 'Auto Mode'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'a'</span>
            </button>

            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Sapilitang ON' : 'Force charge ON', () => bridge?.sendForceChargingOn())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 1
                  ? isDark
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-amber-50 border-amber-500 text-amber-700'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Sapilitang ON' : 'Force ON'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'c'</span>
            </button>

            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Sapilitang OFF' : 'Force charge OFF', () => bridge?.sendForceChargingOff())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 2
                  ? isDark
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                    : 'bg-rose-50 border-rose-500 text-rose-700'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Sapilitang OFF' : 'Force OFF'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'o'</span>
            </button>
          </div>
        </div>

        {/* Diagnostic and Reset Grid */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'I-clear ang overcurrent' : 'Clear overcurrent', () => bridge?.sendClearOvercurrent())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              telemetry.stateCode === 6 || telemetry.activeAlarms?.includes('A_OVERI')
                ? isDark
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                  : 'bg-rose-50 border-rose-500 text-rose-700 animate-pulse'
                : isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconShield size={14} className={`${isDark ? 'text-amber-400' : 'text-amber-700'} flex-shrink-0`} />
            <div className="flex flex-col text-left leading-tight">
              <span>Clear Overcurrent</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'r'</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'I-reset ang Wh' : 'Reset energy Wh', () => bridge?.sendResetEnergy())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconRotateCcw size={14} className={`${isDark ? 'text-[#00E676]' : 'text-emerald-700'} flex-shrink-0`} />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'I-reset ang Wh' : 'Reset Energy Wh'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'z'</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'Pagsusuri ng ilaw at buzzer' : 'LED and buzzer test', () => bridge?.sendTestLedsBuzzer())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconActivity size={14} className={`${isDark ? 'text-cyan-400' : 'text-cyan-700'} flex-shrink-0`} />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'Subukan ang Ilaw' : 'Test LEDs / Buzz'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 't' (2s)</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'Mute/Unmute Buzzer' : 'Mute/Unmute buzzer', () => bridge?.sendMuteBuzzer())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconVolume2 size={14} className={`${isDark ? 'text-violet-400' : 'text-violet-700'} flex-shrink-0`} />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'I-mute ang Buzzer' : 'Mute Buzzer'}</span>
              <span className="text-[9px] font-mono opacity-80">Cmd: 'm'</span>
            </div>
          </button>
        </div>
      </section>

      <section className={`rounded-2xl p-4 border flex flex-col gap-2.5 shadow-lg mt-1 font-sans transition-colors ${
        isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {isFil ? 'Kalibrasyon ng Sensor' : 'Sensor Calibration'}
          </span>
          <button
            type="button"
            onClick={() => setShowAdvancedCal(!showAdvancedCal)}
            className={`text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px] px-3 rounded-lg ${
              isDark
                ? 'text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800/60'
                : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{showAdvancedCal ? (isFil ? 'Itago ang Studio' : 'Hide Studio') : (isFil ? 'Buksan ang Studio' : 'Open Studio')}</span>
          </button>
        </div>

        {showAdvancedCal && (
          <div className={`pt-2 border-t ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
            <CalibrationStudio
              config={calibration}
              currentTelemetry={telemetry}
              lang={lang}
              theme={theme}
              bridge={bridge}
              onSaveCalibration={onSaveCalibration}
              onResetDefaults={onResetDefaults}
              onSendToHardware={onSendToHardware}
            />
          </div>
        )}
      </section>
    </div>
  )
}
