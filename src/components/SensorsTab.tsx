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

export function SensorsTab({ telemetry, calibration, historyPoints = [], lang, theme = 'dark' }: SensorsTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'

  // Voltage reading
  const batteryVoltage = telemetry.batteryVoltage || 13.19

  // Power values
  const loadWattage = telemetry.relays.dcBus
    ? Math.round(telemetry.loadPower)
    : 0
  const tegWattage = telemetry.tegPower > 0 ? telemetry.tegPower.toFixed(1) : '0.0'

  // SVG Chart rendering (0 to 40W load scale)
  const width = 340
  const height = 120
  const yTicks = [40, 30, 20, 10, 0]

  // Construct chart path using history points or baseline
  const pointsToRender = historyPoints.length > 5
    ? historyPoints.slice(-12)
    : [
        { val: 21.8 },
        { val: 21.8 },
        { val: 16.8 },
        { val: 21.8 },
        { val: 21.8 },
        { val: 16.8 },
        { val: 21.8 },
      ]

  const chartStepX = width / Math.max(1, pointsToRender.length - 1)
  const pathD = pointsToRender
    .map((pt, i) => {
      const x = Math.round(i * chartStepX)
      const rawVal = 'loadPower' in pt ? (pt as any).loadPower : pt.val
      const val = Number.isFinite(rawVal) ? rawVal : 0
      const clamped = Math.max(0, Math.min(40, val))
      const y = Math.round(height - (clamped / 40) * (height - 20) - 10)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

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

      {/* ── 1. BATTERY VOLTAGE CARD ─────────────────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-2 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="battery-voltage-heading"
      >
        <div className="flex items-center justify-between">
          <span id="battery-voltage-heading" className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'BOLTAHE NG BATERYA' : 'BATTERY VOLTAGE'}
          </span>
          {/* Gauge Icon */}
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#00E676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 0-10 10c0 4.42 2.87 8.17 6.84 9.5.45.08.66-.2.66-.44v-1.7" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        <div className="flex items-baseline mt-1">
          <span className={`text-3xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
            {batteryVoltage.toFixed(2)}
          </span>
          <span className={`text-xs font-bold ml-2 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>V DC</span>
        </div>
      </section>

      {/* ── 2. POWER TREND (5M) CHART CARD ──────────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-2.5 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="power-trend-heading"
      >
        <div className="flex items-center justify-between">
          <span id="power-trend-heading" className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'DALOY NG KURYENTE (5M)' : 'POWER TREND (5M)'}
          </span>
        </div>

        {/* Chart Viewport */}
        <div className="relative w-full pt-1">
          <svg viewBox={`0 0 ${width + 36} ${height + 24}`} className="w-full h-auto overflow-visible">
            {/* Y-Axis labels & Grid lines */}
            {yTicks.map((tick) => {
              const y = Math.round(height - (tick / 260) * (height - 20) - 10)
              return (
                <g key={tick}>
                  <text
                    x="24"
                    y={y + 3}
                    textAnchor="end"
                    fill={isDark ? '#6B7280' : '#9CA3AF'}
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {tick}
                  </text>
                  <line
                    x1="32"
                    y1={y}
                    x2={width + 32}
                    y2={y}
                    stroke={isDark ? '#1E242B' : '#E5E7EB'}
                    strokeDasharray="3 3"
                  />
                </g>
              )
            })}

            {/* Signal Path in Emerald Green */}
            <g transform="translate(32, 0)">
              <path
                d={pathD}
                fill="none"
                stroke="#00E676"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>

            {/* X-Axis Timestamps */}
            <g transform={`translate(32, ${height + 14})`}>
              {['10:00', '10:05', '10:10', '10:15', '10:20'].map((timeStr, idx) => (
                <text
                  key={timeStr}
                  x={Math.round((idx / 4) * width)}
                  y="0"
                  textAnchor="middle"
                  fill={isDark ? '#6B7280' : '#9CA3AF'}
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {timeStr}
                </text>
              ))}
            </g>
          </svg>
        </div>
      </section>

      {/* ── 3. LOAD & TEG GEN METRIC TILES ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* LOAD */}
        <div className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[95px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'KARGA' : 'LOAD'}
            </span>
            <IconZap size={16} className="text-[#00E676]" />
          </div>
          <div className="flex items-baseline mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {loadWattage}
            </span>
            <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
          </div>
        </div>

        {/* TEG GEN */}
        <div className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[95px] shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
              {isFil ? 'LIKHANG TEG' : 'TEG GEN'}
            </span>
            <IconFlame size={16} className="text-[#00E676]" />
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
            {isFil ? '4-CHANNEL LOAD CONTROLLER (INA219 / RELAYS)' : '4-CHANNEL LOAD CONTROLLER'}
          </span>
          <span className="text-[9px] font-mono font-bold text-[#00E676] px-1.5 py-0.5 rounded bg-[#00E676]/10">
            2-TIER ARQUITECTURA
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {(
            telemetry.loadChannels || [
              { id: 1, name: '12V LED Critical Light', active: true, sheddable: false, currentMa: 400 },
              { id: 2, name: 'Cold-Side Water Fan', active: telemetry.relays?.fans ?? true, sheddable: true, currentMa: 1000 },
              { id: 3, name: 'Hopper Fuel Feed Servo', active: false, sheddable: true, currentMa: 0 },
              { id: 4, name: '5V USB Charging Ports', active: telemetry.relays?.fans ?? true, sheddable: true, currentMa: 415 },
            ]
          ).map((ch) => (
            <div
              key={ch.id}
              className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    ch.active
                      ? ch.sheddable
                        ? 'bg-emerald-400'
                        : 'bg-[#00E676] animate-pulse'
                      : 'bg-zinc-600'
                  }`}
                />
                <div>
                  <span className={`text-[11px] font-bold block ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    CH{ch.id}: {ch.name}
                  </span>
                  <span className={`text-[8.5px] font-mono block ${
                    !ch.sheddable ? 'text-[#00E676] font-bold' : isDark ? 'text-zinc-500' : 'text-zinc-400'
                  }`}>
                    {!ch.sheddable
                      ? (isFil ? 'PANGUNAHIN (TIER 1) · NON-SHEDDABLE' : 'PRIMARY (TIER 1) · NON-SHEDDABLE')
                      : (isFil ? 'PANGALAWANG (TIER 2) · SHEDDABLE' : 'AUXILIARY (TIER 2) · SHEDDABLE')}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className={`text-xs font-mono font-black block tabular-nums ${
                  ch.active ? (isDark ? 'text-white' : 'text-zinc-900') : 'text-zinc-500'
                }`}>
                  {ch.currentMa} mA
                </span>
                <span className={`text-[8.5px] font-mono font-bold uppercase ${
                  ch.active ? 'text-[#00E676]' : 'text-zinc-500'
                }`}>
                  {ch.active ? (isFil ? 'BUKAS' : 'ACTIVE') : (isFil ? 'SARADO' : 'OFF')}
                </span>
              </div>
            </div>
          ))}
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
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>MAX31855</span>
            <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {telemetry.stoveTemp.toFixed(1)}°C Hot Face
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>MQ-7 (CO PPM)</span>
            <span className={telemetry.safety?.coAlert ? 'text-rose-400 font-bold' : isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {(telemetry.safety?.coPpm ?? telemetry.rawCoPpm ?? 12.4).toFixed(1)} PPM
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>DHT22 (Ambient)</span>
            <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {(telemetry.ambient?.tempC ?? telemetry.ambientTemp ?? 28.5).toFixed(1)}°C / {(telemetry.ambient?.humidityPct ?? telemetry.humidity ?? 68.0).toFixed(0)}%
            </span>
          </div>

          <div className={`p-2 rounded-lg border ${isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200'}`}>
            <span className={`block font-bold ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>INA219 (Shunt)</span>
            <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>
              {telemetry.batteryCurrentSigned >= 0 ? '+' : ''}{telemetry.batteryCurrentSigned.toFixed(2)}A Signed
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
