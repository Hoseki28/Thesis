import { useState, useEffect } from 'react'
import { ConnectionStatus, Lang } from '../types/telemetry'
import {
  IconTranslate,
  IconSun,
  IconMoon,
  IconPhone,
  IconCheck,
  IconCopy,
  IconClock,
  IconUsb,
  IconBluetooth,
  IconWifi,
} from './Icons'

interface HeaderProps {
  lang: Lang
  onLanguageChange: (lang: Lang) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  status: ConnectionStatus
  hasAlert: boolean
  transport: string
  onOpenConnectionModal: () => void
}

export function Header({
  lang,
  onLanguageChange,
  theme,
  onToggleTheme,
  status,
  hasAlert,
  transport,
  onOpenConnectionModal,
}: HeaderProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'
  const isLive = status === 'connected'
  const isConnecting = status === 'connecting'
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  // Live Digital Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!showLinkModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLinkModal(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showLinkModal])

  const httpsUrl = 'https://design-energy-dashboard-pwa.vercel.app'
  const originUrl = typeof window !== 'undefined' ? window.location.origin : httpsUrl
  const showOriginCard = originUrl !== httpsUrl

  const handleCopy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(key)
      setTimeout(() => setCopiedLink(null), 2500)
    } catch {
      // fallback
    }
  }

  // Format strictly as 12-hour AM/PM Standard Time (never 24-hour military time) in Asia/Manila (PHT)
  const format12HourPHT = (date: Date): string => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).formatToParts(date)

      const hour = parts.find((p) => p.type === 'hour')?.value || '12'
      const minute = parts.find((p) => p.type === 'minute')?.value || '00'
      const second = parts.find((p) => p.type === 'second')?.value || '00'
      const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || (date.getHours() >= 12 ? 'PM' : 'AM')

      return `${hour}:${minute}:${second} ${dayPeriod}`
    } catch {
      // Fallback
      return date.toLocaleTimeString('en-US', { hour12: true })
    }
  }

  const timeFormatted = format12HourPHT(currentTime)

  const dateFormatted = currentTime.toLocaleDateString(isFil ? 'fil-PH' : 'en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <>
      <header
        className={`border-b sticky top-0 z-30 font-sans transition-colors pt-[env(safe-area-inset-top,0px)] ${
          isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-white border-zinc-200 shadow-sm'
        }`}
        role="banner"
      >
        {/* Top Header Row */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          {/* Left: Microcontroller Logo & Title */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center flex-shrink-0 shadow-sm p-0.5">
              <svg
                width="22"
                height="22"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-emerald-400"
                aria-label="Microcontroller chip icon"
              >
                <path d="M4 8h5l2 3h10l2-3h5" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                <path d="M4 24h5l2-3h10l2 3h5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                <line x1="2" y1="16" x2="6" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
                <line x1="26" y1="16" x2="30" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />

                <line x1="6" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="6" y1="19" x2="9" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="23" y1="13" x2="26" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="23" y1="19" x2="26" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="6" x2="13" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="19" y1="6" x2="19" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="13" y1="23" x2="13" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="19" y1="23" x2="19" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

                <rect x="9" y="9" width="14" height="14" rx="2" fill="#18181b" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="11.5" cy="11.5" r="0.9" fill="currentColor" />
                <rect x="12" y="12" width="8" height="8" rx="1" fill="#27272a" stroke="#10b981" strokeWidth="0.9" />
                <path d="M14 16h4M16 14v4" stroke="#34d399" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className={`text-sm font-black tracking-tight leading-none ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  TEG MONITORING
                </h1>
                <span
                  className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border leading-none ${
                    isDark
                      ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  }`}
                >
                  v2.0
                </span>
              </div>
              <span className={`text-[10px] leading-tight block font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                ESP32 BLE · USB Telemetry
              </span>
            </div>
          </div>

          {/* Right: Quick Action Controls */}
          <div className="flex items-center gap-1.5">
            {/* Phone Modal Link */}
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className={`p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center ${
                isDark ? 'text-zinc-400 hover:text-white hover:bg-[#1E242B]' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
              title="Mobile PWA Access"
              aria-label="Mobile Link"
            >
              <IconPhone size={16} />
            </button>

            {/* Translation Button */}
            <button
              type="button"
              onClick={() => onLanguageChange(lang === 'en' ? 'fil' : 'en')}
              className={`p-2 px-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 border min-h-[44px] ${
                isDark
                  ? 'text-zinc-300 hover:text-white hover:bg-[#1E242B] border-[#1E242B]'
                  : 'text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200'
              }`}
              title="Palitan ang Wika / Switch Language"
              aria-label="Toggle Language"
            >
              <IconTranslate size={15} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
              <span className={`text-[10px] font-bold font-mono uppercase ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                {lang === 'en' ? 'EN' : 'FIL'}
              </span>
            </button>

            {/* Theme Toggle Sun / Moon */}
            <button
              type="button"
              onClick={onToggleTheme}
              className={`p-2 rounded-lg transition-colors cursor-pointer border min-h-[44px] min-w-[44px] flex items-center justify-center ${
                isDark
                  ? 'text-zinc-300 hover:text-white hover:bg-[#1E242B] border-[#1E242B]'
                  : 'text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border-zinc-200'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Theme"
            >
              {isDark ? <IconSun size={16} className="text-amber-400" /> : <IconMoon size={16} className="text-zinc-700" />}
            </button>
          </div>
        </div>

        {/* Sub-bar: Live Clock & ESP32 Connection Status */}
        <div className={`px-4 py-2 border-t flex items-center justify-between transition-colors ${
          isDark ? 'bg-[#0E1216] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
        }`}>
          {/* Live Digital Clock (PHT) */}
          <div className="flex items-center gap-1.5">
            <IconClock size={13} className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} flex-shrink-0`} />
            <span className={`text-xs font-mono font-bold tabular-nums ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              {timeFormatted}{' '}
              <span className={`text-[10px] font-normal ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                PHT
              </span>
            </span>
            <span className={`text-[10px] hidden xs:inline ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              • {dateFormatted}
            </span>
          </div>

          {/* Interactive ESP32 Connection Pill Button */}
          {isLive ? (
            <button
              type="button"
              onClick={onOpenConnectionModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
                isDark
                  ? 'border-emerald-500/50 bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-300'
                  : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
              }`}
              title="ESP32 Nakakabit. Pindutin para pamahalaan."
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${
                  isDark ? 'bg-emerald-400' : 'bg-emerald-600'
                }`}
              />
              {transport === 'serial' && (
                <IconUsb size={13} className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} flex-shrink-0`} />
              )}
              {transport === 'bluetooth' && (
                <IconBluetooth size={13} className={`${isDark ? 'text-sky-400' : 'text-sky-700'} flex-shrink-0`} />
              )}
              {transport === 'websocket' && (
                <IconWifi size={13} className={`${isDark ? 'text-amber-400' : 'text-amber-700'} flex-shrink-0`} />
              )}
              <span className="font-bold">ESP32 LIVE ({transport.toUpperCase()})</span>
            </button>
          ) : isConnecting ? (
            <button
              type="button"
              onClick={onOpenConnectionModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
                isDark
                  ? 'border-amber-500/50 bg-amber-950/40 text-amber-300'
                  : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full animate-ping flex-shrink-0 ${isDark ? 'bg-amber-400' : 'bg-amber-600'}`} />
              <span>{isFil ? 'KUMUKONEKTA...' : 'CONNECTING...'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenConnectionModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
                isDark
                  ? 'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-emerald-500/50 hover:text-white'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-emerald-500 hover:text-zinc-900'
              }`}
              title={isFil ? 'Pindutin para ikabit ang ESP32' : 'Click to connect ESP32'}
            >
              <span className="w-2 h-2 rounded-full bg-zinc-400 flex-shrink-0" />
              <span>{isFil ? 'IKABIT ANG ESP32' : 'CONNECT ESP32'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Hyperlink Modal */}
      {showLinkModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in font-sans"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => setShowLinkModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl w-full max-w-sm p-5 border shadow-2xl flex flex-col gap-4 transition-colors ${
              isDark ? 'bg-[#13171B] border-[#1E242B] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-[#1E242B]' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-2">
                <IconPhone size={16} className={isDark ? 'text-[#00E676]' : 'text-emerald-700'} />
                <h3 id="modal-title" className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                  Mobile PWA Access
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className={`rounded-md flex items-center justify-center text-xs font-bold cursor-pointer min-h-[44px] min-w-[44px] transition-colors ${
                  isDark ? 'bg-[#1E242B] text-zinc-300 hover:text-white' : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900'
                }`}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}>
              {isFil
                ? 'Buksan ang dashboard na ito sa iyong cellphone browser para magamit bilang offline PWA app:'
                : 'Access this telemetry dashboard directly on your smartphone browser or install as a PWA:'}
            </p>

            {/* Production 24/7 HTTPS URL */}
            <div className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
              isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-[#00E676]' : 'text-emerald-700'}`}>
                24/7 ONLINE LIVE URL (RECOMMENDED)
              </span>
              <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
              }`}>
                <span className={`text-[11px] font-mono truncate select-all ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                  {httpsUrl}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(httpsUrl, 'https')}
                  className={`px-2.5 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors min-h-[44px] ${
                    isDark ? 'bg-[#0B0F12] hover:bg-[#1E242B] text-[#00E676]' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {copiedLink === 'https' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                  <span>{copiedLink === 'https' ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            {/* Current Browser Origin (shown only when running outside production domain) */}
            {showOriginCard && (
              <div className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-zinc-50 border-zinc-200'
              }`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  CURRENT BROWSER ORIGIN
                </span>
                <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
                  isDark ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
                }`}>
                  <span className={`text-[11px] font-mono truncate select-all ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                    {originUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(originUrl, 'origin')}
                    className={`px-2.5 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors min-h-[44px] ${
                      isDark ? 'bg-[#0B0F12] hover:bg-[#1E242B] text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                    }`}
                  >
                    {copiedLink === 'origin' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    <span>{copiedLink === 'origin' ? 'COPIED' : 'COPY'}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer min-h-[44px] ${
                isDark ? 'bg-[#1E242B] hover:bg-[#272A30] text-zinc-200' : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800'
              }`}
            >
              {isFil ? 'ISARA' : 'CLOSE'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
