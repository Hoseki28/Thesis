import { useState } from 'react'
import { CalibrationStudio } from './CalibrationStudio'
import { HardwareBridge } from '../services/hardwareBridge'
import { CalibrationConfig, Lang, TelemetryData } from '../types/telemetry'
import {
  IconHistory,
  IconCalendar,
  Check,
  Sliders,
  IconZap,
  IconRotateCcw,
  IconShield,
  IconVolume2,
  IconActivity,
} from './Icons'

interface ServiceTabProps {
  telemetry: TelemetryData
  calibration: CalibrationConfig
  lang: Lang
  theme?: 'dark' | 'light'
  bridge?: HardwareBridge | null
  onSaveCalibration: (updated: CalibrationConfig) => void
  onResetDefaults: () => void
  onSendToHardware?: (cal: CalibrationConfig) => Promise<boolean>
}

export function ServiceTab({
  telemetry,
  calibration,
  lang,
  theme = 'dark',
  bridge,
  onSaveCalibration,
  onResetDefaults,
  onSendToHardware,
}: ServiceTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isHardwareConnected = telemetry.source === 'hardware'

  const [cmdFeedback, setCmdFeedback] = useState<string | null>(null)

  const showFeedback = (msg: string) => {
    setCmdFeedback(msg)
    setTimeout(() => setCmdFeedback(null), 3000)
  }

  const handleCommand = async (action: string, fn: () => Promise<boolean> | void) => {
    if (!bridge) {
      showFeedback(isFil ? 'Nasa simulation mode' : 'In simulation mode')
      return
    }
    await fn()
    showFeedback(`${action} ${isFil ? 'ipinadala' : 'sent'}`)
  }

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

      {/* ── 3. ESP32 HARDWARE SERVICE ACTIONS & COMMANDS ────────── */}
      <section
        className={`rounded-2xl p-4 border flex flex-col gap-3 shadow-lg transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}
        aria-labelledby="hardware-actions-heading"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconZap size={16} className="text-[#00E676]" />
            <h3 id="hardware-actions-heading" className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'KONTROL NG HARDWARE (SERIAL)' : 'ESP32 CHARGER COMMANDS'}
            </h3>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
              isHardwareConnected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
            }`}
          >
            {isHardwareConnected ? (isFil ? 'LIVE LINK' : 'LIVE LINK') : (isFil ? 'SIMULASYON' : 'SIMULATION')}
          </span>
        </div>

        {cmdFeedback && (
          <div className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-fade-in">
            {cmdFeedback}
          </div>
        )}

        {/* Charge Mode Selector ('a', 'c', 'o') */}
        <div className="flex flex-col gap-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'MODO NG CHARGING' : 'CHARGING MODE OVERRIDE'}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Awtomatikong charging' : 'Auto charging', () => bridge?.sendAutoCharging())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 0 || telemetry.forceMode === undefined
                  ? isDark
                    ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                    : 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Awtomatiko' : 'Auto Mode'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'a'</span>
            </button>

            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Sapilitang ON' : 'Force charge ON', () => bridge?.sendForceChargingOn())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 1
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Sapilitang ON' : 'Force ON'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'c'</span>
            </button>

            <button
              type="button"
              onClick={() => handleCommand(isFil ? 'Sapilitang OFF' : 'Force charge OFF', () => bridge?.sendForceChargingOff())}
              className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 min-h-[44px] cursor-pointer transition-colors ${
                telemetry.forceMode === 2
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                  : isDark
                  ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <span>{isFil ? 'Sapilitang OFF' : 'Force OFF'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'o'</span>
            </button>
          </div>
        </div>

        {/* Diagnostic and Reset Grid */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Clear Overcurrent Latch ('r') */}
          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'I-clear ang overcurrent' : 'Clear overcurrent', () => bridge?.sendClearOvercurrent())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              telemetry.stateCode === 6 || telemetry.activeAlarms?.includes('A_OVERI')
                ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                : isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconShield size={14} className="text-amber-400 flex-shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'Clear Overcurrent' : 'Clear Overcurrent'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'r'</span>
            </div>
          </button>

          {/* Reset Energy Counters ('z') */}
          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'I-reset ang Wh' : 'Reset energy Wh', () => bridge?.sendResetEnergy())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconRotateCcw size={14} className="text-[#00E676] flex-shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'I-reset ang Wh' : 'Reset Energy Wh'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'z'</span>
            </div>
          </button>

          {/* Test Lamps & Buzzer ('t') */}
          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'Pagsusuri ng ilaw at buzzer' : 'LED and buzzer test', () => bridge?.sendTestLedsBuzzer())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconActivity size={14} className="text-cyan-400 flex-shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'Subukan ang Ilaw' : 'Test LEDs / Buzz'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 't' (2s)</span>
            </div>
          </button>

          {/* Mute/Unmute Buzzer ('m') */}
          <button
            type="button"
            onClick={() => handleCommand(isFil ? 'Mute/Unmute Buzzer' : 'Mute/Unmute buzzer', () => bridge?.sendMuteBuzzer())}
            className={`py-2 px-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer transition-colors ${
              isDark
                ? 'bg-[#0B0F12] border-[#272A30] text-zinc-300 hover:border-zinc-500'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-400'
            }`}
          >
            <IconVolume2 size={14} className="text-violet-400 flex-shrink-0" />
            <div className="flex flex-col text-left leading-tight">
              <span>{isFil ? 'I-mute ang Buzzer' : 'Mute Buzzer'}</span>
              <span className="text-[9px] font-mono opacity-70">Cmd: 'm'</span>
            </div>
          </button>
        </div>
      </section>

      {/* ── 4. EXPANDABLE ADVANCED SENSOR CALIBRATION DRAWER ──────────── */}
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
              bridge={bridge}
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
