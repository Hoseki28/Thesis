import { CalibrationConfig, Lang, TelemetryData, TelemetryPoint } from '../types/telemetry'
import {
  IconThermometer,
  IconColdSink,
  IconShieldCheck,
} from './Icons'

interface SensorsTabProps {
  telemetry: TelemetryData
  calibration: CalibrationConfig
  historyPoints?: TelemetryPoint[]
  lang: Lang
  theme?: 'dark' | 'light'
}

export function SensorsTab({ telemetry, lang, theme = 'dark' }: SensorsTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isConnected =
    telemetry.source === 'hardware' ||
    telemetry.source === 'serial' ||
    telemetry.source === 'bluetooth' ||
    telemetry.source === 'esp32'

  const tHotLive = telemetry.tHot ?? telemetry.stoveTemp ?? 0.0
  const tColdLive = telemetry.tCold ?? telemetry.coldFaceTemp ?? 0.0
  const dTLive =
    !telemetry.hotFault && !telemetry.coldFault
      ? (telemetry.dT ?? Math.max(0, tHotLive - tColdLive))
      : 0.0

  const dhtOk = telemetry.esp32?.dhtOk !== false && telemetry.dhtOk !== false
  const ambTemp = telemetry.tAmb ?? telemetry.ambientTemp ?? 0.0

  const hotOver = isConnected && !telemetry.hotFault && tHotLive >= 230
  const thermalGuardTripped =
    isConnected &&
    (!dhtOk ||
      telemetry.batHot ||
      telemetry.stateCode === 5 ||
      ambTemp >= 40 ||
      ambTemp < 0)

  const vOpen = telemetry.vOpenNow ?? 14.6
  const vClose = telemetry.vCloseNow ?? 13.7
  const vHard = telemetry.vHardNow ?? 14.8

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="pb-0.5">
        <h2
          className={`text-sm font-black uppercase tracking-wider ${
            isDark ? 'text-white' : 'text-zinc-900'
          }`}
        >
          {isFil ? 'THERMAL AT AMBIENT SENSORS' : 'THERMAL & AMBIENT SENSORS'}
        </h2>
        <p className={`text-[11px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {isFil
            ? 'ESP32 thermal cutoffs, MAX31855 thermocouples, at DHT22 guard'
            : 'ESP32 thermal cutoffs, MAX31855 thermocouples & DHT22 guard'}
        </p>
      </div>

      {/* ── 1. THERMAL SAFETY & CUTOFF MONITOR (<230°C / 0–40°C) ────── */}
      <section
        className={`rounded-2xl p-3.5 border flex flex-col gap-2.5 shadow-md transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="thermal-safety-heading"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <IconShieldCheck
              size={16}
              className={
                thermalGuardTripped || hotOver
                  ? 'text-rose-400'
                  : isDark
                  ? 'text-[#00E676]'
                  : 'text-emerald-700'
              }
            />
            <span
              id="thermal-safety-heading"
              className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
              }`}
            >
              {isFil ? 'THERMAL SAFETY & CUTOFF MONITOR' : 'THERMAL SAFETY & CUTOFF MONITOR'}
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded-md border text-[9.5px] font-mono font-black uppercase tracking-wider flex-shrink-0 ${
              !isConnected
                ? isDark
                  ? 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                : thermalGuardTripped
                ? isDark
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  : 'bg-rose-50 border-rose-300 text-rose-700'
                : hotOver || telemetry.hotFault || telemetry.coldFault
                ? isDark
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                  : 'bg-amber-50 border-amber-300 text-amber-700'
                : isDark
                ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
            }`}
          >
            {!isConnected
              ? 'STANDBY'
              : thermalGuardTripped
              ? 'TEMP LOCKOUT'
              : hotOver
              ? 'HOT >230°C'
              : telemetry.hotFault || telemetry.coldFault
              ? 'PROBE FAULT'
              : 'ALL SAFE'}
          </span>
        </div>

        {/* 2 Thermal Protection Zones: Stove (<230°C) & Battery (0–40°C) */}
        <div className="grid grid-cols-2 gap-2 text-center font-mono">
          {/* Zone 1: Stove Max <230°C */}
          <div
            className={`p-2 rounded-xl border ${
              hotOver
                ? 'bg-rose-950/30 border-rose-500/50'
                : isDark
                ? 'bg-[#0B0F12] border-[#1E242B]'
                : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <span className={`text-[8.5px] block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              STOVE (&lt;230°C)
            </span>
            <span
              className={`text-xs font-black block mt-0.5 ${
                !isConnected
                  ? isDark
                    ? 'text-zinc-400'
                    : 'text-zinc-500'
                  : hotOver || telemetry.hotFault
                  ? 'text-rose-400'
                  : 'text-[#00E676]'
              }`}
            >
              {!isConnected
                ? '-- / 230°C'
                : telemetry.hotFault
                ? 'FAULT'
                : `${tHotLive.toFixed(0)}° / 230°C`}
            </span>
          </div>

          {/* Zone 2: Battery Charge Guard 0–40°C */}
          <div
            className={`p-2 rounded-xl border ${
              thermalGuardTripped
                ? 'bg-rose-950/30 border-rose-500/50'
                : isDark
                ? 'bg-[#0B0F12] border-[#1E242B]'
                : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <span className={`text-[8.5px] block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              BATTERY (0–40°C)
            </span>
            <span
              className={`text-xs font-black block mt-0.5 ${
                !isConnected
                  ? isDark
                    ? 'text-zinc-400'
                    : 'text-zinc-500'
                  : thermalGuardTripped
                  ? 'text-rose-400'
                  : 'text-[#00E676]'
              }`}
            >
              {!isConnected
                ? '0–40°C OK'
                : !dhtOk
                ? 'DHT ERR'
                : thermalGuardTripped
                ? 'LOCKOUT'
                : `${ambTemp.toFixed(0)}°C SAFE`}
            </span>
          </div>
        </div>

        {/* Compact Temperature Difference (ΔT) Footer */}
        <div className="flex items-center justify-between text-[10px] font-mono pt-0.5">
          <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
            {isFil ? 'Agwat ng Init (Hot − Cold ΔT):' : 'Temp Difference (Hot − Cold ΔT):'}
          </span>
          <span className={`font-black ${isDark ? 'text-white' : 'text-zinc-900'}`}>
            {!isConnected || telemetry.hotFault || telemetry.coldFault
              ? '-- °C'
              : `${dTLive.toFixed(1)} °C`}
          </span>
        </div>
      </section>

      {/* ── 2. HOT & COLD THERMOCOUPLE CARDS (MAX31855 SPI) ─────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* HOT THERMOCOUPLE (CS GPIO5) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-colors ${
            isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {isFil ? 'HOT TC (CS GPIO5)' : 'HOT TC (CS GPIO5)'}
              </span>
              <IconThermometer
                size={16}
                className={
                  isConnected && telemetry.hotFault
                    ? 'text-rose-400'
                    : isDark
                    ? 'text-[#00E676]'
                    : 'text-emerald-700'
                }
              />
            </div>
            <span
              className={`text-[9.5px] font-mono block mt-0.5 truncate ${
                isConnected && telemetry.hotFault
                  ? 'text-rose-400 font-bold'
                  : isDark
                  ? 'text-zinc-400'
                  : 'text-zinc-500'
              }`}
            >
              {!isConnected
                ? 'MAX31855 · Max 230°C'
                : telemetry.hotFault
                ? `Fault: ${telemetry.hotWhy || 'check probe'}`
                : 'Stove Hot Face · Max 230°C'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${
                !isConnected
                  ? isDark
                    ? 'text-zinc-500'
                    : 'text-zinc-400'
                  : telemetry.hotFault
                  ? 'text-rose-400 text-xl'
                  : isDark
                  ? 'text-white'
                  : 'text-zinc-900'
              }`}
            >
              {!isConnected ? '--' : telemetry.hotFault ? 'FAULT' : tHotLive.toFixed(1)}
            </span>
            {(!isConnected || !telemetry.hotFault) && (
              <span
                className={`text-xs font-semibold ml-1 ${
                  isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                }`}
              >
                °C
              </span>
            )}
          </div>
        </div>

        {/* COLD THERMOCOUPLE (CS GPIO17) */}
        <div
          className={`rounded-2xl p-3.5 border flex flex-col justify-between min-h-[112px] shadow-md transition-colors ${
            isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {isFil ? 'COLD TC (CS GPIO17)' : 'COLD TC (CS GPIO17)'}
              </span>
              <IconColdSink
                size={16}
                className={
                  isConnected && telemetry.coldFault
                    ? 'text-rose-400'
                    : isDark
                    ? 'text-[#00E676]'
                    : 'text-emerald-700'
                }
              />
            </div>
            <span
              className={`text-[9.5px] font-mono block mt-0.5 truncate ${
                isConnected && telemetry.coldFault
                  ? 'text-rose-400 font-bold'
                  : isDark
                  ? 'text-zinc-400'
                  : 'text-zinc-500'
              }`}
            >
              {!isConnected
                ? 'MAX31855 · Heatsink Cold Side'
                : telemetry.coldFault
                ? `Fault: ${telemetry.coldWhy || 'check probe'}`
                : 'MAX31855 · Heatsink Cold Side'}
            </span>
          </div>

          <div className="flex items-baseline mt-2">
            <span
              className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${
                !isConnected
                  ? isDark
                    ? 'text-zinc-500'
                    : 'text-zinc-400'
                  : telemetry.coldFault
                  ? 'text-rose-400 text-xl'
                  : isDark
                  ? 'text-white'
                  : 'text-zinc-900'
              }`}
            >
              {!isConnected ? '--' : telemetry.coldFault ? 'FAULT' : tColdLive.toFixed(1)}
            </span>
            {(!isConnected || !telemetry.coldFault) && (
              <span
                className={`text-xs font-semibold ml-1 ${
                  isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                }`}
              >
                °C
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. DHT22 BATTERY TEMPERATURE (GPIO23 · 0–40°C CHARGE GUARD) ─ */}
      <div
        className={`rounded-2xl p-3.5 border flex items-center justify-between shadow-md transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
      >
        <div>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider block ${
              isDark ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {isFil ? 'BATTERY TEMP (GPIO23)' : 'BATTERY TEMP (GPIO23)'}
          </span>
          <span
            className={`text-[9.5px] font-mono block mt-0.5 ${
              thermalGuardTripped
                ? 'text-rose-400 font-bold'
                : isDark
                ? 'text-zinc-400'
                : 'text-zinc-500'
            }`}
          >
            {!isConnected
              ? 'DHT22 · 0–40°C Charge Window'
              : !dhtOk
              ? 'DHT22 Error · Charge Lockout'
              : thermalGuardTripped
              ? 'Outside 0–40°C · Charge Lockout'
              : 'DHT22 · Safe Charge Window (0–40°C)'}
          </span>
        </div>

        <div className="flex items-baseline">
          <span
            className={`text-2xl font-black font-mono tabular-nums ${
              !isConnected
                ? isDark
                  ? 'text-zinc-500'
                  : 'text-zinc-400'
                : !dhtOk
                ? 'text-rose-400 text-xl'
                : isDark
                ? 'text-white'
                : 'text-zinc-900'
            }`}
          >
            {!isConnected ? '--' : !dhtOk ? 'ERR' : ambTemp.toFixed(1)}
          </span>
          {(!isConnected || dhtOk) && (
            <span
              className={`text-xs font-semibold ml-1 ${
                isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
              }`}
            >
              °C
            </span>
          )}
        </div>
      </div>

      {/* ── 4. TEMPERATURE-COMPENSATED TNE12-15 VOLTAGE THRESHOLDS ──── */}
      <section
        className={`rounded-2xl p-3.5 border flex flex-col gap-2 shadow-md transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="temp-comp-heading"
      >
        <div className="flex items-center justify-between">
          <span
            id="temp-comp-heading"
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
            }`}
          >
            {isFil
              ? 'THERMAL VOLTAGE COMPENSATION (-24/-18mV/°C)'
              : 'THERMAL VOLTAGE COMPENSATION (-24/-18mV/°C)'}
          </span>
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
              thermalGuardTripped
                ? 'bg-rose-500/15 text-rose-400'
                : 'bg-[#00E676]/10 text-[#00E676]'
            }`}
          >
            {!isConnected
              ? 'BASE 25°C'
              : thermalGuardTripped
              ? 'LOCKOUT'
              : `${ambTemp.toFixed(1)}°C REF`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div
            className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <span className={`text-[8.5px] block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              OPEN (FULL)
            </span>
            <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {vOpen.toFixed(2)}V
            </span>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <span className={`text-[8.5px] block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              CLOSE (RESUME)
            </span>
            <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {vClose.toFixed(2)}V
            </span>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <span className={`text-[8.5px] block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              HARD CUTOFF
            </span>
            <span className="text-xs font-black text-rose-400">{vHard.toFixed(2)}V</span>
          </div>
        </div>
      </section>
    </div>
  )
}
