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
  bridge,
}: CalibrationStudioProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  // Multimeter manual input values for ESP32 B / G / I calibration
  const [multiBatV, setMultiBatV] = useState<string>('10.24')
  const [multiTegV, setMultiTegV] = useState<string>('13.10')
  const [multiCurA, setMultiCurA] = useState<string>('0.50')

  const notify = (msg: string) => {
    setSavedNotice(msg)
    setTimeout(() => setSavedNotice(null), 3500)
  }

  const handleSendMultimeterBat = async () => {
    const val = parseFloat(multiBatV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (bridge) {
      await bridge.sendCalibrateBattery(val)
      notify(
        isFil
          ? `Ipinadala ang B${val.toFixed(2)} sa ESP32 NVS!`
          : `Sent B${val.toFixed(2)} battery trim to ESP32 NVS!`
      )
    }
  }

  const handleSendMultimeterTeg = async () => {
    const val = parseFloat(multiTegV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (bridge) {
      await bridge.sendCalibrateTeg(val)
      notify(
        isFil
          ? `Ipinadala ang G${val.toFixed(2)} sa ESP32 NVS!`
          : `Sent G${val.toFixed(2)} TEG trim to ESP32 NVS!`
      )
    }
  }

  const handleSendMultimeterCurrent = async () => {
    const val = parseFloat(multiCurA)
    if (!Number.isFinite(val) || val < 0.05 || val > 5.0) return
    if (bridge) {
      await bridge.sendCalibrateCurrent(val)
      notify(
        isFil
          ? `Ipinadala ang I${val.toFixed(2)} sa ESP32 (0.05–5.00A habang naka-charging)!`
          : `Sent I${val.toFixed(2)} current trim to ESP32 (0.05–5.00A while charging)!`
      )
    }
  }

  const handleTareCurrent = async () => {
    if (bridge) {
      await bridge.sendZeroCurrent()
      notify(
        isFil
          ? 'Ipinadala ang k (zero current) sa ESP32!'
          : 'Sent k (zero current) command to ESP32!'
      )
    }
  }

  const handleSendPinCheck = async () => {
    if (bridge) {
      await bridge.sendPinCheck()
      notify(
        isFil
          ? 'Ipinadala ang v (pin check). Tingnan ang Serial Monitor sa Logs tab!'
          : 'Sent v (pin check). View output in Logs Serial Monitor!'
      )
    }
  }

  const handleResetEsp32Flash = async () => {
    if (bridge) {
      await bridge.sendResetCalibrations()
      notify(
        isFil
          ? 'Ipinadala ang X (reset NVS calibrations) sa ESP32!'
          : 'Sent X (reset NVS calibrations) command to ESP32!'
      )
    }
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

  const inputClass = `flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
    isDark
      ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-100 placeholder-zinc-500'
      : 'bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400'
  }`

  const cardClass = `rounded-xl p-3 border transition-colors ${
    isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
  }`

  return (
    <div className="flex flex-col gap-2.5 font-sans text-left">
      {savedNotice && (
        <div className="rounded-lg p-2 bg-emerald-950/60 border border-emerald-500/70 text-emerald-300 text-[11px] font-mono font-medium flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" strokeWidth={2} />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* ── 1. LIVE ESP32 NVS TRIMS & ADC VALUES ──────────────────────── */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BatteryCharging className="w-3.5 h-3.5 text-[#00E676]" strokeWidth={1.75} />
            <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {isFil ? 'Live ESP32 ADC at NVS Trims' : 'Live ESP32 ADC & NVS Trims'}
            </h3>
          </div>
          <span className={`text-[9.5px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Preferences "cal"
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Battery (GPIO32)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawBatVal.toFixed(2)} V
            </span>
            <span className="text-[9.5px] text-emerald-400 block">x{batTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              TEG Boost (GPIO33)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawTegVal.toFixed(2)} V
            </span>
            <span className="text-[9.5px] text-emerald-400 block">x{tegTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              ACS712 (GPIO35)
            </span>
            <span className={`font-bold text-xs tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {rawIVal.toFixed(2)} A
            </span>
            <span className="text-[9.5px] text-emerald-400 block">x{curTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'}`}>
            <span className={`text-[9px] uppercase font-bold block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              ACS Zero (~2.50V)
            </span>
            <span className={`font-bold text-xs tabular-nums ${acsOkVal ? (isDark ? 'text-white' : 'text-zinc-900') : 'text-amber-400'}`}>
              {acsZeroVal.toFixed(3)} V
            </span>
            <span className={`text-[9.5px] block ${acsOkVal ? 'text-zinc-400' : 'text-amber-400'}`}>
              Now {acsVoltsVal.toFixed(2)}V · {acsOkVal ? 'OK' : 'Fault'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. MULTIMETER CALIBRATION COMMANDS (B, G, I, k, v, X) ─────── */}
      <div className={`${cardClass} flex flex-col gap-2.5`}>
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
          <h3 className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {isFil ? 'Multimeter Calibration (B / G / I)' : 'Multimeter Calibration (B / G / I)'}
          </h3>
        </div>

        {/* Battery Volts (B) */}
        <div className="flex items-center gap-2">
          <span className={`text-[10.5px] font-mono w-24 flex-shrink-0 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
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
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0"
          >
            B{multiBatV}
          </button>
        </div>

        {/* TEG Volts (G) */}
        <div className="flex items-center gap-2">
          <span className={`text-[10.5px] font-mono w-24 flex-shrink-0 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
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
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0"
          >
            G{multiTegV}
          </button>
        </div>

        {/* Charge Current Amps (I) */}
        <div className="flex items-center gap-2">
          <span className={`text-[10.5px] font-mono w-24 flex-shrink-0 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
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
            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-bold cursor-pointer transition-colors flex-shrink-0"
          >
            I{multiCurA}
          </button>
        </div>

        {/* Quick Hardware Commands: k, v, X */}
        <div className={`grid grid-cols-3 gap-1.5 pt-2 border-t ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
          <button
            type="button"
            onClick={handleTareCurrent}
            className={`h-8 px-2 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800'
            }`}
            title="Zero ACS712 while relay is OPEN"
          >
            Zero I (k)
          </button>
          <button
            type="button"
            onClick={handleSendPinCheck}
            className={`h-8 px-2 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
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
            onClick={handleResetEsp32Flash}
            className={`h-8 px-2 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-rose-400'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-rose-600'
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
