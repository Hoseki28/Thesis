import { useState } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { CalibrationConfig, Lang, TelemetryData } from '../types/telemetry'
import {
  Sliders,
  BatteryCharging,
  Check,
} from './Icons'

interface CalibrationStudioProps {
  config: CalibrationConfig
  currentTelemetry: TelemetryData
  lang: Lang
  theme?: 'dark' | 'light'
  onSaveCalibration: (updated: CalibrationConfig) => void
  onResetDefaults: () => void
  onSendToHardware?: (cal: CalibrationConfig) => Promise<boolean>
  bridge?: HardwareBridge | null
}

export function CalibrationStudio({
  config,
  currentTelemetry,
  lang,
  theme = 'dark',
  onSaveCalibration,
  bridge,
}: CalibrationStudioProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const [noticeTone, setNoticeTone] = useState<'ok' | 'warn'>('ok')

  // Multimeter & Reference Thermometer input values for ESP32 B / G / I / TH / TC calibration
  const [multiBatV, setMultiBatV] = useState<string>('10.24')
  const [multiTegV, setMultiTegV] = useState<string>('13.10')
  const [multiCurA, setMultiCurA] = useState<string>('0.50')
  const [refHotC, setRefHotC] = useState<string>('28.0')
  const [refColdC, setRefColdC] = useState<string>('28.0')

  const notify = (msg: string, tone: 'ok' | 'warn' = 'ok') => {
    setSavedNotice(msg)
    setNoticeTone(tone)
    setTimeout(() => setSavedNotice(null), 3500)
  }

  const offlineMsg = isFil
    ? 'Hindi nakakabit ang ESP32. Ikabit muna sa BLE o USB.'
    : 'ESP32 is not connected. Connect via BLE or USB first.'

  const handleSendMultimeterBat = async () => {
    const val = parseFloat(multiBatV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendCalibrateBattery(val)
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? `Ipinadala ang B${val.toFixed(2)} sa ESP32 NVS!`
        : `Sent B${val.toFixed(2)} battery trim to ESP32 NVS!`
    )
  }

  const handleSendMultimeterTeg = async () => {
    const val = parseFloat(multiTegV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendCalibrateTeg(val)
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? `Ipinadala ang G${val.toFixed(2)} sa ESP32 NVS!`
        : `Sent G${val.toFixed(2)} TEG trim to ESP32 NVS!`
    )
  }

  const handleSendMultimeterCurrent = async () => {
    const val = parseFloat(multiCurA)
    if (!Number.isFinite(val) || val < 0.05 || val > 5.0) return
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendCalibrateCurrent(val)
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? `Ipinadala ang I${val.toFixed(2)} sa ESP32 (0.05–5.00A habang naka-charging)!`
        : `Sent I${val.toFixed(2)} current trim to ESP32 (0.05–5.00A while charging)!`
    )
  }

  const handleSendRefHotTc = async () => {
    const val = parseFloat(refHotC)
    if (!Number.isFinite(val) || val < -20 || val > 1000) return
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendCalibrateHotTc(val)
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    const rawHot = currentTelemetry.tHot ?? currentTelemetry.rawStoveTemp ?? 0
    if (rawHot > 0) {
      const newOffset = Math.round((val - rawHot) * 10) / 10
      onSaveCalibration({ ...config, stoveTempOffset: newOffset })
    }
    notify(
      isFil
        ? `Ipinadala ang TH${val.toFixed(1)} (Hot Thermocouple GPIO5) sa ESP32!`
        : `Sent TH${val.toFixed(1)} (Hot Thermocouple GPIO5) reference to ESP32!`
    )
  }

  const handleSendRefColdTc = async () => {
    const val = parseFloat(refColdC)
    if (!Number.isFinite(val) || val < -20 || val > 1000) return
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendCalibrateColdTc(val)
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? `Ipinadala ang TC${val.toFixed(1)} (Cold Thermocouple GPIO17) sa ESP32!`
        : `Sent TC${val.toFixed(1)} (Cold Thermocouple GPIO17) reference to ESP32!`
    )
  }

  const handleClearTcOffsets = async () => {
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendClearTcOffsets()
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    onSaveCalibration({ ...config, stoveTempOffset: 0 })
    notify(
      isFil
        ? 'Ipinadala ang TX (clear thermocouple offsets) sa ESP32!'
        : 'Sent TX (clear thermocouple offsets) command to ESP32!'
    )
  }

  const handleTareCurrent = async () => {
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendZeroCurrent()
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? 'Ipinadala ang k (zero current) sa ESP32!'
        : 'Sent k (zero current) command to ESP32!'
    )
  }

  const handleSendPinCheck = async () => {
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendPinCheck()
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? 'Ipinadala ang v (pin check). Tingnan ang Serial Monitor sa Logs tab!'
        : 'Sent v (pin check). View output in Logs Serial Monitor!'
    )
  }

  const handleResetEsp32Flash = async () => {
    if (!bridge) {
      notify(offlineMsg, 'warn')
      return
    }
    const ok = await bridge.sendResetCalibrations()
    if (!ok) {
      notify(offlineMsg, 'warn')
      return
    }
    notify(
      isFil
        ? 'Ipinadala ang X (reset NVS calibrations) sa ESP32!'
        : 'Sent X (reset NVS calibrations) command to ESP32!'
    )
  }

  // Live readings from ESP32 state
  const rawBatVal = currentTelemetry.rawBat ?? currentTelemetry.rawBatteryVoltage ?? 0.0
  const rawTegVal = currentTelemetry.rawTeg ?? currentTelemetry.rawTegVoltage ?? 0.0
  const rawIVal = currentTelemetry.rawI ?? currentTelemetry.rawTegCurrent ?? 0.0
  const batTrimVal = currentTelemetry.batTrim ?? config.batteryVoltageGain ?? 1.1011
  const tegTrimVal = currentTelemetry.tegTrim ?? 1.1679
  const curTrimVal = currentTelemetry.curTrim ?? config.tegCurrentGain ?? 1.0
  const acsZeroVal = currentTelemetry.acsZero ?? 2.5
  const acsVoltsVal = currentTelemetry.acsVolts ?? 2.5
  const acsOkVal = currentTelemetry.inaOk !== false && acsZeroVal >= 2.30 && acsZeroVal <= 2.70
  const hotTempVal = currentTelemetry.tHot ?? currentTelemetry.stoveTemp ?? 0.0
  const coldTempVal = currentTelemetry.tCold ?? currentTelemetry.coldFaceTemp ?? 0.0

  const inputClass = `flex-1 min-w-0 w-full min-h-[44px] rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
    isDark
      ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-100 placeholder-zinc-500'
      : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-500'
  }`

  const cardClass = `rounded-xl p-3 border overflow-hidden transition-colors ${
    isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
  }`

  return (
    <div className="flex flex-col gap-2.5 font-sans text-left">
      {savedNotice && (
        <div
          className={`rounded-lg p-2.5 border text-[11px] font-mono font-medium flex items-center gap-2 ${
            noticeTone === 'warn'
              ? isDark
                ? 'bg-amber-950/60 border-amber-500/70 text-amber-300'
                : 'bg-amber-50 border-amber-300 text-amber-800'
              : isDark
              ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-300'
              : 'bg-emerald-50 border-emerald-300 text-emerald-800'
          }`}
        >
          <Check
            className={`w-3.5 h-3.5 flex-shrink-0 ${
              noticeTone === 'warn'
                ? isDark ? 'text-amber-400' : 'text-amber-700'
                : isDark ? 'text-emerald-400' : 'text-emerald-700'
            }`}
            strokeWidth={2}
          />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className={cardClass}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BatteryCharging className={`w-3.5 h-3.5 ${isDark ? 'text-[#00E676]' : 'text-emerald-700'}`} strokeWidth={1.75} />
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {isFil ? 'Live ESP32 ADC at Thermocouples' : 'Live ESP32 ADC & Thermocouples'}
            </h3>
          </div>
          <span className={`text-[9.5px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Preferences "cal"
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Battery (GPIO32)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawBatVal.toFixed(2)} V
            </span>
            <span className={`text-[9.5px] block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              x{batTrimVal.toFixed(4)}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              TEG Boost (GPIO33)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawTegVal.toFixed(2)} V
            </span>
            <span className={`text-[9.5px] block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              x{tegTrimVal.toFixed(4)}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              ACS712 (GPIO35)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawIVal.toFixed(2)} A
            </span>
            <span className={`text-[9.5px] block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              x{curTrimVal.toFixed(4)}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              ACS Zero (~2.50V)
            </span>
            <span
              className={`font-bold text-xs tabular-nums ${
                acsOkVal
                  ? isDark ? 'text-white' : 'text-zinc-900'
                  : isDark ? 'text-amber-400' : 'text-amber-700'
              }`}
            >
              {acsZeroVal.toFixed(3)} V
            </span>
            <span
              className={`text-[9.5px] block ${
                acsOkVal
                  ? isDark ? 'text-zinc-400' : 'text-zinc-600'
                  : isDark ? 'text-amber-400' : 'text-amber-700'
              }`}
            >
              Now {acsVoltsVal.toFixed(2)}V · {acsOkVal ? 'OK' : 'Fault'}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Hot TC (CS GPIO5)
            </span>
            <span
              className={`font-bold text-xs tabular-nums ${
                currentTelemetry.hotFault
                  ? isDark ? 'text-rose-400' : 'text-rose-700'
                  : isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {currentTelemetry.hotFault ? 'FAULT' : `${hotTempVal.toFixed(1)} °C`}
            </span>
            <span
              className={`text-[9.5px] block truncate ${
                currentTelemetry.hotFault
                  ? isDark ? 'text-rose-400' : 'text-rose-700'
                  : isDark ? 'text-emerald-400' : 'text-emerald-700'
              }`}
            >
              {currentTelemetry.hotFault ? (currentTelemetry.hotWhy || 'Check probe') : 'MAX31855 Hot'}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Cold TC (CS GPIO17)
            </span>
            <span
              className={`font-bold text-xs tabular-nums ${
                currentTelemetry.coldFault
                  ? isDark ? 'text-rose-400' : 'text-rose-700'
                  : isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              {currentTelemetry.coldFault ? 'FAULT' : `${coldTempVal.toFixed(1)} °C`}
            </span>
            <span
              className={`text-[9.5px] block truncate ${
                currentTelemetry.coldFault
                  ? isDark ? 'text-rose-400' : 'text-rose-700'
                  : isDark ? 'text-emerald-400' : 'text-emerald-700'
              }`}
            >
              {currentTelemetry.coldFault ? (currentTelemetry.coldWhy || 'Check probe') : 'MAX31855 Cold'}
            </span>
          </div>
        </div>
      </div>

      <div className={`${cardClass} flex flex-col gap-2.5`}>
        <div className="flex items-center gap-1.5">
          <Sliders className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} strokeWidth={1.75} />
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {isFil ? 'Multimeter at Thermocouple (B / G / I / TH / TC)' : 'Multimeter & Thermocouple (B / G / I / TH / TC)'}
          </h3>
        </div>

        {/* Battery Volts (B) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10.5px] font-mono w-20 sm:w-24 flex-shrink-0 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Battery (V):
          </span>
          <input
            type="number"
            step="0.01"
            value={multiBatV}
            onChange={(e) => setMultiBatV(e.target.value)}
            className={inputClass}
            aria-label="Multimeter Battery Volts"
          />
          <button
            type="button"
            onClick={handleSendMultimeterBat}
            className="min-h-[44px] min-w-[68px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0 text-center"
          >
            B{multiBatV}
          </button>
        </div>

        {/* TEG Volts (G) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10.5px] font-mono w-20 sm:w-24 flex-shrink-0 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            TEG Boost (V):
          </span>
          <input
            type="number"
            step="0.01"
            value={multiTegV}
            onChange={(e) => setMultiTegV(e.target.value)}
            className={inputClass}
            aria-label="Multimeter TEG Volts"
          />
          <button
            type="button"
            onClick={handleSendMultimeterTeg}
            className="min-h-[44px] min-w-[68px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0 text-center"
          >
            G{multiTegV}
          </button>
        </div>

        {/* Charge Current Amps (I) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10.5px] font-mono w-20 sm:w-24 flex-shrink-0 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Current (A):
          </span>
          <input
            type="number"
            step="0.01"
            value={multiCurA}
            onChange={(e) => setMultiCurA(e.target.value)}
            className={inputClass}
            aria-label="Multimeter Charge Current Amps"
          />
          <button
            type="button"
            onClick={handleSendMultimeterCurrent}
            className="min-h-[44px] min-w-[68px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0 text-center"
          >
            I{multiCurA}
          </button>
        </div>

        {/* Hot Thermocouple Reference °C (TH) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10.5px] font-mono w-20 sm:w-24 flex-shrink-0 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Hot TC (°C):
          </span>
          <input
            type="number"
            step="0.1"
            value={refHotC}
            onChange={(e) => setRefHotC(e.target.value)}
            className={inputClass}
            aria-label="Reference Hot Thermocouple Celsius"
          />
          <button
            type="button"
            onClick={handleSendRefHotTc}
            className="min-h-[44px] min-w-[68px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0 text-center"
          >
            TH{refHotC}
          </button>
        </div>

        {/* Cold Thermocouple Reference °C (TC) */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10.5px] font-mono w-20 sm:w-24 flex-shrink-0 truncate ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Cold TC (°C):
          </span>
          <input
            type="number"
            step="0.1"
            value={refColdC}
            onChange={(e) => setRefColdC(e.target.value)}
            className={inputClass}
            aria-label="Reference Cold Thermocouple Celsius"
          />
          <button
            type="button"
            onClick={handleSendRefColdTc}
            className="min-h-[44px] min-w-[68px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0 text-center"
          >
            TC{refColdC}
          </button>
        </div>

        {/* Quick Hardware Commands: k, v, TX, X */}
        <div className={`grid grid-cols-4 gap-1.5 pt-2 border-t ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
          <button
            type="button"
            onClick={handleTareCurrent}
            className={`min-h-[44px] px-1.5 rounded-lg border text-[9.5px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            title="Zero ACS712 while relay is OPEN"
          >
            Zero (k)
          </button>
          <button
            type="button"
            onClick={handleSendPinCheck}
            className={`min-h-[44px] px-1.5 rounded-lg border text-[9.5px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            title="Print raw pin voltages to Serial Monitor"
          >
            Pins (v)
          </button>
          <button
            type="button"
            onClick={handleClearTcOffsets}
            className={`min-h-[44px] px-1.5 rounded-lg border text-[9.5px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-amber-400'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-amber-700'
            }`}
            title="Clear Hot and Cold thermocouple offsets (TX)"
          >
            Clear TC
          </button>
          <button
            type="button"
            onClick={handleResetEsp32Flash}
            className={`min-h-[44px] px-1.5 rounded-lg border text-[9.5px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-rose-400'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-rose-700'
            }`}
            title="Reset ESP32 NVS calibration trims to defaults"
          >
            Reset (X)
          </button>
        </div>
      </div>
    </div>
  )
}
