import { useRef } from 'react'
import { Lang, ScenarioPreset, TelemetryData } from '../types/telemetry'
import {
  IconPowerCircle,
  IconFlame,
  IconZap,
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
  isCharging = false,
  size = 24,
}: {
  activeBars: number
  isDark: boolean
  isCharging?: boolean
  size?: number
}) {
  const activeColor =
    activeBars === 1
      ? '#ef4444'
      : activeBars === 2
      ? '#f59e0b'
      : '#00E676'

  const inactiveColor = isDark ? '#272F38' : '#e4e4e7'
  const strokeColor =
    activeBars === 0
      ? isCharging
        ? '#00E676'
        : isDark
        ? '#4b5563'
        : '#a1a1aa'
      : activeColor

  return (
    <svg
      width={size}
      height={Math.round(size * 0.52)}
      viewBox="0 0 28 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      aria-label={`${activeBars} of 4 bars${isCharging ? ' (charging)' : ''}`}
    >
      <rect
        x="1"
        y="1"
        width="22"
        height="12"
        rx="2.5"
        stroke={strokeColor}
        strokeWidth="1.5"
      />
      <path
        d="M25 5C25.5 5 26 5.5 26 6V8C26 8.5 25.5 9 25 9"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 1 ? activeColor : inactiveColor}
      />
      <rect
        x="8"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 2 ? activeColor : inactiveColor}
      />
      <rect
        x="13"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 3 ? activeColor : inactiveColor}
      />
      <rect
        x="18"
        y="3"
        width="3.6"
        height="8"
        rx="0.8"
        fill={activeBars >= 4 ? activeColor : inactiveColor}
      />
      {isCharging && (
        <g className="animate-pulse">
          <path
            d="M13.6 1.2L8.8 7.6H12.1L10.4 12.8L15.2 6.4H11.9L13.6 1.2Z"
            stroke="#0B0F12"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M13.6 1.2L8.8 7.6H12.1L10.4 12.8L15.2 6.4H11.9L13.6 1.2Z"
            fill="#FACC15"
          />
        </g>
      )}
    </svg>
  )
}

