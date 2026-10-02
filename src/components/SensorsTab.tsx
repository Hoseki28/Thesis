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
    ? (telemetry.loadPower > 0 ? Math.round(telemetry.loadPower * 12) : 229)
    : 0
  const tegWattage = telemetry.tegPower > 0 ? telemetry.tegPower.toFixed(1) : '38.0'

  // SVG Chart rendering
  const width = 340
  const height = 120
  const yTicks = [260, 195, 130, 65, 0]

  // Construct chart path using history points or mock curve
  const pointsToRender = historyPoints.length > 5
    ? historyPoints.slice(-12)
    : [
        { val: 230 },
        { val: 245 },
        { val: 240 },
        { val: 238 },
        { val: 248 },
        { val: 242 },
        { val: 230 },
      ]

  const chartStepX = width / Math.max(1, pointsToRender.length - 1)
  const pathD = pointsToRender
    .map((pt, i) => {
      const x = Math.round(i * chartStepX)
      const val = 'loadPower' in pt ? (pt as any).loadPower * 12 : pt.val
      const clamped = Math.max(0, Math.min(260, val))
      const y = Math.round(height - (clamped / 260) * (height - 20) - 10)
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
    </div>
  )
}
