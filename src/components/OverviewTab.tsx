import { Lang, ScenarioPreset, TelemetryData } from '../types/telemetry'
import {
  IconShieldCheck,
  IconPowerCircle,
  IconClock,
  IconBattery,
  IconFlame,
  IconThermometer,
  IconColdSink,
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
  sessionUptimeStr?: string
  onToggleFans: () => void
  onToggleDcBus: () => void
  onScenarioChange: (preset: ScenarioPreset) => void
  onSimSpeedChange: (speed: number) => void
  onManualSlider: (key: 'stoveTemp' | 'ambientTemp' | 'humidity' | 'batteryPct', val: number) => void
}

/**
 * 4-Bar State-of-Charge Battery SVG Icon
 * Lights up 0 to 4 bars corresponding to:
 * - 4 bars: 76% to 100%
 * - 3 bars: 51% to 75%
 * - 2 bars: 26% to 50%
 * - 1 bar: 1% to 25% (warning color)
 * - 0 bars: 0% / disconnected
 */
function Battery4BarIcon({
  activeBars,
  isDark,
  size = 24,
}: {
  activeBars: number
  isDark: boolean
  size?: number
}) {
  const activeColor =
    activeBars === 1
      ? '#ef4444' // Red / Low (1-25%)
      : activeBars === 2
      ? '#f59e0b' // Amber (26-50%)
      : '#00E676' // Vibrant green (>50%)

  const inactiveColor = isDark ? '#272F38' : '#e4e4e7'
  const strokeColor = activeBars === 0 ? (isDark ? '#4b5563' : '#a1a1aa') : activeColor

  return (
    <svg
      width={size}
      height={Math.round(size * 0.52)}
      viewBox="0 0 28 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      aria-label={`${activeBars} of 4 bars`}
    >
      {/* Battery Body Outline */}
      <rect
        x="1"
        y="1"
        width="22"
        height="12"
        rx="2.5"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      {/* Battery Positive Terminal Tip */}
      <path
        d="M25 5C25.5 5 26 5.5 26 6V8C26 8.5 25.5 9 25 9"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Bar 1 */}
      <rect
        x="3"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 1 ? activeColor : inactiveColor}
      />
      {/* Bar 2 */}
      <rect
        x="8"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 2 ? activeColor : inactiveColor}
      />
      {/* Bar 3 */}
      <rect
        x="13"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 3 ? activeColor : inactiveColor}
      />
      {/* Bar 4 */}
      <rect
        x="18"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 4 ? activeColor : inactiveColor}
      />
    </svg>
  )
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
  sessionUptimeStr,
  onToggleFans,
  onToggleDcBus,
  onScenarioChange,
  onSimSpeedChange,
  onManualSlider,
}: OverviewTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isConnected = isLive

  // Delta T (Seebeck gradient)
  const deltaT = Number.isFinite(telemetry.deltaT)
    ? telemetry.deltaT
    : Math.max(0, Math.round((telemetry.stoveTemp - (telemetry.coldFaceTemp || telemetry.ambientTemp)) * 10) / 10)

  // Ambient temperature and humidity (DHT22 on GPIO23)
  const ambientTempC = Number.isFinite(telemetry.tAmb)
    ? (telemetry.tAmb as number)
    : Number.isFinite(telemetry.ambient?.tempC)
    ? telemetry.ambient.tempC
    : Number.isFinite(telemetry.ambientTemp)
    ? telemetry.ambientTemp
    : 28.5
  const ambientHumPct = Number.isFinite(telemetry.hum)
    ? (telemetry.hum as number)
    : Number.isFinite(telemetry.ambient?.humidityPct)
    ? telemetry.ambient.humidityPct
    : Number.isFinite(telemetry.humidity)
    ? telemetry.humidity
    : 68.0

  // Real ESP32 Hardware State & Alarms (thesis.ino)
  const espStateName = (telemetry.stateName || telemetry.esp32?.stateName || '').trim()
  const espAlarms = telemetry.activeAlarms || telemetry.esp32?.activeAlarms || []
  const hasCriticalAlarm =
    tooHot ||
    lowBattery ||
    Boolean(telemetry.ts1Tripped) ||
    Boolean(telemetry.esp32?.overcurrentLatched) ||
    Boolean(telemetry.esp32?.batHot) ||
    espAlarms.some((a) => a.includes('over 230') || a.includes('over 60') || a.includes('over 45') || a.includes('overcurrent') || a.includes('TS1'))

  // System status text and colors mapped to thesis.ino state machine
  const statusText = !isConnected
    ? isFil
      ? 'HINDI NAKAKONEKTA: IKABIT ANG ESP32 SA USB PORT'
      : 'DISCONNECTED: CONNECT ESP32 VIA USB SERIAL'
    : espStateName
    ? `STATE: ${espStateName}${espAlarms.length > 0 ? ` (${espAlarms[0]})` : ''}`
    : tooHot
    ? 'SYSTEM ALERT: CORE OVERHEAT'
    : lowBattery
    ? 'SYSTEM ALERT: LOW BATTERY CUTOFF'
    : lowHeat
    ? 'SYSTEM DEFICIT: LOW FLAME'
    : 'SYSTEM GOOD: RUNNING'

  const statusBorder = !isConnected
    ? isDark
      ? 'border-zinc-800 text-zinc-400 bg-zinc-900/40'
      : 'border-zinc-300 text-zinc-500 bg-zinc-100'
    : hasCriticalAlarm || hasAlert
    ? hasCriticalAlarm || tooHot || lowBattery
      ? 'border-rose-500 text-rose-400 bg-rose-950/20'
      : 'border-amber-500 text-amber-400 bg-amber-950/20'
    : isDark
    ? 'border-[#00E676] text-[#00E676] bg-[#00E676]/10'
    : 'border-emerald-500 text-emerald-600 bg-emerald-50'

  const vBatLive = isConnected ? (telemetry.vBat ?? telemetry.batteryVoltage ?? 0.0) : 0.0
  const vTegLive = isConnected ? (telemetry.vTeg ?? telemetry.tegVoltage ?? 0.0) : 0.0
  const iBatLive = isConnected ? (telemetry.iBat ?? telemetry.rawTegCurrent ?? 0.0) : 0.0
  const pBatLive = isConnected ? (telemetry.pBat ?? Math.round(vBatLive * iBatLive * 10) / 10) : 0.0
  const pHarvLive = isConnected ? (telemetry.pHarv ?? (telemetry.tegPower > 0 ? telemetry.tegPower : Math.round(vTegLive * iBatLive * 10) / 10)) : 0.0
  const whHarvLive = isConnected ? (telemetry.whHarv ?? 0.0) : 0.0
  const isRelayClosed = isConnected ? Boolean(telemetry.relayOn ?? telemetry.relays.dcBus) : false

  // 4-Bar Battery State-of-Charge Calculation
  // 4 bars: 76-100%, 3 bars: 51-75%, 2 bars: 26-50%, 1 bar: 1-25%, 0 bars: 0%
  const battPct = isConnected ? Math.min(100, Math.max(0, Math.round(telemetry.batteryPct))) : 0
  const activeBars = battPct > 75 ? 4 : battPct > 50 ? 3 : battPct > 25 ? 2 : battPct > 0 ? 1 : 0

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── 1. CHARGER RELAY & CURRENT LOAD CARD ─────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3.5 shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}
        aria-labelledby="charger-relay-heading"
      >
        {/* Top Switch Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="charger-relay-heading" className={`text-xs font-black uppercase tracking-wider truncate ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {isFil ? 'KONTROL NG CHARGER RELAY (GPIO14)' : 'CHARGER RELAY (GPIO14)'}
            </h2>
            <span className={`text-[10px] mt-0.5 block truncate ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {telemetry.stateReason || (isRelayClosed ? (isFil ? 'Konektado ang TEG · Nagkakarga' : 'TEG Connected · Charging Active') : (isFil ? 'Nakabukas ang relay · Nakahiwalay' : 'Relay Open · Disconnected'))}
            </span>
          </div>

          {/* Read-Only Relay Status Indicator (Controlled automatically by ESP32) */}
          <div
            className={`px-3 py-1.5 rounded-full border text-[10px] font-mono font-black uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0 select-none ${
              isRelayClosed
                ? isDark
                  ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                  : 'bg-emerald-100 border-emerald-300 text-emerald-800'
                : isDark
                ? 'bg-[#1E242B] border-zinc-700 text-zinc-400'
                : 'bg-zinc-100 border-zinc-300 text-zinc-600'
            }`}
            aria-label={`Charger Relay GPIO14 is ${isRelayClosed ? 'Closed' : 'Open'}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRelayClosed
                  ? isDark
                    ? 'bg-[#00E676] animate-pulse'
                    : 'bg-emerald-600 animate-pulse'
                  : 'bg-zinc-500'
              }`}
            />
            <span>{isRelayClosed ? (isFil ? 'SARADO (ON)' : 'CLOSED') : (isFil ? 'BUKAS (OFF)' : 'OPEN')}</span>
          </div>
        </div>

        {/* Nested CURRENT LOAD Card */}
        <div className={`rounded-xl p-3.5 border flex flex-col gap-1 transition-colors ${
          isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {isFil ? 'KASALUKUYANG KURYENTE AT LAKAS' : 'CHARGE CURRENT & POWER'}
            </span>
            <IconPowerCircle size={16} className={isRelayClosed ? (isDark ? 'text-[#00E676]' : 'text-emerald-600') : (isDark ? 'text-zinc-500' : 'text-zinc-400')} />
          </div>
          <span className={`text-[9.5px] font-mono tracking-tight ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
            TEG CURRENT: {iBatLive.toFixed(2)}A · TEG V: {vTegLive.toFixed(1)}V · Wh: {whHarvLive.toFixed(3)}
          </span>
          <div className="flex items-baseline mt-1">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {isRelayClosed ? pHarvLive.toFixed(1) : '0.0'}
            </span>
            <span className={`text-xs font-semibold ml-1.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>W</span>
          </div>
        </div>

        {/* ── TWO-TIER LOAD CONTROLS ───────────────────────────────────── */}
        <div className="flex flex-col gap-2 pt-0.5">
          {/* Tier 1: Primary Critical Load (12V LED Light) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isRelayClosed ? (isDark ? 'bg-[#00E676] animate-pulse' : 'bg-emerald-600 animate-pulse') : 'bg-zinc-500'}`} />
              <div className="truncate">
                <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                  {isFil ? 'ESP32 State Machine' : 'ESP32 State Machine'}
                </span>
                <span className={`text-[9px] font-mono font-bold tracking-tight ${isDark ? 'text-[#00E676]' : 'text-emerald-700'}`}>
                  {espStateName || (isRelayClosed ? 'CHARGING' : 'STANDBY')} (GPIO14: {isRelayClosed ? 'CLOSED' : 'OPEN'})
                </span>
              </div>
            </div>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-black uppercase flex-shrink-0 ${
              isRelayClosed
                ? isDark ? 'bg-emerald-500/20 text-[#00E676]' : 'bg-emerald-100 text-emerald-800'
                : isDark ? 'bg-[#1E242B] text-zinc-300' : 'bg-zinc-200 text-zinc-700'
            }`}>
              {isRelayClosed ? 'CHARGING' : 'HOLD/OFF'}
            </span>
          </div>

          {/* Tier 2: Secondary Auxiliary Load (Dynamic Thermal Limits) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
          }`}>
            <div className="min-w-0">
              <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {isFil ? 'Mga Limit ng Boltahe (-18mV/°C)' : 'Dynamic Voltage Limits (-18mV/°C)'}
              </span>
              <span className={`text-[9px] font-mono tracking-tight ${
                telemetry.auxLockout ? 'text-rose-400 font-bold' : isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}>
                Open: {(telemetry.vOpenNow ?? 14.4).toFixed(2)}V · Close: {(telemetry.vCloseNow ?? 13.6).toFixed(2)}V · Hard: {(telemetry.vHardNow ?? 14.6).toFixed(2)}V
              </span>
            </div>

            <span
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider font-mono flex items-center justify-center select-none ${
                !isConnected
                  ? isDark
                    ? 'bg-[#1E242B] border border-zinc-700 text-zinc-400'
                    : 'bg-zinc-200 border border-zinc-300 text-zinc-600'
                  : telemetry.esp32?.dhtOk === false
                  ? isDark
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                    : 'bg-amber-50 border border-amber-300 text-amber-700'
                  : ambientTempC > 25
                  ? isDark
                    ? 'bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676]'
                    : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                  : isDark
                  ? 'bg-[#1E242B] border border-zinc-700 text-zinc-300'
                  : 'bg-zinc-200 border border-zinc-300 text-zinc-700'
              }`}
              aria-label="Dynamic Voltage Limits Status"
            >
              {!isConnected
                ? (isFil ? 'STANDBY' : 'STANDBY')
                : telemetry.esp32?.dhtOk === false
                ? (isFil ? 'WALANG TEMP' : 'NO TEMP')
                : ambientTempC > 25
                ? (isFil ? 'AKTIBO' : 'ACTIVE')
                : (isFil ? 'NORMAL' : 'NOMINAL')}
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. HARVESTED ENERGY CARD ──────────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}
        aria-labelledby="harvested-energy-heading"
      >
        {/* Harvested Energy Title & Live Wh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <IconFlame size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            <h2 id="harvested-energy-heading" className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {isFil ? 'NA-HARVEST NA ENERHIYA' : 'HARVESTED ENERGY'}
            </h2>
          </div>
          <div className="flex items-baseline">
            <span className={`text-lg font-black font-mono tabular-nums ${isDark ? 'text-[#00E676]' : 'text-emerald-700'}`}>
              {whHarvLive.toFixed(3)}
            </span>
            <span className={`text-[10px] font-bold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              WH
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#1E242B]' : 'bg-zinc-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${isDark ? 'bg-[#00E676]' : 'bg-emerald-600'}`}
            style={{ width: `${isConnected ? Math.min(100, Math.round((vBatLive / 14.4) * 100)) : 0}%` }}
            role="progressbar"
            aria-valuenow={isConnected ? Math.min(100, Math.round((vBatLive / 14.4) * 100)) : 0}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Bottom Note */}
        <span className={`text-[9.5px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
          {telemetry.esp32?.note ? telemetry.esp32.note : (isFil ? '12V 15Ah Sealed Lead-Acid (SLA) Baterya' : '12V 15Ah Sealed Lead-Acid (SLA) Battery')}
        </span>
      </section>

      {/* ── 3. 2×2 TELEMETRY GRID ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* TILE 1: BATTERY (12V 15Ah SLA) WITH 4-BAR GAUGE */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {isFil ? 'BATERYA' : 'BATTERY'}
              </span>
              <Battery4BarIcon activeBars={activeBars} isDark={isDark} size={24} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9.5px] font-mono ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
                {vBatLive.toFixed(2)}V
              </span>
              <span className={`text-[8.5px] font-mono px-1 rounded font-bold ${
                isDark ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-emerald-100 text-emerald-800'
              }`}>
                12V 15Ah SLA
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-baseline mt-1">
              <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {battPct}
              </span>
              <span className={`text-xs font-semibold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>%</span>
            </div>

            {/* 4-Segment State-of-Charge Bar Gauge */}
            <div
              className="grid grid-cols-4 gap-1 w-full my-1.5"
              role="meter"
              aria-valuenow={battPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Battery ${battPct}%, ${activeBars} of 4 bars`}
            >
              {[1, 2, 3, 4].map((bar) => {
                const isLit = activeBars >= bar
                return (
                  <div
                    key={bar}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isLit
                        ? activeBars === 1
                          ? 'bg-rose-500 shadow-sm shadow-rose-500/40'
                          : activeBars === 2
                          ? 'bg-amber-400 shadow-sm shadow-amber-400/40'
                          : isDark
                          ? 'bg-[#00E676] shadow-sm shadow-emerald-500/40'
                          : 'bg-emerald-600'
                        : isDark
                        ? 'bg-[#1E242B]'
                        : 'bg-zinc-200'
                    }`}
                  />
                )
              })}
            </div>

            <span className={`text-[8.5px] font-mono block mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              6.0V Min · 14.4V Full
            </span>
          </div>
        </div>

        {/* TILE 2: TEG GEN */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {isFil ? 'LIKHANG TEG' : 'TEG GEN'}
              </span>
              <IconFlame size={18} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            </div>
            <span className={`text-[9.5px] font-mono block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {isConnected ? `${vTegLive.toFixed(1)}V · Peak: ${(telemetry.vTegPeak ?? vTegLive).toFixed(1)}V` : '0.0V · Peak: 0.0V'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {pHarvLive.toFixed(1)}
            </span>
            <span className={`text-xs font-semibold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>W</span>
          </div>
        </div>

        {/* TILE 3: HEAT DIFF */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {isFil ? 'AGAPAT NG INIT' : 'HEAT DIFF'}
              </span>
              <IconThermometer size={18} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            </div>
            <span className={`text-[9.5px] font-mono block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {isConnected
                ? `Hot: ${telemetry.hotFault ? '---' : `${Math.round(telemetry.tHot ?? telemetry.stoveTemp)}°C`} · Cold: ${telemetry.coldFault ? '---' : `${Math.round(telemetry.tCold ?? telemetry.coldFaceTemp ?? 0)}°C`}`
                : 'Hot: 0°C · Cold: 0°C'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {isConnected && !telemetry.hotFault && !telemetry.coldFault ? Math.round(telemetry.dT ?? deltaT) : 0}
            </span>
            <span className={`text-xs font-semibold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>°C</span>
          </div>
        </div>

        {/* TILE 4: COOLING & AMBIENT (DHT22) */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                {isFil ? 'PALAMIG AT PALIGID' : 'COOLING & AMBIENT'}
              </span>
              <IconColdSink size={18} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            </div>
            <span className={`text-[9.5px] font-mono block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>
              {isConnected
                ? `${telemetry.coldFault ? 'Cold Fault' : 'Cold Face'} · ${telemetry.esp32?.dhtOk === false ? 'DHT22 Fault' : `Amb: ${ambientTempC.toFixed(1)}°C (${ambientHumPct.toFixed(0)}% RH)`}`
                : 'Cold Face · Amb: 0.0°C (0% RH)'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              {isConnected && !telemetry.coldFault ? Math.round(telemetry.tCold ?? telemetry.coldFaceTemp ?? 0) : 0}
            </span>
            <span className={`text-xs font-semibold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'}`}>°C</span>
          </div>
        </div>
      </div>
    </div>
  )
}
