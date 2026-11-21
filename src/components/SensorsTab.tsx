import { CalibrationConfig, Lang, TelemetryData, TelemetryPoint } from '../types/telemetry'
import {
  IconZap,
  IconFlame,
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

  // Voltage & current readings
  const batteryVoltage = telemetry.vBat ?? telemetry.batteryVoltage ?? 0.0
  const tegVoltage = telemetry.vTeg ?? telemetry.tegVoltage ?? 0.0
  const chargeCurrent = telemetry.iBat ?? telemetry.rawTegCurrent ?? 0.0
  const battPct = isConnected ? Math.max(0, Math.min(100, Math.round(telemetry.batteryPct ?? 0))) : 0

  // Charge Stage badge for Top Hero Card (IDLE / BULK / FLOAT / LOCKOUT)
  const chargeStage = (() => {
    if (!isConnected) return { label: 'IDLE', tone: 'neutral' as const }
    if (telemetry.stateCode === 6 || telemetry.overcurrentLatched) return { label: 'OVERCURRENT', tone: 'danger' as const }
    if (telemetry.stateCode === 5 || telemetry.batHot) return { label: 'TEMP LOCKOUT', tone: 'warn' as const }
    if (telemetry.stateCode === 1 || telemetry.relayOn) return { label: 'BULK', tone: 'active' as const }
    if (telemetry.stateCode === 2 || telemetry.stateCode === 3) return { label: 'FLOAT', tone: 'info' as const }
    return { label: 'IDLE', tone: 'neutral' as const }
  })()

  // Power values: In-Battery Power = Vbat × Icharge, TEG Harvest = Vteg × Icharge
  const pBatLive =
    telemetry.pBat && telemetry.pBat > 0
      ? telemetry.pBat
      : Math.round(batteryVoltage * chargeCurrent * 10) / 10
  const pHarvNum =
    telemetry.pHarv && telemetry.pHarv > 0
      ? telemetry.pHarv
      : telemetry.tegPower > 0
      ? telemetry.tegPower
      : Math.round(tegVoltage * chargeCurrent * 10) / 10
  const tegWattage = pHarvNum.toFixed(1)

  const dhtOk = telemetry.esp32?.dhtOk !== false
  const ambTemp = telemetry.tAmb ?? telemetry.ambientTemp ?? 0
  const thermalGuardTripped = isConnected && (!dhtOk || telemetry.batHot || telemetry.stateCode === 5 || ambTemp >= 40 || ambTemp < 0)

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="pb-1">
        <h2 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
          {isFil ? 'DETALYADONG TELEMETRIYA' : 'EXPANDED TELEMETRY'}
        </h2>
        <p className={`text-[11px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {isFil ? 'Pagsusuri ng mga sensor sa prototype' : 'Detailed sensor diagnostics'}
        </p>
      </div>

      {/* ── 1. TOP HERO CARD: BATTERY VOLTAGE + SoC % & CHARGE STAGE ── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-2 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="battery-voltage-heading"
      >
        <div className="flex items-center justify-between gap-2">
          <span id="battery-voltage-heading" className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'BOLTAHE NG BATERYA' : 'BATTERY VOLTAGE'}
          </span>
          <div className="flex items-center gap-1.5">
            {/* SoC % Badge */}
            <span
              className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold tabular-nums ${
                isConnected
                  ? isDark
                    ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-200'
                    : 'bg-zinc-100 border-zinc-200 text-zinc-800'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-500'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-400'
              }`}
            >
              {isConnected ? `${battPct}% SoC` : '--% SoC'}
            </span>

            {/* Charge Stage Badge (IDLE / BULK / FLOAT / LOCKOUT) */}
            <span
              className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-black uppercase tracking-wider ${
                chargeStage.tone === 'active'
                  ? isDark
                    ? 'bg-[#00E676]/15 border-[#00E676]/40 text-[#00E676]'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : chargeStage.tone === 'info'
                  ? isDark
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                    : 'bg-sky-50 border-sky-300 text-sky-700'
                  : chargeStage.tone === 'warn'
                  ? isDark
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-amber-50 border-amber-300 text-amber-700'
                  : chargeStage.tone === 'danger'
                  ? isDark
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-rose-50 border-rose-300 text-rose-700'
                  : isDark
                  ? 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-600'
              }`}
            >
              {chargeStage.label}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between mt-1">
          <div className="flex items-baseline">
            <span className={`text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {batteryVoltage.toFixed(2)}
            </span>
            <span className={`text-xs font-bold ml-2 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>V DC</span>
          </div>
          <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            TNE12-15 · 12V 15Ah
          </span>
        </div>
      </section>

      {/* ── 2. MIDDLE 2-COLUMN ROW: IN-BATTERY POWER & TEG HARVEST ─── */}
      <div className="grid grid-cols-2 gap-3">
        {/* IN-BATTERY POWER (Vbat × Icharge) */}
        <div className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                {isFil ? 'LAKAS SA BATERYA' : 'IN-BATTERY POWER'}
              </span>
              <IconZap size={16} className="text-[#00E676]" />
            </div>
            <span className={`text-[9.5px] font-mono block mt-0.5 truncate ${
              telemetry.inaOk === false ? 'text-amber-400 font-bold' : isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}>
              {telemetry.inaOk === false
                ? 'ACS712 fault (GPIO35)'
                : `${batteryVoltage.toFixed(2)}V × ${chargeCurrent.toFixed(2)}A`}
            </span>
          </div>
          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {pBatLive.toFixed(1)}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
          </div>
        </div>

        {/* TEG HARVEST (Vteg × Icharge) */}
        <div className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[105px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                {isFil ? 'LIKHANG TEG' : 'TEG HARVEST'}
              </span>
              <IconFlame size={16} className="text-[#00E676]" />
            </div>
            <span className={`text-[9.5px] font-mono block mt-0.5 truncate ${
              !telemetry.relayOn && chargeCurrent === 0 ? (isDark ? 'text-zinc-400' : 'text-zinc-500') : isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}>
              {telemetry.inaOk === false
                ? 'ACS712 fault (GPIO35)'
                : `${tegVoltage.toFixed(2)}V × ${chargeCurrent.toFixed(2)}A`}
            </span>
          </div>
          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {tegWattage}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
          </div>
        </div>
      </div>

      {/* ── 4. 4-CHANNEL LOAD CONTROLLER BREAKDOWN ────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="load-channels-heading"
      >
        <div className="flex items-center justify-between">
          <span id="load-channels-heading" className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'ESP32 CHARGER SUB-SYSTEMS & ACTUATORS' : 'ESP32 CHARGER SUB-SYSTEMS & RELAYS'}
          </span>
          <span className="text-[9px] font-mono font-bold text-[#00E676] px-1.5 py-0.5 rounded bg-[#00E676]/10">
            THESIS FIRMWARE
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {/* Row 1: GPIO14 Relay */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${telemetry.relayOn ? 'bg-[#00E676] animate-pulse' : 'bg-zinc-600'}`} />
              <div>
                <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  CH1: GPIO14 Charging Relay
                </span>
                <span className={`text-[8.5px] font-mono block ${telemetry.relayOn ? 'text-[#00E676] font-bold' : isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {telemetry.relayOn ? 'RELAY CLOSED · TEG CONNECTED' : 'RELAY OPEN · DISCONNECTED'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-mono font-black block tabular-nums ${telemetry.relayOn ? (isDark ? 'text-white' : 'text-zinc-900') : 'text-zinc-500'}`}>
                {(telemetry.iBat ?? 0).toFixed(2)} A
              </span>
              <span className={`text-[8.5px] font-mono font-bold uppercase ${telemetry.relayOn ? 'text-[#00E676]' : 'text-zinc-500'}`}>
                {telemetry.relayOn ? 'CLOSED' : 'OPEN'}
              </span>
            </div>
          </div>

          {/* Row 2: State Machine */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  CH2: State #{telemetry.stateCode ?? 1} ({telemetry.stateName || 'CHARGING'})
                </span>
                <span className={`text-[8.5px] font-mono block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {telemetry.stateReason || 'Charge controller state machine'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-mono font-black block tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {(telemetry.vTeg ?? 0).toFixed(1)} V
              </span>
              <span className="text-[8.5px] font-mono font-bold uppercase text-[#00E676]">
                {telemetry.stateName || 'ACTIVE'}
              </span>
            </div>
          </div>

          {/* Row 3: DHT22 Thermal Guard (GPIO23, 0-40°C Charge Window) */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${!isConnected ? 'bg-zinc-600' : thermalGuardTripped ? 'bg-rose-500' : 'bg-[#00E676]'}`} />
              <div>
                <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  CH3: GPIO23 DHT22 Thermal Guard (0–40°C)
                </span>
                <span className={`text-[8.5px] font-mono block ${thermalGuardTripped ? 'text-rose-400 font-bold' : isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {!isConnected
                    ? 'STANDBY · WAITING FOR ESP32'
                    : !dhtOk
                    ? 'DHT22 MISSING · CHARGE LOCKOUT'
                    : thermalGuardTripped
                    ? 'OUTSIDE 0–40°C · CHARGE LOCKOUT'
                    : 'NOMINAL · BATTERY AREA SAFE'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-mono font-black block tabular-nums ${thermalGuardTripped ? 'text-rose-400' : isDark ? 'text-white' : 'text-zinc-900'}`}>
                {!isConnected ? '--' : !dhtOk ? 'ERR' : `${ambTemp.toFixed(1)} °C`}
              </span>
              <span className={`text-[8.5px] font-mono font-bold uppercase ${!isConnected ? 'text-zinc-500' : thermalGuardTripped ? 'text-rose-400' : 'text-[#00E676]'}`}>
                {!isConnected ? 'STANDBY' : thermalGuardTripped ? 'LOCKOUT' : 'NORMAL'}
              </span>
            </div>
          </div>

          {/* Row 4: Dynamic Limits */}
          <div className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  CH4: Dynamic TNE12-15 Charge Limits
                </span>
                <span className={`text-[8.5px] font-mono block ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Open: {(telemetry.vOpenNow ?? 14.6).toFixed(2)}V · Close: {(telemetry.vCloseNow ?? 13.7).toFixed(2)}V · Hard: {(telemetry.vHardNow ?? 14.8).toFixed(2)}V
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-mono font-black block tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {(telemetry.vOpenNow ?? 14.6).toFixed(2)} V
              </span>
              <span className="text-[8.5px] font-mono font-bold uppercase text-[#00E676]">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. PHYSICAL SENSOR SUITE DIAGNOSTICS ─────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-2.5 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="physical-suite-heading"
      >
        <span id="physical-suite-heading" className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {isFil ? 'PHYSICAL SENSOR SUITE · MGA KABIT NA SENSOR' : 'PHYSICAL SENSOR SUITE · IC SPECS'}
        </span>

        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>MAX31855 Hot (GPIO5)</span>
            <span className={telemetry.hotFault ? 'text-rose-400 font-bold' : isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {telemetry.hotFault ? `FAULT (${telemetry.hotWhy || 'open'})` : `${(telemetry.tHot ?? telemetry.stoveTemp).toFixed(1)}°C Hot Face`}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>MAX31855 Cold (GPIO17)</span>
            <span className={telemetry.coldFault ? 'text-rose-400 font-bold' : isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {telemetry.coldFault ? `FAULT (${telemetry.coldWhy || 'open'})` : `${(telemetry.tCold ?? telemetry.coldFaceTemp ?? 0).toFixed(1)}°C Cold Face`}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>DHT22 Battery Area (GPIO23)</span>
            <span className={!telemetry.dhtOk ? 'text-amber-400 font-bold' : isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {(telemetry.tAmb ?? telemetry.ambientTemp ?? 0).toFixed(1)}°C / {(telemetry.hum ?? telemetry.humidity ?? 0).toFixed(0)}% {!telemetry.dhtOk ? '(ERR)' : ''}
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              ACS712-5A Current (GPIO35)
            </span>
            <span className={telemetry.inaOk === false ? 'text-amber-400 font-bold' : isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {telemetry.inaOk === false
                ? `NOT OK (zero: ${(telemetry.acsZero ?? 0).toFixed(3)}V · check GPIO35)`
                : `${(telemetry.iBat ?? telemetry.rawTegCurrent ?? 0.0).toFixed(2)}A (zero: ${(telemetry.acsZero ?? 2.5).toFixed(3)}V)`}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
