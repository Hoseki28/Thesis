import { useState } from 'react'
import { Lang, ScenarioPreset, TelemetryData } from '../types/telemetry'
import {
  IconShieldCheck,
  IconPowerCircle,
  IconClock,
  IconBattery,
  IconFlame,
  IconThermometer,
  IconColdSink,
  IconSliders,
  IconGas,
  IconFeedServo,
} from './Icons'

interface OverviewTabProps {
  telemetry: TelemetryData
  lang: Lang
  theme?: 'dark' | 'light'
  scenario: ScenarioPreset
  simSpeed: number
  isLive: boolean
  hasAlert: boolean
  tooHot: boolean
  lowHeat: boolean
  lowBattery: boolean
  onToggleFans: () => void
  onToggleDcBus: () => void
  onPulseFeed?: () => void
  onScenarioChange: (preset: ScenarioPreset) => void
  onSimSpeedChange: (speed: number) => void
  onManualSlider: (key: 'stoveTemp' | 'ambientTemp' | 'humidity' | 'batteryPct', val: number) => void
}

export function OverviewTab({
  telemetry,
  lang,
  theme = 'dark',
  scenario,
  simSpeed,
  isLive,
  hasAlert,
  tooHot,
  lowHeat,
  lowBattery,
  onToggleFans,
  onToggleDcBus,
  onPulseFeed,
  onScenarioChange,
  onSimSpeedChange,
  onManualSlider,
}: OverviewTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const [showSliders, setShowSliders] = useState<boolean>(false)

  // Delta T (Seebeck gradient)
  const deltaT = Number.isFinite(telemetry.deltaT)
    ? telemetry.deltaT
    : Math.max(0, Math.round((telemetry.stoveTemp - (telemetry.coldFaceTemp || telemetry.ambientTemp)) * 10) / 10)

  // Safety & Environment metrics
  const coPpm = Number.isFinite(telemetry.safety?.coPpm)
    ? telemetry.safety.coPpm
    : Number.isFinite(telemetry.rawCoPpm)
    ? telemetry.rawCoPpm
    : 12.4
  const ambientTempC = Number.isFinite(telemetry.ambient?.tempC)
    ? telemetry.ambient.tempC
    : Number.isFinite(telemetry.ambientTemp)
    ? telemetry.ambientTemp
    : 28.5
  const ambientHumPct = Number.isFinite(telemetry.ambient?.humidityPct)
    ? telemetry.ambient.humidityPct
    : Number.isFinite(telemetry.humidity)
    ? telemetry.humidity
    : 68.0

  // CO Alert status styling (Green <50, Amber 50-100, Red >100)
  const coColorClass =
    coPpm >= 100
      ? 'text-rose-400'
      : coPpm >= 50
      ? 'text-amber-400'
      : 'text-[#00E676]'
  const coBadgeBorderClass =
    coPpm >= 100
      ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
      : coPpm >= 50
      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
  const coStatusLabel = isFil
    ? coPpm >= 100
      ? 'ALARMA SA CO'
      : coPpm >= 50
      ? 'BABALA SA CO'
      : 'LIGTAS NA HANGIN'
    : coPpm >= 100
    ? 'CO CRITICAL ALARM'
    : coPpm >= 50
    ? 'CO WARNING'
    : 'NOMINAL AIR'

  // Fuel Hopper status
  const isHopperActive = Boolean(telemetry.fuelSystem?.hopperServoActive)
  const feedCycles = telemetry.fuelSystem?.feedCycles ?? 14

  // System status text and colors
  const statusText = isFil
    ? tooHot
      ? 'BABALA: SOBRANG INIT NG KALAN'
      : lowBattery
      ? 'BABALA: MABABANG BATERYA CUTOFF'
      : lowHeat
      ? 'KULANG SA INIT: MAHINANG APOY'
      : 'MAAYOS ANG SISTEMA: GUMAGANA'
    : tooHot
    ? 'SYSTEM ALERT: CORE OVERHEAT'
    : lowBattery
    ? 'SYSTEM ALERT: LOW BATTERY CUTOFF'
    : lowHeat
    ? 'SYSTEM DEFICIT: LOW FLAME'
    : 'SYSTEM GOOD: RUNNING'

  const statusBorder = hasAlert
    ? tooHot || lowBattery
      ? 'border-rose-500 text-rose-400 bg-rose-950/20'
      : 'border-amber-500 text-amber-400 bg-amber-950/20'
    : isDark
    ? 'border-[#00E676] text-[#00E676] bg-[#00E676]/10'
    : 'border-emerald-500 text-emerald-600 bg-emerald-50'

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── 1. SYSTEM STATUS BANNER ───────────────────────────────────── */}
      <div
        className={`w-full rounded-xl p-3 flex items-center justify-between font-bold text-xs uppercase tracking-wider border transition-colors shadow-sm ${statusBorder}`}
      >
        <div className="flex items-center gap-2.5">
          <IconShieldCheck size={18} className="flex-shrink-0" />
          <span>{statusText}</span>
        </div>

        {isLive && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">
            LIVE HARDWARE
          </span>
        )}
      </div>

      {/* ── 2. DC MAIN POWER & CURRENT LOAD CARD ─────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3.5 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="dc-main-power-heading"
      >
        {/* Top Switch Row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 id="dc-main-power-heading" className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'PANGUNAHING KURYENTE (DC)' : 'DC MAIN POWER'}
            </h2>
            <span className={`text-[10px] mt-0.5 block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Pangunahing Switch ng Pagkarga' : 'Master Load Switch'}
            </span>
          </div>

          {/* Interactive Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={telemetry.relays.dcBus}
            onClick={onToggleDcBus}
            className={`w-14 h-8 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
              telemetry.relays.dcBus ? 'bg-[#00E676]' : isDark ? 'bg-[#1E242B]' : 'bg-zinc-300'
            }`}
            aria-label="Toggle DC Main Power Switch"
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                telemetry.relays.dcBus ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Nested CURRENT LOAD Card */}
        <div className={`rounded-xl p-3.5 border flex flex-col gap-1 transition-colors ${
          isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'KASALUKUYANG KARGA' : 'CURRENT LOAD'}
            </span>
            <IconPowerCircle size={16} className={telemetry.relays.dcBus ? 'text-[#00E676]' : 'text-zinc-400'} />
          </div>
          <span className={`text-[9px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-400'}`}>
            {isFil ? 'Tunay na Paggamit' : 'Realtime Usage'}
          </span>
          <div className="flex items-baseline mt-1">
            <span className={`text-2xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {telemetry.relays.dcBus ? telemetry.loadPower.toFixed(1) : '0.0'}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
          </div>
        </div>

        {/* ── TWO-TIER LOAD CONTROLS ───────────────────────────────────── */}
        <div className="flex flex-col gap-2 pt-0.5">
          {/* Tier 1: Primary Critical Load (12V LED Light) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
              <div>
                <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  {isFil ? '12V Ilaw ng Sakuna (Critical)' : '12V Emergency Light'}
                </span>
                <span className="text-[9px] font-mono text-[#00E676] font-bold tracking-tight">
                  {isFil ? 'TIER 1 · HINDI MAIBUBUKOD' : 'TIER 1 · PRIMARY NON-SHEDDABLE'}
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#00E676]/20 text-[#00E676] font-black uppercase">
              {isFil ? 'LOCKED ON' : 'GUARDED ON'}
            </span>
          </div>

          {/* Tier 2: Secondary Auxiliary Load (12V DC Fans & USB) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
          }`}>
            <div>
              <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? '12V DC Fans & USB (Aux)' : '12V DC Fans & 5V USB'}
              </span>
              <span className={`text-[9px] font-mono tracking-tight ${
                telemetry.auxLockout ? 'text-rose-400 font-bold' : isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
              }`}>
                {telemetry.auxLockout
                  ? (isFil ? 'TIER 2 · NAKA-LOCKOUT SA MABABANG BATT' : 'TIER 2 · LOW BATT LOCKOUT')
                  : (isFil ? 'TIER 2 · MAIBUBUKOD NA KARGA' : 'TIER 2 · SECONDARY SHEDDABLE')}
              </span>
            </div>

            <button
              type="button"
              disabled={telemetry.auxLockout && !telemetry.relays.fans}
              onClick={onToggleFans}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider font-mono cursor-pointer transition-colors min-h-[36px] ${
                telemetry.relays.fans
                  ? 'bg-[#00E676] text-zinc-950 shadow-sm'
                  : telemetry.auxLockout
                  ? 'bg-rose-950/40 border border-rose-500/30 text-rose-400 cursor-not-allowed opacity-80'
                  : isDark
                  ? 'bg-[#1E242B] border border-zinc-700 text-zinc-300 hover:text-white'
                  : 'bg-zinc-200 border border-zinc-300 text-zinc-700 hover:text-zinc-900'
              }`}
            >
              {telemetry.auxLockout && !telemetry.relays.fans
                ? (isFil ? 'LOCKOUT' : 'LOCKED OUT')
                : telemetry.relays.fans
                ? (isFil ? 'BUKAS' : 'ACTIVE')
                : (isFil ? 'SARADO' : 'OFF')}
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. RUN HOURS & INSPECTION PROGRESS CARD ──────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="run-hours-heading"
      >
        {/* Top Line */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <IconClock size={16} className="text-[#00E676]" />
            <h2 id="run-hours-heading" className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'ORAS NG PAG-ANDAR' : 'RUN HOURS'}
            </h2>
          </div>
          <div className="flex items-baseline">
            <span className={`text-lg font-black font-mono ${isDark ? 'text-white' : 'text-zinc-900'}`}>1248</span>
            <span className={`text-[10px] font-bold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'ORAS' : 'HRS'}
            </span>
          </div>
        </div>

        {/* Progress Line */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
          <span className={isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}>
            {isFil ? 'PAG-USAD NG PAGSUSURI' : 'INSPECTION PROGRESS'}
          </span>
          <span className="text-[#00E676] font-mono">75%</span>
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#1E242B]' : 'bg-zinc-200'}`}>
          <div
            className="bg-[#00E676] h-full rounded-full transition-all duration-500"
            style={{ width: '75%' }}
            role="progressbar"
            aria-valuenow={75}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Bottom Note */}
        <span className={`text-[9px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {isFil ? 'Susunod na pag-aayos sa 2,000 oras' : 'Next overhaul scheduled at 2,000 hrs'}
        </span>
      </section>

      {/* ── 4. 2×2 TELEMETRY GRID ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* TILE 1: BATTERY (LiFePO4 12V 50Ah) */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'BATERYA' : 'BATTERY'}
              </span>
              <IconBattery size={18} className="text-[#00E676]" />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                {telemetry.batteryVoltage ? `${telemetry.batteryVoltage.toFixed(2)}V` : '13.20V'}
              </span>
              <span className="text-[8px] font-mono px-1 rounded bg-[#00E676]/15 text-[#00E676] font-bold">
                LiFePO4
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-baseline mt-1.5">
              <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {Math.round(telemetry.batteryPct)}
              </span>
              <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>%</span>
            </div>
            <span className={`text-[8.5px] font-mono block mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              10.0V (0%) - 14.6V (100%)
            </span>
          </div>
        </div>

        {/* TILE 2: TEG GEN */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'LIKHANG TEG' : 'TEG GEN'}
              </span>
              <IconFlame size={18} className="text-[#00E676]" />
            </div>
            <span className={`text-[9px] block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Lakas na Nalilikha' : 'Output Power'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {telemetry.tegPower.toFixed(1)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
          </div>
        </div>

        {/* TILE 3: HEAT DIFF */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'AGAPAT NG INIT' : 'HEAT DIFF'}
              </span>
              <IconThermometer size={18} className="text-[#00E676]" />
            </div>
            <span className={`text-[9px] block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Agwat ng Temperatura (ΔT)' : 'Difference (ΔT)'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {Math.round(deltaT)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
          </div>
        </div>

        {/* TILE 4: COOLING */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'PAMPALAMIG' : 'COOLING'}
              </span>
              <IconColdSink size={18} className="text-[#00E676]" />
            </div>
            <span className={`text-[9px] block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Temperatura ng Pampalamig' : 'Cold Sink Temp'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {Math.round(telemetry.coldFaceTemp || telemetry.ambientTemp)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
          </div>
        </div>
      </div>

      {/* ── 5. ENVIRONMENTAL & SITE SAFETY CARD (MQ-7 & DHT22) ─────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="env-safety-heading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconGas size={17} className={coColorClass} />
            <h2 id="env-safety-heading" className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'KALIGIRAN AT KALIGTASAN (MQ-7 & DHT22)' : 'ENVIRONMENT & SITE SAFETY'}
            </h2>
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${coBadgeBorderClass}`}>
            {coStatusLabel}
          </span>
        </div>

        {/* CO PPM Gauge Row */}
        <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
          coPpm >= 100
            ? 'bg-rose-950/20 border-rose-500/40 text-rose-300'
            : coPpm >= 50
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
            : isDark
            ? 'bg-[#0B0F12] border-[#1E242B]'
            : 'bg-[#F9FAFB] border-zinc-200'
        }`}>
          <div>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
            }`}>
              {isFil ? 'Konsentrasyon ng Carbon Monoxide (MQ-7)' : 'Carbon Monoxide Concentration (MQ-7)'}
            </span>
            <div className="flex items-baseline mt-0.5">
              <span className={`text-2xl font-black font-mono tabular-nums tracking-tight ${coColorClass}`}>
                {coPpm.toFixed(1)}
              </span>
              <span className={`text-xs font-bold ml-1.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>PPM</span>
            </div>
          </div>

          <div className="text-right">
            <span className={`text-[9px] font-mono block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Ligtas: &lt;50 PPM
            </span>
            <span className={`text-[9px] font-mono block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Babala: 50-100 PPM
            </span>
            <span className={`text-[9px] font-mono font-bold block ${coPpm >= 100 ? 'text-rose-400' : isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Alarma: &gt;100 PPM
            </span>
          </div>
        </div>

        {/* DHT22 Ambient Temp & Relative Humidity */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <span className={`text-[9.5px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'DHT22 Temperatura' : 'DHT22 Ambient Temp'}
            </span>
            <div className="flex items-baseline mt-1">
              <span className={`text-lg font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {ambientTempC.toFixed(1)}
              </span>
              <span className={`text-xs ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
            </div>
          </div>

          <div className={`p-2.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <span className={`text-[9.5px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'DHT22 Alinsangan' : 'DHT22 Humidity'}
            </span>
            <div className="flex items-baseline mt-1">
              <span className={`text-lg font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {ambientHumPct.toFixed(1)}
              </span>
              <span className={`text-xs ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>% RH</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. FUEL HOPPER SERVO CONTROL WIDGET ─────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="hopper-control-heading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconFeedServo size={18} className="text-[#00E676]" />
            <h2 id="hopper-control-heading" className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'KONTROL NG HOPPER (FEED SERVO)' : 'FUEL HOPPER SERVO CONTROL'}
            </h2>
          </div>
          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
            isHopperActive
              ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676] animate-pulse'
              : isDark
              ? 'bg-[#1E242B] text-zinc-400 border border-[#1E242B]'
              : 'bg-zinc-100 text-zinc-500 border border-zinc-200'
          }`}>
            {isHopperActive
              ? (isFil ? 'GUMAGANA / FEEDING' : 'FEEDING / ACTIVE')
              : (isFil ? 'NAKAHANDA / IDLE' : 'STANDBY / IDLE')}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <span className={`text-[10px] font-bold uppercase tracking-wider block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Kabuuan ng Siklo ng Pagpapakain' : 'Total Feed Cycles'}
            </span>
            <div className="flex items-baseline mt-0.5">
              <span className={`text-xl font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {feedCycles}
              </span>
              <span className={`text-xs ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                {isFil ? 'siklo' : 'cycles'}
              </span>
            </div>
          </div>

          {/* Pulse Feed Action Button */}
          <button
            type="button"
            onClick={onPulseFeed}
            disabled={isHopperActive}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider font-mono cursor-pointer transition-colors shadow-md min-h-[44px] flex items-center gap-2 ${
              isHopperActive
                ? 'bg-[#00E676]/30 text-[#00E676] border border-[#00E676] cursor-wait'
                : 'bg-[#00E676] hover:bg-emerald-400 text-zinc-950 border border-[#00E676]'
            }`}
          >
            <IconFeedServo size={16} />
            <span>{isFil ? 'PULSE FEED' : 'PULSE FEED'}</span>
          </button>
        </div>
      </section>

      {/* ── 5. COLLAPSIBLE BENCH SIMULATION CONTROLS ─────────────────── */}
      <section className={`rounded-2xl p-3 border flex flex-col gap-2 shadow-lg mt-1 font-sans transition-colors ${
        isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'BENCH PHYSICS AT PAGSUBOK' : 'BENCH PHYSICS & TEST PRESETS'}
          </span>
          <button
            type="button"
            onClick={() => setShowSliders(!showSliders)}
            className="text-[10px] text-[#00E676] hover:text-emerald-500 font-bold uppercase flex items-center gap-1 cursor-pointer"
          >
            <IconSliders size={12} />
            <span>{showSliders ? (isFil ? 'ITAGO' : 'COLLAPSE') : (isFil ? 'BUKSAN' : 'EXPAND CONTROLS')}</span>
          </button>
        </div>

        {showSliders && (
          <div className={`pt-2 border-t flex flex-col gap-2.5 animate-slide-in ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
            {/* Presets */}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'normal', label: isFil ? 'NORMAL' : 'NORMAL' },
                  { id: 'tegPeak', label: isFil ? 'PEAK TEG' : 'PEAK TEG' },
                  { id: 'lowHeat', label: isFil ? 'MAHINANG INIT' : 'LOW FLAME' },
                  { id: 'overheat', label: isFil ? 'OVERHEAT' : 'OVERHEAT' },
                  { id: 'lowBatt', label: isFil ? 'MABABANG BATT' : 'LOW BATT' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onScenarioChange(p.id)}
                  className={`py-1.5 px-2 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer border ${
                    scenario === p.id
                      ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                      : isDark
                      ? 'bg-[#0B0F12] border-[#1E242B] text-[#9CA3AF] hover:text-zinc-200'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Manual Sliders */}
            <div className="flex flex-col gap-2 pt-1">
              <div>
                <div className={`flex justify-between text-[10px] mb-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                  <span>{isFil ? 'TEMPERATURA NG KALAN' : 'STOVE TEMPERATURE'}</span>
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>{Math.round(telemetry.stoveTemp)}°C</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="280"
                  step="1"
                  value={telemetry.stoveTemp}
                  onChange={(e) => onManualSlider('stoveTemp', parseFloat(e.target.value))}
                  className="accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  aria-label="Stove Temperature Slider"
                />
              </div>

              <div>
                <div className={`flex justify-between text-[10px] mb-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                  <span>{isFil ? 'KARGA NG BATERYA' : 'BATTERY CHARGE'}</span>
                  <span className={`font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>{Math.round(telemetry.batteryPct)}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="1"
                  value={telemetry.batteryPct}
                  onChange={(e) => onManualSlider('batteryPct', parseFloat(e.target.value))}
                  className="accent-emerald-500 h-1.5 w-full bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  aria-label="Battery SOC Slider"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