export function OverviewTab({
  telemetry,
  lang,
  theme = 'dark',
  isLive,
}: OverviewTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isConnected = isLive

  const espStateName = (telemetry.stateName || telemetry.esp32?.stateName || '').trim()

  const vBatLive = isConnected ? (telemetry.vBat ?? telemetry.batteryVoltage ?? 0.0) : 0.0
  const vTegLive = isConnected ? (telemetry.vTeg ?? telemetry.tegVoltage ?? 0.0) : 0.0
  const iBatLive = isConnected ? (telemetry.iBat ?? telemetry.rawTegCurrent ?? 0.0) : 0.0
  const pBatLive = isConnected ? (telemetry.pBat ?? Math.round(vBatLive * iBatLive * 10) / 10) : 0.0
  const pHarvLive = isConnected
    ? (telemetry.pHarv ?? (telemetry.tegPower > 0 ? telemetry.tegPower : Math.round(vTegLive * iBatLive * 10) / 10))
    : 0.0
  const whHarvLive = isConnected ? (telemetry.whHarv ?? 0.0) : 0.0
  const isRelayClosed = isConnected ? Boolean(telemetry.relayOn ?? telemetry.relays.dcBus) : false

  // Tianneng TNE12-15 (12V 15Ah VRLA/AGM-Gel) Smooth & State-Aware 4-Bar Indicator
  // - Uses telemetry.batPct directly from ESP32 firmware when available (or fallback telemetry.batteryPct)
  // - Trims stateName strings (e.g. "CHARGING   ", "FULL-HOLD  ") before matching/styling states
  const heldBarsRef = useRef<number>(0)
  const stateCode = telemetry.stateCode ?? telemetry.esp32?.stateCode ?? 0
  const hasValidBattery =
    isConnected &&
    stateCode !== 0 &&
    espStateName !== 'NO BATTERY' &&
    vBatLive >= 6.0 &&
    vBatLive <= 16.5

  const iTegLive = isConnected
    ? Math.max(telemetry.iTeg ?? 0, telemetry.iBat ?? 0, telemetry.rawTegCurrent ?? 0)
    : 0.0

  // Charging indicator appears ONLY when ESP32 is connected, battery is valid,
  // Relay GPIO14 is CLOSED in CHARGING state, and TEG/charger is actively driving the battery
  // (current > 0, TEG >= Bat - 0.15V, or elevated charging voltage >= 13.0V such as 14.04V).
  // Immediately disappears when disconnected or when relay opens (WAITING, FULL-HOLD, FORCED OFF, TEMP LOCK, OVERCURRENT).
  const isActivelyCharging =
    hasValidBattery &&
    isRelayClosed &&
    (stateCode === 1 || espStateName === 'CHARGING') &&
    (iTegLive > 0 || vTegLive >= vBatLive - 0.15 || vBatLive >= 13.0)
  const rawSocVal = telemetry.batPct ?? telemetry.batteryPct ?? 0
  const battPct =
    !isConnected || stateCode === 0 || espStateName === 'NO BATTERY' || vBatLive < 6.0 || vBatLive > 16.5
      ? 0
      : Math.min(100, Math.max(0, Math.round(rawSocVal)))

  const batteryStageBadge = (() => {
    if (!isConnected) return { label: 'STANDBY', tone: 'neutral' as const }
    if (stateCode === 0 || espStateName === 'NO BATTERY' || vBatLive < 6.0 || vBatLive > 16.5) {
      return { label: 'NO BAT', tone: 'warn' as const }
    }
    if (stateCode === 6 || espStateName === 'OVERCURRENT') return { label: 'OVER-I', tone: 'danger' as const }
    if (stateCode === 5 || espStateName === 'TEMP LOCKOUT') return { label: 'TEMP LOCK', tone: 'warn' as const }
    if (stateCode === 2 || espStateName === 'FULL-HOLD') return { label: 'FULL-HOLD', tone: 'full' as const }
    if (stateCode === 3 || espStateName === 'WAITING') return { label: 'WAITING', tone: 'hold' as const }
    if (isActivelyCharging) return { label: 'CHARGING', tone: 'charging' as const }
    if (isRelayClosed && (stateCode === 1 || espStateName === 'CHARGING')) {
      return { label: 'IDLE 0A', tone: 'hold' as const }
    }
    if (stateCode === 4 || espStateName === 'FORCED OFF') return { label: 'FORCED OFF', tone: 'neutral' as const }
    return { label: 'RESTING', tone: 'neutral' as const }
  })()

  const activeBars = (() => {
    if (!isConnected || stateCode === 0 || vBatLive < 6.0 || vBatLive > 16.5) {
      heldBarsRef.current = 0
      return 0
    }

    // Map smoothed SoC % to 4 bars with ±3% hysteresis so bars never flicker on transitions
    let bars = battPct >= 76 ? 4 : battPct >= 50 ? 3 : battPct >= 20 ? 2 : battPct > 0 ? 1 : 0
    const prev = heldBarsRef.current
    if (prev > 0 && bars !== prev) {
      if (prev === 4 && battPct >= 73) bars = 4
      else if (prev === 3 && battPct >= 47 && battPct <= 78) bars = 3
      else if (prev === 2 && battPct >= 17 && battPct <= 52) bars = 2
      else if (prev === 1 && battPct >= 1 && battPct <= 22) bars = 1
    }
    heldBarsRef.current = bars
    return bars
  })()

  return (
    <div className="flex flex-col gap-3 font-sans">
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}
        aria-labelledby="charger-relay-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2
              id="charger-relay-heading"
              className={`text-xs font-black uppercase tracking-wider truncate ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {isFil ? 'KONTROL NG CHARGER RELAY (GPIO14)' : 'CHARGER RELAY (GPIO14)'}
            </h2>
            <span
              className={`text-[10px] mt-0.5 block truncate ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              {telemetry.stateReason ||
                (isRelayClosed
                  ? isFil
                    ? 'Konektado ang TEG · Nagkakarga'
                    : 'TEG Connected · Charging Active'
                  : isFil
                  ? 'Nakabukas ang relay · Nakahiwalay'
                  : 'Relay Open · Disconnected')}
            </span>
          </div>

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
            <span>
              {isRelayClosed
                ? isFil
                  ? 'SARADO (ON)'
                  : 'CLOSED'
                : isFil
                ? 'BUKAS (OFF)'
                : 'OPEN'}
            </span>
          </div>
        </div>

        {/* ESP32 State Machine Row */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isRelayClosed
                  ? isDark
                    ? 'bg-[#00E676] animate-pulse'
                    : 'bg-emerald-600 animate-pulse'
                  : 'bg-zinc-500'
              }`}
            />
            <div className="truncate">
              <span
                className={`text-[11px] font-bold block leading-tight ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                ESP32 State Machine
              </span>
              <span
                className={`text-[9px] font-mono font-bold tracking-tight ${
                  isDark ? 'text-[#00E676]' : 'text-emerald-700'
                }`}
              >
                {espStateName || (isRelayClosed ? 'CHARGING' : 'STANDBY')} (GPIO14:{' '}
                {isRelayClosed ? 'CLOSED' : 'OPEN'})
              </span>
            </div>
          </div>
          <span
            className={`text-[9px] font-mono px-2 py-0.5 rounded font-black uppercase flex-shrink-0 ${
              isRelayClosed
                ? isDark
                  ? 'bg-emerald-500/20 text-[#00E676]'
                  : 'bg-emerald-100 text-emerald-800'
                : isDark
                ? 'bg-[#1E242B] text-zinc-300'
                : 'bg-zinc-200 text-zinc-700'
            }`}
          >
            {isRelayClosed ? 'CHARGING' : 'HOLD/OFF'}
          </span>
        </div>
      </section>

      <section
        className={`rounded-2xl p-3.5 border flex flex-col gap-2.5 shadow-md transition-all ${
          isDark
            ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
            : 'bg-white border-zinc-200/90 shadow-sm'
        }`}
        aria-labelledby="harvested-energy-heading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <IconFlame size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            <h2
              id="harvested-energy-heading"
              className={`text-xs font-bold uppercase tracking-wider ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {isFil ? 'NA-HARVEST NA ENERHIYA' : 'HARVESTED ENERGY'}
            </h2>
          </div>
          <div className="flex items-baseline">
            <span
              className={`text-lg font-black font-mono tabular-nums ${
                isDark ? 'text-[#00E676]' : 'text-emerald-700'
              }`}
            >
              {whHarvLive.toFixed(3)}
            </span>
            <span
              className={`text-[10px] font-bold ml-1 ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              WH
            </span>
          </div>
        </div>

        <div
          className={`w-full h-2 rounded-full overflow-hidden ${
            isDark ? 'bg-[#1E242B]' : 'bg-zinc-200'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isDark ? 'bg-[#00E676]' : 'bg-emerald-600'
            }`}
            style={{
              width: `${
                isConnected
                  ? Math.min(100, Math.round((vBatLive / (telemetry.vOpenNow ?? 14.6)) * 100))
                  : 0
              }%`,
            }}
            role="progressbar"
            aria-valuenow={
              isConnected
                ? Math.min(100, Math.round((vBatLive / (telemetry.vOpenNow ?? 14.6)) * 100))
                : 0
            }
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {/* TILE 1: BATTERY (GPIO32 · 12V 15Ah SLA) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-all ${
            isDark
              ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
              : 'bg-white border-zinc-200/90 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                {isFil ? 'BATERYA (GPIO32)' : 'BATTERY (GPIO32)'}
              </span>
              <span
                className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-black uppercase flex-shrink-0 inline-flex items-center gap-0.5 ${
                  batteryStageBadge.tone === 'charging' || batteryStageBadge.tone === 'full'
                    ? isDark
                      ? 'bg-[#00E676]/15 text-[#00E676]'
                      : 'bg-emerald-100 text-emerald-800'
                    : batteryStageBadge.tone === 'hold'
                    ? isDark
                      ? 'bg-sky-500/15 text-sky-400'
                      : 'bg-sky-100 text-sky-800'
                    : batteryStageBadge.tone === 'warn'
                    ? isDark
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-amber-100 text-amber-800'
                    : batteryStageBadge.tone === 'danger'
                    ? isDark
                      ? 'bg-rose-500/15 text-rose-400'
                      : 'bg-rose-100 text-rose-800'
                    : isDark
                    ? 'bg-[#1E242B] text-zinc-400'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {batteryStageBadge.tone === 'charging' && <IconZap size={9} className="flex-shrink-0" />}
                {batteryStageBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-xs font-mono font-black ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {vBatLive.toFixed(2)}V
              </span>
              <span
                className={`text-[8.5px] font-mono px-1 rounded font-bold ${
                  isDark ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                12V 15Ah
              </span>
            </div>
          </div>

          <div
            className="flex items-center justify-start mt-2 mb-0.5"
            role="meter"
            aria-valuenow={activeBars}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-label={`Battery level ${activeBars} of 4 bars (${batteryStageBadge.label})`}
          >
            <Battery4BarIcon
              activeBars={activeBars}
              isDark={isDark}
              isCharging={isActivelyCharging}
              size={92}
            />
          </div>
        </div>

        {/* TILE 2: TEG INPUT VOLTAGE (GPIO33) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-all ${
            isDark
              ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
              : 'bg-white border-zinc-200/90 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                TEG INPUT (GPIO33)
              </span>
              <IconFlame size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            </div>
            <span
              className={`text-[9.5px] font-mono block mt-0.5 ${
                isConnected && vTegLive < 1.0 && activeBars > 0 && activeBars <= 2
                  ? isDark
                    ? 'text-amber-400 font-bold'
                    : 'text-amber-700 font-bold'
                  : isDark
                  ? 'text-[#9CA3AF]'
                  : 'text-zinc-600'
              }`}
            >
              Peak: {(telemetry.vTegPeak ?? vTegLive).toFixed(1)}V ·{' '}
              {isConnected && vTegLive < 1.0 && activeBars > 0 && activeBars <= 2
                ? 'Low <1.0V'
                : '150k/10k'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {vTegLive.toFixed(2)}
            </span>
            <span
              className={`text-xs font-semibold ml-1 ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              V
            </span>
          </div>
        </div>

        {/* TILE 3: CHARGE CURRENT (ACS712-5A · GPIO35) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-all ${
            isDark
              ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
              : 'bg-white border-zinc-200/90 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                {isFil ? 'KURYENTE (GPIO35)' : 'CURRENT (GPIO35)'}
              </span>
              <IconPowerCircle
                size={16}
                className={
                  telemetry.inaOk === false
                    ? isDark
                      ? 'text-amber-400'
                      : 'text-amber-700'
                    : isDark
                    ? 'text-[#00E676]'
                    : 'text-emerald-700'
                }
              />
            </div>
            <span
              className={`text-[9.5px] font-mono block mt-0.5 truncate ${
                telemetry.inaOk === false
                  ? isDark
                    ? 'text-amber-400 font-bold'
                    : 'text-amber-700 font-bold'
                  : isDark
                  ? 'text-[#9CA3AF]'
                  : 'text-zinc-600'
              }`}
            >
              {telemetry.inaOk === false
                ? 'ACS712 fault'
                : `ACS712-5A · Zero ${(telemetry.acsZero ?? 2.5).toFixed(2)}V`}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {iBatLive.toFixed(2)}
            </span>
            <span
              className={`text-xs font-semibold ml-1 ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              A
            </span>
          </div>
        </div>

        {/* TILE 4: CHARGING POWER (IN-BATTERY vs TEG HARVEST) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-all ${
            isDark
              ? 'bg-[#13171B] border-[#1E242B] ring-1 ring-white/[0.04]'
              : 'bg-white border-zinc-200/90 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-zinc-950'
                }`}
              >
                {isFil ? 'LAKAS NG KARGA' : 'CHARGE POWER'}
              </span>
              <IconZap size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
            </div>
            <span
              className={`text-[9.5px] font-mono block mt-0.5 truncate ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              Bat: {pBatLive.toFixed(1)}W · TEG: {pHarvLive.toFixed(1)}W
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${
                isDark ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {pBatLive.toFixed(1)}
            </span>
            <span
              className={`text-xs font-semibold ml-1 ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-600'
              }`}
            >
              W
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
