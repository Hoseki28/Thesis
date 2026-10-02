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
  onToggleFans: () => void
  onToggleDcBus: () => void
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
  onScenarioChange,
  onSimSpeedChange,
  onManualSlider,
}: OverviewTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const [showSliders, setShowSliders] = useState<boolean>(false)

  // Delta T (Seebeck gradient)
  const deltaT = Math.max(0, Math.round((telemetry.stoveTemp - telemetry.ambientTemp) * 10) / 10)

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
              {telemetry.relays.dcBus ? (telemetry.loadPower > 0 ? (telemetry.loadPower * 12).toFixed(1) : '239.4') : '0.0'}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
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
        {/* TILE 1: BATTERY */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'BATERYA' : 'BATTERY'}
              </span>
              <IconBattery size={18} className="text-[#00E676]" />
            </div>
            <span className={`text-[9px] block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'Lebel ng Karga' : 'Level (Karga)'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {Math.round(telemetry.batteryPct)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>%</span>
          </div>
        </div>

        {/* TILE 2: TEG GEN */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
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
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
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
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
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
              {isFil ? 'Temperatura ng Likido' : 'Fluid Temp'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {Math.round(telemetry.ambientTemp)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
          </div>
        </div>
      </div>

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
