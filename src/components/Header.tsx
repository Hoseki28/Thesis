import { useState } from 'react'
import { ConnectionStatus, Lang } from '../types/telemetry'
import { IconZap, IconTranslate, IconSun, IconMoon, IconPhone, IconCheck, IconCopy } from './Icons'

interface HeaderProps {
  lang: Lang
  onLanguageChange: (lang: Lang) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: ConnectionStatus
  hasAlert: boolean
  transport: string
  onOpenHardwareTab: () => void
}

export function Header({
  lang,
  onLanguageChange,
  theme,
  onToggleTheme,
  status,
  hasAlert,
  transport,
  onOpenHardwareTab,
}: HeaderProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isLive = status === 'connected'
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  const httpsUrl = 'https://design-energy-dashboard-pwa.vercel.app'
  const localUrl = 'http://192.168.100.9:5173/'

  const handleCopy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(key)
      setTimeout(() => setCopiedLink(null), 2500)
    } catch {
      // fallback
    }
  }

  return (
    <>
      <header
        className={`px-4 pt-3.5 pb-2.5 border-b sticky top-0 z-30 font-sans transition-colors ${
          isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-white border-zinc-200 shadow-sm'
        }`}
        role="banner"
      >
        <div className="flex items-center justify-between">
          {/* Left: 8-Pin QFP Microcontroller Chip with PCB Seebeck Traces + Title Stack */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-sm p-0.5">
              <svg
                width="24"
                height="24"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-emerald-400"
                aria-label="8-pin QFP Microcontroller with Seebeck traces"
              >
                {/* PCB Seebeck Thermocouple Traces (Hot & Cold Differential Lines) */}
                <path d="M4 8h5l2 3h10l2-3h5" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
                <path d="M4 24h5l2-3h10l2 3h5" stroke="#38bdf8" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
                <line x1="2" y1="16" x2="6" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
                <line x1="26" y1="16" x2="30" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />

                {/* 8-Pin QFP Package Leads (2 pins on each of 4 edges) */}
                <line x1="6" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6" y1="19" x2="9" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="23" y1="13" x2="26" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="23" y1="19" x2="26" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="6" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="19" y1="6" x2="19" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="23" x2="13" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="19" y1="23" x2="19" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

                {/* QFP Chip Body */}
                <rect x="9" y="9" width="14" height="14" rx="2" fill="#18181b" stroke="currentColor" strokeWidth="1.4" />

                {/* Pin 1 Index Indicator */}
                <circle cx="11.5" cy="11.5" r="0.9" fill="currentColor" />

                {/* Internal Silicon Die / Thermocouple Core Junction */}
                <rect x="12" y="12" width="8" height="8" rx="1" fill="#27272a" stroke="#10b981" strokeWidth="0.9" />
                <path d="M14 16h4M16 14v4" stroke="#34d399" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className={`text-sm font-black tracking-tight leading-none ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  B-TEG CORE
                </h1>
                <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border leading-none bg-emerald-950/60 border-emerald-500/40 text-emerald-400">
                  v2.0
                </span>
              </div>
              <span className={`text-[10px] leading-tight block font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Node #01 • Upper Wawa Dam
              </span>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5">
            {/* Phone Modal Link */}
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isDark ? 'text-[#9CA3AF] hover:text-white hover:bg-[#1E242B]' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
              title="Mobile PWA Hyperlink"
              aria-label="Mobile Link"
            >
              <IconPhone size={16} />
            </button>

            {/* Translation Button */}
            <button
              type="button"
              onClick={() => onLanguageChange(lang === 'en' ? 'fil' : 'en')}
              className={`p-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border ${
                isDark
                  ? 'text-[#9CA3AF] hover:text-white hover:bg-[#1E242B] border-[#1E242B]'
                  : 'text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200'
              }`}
              title="Palitan ang Wika / Switch Language"
              aria-label="Toggle Language"
            >
              <IconTranslate size={15} className="text-[#00E676]" />
              <span className={`text-[10px] font-bold font-mono uppercase ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {lang === 'en' ? 'EN' : 'FIL'}
              </span>
            </button>

            {/* Theme Toggle Sun / Moon */}
            <button
              type="button"
              onClick={onToggleTheme}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                isDark
                  ? 'text-[#9CA3AF] hover:text-white hover:bg-[#1E242B] border-[#1E242B]'
                  : 'text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Theme"
            >
              {isDark ? <IconSun size={16} className="text-amber-400" /> : <IconMoon size={16} className="text-zinc-700" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Hyperlink Modal */}
      {showLinkModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="bg-[#13171B] border border-[#1E242B] rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E242B]">
              <div className="flex items-center gap-2">
                <IconPhone size={16} className="text-[#00E676]" />
                <h3 id="modal-title" className="text-sm font-black text-white uppercase tracking-wider">
                  Mobile PWA Access
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="w-6 h-6 rounded-md bg-[#1E242B] text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#9CA3AF]">
              {isFil
                ? 'Buksan ang dashboard na ito sa iyong cellphone browser para magamit bilang offline PWA app:'
                : 'Access this telemetry dashboard directly on your smartphone browser or install as a PWA:'}
            </p>

            {/* Production 24/7 HTTPS URL */}
            <div className="p-3 rounded-xl bg-[#0B0F12] border border-[#1E242B] flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-[#00E676] uppercase tracking-wider">
                24/7 ONLINE LIVE URL (RECOMMENDED)
              </span>
              <div className="flex items-center justify-between gap-2 bg-[#13171B] px-2.5 py-1.5 rounded-lg border border-[#1E242B]">
                <span className="text-[11px] text-zinc-300 font-mono truncate select-all">
                  {httpsUrl}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(httpsUrl, 'https')}
                  className="px-2 py-1 rounded bg-[#0B0F12] hover:bg-[#1E242B] text-[10px] text-[#00E676] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedLink === 'https' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  <span>{copiedLink === 'https' ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            {/* Local Wi-Fi URL */}
            <div className="p-3 rounded-xl bg-[#0B0F12] border border-[#1E242B] flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                LOCAL WI-FI (OFFLINE FIELD BENCH)
              </span>
              <div className="flex items-center justify-between gap-2 bg-[#13171B] px-2.5 py-1.5 rounded-lg border border-[#1E242B]">
                <span className="text-[11px] text-zinc-300 font-mono truncate select-all">
                  {localUrl}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(localUrl, 'local')}
                  className="px-2 py-1 rounded bg-[#0B0F12] hover:bg-[#1E242B] text-[10px] text-zinc-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedLink === 'local' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  <span>{copiedLink === 'local' ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#1E242B] hover:bg-[#272A30] text-zinc-200 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  )
}
