import { useState } from 'react'
import { CalibrationStudio } from './CalibrationStudio'
import { CalibrationConfig, Lang, TelemetryData } from '../types/telemetry'
import {
  IconHistory,
  IconCalendar,
  Check,
  Sliders,
} from './Icons'

interface ServiceTabProps {
  telemetry: TelemetryData
  calibration: CalibrationConfig
  lang: Lang
  theme?: 'dark' | 'light'
  onSaveCalibration: (updated: CalibrationConfig) => void
  onResetDefaults: () => void
  onSendToHardware?: (cal: CalibrationConfig) => Promise<boolean>
}

export function ServiceTab({
  telemetry,
  calibration,
  lang,
  theme = 'dark',
  onSaveCalibration,
  onResetDefaults,
  onSendToHardware,
}: ServiceTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'

  // Interactive Checklist states
  const [tasks, setTasks] = useState([
    {
      id: 'heatsink',
      labelEn: 'Clean TEG Heat Sink',
      labelFil: 'Linisin ang TEG Heat Sink',
      done: true,
    },
    {
      id: 'terminals',
      labelEn: 'Check Battery Terminals',
      labelFil: 'Suriin ang mga Terminal ng Baterya',
      done: true,
    },
    {
      id: 'cooling',
      labelEn: 'Inspect Cooling Pipes',
      labelFil: 'Suriin ang mga Tubo ng Pampalamig',
      done: false,
    },
    {
      id: 'load',
      labelEn: 'Verify Load Connections',
      labelFil: 'Tiyakin ang mga Koneksyon ng Karga',
      done: false,
    },
  ])

  const [showAdvancedCal, setShowAdvancedCal] = useState<boolean>(false)

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    )
  }

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="pb-1">
        <h2 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
          {isFil ? 'PANGANGALAGA AT SERBISYO' : 'MAINTENANCE'}
        </h2>
        <p className={`text-[11px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
          {isFil ? 'Lingguhang mga gawain sa pagsusuri' : 'Weekly inspection tasks'}
        </p>
      </div>

      {/* ── 1. WEEKLY INSPECTION CHECKLIST CARD ──────────────────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="inspection-tasks-heading"
      >
        <div className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => toggleTask(task.id)}
              className={`flex items-center gap-3 p-2 rounded-xl transition-colors cursor-pointer text-left w-full ${
                isDark ? 'hover:bg-[#1E242B]/40' : 'hover:bg-zinc-100'
              }`}
            >
              {/* Rounded Green Checkbox */}
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all border ${
                  task.done
                    ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                    : isDark
                    ? 'bg-[#0B0F12] border-[#272A30] text-transparent'
                    : 'bg-zinc-100 border-zinc-300 text-transparent'
                }`}
              >
                {task.done && <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />}
              </div>

              {/* Task Label */}
              <span
                className={`text-xs font-bold transition-colors ${
                  task.done
                    ? isDark ? 'text-white' : 'text-zinc-900'
                    : isDark ? 'text-[#9CA3AF]' : 'text-zinc-400 line-through'
                }`}
              >
                {isFil ? task.labelFil : task.labelEn}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 2. SERVICE HISTORY 2-COLUMN TILES ────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* LAST SERVICE */}
        <div className={`rounded-2xl p-4 border flex flex-col items-center justify-center text-center gap-1 shadow-lg min-h-[100px] transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <IconHistory size={18} className="text-[#00E676]" />
          <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'HULING SERBISYO' : 'LAST SERVICE'}
          </span>
          <span className={`text-base sm:text-lg font-black font-mono tabular-nums mt-0.5 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
            1,200 hrs
          </span>
        </div>

        {/* NEXT SERVICE */}
        <div className={`rounded-2xl p-4 border flex flex-col items-center justify-center text-center gap-1 shadow-lg min-h-[100px] transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <IconCalendar size={18} className="text-[#00E676]" />
          <span className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'SUSUNOD NA SERBISYO' : 'NEXT SERVICE'}
          </span>
          <span className={`text-base sm:text-lg font-black font-mono tabular-nums mt-0.5 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
            1,500 hrs
          </span>
        </div>
      </div>

      {/* ── 3. EXPANDABLE ADVANCED SENSOR CALIBRATION DRAWER ──────────── */}
      <section className={`rounded-2xl p-4 border flex flex-col gap-2.5 shadow-lg mt-1 font-sans transition-colors ${
        isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
            {isFil ? 'Kalibrasyon ng Sensor' : 'Sensor Calibration'}
          </span>
          <button
            type="button"
            onClick={() => setShowAdvancedCal(!showAdvancedCal)}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{showAdvancedCal ? (isFil ? 'Itago ang Studio' : 'Hide Studio') : (isFil ? 'Buksan ang Studio' : 'Open Studio')}</span>
          </button>
        </div>

        {showAdvancedCal && (
          <div className={`pt-2 border-t ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
            <CalibrationStudio
              config={calibration}
              currentTelemetry={telemetry}
              lang={lang}
              theme={theme}
              onSaveCalibration={onSaveCalibration}
              onResetDefaults={onResetDefaults}
              onSendToHardware={onSendToHardware}
            />
          </div>
        )}
      </section>
    </div>
  )
}
