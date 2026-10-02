import { useState } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { TelemetryHistoryManager, TelemetryStats } from '../services/telemetryHistory'
import { HardwareState, Lang, TelemetryPoint } from '../types/telemetry'
import {
  IconFileText,
  IconInfoCircle,
  IconAlertTriangle,
  IconXCircle,
  IconDownload,
  IconUsb,
} from './Icons'

interface LogsTabProps {
  bridge: HardwareBridge
  hardwareState: HardwareState
  historyManager: TelemetryHistoryManager
  points: TelemetryPoint[]
  stats: TelemetryStats
  lang: Lang
  theme?: 'dark' | 'light'
}

export function LogsTab({
  bridge,
  hardwareState,
  historyManager,
  points,
  stats,
  lang,
  theme = 'dark',
}: LogsTabProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isConnected = hardwareState.status === 'connected'
  const [exportedNotice, setExportedNotice] = useState<boolean>(false)
  const [showConsole, setShowConsole] = useState<boolean>(false)

  // Default event stream from UX Pilot mockup with multilingual support:
  const logEvents = [
    {
      id: '1',
      titleEn: 'System started successfully',
      titleFil: 'Matagumpay na nag-umpisa ang sistema',
      time: '2024-03-20 14:30',
      type: 'info',
    },
    {
      id: '2',
      titleEn: 'TEG temp rising above normal',
      titleFil: 'Tumaas ang temperatura ng TEG kaysa normal',
      time: '2024-03-20 15:45',
      type: 'warn',
    },
    {
      id: '3',
      titleEn: 'Cooling pump speed increased',
      titleFil: 'Tumaas ang bilis ng cooling pump',
      time: '2024-03-20 16:15',
      type: 'info',
    },
    {
      id: '4',
      titleEn: 'Battery level below 20%',
      titleFil: 'Mababa na sa 20% ang lebel ng baterya',
      time: '2024-03-20 18:00',
      type: 'error',
    },
  ]

  const handleExportCsv = () => {
    const ok = historyManager.exportCsv('padayon_biomass_teg_telemetry')
    if (ok) {
      setExportedNotice(true)
      setTimeout(() => setExportedNotice(false), 3000)
    }
  }

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h2 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
            {isFil ? 'MGA TALAAN NG SISTEMA' : 'SYSTEM LOGS'}
          </h2>
          <p className={`text-[11px] ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
            {isFil ? 'Kasalukuyang mga kaganapan' : 'Recent activity'}
          </p>
        </div>
        <IconFileText size={18} className={isDark ? 'text-[#9CA3AF]' : 'text-zinc-400'} />
      </div>

      {/* ── 1. COLOR-CODED STATUS LOG CARDS ──────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {logEvents.map((evt) => {
          const title = isFil ? evt.titleFil : evt.titleEn

          if (evt.type === 'info') {
            return (
              <div
                key={evt.id}
                className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-colors ${
                  isDark
                    ? 'bg-[#064E3B]/20 border-[#10B981]/50'
                    : 'bg-emerald-50/80 border-emerald-300'
                }`}
              >
                <IconInfoCircle size={18} className="text-[#10B981] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-[#10B981] block">
                    {title}
                  </span>
                  <span className={`text-[10px] font-mono mt-0.5 block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                    {evt.time}
                  </span>
                </div>
              </div>
            )
          }

          if (evt.type === 'warn') {
            return (
              <div
                key={evt.id}
                className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-colors ${
                  isDark
                    ? 'bg-[#78350F]/20 border-[#F59E0B]/50'
                    : 'bg-amber-50/80 border-amber-300'
                }`}
              >
                <IconAlertTriangle size={18} className="text-[#F59E0B] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-[#F59E0B] block">
                    {title}
                  </span>
                  <span className={`text-[10px] font-mono mt-0.5 block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                    {evt.time}
                  </span>
                </div>
              </div>
            )
          }

          return (
            <div
              key={evt.id}
              className={`rounded-2xl p-3.5 flex items-start gap-3 shadow-lg border transition-colors ${
                isDark
                  ? 'bg-[#7F1D1D]/20 border-[#EF4444]/50'
                  : 'bg-rose-50/80 border-rose-300'
              }`}
            >
              <IconXCircle size={18} className="text-[#EF4444] flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#EF4444] block">
                  {title}
                </span>
                <span className={`text-[10px] font-mono mt-0.5 block ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>
                  {evt.time}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 2. QUICK ACTIONS (CSV EXPORT & USB HARDWARE) ─────────────── */}
      <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
        <button
          type="button"
          onClick={handleExportCsv}
          className={`py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-lg min-h-[44px] ${
            isDark
              ? 'bg-[#13171B] hover:bg-[#1E242B] border-[#1E242B] text-[#00E676]'
              : 'bg-white hover:bg-zinc-50 border-zinc-200 text-emerald-600'
          }`}
        >
          <IconDownload size={14} />
          <span>{exportedNotice ? (isFil ? 'NAI-DOWNLOAD NA' : 'CSV DOWNLOADED') : (isFil ? 'I-DOWNLOAD ANG CSV' : 'EXPORT CSV')}</span>
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
          <span>{showConsole ? (isFil ? 'ITAGO ANG SERIAL' : 'HIDE TERMINAL') : (isFil ? 'BUKSAN ANG SERIAL' : 'USB SERIAL')}</span>
        </button>
      </div>

      {/* ── 3. EXPANDABLE HARDWARE SERIAL TERMINAL ────────────────────── */}
      {showConsole && (
        <section className={`rounded-2xl p-3.5 border flex flex-col gap-2.5 shadow-lg font-sans transition-colors ${
          isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
        }`}>
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>PORT: {hardwareState.portInfo}</span>
            <div className="flex items-center gap-2">
              <span className={isConnected ? 'text-[#00E676] font-bold' : 'text-zinc-400'}>
                {isConnected ? (isFil ? 'NAKABIT' : 'ONLINE') : (isFil ? 'STANDBY' : 'STANDBY')}
              </span>
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => bridge.disconnectSerial()}
                  className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase hover:bg-rose-500/30 cursor-pointer"
                >
                  {isFil ? 'PUTULIN' : 'DISCONNECT'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => bridge.connectSerial()}
                  className="px-2 py-0.5 rounded bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30 text-[10px] font-bold uppercase hover:bg-[#00E676]/30 cursor-pointer"
                >
                  {isFil ? 'IKABIT' : 'CONNECT'}
                </button>
              )}
            </div>
          </div>

          <div className={`p-2.5 rounded-xl border text-[10px] font-mono h-32 overflow-y-auto flex flex-col gap-1 ${
            isDark ? 'bg-[#0B0F12] border-[#1E242B] text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-800'
          }`}>
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
