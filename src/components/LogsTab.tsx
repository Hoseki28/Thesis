import { useState, useRef, useEffect } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { TelemetryHistoryManager } from '../services/telemetryHistory'
import { systemLogManager } from '../services/systemLogService'
import {
  HardwareState,
  Lang,
  SystemLogEntry,
  SystemLogLevel,
} from '../types/telemetry'
import {
  IconFileText,
  IconCheckCircle,
  IconAlertTriangle,
  IconXCircle,
  IconDownload,
  IconUsb,
  IconRotateCcw,
} from './Icons'

interface LogsTabProps {
  bridge: HardwareBridge
  hardwareState: HardwareState
  historyManager: TelemetryHistoryManager
  logs: SystemLogEntry[]
  onAddLog?: (message: string, level: SystemLogLevel, messageFil?: string) => void
  onClearLogs?: () => void
  onExportCsv?: () => void
  lang: Lang
  theme?: 'dark' | 'light'
}

type FilterLevel = 'all' | 'info' | 'warning' | 'error'

export function LogsTab({
  bridge,
  hardwareState,
  logs,
  onClearLogs,
  onExportCsv,
  lang,
  theme = 'dark',
}: LogsTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isConnected = hardwareState.status === 'connected'

  const [filter, setFilter] = useState<FilterLevel>('all')
  const [exportedNotice, setExportedNotice] = useState<boolean>(false)
  const [showConsole, setShowConsole] = useState<boolean>(false)

  const listContainerRef = useRef<HTMLDivElement>(null)
  const prevLogsCountRef = useRef<number>(logs.length)

  // Gracefully auto-scroll to the latest log entry (top of buffer) when a new log arrives
  useEffect(() => {
    if (logs.length > prevLogsCountRef.current && listContainerRef.current) {
      listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLogsCountRef.current = logs.length
  }, [logs.length])

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true
    return log.level === filter
  })

  const counts = {
    all: logs.length,
    info: logs.filter((l) => l.level === 'info').length,
    warning: logs.filter((l) => l.level === 'warning').length,
    error: logs.filter((l) => l.level === 'error').length,
  }

  const handleExport = () => {
    if (onExportCsv) {
      onExportCsv()
    } else {
      systemLogManager.exportCsv('padayon_system_logs')
    }
    setExportedNotice(true)
    setTimeout(() => setExportedNotice(false), 3000)
  }

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {isFil ? 'MGA TALAAN NG SISTEMA' : 'SYSTEM LOGS'}
            </h2>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-tight tabular-nums ${
                isDark ? 'bg-[#1E242B] text-[#9CA3AF]' : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {logs.length}/50
            </span>
          </div>
          <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            PHT (UTC+8) • {isFil ? 'Aktibong talaan ng kaganapan' : 'Real-time telemetry buffer'}
          </p>
        </div>
        <IconFileText size={18} className={isDark ? 'text-[#9CA3AF]' : 'text-zinc-400'} />
      </div>

      {/* ── FILTER PILLS ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {(
          [
            { id: 'all', label: isFil ? 'LAHAT' : 'ALL', count: counts.all },
            { id: 'info', label: 'INFO', count: counts.info, dot: 'bg-emerald-400' },
            { id: 'warning', label: isFil ? 'BABALA' : 'WARN', count: counts.warning, dot: 'bg-amber-400' },
            { id: 'error', label: 'ERROR', count: counts.error, dot: 'bg-rose-400' },
          ] as const
        ).map((item) => {
          const isActive = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                isActive
                  ? isDark
                    ? 'bg-[#10B981] text-zinc-950 shadow-md'
                    : 'bg-emerald-600 text-white shadow-md'
                  : isDark
                  ? 'bg-[#13171B] text-[#9CA3AF] hover:text-white border border-[#1E242B]'
                  : 'bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200'
              }`}
            >
              {'dot' in item && item.dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-zinc-950' : item.dot}`} />
              )}
              <span>{item.label}</span>
              <span
                className={`text-[10px] font-mono px-1 rounded tabular-nums ${
                  isActive
                    ? 'bg-black/20 text-current'
                    : isDark
                    ? 'bg-zinc-800 text-zinc-400'
                    : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                {item.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── LOG ENTRIES VIEWPORT (BUFFER CAPPED AT 50) ───────────────── */}
      <div
        ref={listContainerRef}
        className="flex flex-col gap-2.5 max-h-[390px] overflow-y-auto pr-0.5 scroll-smooth"
      >
        {filteredLogs.length === 0 ? (
          <div
            className={`p-6 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 ${
              isDark ? 'bg-[#13171B] border-[#1E242B] text-[#9CA3AF]' : 'bg-white border-zinc-200 text-zinc-500'
            }`}
          >
            <IconFileText size={24} className="opacity-40" />
            <p className="text-xs font-medium">
              {isFil ? 'Walang nakitang talaan sa kategoryang ito.' : 'No system events recorded in this category.'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const message = isFil && log.messageFil ? log.messageFil : log.message

            if (log.level === 'info') {
              return (
                <article
                  key={log.id}
                  className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-all ${
                    isDark
                      ? 'bg-[#064E3B]/20 border-[#10B981]/50 text-[#10B981]'
                      : 'bg-emerald-50/90 border-emerald-300 text-emerald-800'
                  }`}
                >
                  <IconCheckCircle size={18} className="text-[#10B981] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#10B981]">
                        INFO
                      </span>
                      <time
                        dateTime={new Date(log.timestampMs).toISOString()}
                        className={`text-[10px] font-mono tabular-nums select-none ${
                          isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                        }`}
                      >
                        {log.timestamp}
                      </time>
                    </div>
                    <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                      {message}
                    </p>
                  </div>
                </article>
              )
            }

            if (log.level === 'warning') {
              return (
                <article
                  key={log.id}
                  className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-all ${
                    isDark
                      ? 'bg-[#78350F]/20 border-[#F59E0B]/50 text-[#F59E0B]'
                      : 'bg-amber-50/90 border-amber-300 text-amber-800'
                  }`}
                >
                  <IconAlertTriangle size={18} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B]">
                        WARNING
                      </span>
                      <time
                        dateTime={new Date(log.timestampMs).toISOString()}
                        className={`text-[10px] font-mono tabular-nums select-none ${
                          isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                        }`}
                      >
                        {log.timestamp}
                      </time>
                    </div>
                    <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                      {message}
                    </p>
                  </div>
                </article>
              )
            }

            return (
              <article
                key={log.id}
                className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-all ${
                  isDark
                    ? 'bg-[#7F1D1D]/20 border-[#EF4444]/50 text-[#EF4444]'
                    : 'bg-rose-50/90 border-rose-300 text-rose-800'
                }`}
              >
                <IconXCircle size={18} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#EF4444]/20 text-[#EF4444]">
                      ERROR
                    </span>
                    <time
                      dateTime={new Date(log.timestampMs).toISOString()}
                      className={`text-[10px] font-mono tabular-nums select-none ${
                        isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                      }`}
                    >
                      {log.timestamp}
                    </time>
                  </div>
                  <p className={`text-xs font-semibold leading-relaxed ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                    {message}
                  </p>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* ── ACTION BUTTONS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
        <button
          type="button"
          onClick={handleExport}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-lg min-h-[44px] ${
            isDark
              ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-[#00E676]'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-emerald-600'
          }`}
        >
          <IconDownload size={14} />
          <span>
            {exportedNotice
              ? isFil
                ? 'NAI-DOWNLOAD NA'
                : 'CSV DOWNLOADED'
              : isFil
              ? 'I-DOWNLOAD ANG CSV'
              : 'EXPORT CSV'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowConsole(!showConsole)}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-lg min-h-[44px] ${
            isDark
              ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-white'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-900'
          }`}
        >
          <IconUsb size={14} className="text-[#00E676]" />
          <span>
            {showConsole
              ? isFil
                ? 'ITAGO ANG SERIAL'
                : 'HIDE TERMINAL'
              : isFil
              ? 'BUKSAN ANG SERIAL'
              : 'USB SERIAL'}
          </span>
        </button>
      </div>

      {/* Secondary reset/clear action */}
      {logs.length > 0 && onClearLogs && (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={onClearLogs}
            className={`text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer py-1 px-2 rounded hover:underline ${
              isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <IconRotateCcw size={11} />
            <span>{isFil ? 'Linisin ang talaan' : 'Clear log buffer'}</span>
          </button>
        </div>
      )}

      {/* ── EXPANDABLE HARDWARE SERIAL TERMINAL ────────────────────────── */}
      {showConsole && (
        <section
          className={`rounded-2xl p-3.5 border flex flex-col gap-2.5 shadow-lg font-sans transition-colors ${
            isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="font-mono text-[11px]">PORT: {hardwareState.portInfo}</span>
            <div className="flex items-center gap-2">
              <span className={isConnected ? 'text-[#00E676] font-bold' : 'text-zinc-400'}>
                {isConnected ? (isFil ? 'NAKABIT' : 'ONLINE') : isFil ? 'STANDBY' : 'STANDBY'}
              </span>
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => bridge.disconnectSerial()}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase hover:bg-rose-500/30 cursor-pointer min-h-[30px]"
                >
                  {isFil ? 'PUTULIN' : 'DISCONNECT'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => bridge.connectSerial()}
                  className="px-2 py-0.5 rounded bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30 text-[10px] font-bold uppercase hover:bg-[#00E676]/30 cursor-pointer min-h-[30px]"
                >
                  {isFil ? 'IKABIT' : 'CONNECT'}
                </button>
              )}
            </div>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-[10px] font-mono h-32 overflow-y-auto flex flex-col gap-1 ${
              isDark ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-800'
            }`}
          >
            {hardwareState.rawLogs.length === 0 ? (
              <div className={`py-3 text-center text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {isFil
                  ? 'Aktibo ang Physics Simulation. Ikabit ang USB Serial para sa live hardware bytes.'
                  : 'Internal Physics Engine active. Connect USB Serial to view raw bytes.'}
              </div>
            ) : (
              hardwareState.rawLogs.slice(-25).map((log) => (
                <div key={log.id} className="break-all leading-tight">
                  <span className="text-[#9CA3AF] select-none mr-1.5">[{log.timestamp}]</span>
                  <span>{log.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
