import { useState } from 'react'
import { generateCppCalibrationHeader } from '../services/calibrationStorage'
import { HardwareBridge } from '../services/hardwareBridge'
import { CalibrationConfig, Lang, TelemetryData } from '../types/telemetry'
import {
  Sliders,
  Flame,
  Thermometer,
  BatteryCharging,
  Zap,
  Check,
  Terminal,
  FileCode,
  RotateCcw,
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
  onResetDefaults,
  onSendToHardware,
  bridge,
}: CalibrationStudioProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const [form, setForm] = useState<CalibrationConfig>({ ...config })
  const [savedNotice, setSavedNotice] = useState<string | null>(null)
  const [copiedNotice, setCopiedNotice] = useState<boolean>(false)

  // Multimeter manual input values for ESP32 B / G / I serial calibration
  const [multiBatV, setMultiBatV] = useState<string>('10.24')
  const [multiTegV, setMultiTegV] = useState<string>('13.10')
  const [multiCurA, setMultiCurA] = useState<string>('0.50')

  const handleChange = (key: keyof CalibrationConfig, val: number) => {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  const handleSave = () => {
    onSaveCalibration(form)
    setSavedNotice(
      isFil
        ? 'Matagumpay na na-save ang mga parameter ng kalibrasyon!'
        : 'Calibration parameters saved to local storage!'
    )
    setTimeout(() => setSavedNotice(null), 3500)
  }

  const handleTareCurrent = async () => {
    if (bridge) {
      await bridge.sendZeroCurrent()
      setSavedNotice(
        isFil
          ? 'Ipinadala ang command na k (zero current) sa ESP32!'
          : 'Dispatched k (zero current) command to ESP32!'
      )
    } else {
      const newTare = currentTelemetry.rawTegCurrent
      handleChange('tegCurrentZeroOffset', newTare)
      setSavedNotice(
        isFil
          ? `Na-zero ang ACS712 tare sa ${newTare.toFixed(2)}A!`
          : `ACS712 current zero-drift tared to ${newTare.toFixed(2)}A!`
      )
    }
    setTimeout(() => setSavedNotice(null), 3500)
  }

  const handleSendMultimeterBat = async () => {
    const val = parseFloat(multiBatV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (bridge) {
      await bridge.sendCalibrateBattery(val)
      setSavedNotice(
        isFil
          ? `Ipinadala ang B${val.toFixed(2)} sa ESP32!`
          : `Dispatched B${val.toFixed(2)} battery calibration to ESP32!`
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleSendMultimeterTeg = async () => {
    const val = parseFloat(multiTegV)
    if (!Number.isFinite(val) || val < 3 || val > 60) return
    if (bridge) {
      await bridge.sendCalibrateTeg(val)
      setSavedNotice(
        isFil
          ? `Ipinadala ang G${val.toFixed(2)} sa ESP32!`
          : `Dispatched G${val.toFixed(2)} TEG calibration to ESP32!`
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleSendMultimeterCurrent = async () => {
    const val = parseFloat(multiCurA)
    if (!Number.isFinite(val) || val < 0.1 || val > 10) return
    if (bridge) {
      await bridge.sendCalibrateCurrent(val)
      setSavedNotice(
        isFil
          ? `Ipinadala ang I${val.toFixed(2)} sa ESP32!`
          : `Dispatched I${val.toFixed(2)} current calibration to ESP32!`
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleSendPinCheck = async () => {
    if (bridge) {
      await bridge.sendPinCheck()
      setSavedNotice(
        isFil
          ? 'Ipinadala ang command na v (pin check). Tingnan ang Terminal!'
          : 'Dispatched v (pin check) command. Check Serial Terminal!'
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleResetEsp32Flash = async () => {
    if (bridge) {
      await bridge.sendResetCalibrations()
      setSavedNotice(
        isFil
          ? 'Ipinadala ang command na X (reset flash calibrations) sa ESP32!'
          : 'Dispatched X (reset flash calibrations) command to ESP32!'
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleCalibrateIceBath = () => {
    const newOffset = Math.round((0 - currentTelemetry.rawStoveTemp) * 10) / 10
    handleChange('stoveTempOffset', newOffset)
    setSavedNotice(
      isFil
        ? `Na-calibrate ang 0.0°C Ice Bath! Bagong offset: ${newOffset}°C`
        : `0.0°C Ice Bath reference calibrated! New offset: ${newOffset}°C`
    )
    setTimeout(() => setSavedNotice(null), 3500)
  }

  const handleCalibrateBoilingWater = () => {
    const currentBase = currentTelemetry.rawStoveTemp + form.stoveTempOffset
    if (currentBase > 0) {
      const newGain = Math.round((100 / currentBase) * 1000) / 1000
      handleChange('stoveTempGain', newGain)
      setSavedNotice(
        isFil
          ? `Na-calibrate ang 100.0°C Boiling Water! Bagong gain: ${newGain}`
          : `100.0°C Boiling Water reference calibrated! New gain: ${newGain}`
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  const handleCopyCpp = async () => {
    const code = generateCppCalibrationHeader(form)
    try {
      await navigator.clipboard.writeText(code)
      setCopiedNotice(true)
      setTimeout(() => setCopiedNotice(false), 3000)
    } catch (err) {
      console.warn('Failed to copy', err)
    }
  }

  const handleDispatchHardware = async () => {
    if (onSendToHardware) {
      const success = await onSendToHardware(form)
      setSavedNotice(
        success
          ? isFil ? 'Naipadala ang utos sa ESP32 EEPROM!' : 'Calibration command dispatched to ESP32 EEPROM!'
          : isFil ? 'Nabigo: Walang nakakabit na hardware.' : 'Failed: No hardware currently connected.'
      )
      setTimeout(() => setSavedNotice(null), 3500)
    }
  }

  // Live readings from thesis.ino state
  const rawBatVal = currentTelemetry.rawBat ?? currentTelemetry.rawBatteryVoltage ?? 12.65
  const rawTegVal = currentTelemetry.rawTeg ?? currentTelemetry.rawTegVoltage ?? 0.0
  const rawIVal = currentTelemetry.rawI ?? currentTelemetry.rawTegCurrent ?? 0.0
  const batTrimVal = currentTelemetry.batTrim ?? form.batteryVoltageGain ?? 1.028
  const tegTrimVal = currentTelemetry.tegTrim ?? 1.052
  const curTrimVal = currentTelemetry.curTrim ?? form.tegCurrentGain ?? 1.0
  const acsZeroVal = currentTelemetry.acsZero ?? 2.5
  const acsVoltsVal = currentTelemetry.acsVolts ?? 2.5

  // Industrial workbench input styling (Dark Mode Standard)
  const baseInputClass =
    'bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors'

  const fullInputClass = `w-full ${baseInputClass}`
  const numberInputClass = `w-24 ${baseInputClass}`

  // Safety threshold input styles with palette discipline (rose-500 for trip, amber-500 for warning)
  const tripInputClass =
    'w-full rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums outline-none transition-colors border bg-rose-500/10 border-rose-500/30 text-rose-500 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500'
  const warningInputClass =
    'w-full rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums outline-none transition-colors border bg-amber-500/10 border-amber-500/30 text-amber-400 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500'

  const cardClass = `rounded-2xl p-4 border transition-colors shadow-sm ${
    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
  }`

  return (
    <div className="flex flex-col gap-3 font-sans text-left">
      {/* ── HEADER CARD ──────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
            }`}>
              <Sliders className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            </div>
            <div>
              <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-400 font-medium block">
                {isFil ? 'Analog Front-End Calibration' : 'Analog Front-End Calibration'}
              </span>
              <h2 className={`text-sm font-bold tracking-tight ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                {isFil ? 'Sensor Calibration Studio' : 'Sensor Calibration Studio'}
              </h2>
            </div>
          </div>
          <span className={`text-[11px] font-mono tracking-wider px-2 py-0.5 rounded-md border ${
            isDark ? 'bg-zinc-900/90 border-zinc-800 text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-600'
          }`}>
            REV 2.1
          </span>
        </div>
        <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {isFil
            ? 'I-tune ang ADC offsets, gain multipliers, at bench zero-drift references para sa mga pisikal na sensor.'
            : 'Tune ADC offsets, gain multipliers, and bench zero-drift references for physical sensors.'}
        </p>

        {savedNotice && (
          <div className="rounded-lg p-2.5 mt-2.5 bg-emerald-950/60 border border-emerald-500/70 text-emerald-300 text-xs font-mono font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" strokeWidth={2} />
            <span>{savedNotice}</span>
          </div>
        )}
      </section>

      {/* ── LIVE HARDWARE TRIMS & ADC VALUES (thesis.ino) ───────────── */}
      <section className={`${cardClass} flex flex-col gap-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-[#00E676]" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Live ESP32 ADC at Calibration Factors' : 'Live ESP32 ADCs & Calibration Factors'}
            </h3>
          </div>
          <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            NVS Flash Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Battery (GPIO32)</span>
            <span className="font-bold text-sm tabular-nums text-zinc-100">{rawBatVal.toFixed(2)} V</span>
            <span className="text-[10px] text-emerald-400">Trim: x{batTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>TEG (GPIO33)</span>
            <span className="font-bold text-sm tabular-nums text-zinc-100">{rawTegVal.toFixed(2)} V</span>
            <span className="text-[10px] text-emerald-400">Trim: x{tegTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              ACS712 Current (GPIO35)
            </span>
            <span className="font-bold text-sm tabular-nums text-zinc-100">{rawIVal.toFixed(2)} A</span>
            <span className="text-[10px] text-emerald-400">Trim: x{curTrimVal.toFixed(4)}</span>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              ACS Zero Point
            </span>
            <span className="font-bold text-sm tabular-nums text-zinc-100">
              {acsZeroVal.toFixed(3)} V
            </span>
            <span className="text-[10px] text-zinc-400">
              Sensor: {acsVoltsVal.toFixed(3)} V
            </span>
          </div>
        </div>
      </section>

      {/* ── MULTIMETER SERIAL CALIBRATION (Commands B, G, I, k, v, X) ─── */}
      <section className={`${cardClass} flex flex-col gap-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Multimeter Calibration Commands (B / G / I / k / v / X)' : 'Multimeter Calibration Commands (B / G / I / k / v / X)'}
            </h3>
          </div>
          <span className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            115200 baud
          </span>
        </div>

        {/* Multimeter Battery (B) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <label className={`text-[11px] font-medium block mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Multimeter Battery Volts (Cmd B):
            </label>
            <input
              type="number"
              step="0.01"
              value={multiBatV}
              onChange={(e) => setMultiBatV(e.target.value)}
              placeholder="e.g. 12.65"
              className={fullInputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleSendMultimeterBat}
            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors sm:self-end"
          >
            Send B{multiBatV}
          </button>
        </div>

        {/* Multimeter TEG (G) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <label className={`text-[11px] font-medium block mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Multimeter TEG Volts (Cmd G):
            </label>
            <input
              type="number"
              step="0.01"
              value={multiTegV}
              onChange={(e) => setMultiTegV(e.target.value)}
              placeholder="e.g. 14.80"
              className={fullInputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleSendMultimeterTeg}
            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors sm:self-end"
          >
            Send G{multiTegV}
          </button>
        </div>

        {/* Multimeter Current (I) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <label className={`text-[11px] font-medium block mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Multimeter Charge Current Amps (Cmd I - while charging):
            </label>
            <input
              type="number"
              step="0.01"
              value={multiCurA}
              onChange={(e) => setMultiCurA(e.target.value)}
              placeholder="e.g. 0.50"
              className={fullInputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleSendMultimeterCurrent}
            className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors sm:self-end"
          >
            Send I{multiCurA}
          </button>
        </div>

        {/* Action strip: k, v, X */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleTareCurrent}
            className="h-9 px-2 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-200"
            title="Re-zero ACS712 sensor (only when relay is open)"
          >
            Cmd k (Zero Current)
          </button>
          <button
            type="button"
            onClick={handleSendPinCheck}
            className="h-9 px-2 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-200"
            title="Print raw GPIO pin voltages (GPIO32, 33, 35) to Serial Terminal"
          >
            Cmd v (Pin Check)
          </button>
          <button
            type="button"
            onClick={handleResetEsp32Flash}
            className="h-9 px-2 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-rose-400"
            title="Reset all calibration trims in ESP32 flash to default"
          >
            Cmd X (Reset Cal)
          </button>
        </div>
      </section>

      {/* ── 1. STOVE THERMOCOUPLE CALIBRATION ────────────────────────── */}
      <section className={`${cardClass} flex flex-col gap-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Stove Thermocouple (MAX6675)' : 'Stove Thermocouple (MAX6675)'}
            </h3>
          </div>
          <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Raw: <span className={isDark ? 'text-zinc-200' : 'text-zinc-700'}>{currentTelemetry.rawStoveTemp.toFixed(1)}°C</span> → Cal: <span className="text-emerald-400 font-semibold">{currentTelemetry.stoveTemp.toFixed(1)}°C</span>
          </span>
        </div>

        {/* 2-Point Bench Reference Helpers */}
        <div className={`p-3 rounded-xl border flex flex-col gap-2 ${
          isDark ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
        }`}>
          <span className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {isFil ? '2-Point Bench Reference Helpers' : '2-Point Bench Reference Helpers'}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCalibrateIceBath}
              className="h-9 px-3 rounded-lg border text-xs font-medium cursor-pointer transition-colors flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-200"
            >
              {isFil ? 'Set 0.0°C Ice Bath' : 'Set 0.0°C Ice Bath'}
            </button>
            <button
              type="button"
              onClick={handleCalibrateBoilingWater}
              className="h-9 px-3 rounded-lg border text-xs font-medium cursor-pointer transition-colors flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-200"
            >
              {isFil ? 'Set 100.0°C Boiling' : 'Set 100.0°C Boiling'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Zero Offset */}
          <div>
            <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <span className="font-medium">{isFil ? 'Zero Offset (°C)' : 'Zero Offset (°C)'}</span>
              <span className={`font-mono tabular-nums font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {form.stoveTempOffset.toFixed(1)}°C
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.1"
                value={form.stoveTempOffset}
                onChange={(e) => handleChange('stoveTempOffset', parseFloat(e.target.value) || 0)}
                className={numberInputClass}
                aria-label="Stove temperature zero offset number input"
              />
              <input
                type="range"
                min="-30"
                max="30"
                step="0.5"
                value={form.stoveTempOffset}
                onChange={(e) => handleChange('stoveTempOffset', parseFloat(e.target.value))}
                className="flex-1 accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                aria-label="Stove temperature zero offset slider"
              />
            </div>
          </div>

          {/* Gain Multiplier */}
          <div>
            <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <span className="font-medium">{isFil ? 'Gain Multiplier' : 'Gain Multiplier'}</span>
              <span className={`font-mono tabular-nums font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                {form.stoveTempGain.toFixed(3)}x
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.005"
                value={form.stoveTempGain}
                onChange={(e) => handleChange('stoveTempGain', parseFloat(e.target.value) || 1)}
                className={numberInputClass}
                aria-label="Stove temperature gain number input"
              />
              <input
                type="range"
                min="0.8"
                max="1.2"
                step="0.005"
                value={form.stoveTempGain}
                onChange={(e) => handleChange('stoveTempGain', parseFloat(e.target.value))}
                className="flex-1 accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                aria-label="Stove temperature gain slider"
              />
            </div>
          </div>
        </div>

        {/* Safety Thresholds */}
        <div className={`grid grid-cols-2 gap-3 pt-2.5 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Overheat Trip (°C)' : 'Overheat Trip (°C)'}
            </label>
            <input
              type="number"
              value={form.stoveOverheatThreshold}
              onChange={(e) => handleChange('stoveOverheatThreshold', parseInt(e.target.value) || 230)}
              className={tripInputClass}
            />
          </div>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Low Heat Floor (°C)' : 'Low Heat Floor (°C)'}
            </label>
            <input
              type="number"
              value={form.stoveLowHeatThreshold}
              onChange={(e) => handleChange('stoveLowHeatThreshold', parseInt(e.target.value) || 100)}
              className={warningInputClass}
            />
          </div>
        </div>
      </section>

      {/* ── 2. DHT11 CALIBRATION ─────────────────────────────────────── */}
      <section className={`${cardClass} flex flex-col gap-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Cold Sink Sensor (DHT11)' : 'Cold Sink Sensor (DHT11)'}
            </h3>
          </div>
          <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Sink: <span className="text-emerald-400 font-semibold">{currentTelemetry.ambientTemp.toFixed(1)}°C</span> • RH: <span className={`font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>{Math.round(currentTelemetry.humidity)}%</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Temperature Offset (°C)' : 'Temperature Offset (°C)'}
            </label>
            <input
              type="number"
              step="0.1"
              value={form.dhtTempOffset}
              onChange={(e) => handleChange('dhtTempOffset', parseFloat(e.target.value) || 0)}
              className={fullInputClass}
            />
          </div>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Humidity Offset (%)' : 'Humidity Offset (%)'}
            </label>
            <input
              type="number"
              step="0.5"
              value={form.dhtHumidityOffset}
              onChange={(e) => handleChange('dhtHumidityOffset', parseFloat(e.target.value) || 0)}
              className={fullInputClass}
            />
          </div>
        </div>
      </section>

      {/* ── 3. BATTERY ADC & VOLTAGE DIVIDER ─────────────────────────── */}
      <section className={`${cardClass} flex flex-col gap-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-4 h-4 text-emerald-400" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Battery Voltage Sensor (Divider ADC)' : 'Battery Voltage Sensor (Divider ADC)'}
            </h3>
          </div>
          <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Bus: <span className="text-emerald-400 font-semibold">{currentTelemetry.batteryVoltage.toFixed(2)} VDC</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Cutoff Vmin' : 'Cutoff Vmin'}
            </label>
            <input
              type="number"
              step="0.1"
              value={form.batteryVMin}
              onChange={(e) => handleChange('batteryVMin', parseFloat(e.target.value) || 10.8)}
              className={fullInputClass}
            />
          </div>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Full Vmax' : 'Full Vmax'}
            </label>
            <input
              type="number"
              step="0.1"
              value={form.batteryVMax}
              onChange={(e) => handleChange('batteryVMax', parseFloat(e.target.value) || 12.8)}
              className={fullInputClass}
            />
          </div>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Divider Gain' : 'Divider Gain'}
            </label>
            <input
              type="number"
              step="0.005"
              value={form.batteryVoltageGain}
              onChange={(e) => handleChange('batteryVoltageGain', parseFloat(e.target.value) || 1.0)}
              className={fullInputClass}
            />
          </div>
        </div>
      </section>

      {/* ── 4. ACS712 CURRENT ZERO TARE ──────────────────────────────── */}
      <section className={`${cardClass} flex flex-col gap-3.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
            <h3 className={`text-xs font-semibold ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
              {isFil ? 'Current Sensor (ACS712)' : 'Current Sensor (ACS712)'}
            </h3>
          </div>
          <span className={`text-xs font-mono tabular-nums ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Tare: <span className="text-amber-400 font-semibold">{form.tegCurrentZeroOffset.toFixed(2)} A</span>
          </span>
        </div>

        {/* Structured Action Strip: Button + Tare Average Indicator */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleTareCurrent}
            className="flex-1 h-10 px-4 rounded-lg border text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-200"
          >
            <Zap className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
            <span>{isFil ? 'Tare Current to Zero' : 'Tare Current to Zero'}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className={`text-xs whitespace-nowrap font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil ? 'Tare Average:' : 'Tare Average:'}
            </span>
            <div className="h-10 px-3.5 flex items-center justify-center rounded-lg border font-mono text-sm tabular-nums bg-zinc-900 border-zinc-800 text-zinc-100">
              10 samples
            </div>
          </div>
        </div>

        {/* Tare Current Zero Offset (Manual Calibration & Slider) */}
        <div>
          <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <span className="font-medium">{isFil ? 'Tare Current Zero Offset' : 'Tare Current Zero Offset'}</span>
            <span className={`font-mono tabular-nums font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {form.tegCurrentZeroOffset.toFixed(2)} A
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              value={form.tegCurrentZeroOffset}
              onChange={(e) => handleChange('tegCurrentZeroOffset', parseFloat(e.target.value) || 0)}
              className={numberInputClass}
              aria-label="Tare Current Zero Offset input"
            />
            <input
              type="range"
              min="-2.0"
              max="2.0"
              step="0.01"
              value={form.tegCurrentZeroOffset}
              onChange={(e) => handleChange('tegCurrentZeroOffset', parseFloat(e.target.value))}
              className="flex-1 accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              aria-label="Tare Current Zero Offset slider"
            />
          </div>
        </div>

        {/* ACS712 Gain Factor Multiplier */}
        <div>
          <div className={`flex justify-between text-xs mb-1.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            <span className="font-medium">{isFil ? 'Current Sensor Gain Multiplier' : 'Current Sensor Gain Multiplier'}</span>
            <span className={`font-mono tabular-nums font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
              {form.tegCurrentGain.toFixed(3)}x
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.01"
              value={form.tegCurrentGain}
              onChange={(e) => handleChange('tegCurrentGain', parseFloat(e.target.value) || 1.0)}
              className={numberInputClass}
              title="ACS712 Current Gain Multiplier"
            />
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.01"
              value={form.tegCurrentGain}
              onChange={(e) => handleChange('tegCurrentGain', parseFloat(e.target.value))}
              className="flex-1 accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
              aria-label="Current sensor gain slider"
            />
          </div>
        </div>
      </section>

      {/* ── ACTION BUTTONS: BALANCED 2x2 GRID (40px HEIGHT, UNIFORM ROUNDED-LG) ─ */}
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        {/* 1. Save to Storage */}
        <button
          type="button"
          onClick={handleSave}
          className="h-10 text-xs font-medium font-sans flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors cursor-pointer"
        >
          <Check className="w-4 h-4" strokeWidth={2} />
          <span>Save to Storage</span>
        </button>

        {/* 2. Send to ESP32 */}
        <button
          type="button"
          onClick={handleDispatchHardware}
          className="h-10 text-xs font-medium font-sans flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
        >
          <Terminal className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
          <span>Send to ESP32</span>
        </button>

        {/* 3. Export C++ Header */}
        <button
          type="button"
          onClick={handleCopyCpp}
          className="h-10 text-xs font-medium font-sans flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
        >
          <FileCode className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
          <span>{copiedNotice ? 'Copied Header' : 'Export C++ Header'}</span>
        </button>

        {/* 4. Reset Defaults */}
        <button
          type="button"
          onClick={onResetDefaults}
          className="h-10 text-xs font-medium font-sans flex items-center justify-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />
          <span>Reset Defaults</span>
        </button>
      </div>
    </div>
  )
}
