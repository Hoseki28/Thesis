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

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── 1. DC MAIN POWER & CURRENT LOAD CARD ─────────────────────── */}
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
              {isFil ? 'KONTROL NG CHARGER RELAY (GPIO14)' : 'CHARGER RELAY (GPIO14)'}
            </h2>
            <span className={`text-[10px] mt-0.5 block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {telemetry.stateReason || (isRelayClosed ? (isFil ? 'Konektado ang TEG · Nagkakarga' : 'TEG Connected · Charging Active') : (isFil ? 'Nakabukas ang relay · Nakahiwalay' : 'Relay Open · Disconnected'))}
            </span>
          </div>

          {/* Interactive Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={isRelayClosed}
            onClick={onToggleDcBus}
            className={`w-14 h-8 rounded-full p-1 transition-colors cursor-pointer flex items-center ${
              isRelayClosed ? 'bg-[#00E676]' : isDark ? 'bg-[#1E242B]' : 'bg-zinc-300'
            }`}
            aria-label="Toggle Charger Relay Switch"
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                isRelayClosed ? 'translate-x-6' : 'translate-x-0'
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
              {isFil ? 'KASALUKUYANG KURYENTE AT LAKAS' : 'CHARGE CURRENT & POWER'}
            </span>
            <IconPowerCircle size={16} className={isRelayClosed ? 'text-[#00E676]' : 'text-zinc-400'} />
          </div>
          <span className={`text-[9px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-400'}`}>
            TEG CURRENT: {iBatLive.toFixed(2)}A · TEG V: {vTegLive.toFixed(1)}V · Wh: {whHarvLive.toFixed(3)}
          </span>
          <div className="flex items-baseline mt-1">
            <span className={`text-2xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isRelayClosed ? pHarvLive.toFixed(1) : '0.0'}
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
              <span className={`w-2 h-2 rounded-full ${isRelayClosed ? 'bg-[#00E676] animate-pulse' : 'bg-zinc-600'}`} />
              <div>
                <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  {isFil ? 'ESP32 State Machine' : 'ESP32 State Machine'}
                </span>
                <span className="text-[9px] font-mono text-[#00E676] font-bold tracking-tight">
                  {espStateName || (isRelayClosed ? 'CHARGING' : 'STANDBY')} (GPIO14: {isRelayClosed ? 'CLOSED' : 'OPEN'})
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#1E242B] text-zinc-400 font-black uppercase">
              {isRelayClosed ? 'CHARGING' : 'HOLD/OFF'}
            </span>
          </div>

          {/* Tier 2: Secondary Auxiliary Load (12V DC Fans & USB) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
          }`}>
            <div>
              <span className={`text-[11px] font-bold block leading-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'Mga Limit ng Boltahe (-18mV/°C)' : 'Dynamic Voltage Limits (-18mV/°C)'}
              </span>
              <span className={`text-[9px] font-mono tracking-tight ${
                telemetry.auxLockout ? 'text-rose-400 font-bold' : isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
              }`}>
                Open: {(telemetry.vOpenNow ?? 14.4).toFixed(2)}V · Close: {(telemetry.vCloseNow ?? 13.6).toFixed(2)}V · Hard: {(telemetry.vHardNow ?? 14.6).toFixed(2)}V
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
              {isFil ? 'ORAS NG PAG-ANDAR (UPTIME)' : 'SESSION UPTIME & ENERGY'}
            </h2>
          </div>
          <div className="flex items-baseline">
            <span className={`text-lg font-black font-mono ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isConnected ? (telemetry.esp32?.uptimeStr || '00:00:00') : '--:--:--'}
            </span>
            <span className={`text-[10px] font-bold ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              PHT
            </span>
          </div>
        </div>

        {/* Progress Line */}
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
          <span className={isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}>
            {isFil ? 'NA-HARVEST NA ENERHIYA' : 'HARVESTED ENERGY'}
          </span>
          <span className="text-[#00E676] font-mono">{whHarvLive.toFixed(3)} WH</span>
        </div>

        {/* Progress Bar */}
        <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#1E242B]' : 'bg-zinc-200'}`}>
          <div
            className="bg-[#00E676] h-full rounded-full transition-all duration-500"
            style={{ width: `${isConnected ? Math.min(100, Math.round((vBatLive / 14.4) * 100)) : 0}%` }}
            role="progressbar"
            aria-valuenow={isConnected ? Math.min(100, Math.round((vBatLive / 14.4) * 100)) : 0}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Bottom Note */}
        <span className={`text-[9px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {telemetry.esp32?.note ? telemetry.esp32.note : (isFil ? '12V 15Ah Sealed Lead-Acid (SLA) Baterya' : '12V 15Ah Sealed Lead-Acid (SLA) Battery')}
        </span>
      </section>

      {/* ── 4. 2×2 TELEMETRY GRID ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* TILE 1: BATTERY (12V 15Ah SLA) */}
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
                {vBatLive.toFixed(2)}V
              </span>
              <span className="text-[8px] font-mono px-1 rounded bg-[#00E676]/15 text-[#00E676] font-bold">
                12V 15Ah SLA
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-baseline mt-1.5">
              <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isConnected ? Math.round(telemetry.batteryPct) : 0}
              </span>
              <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>%</span>
            </div>
            <span className={`text-[8.5px] font-mono block mt-0.5 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              6.0V Min · 14.4V Full
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
              {isConnected ? `${vTegLive.toFixed(1)}V · Peak: ${(telemetry.vTegPeak ?? vTegLive).toFixed(1)}V` : '0.0V · Peak: 0.0V'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {pHarvLive.toFixed(1)}
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
              {isConnected
                ? `Hot: ${Math.round(telemetry.tHot ?? telemetry.stoveTemp)}°C · Cold: ${Math.round(telemetry.tCold ?? (telemetry.coldFaceTemp || 25))}°C`
                : 'Hot: 0°C · Cold: 0°C'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isConnected ? Math.round(telemetry.dT ?? deltaT) : 0}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
          </div>
        </div>

        {/* TILE 4: COOLING & AMBIENT (DHT22) */}
        <div className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[110px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {isFil ? 'PAMPALAMIG AT PALIGID' : 'COOLING & AMBIENT'}
              </span>
              <IconColdSink size={18} className="text-[#00E676]" />
            </div>
            <span className={`text-[9px] block mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isConnected
                ? `${telemetry.coldFault ? 'Cold Fault' : 'Cold Face'} · Amb: ${ambientTempC.toFixed(1)}°C (${ambientHumPct.toFixed(0)}% RH)`
                : 'Cold Face · Amb: 0.0°C (0% RH)'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isConnected ? Math.round(telemetry.tCold ?? (telemetry.coldFaceTemp || telemetry.ambientTemp)) : 0}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>°C</span>
          </div>
        </div>
      </div>
    </div>
  )
}
