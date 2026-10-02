import { Lang, TabId } from '../types/telemetry'
import {
  IconGrid,
  IconPulse,
  IconWrench,
  IconFileText,
} from './Icons'

interface BottomNavProps {
  currentTab: TabId
  onSelectTab: (tab: TabId) => void
  lang?: Lang
  theme?: 'dark' | 'light'
  hasAlert?: boolean
}

export function BottomNav({ currentTab, onSelectTab, lang = 'en', theme = 'dark', hasAlert = false }: BottomNavProps) {
  const isFil = lang === 'fil'
  const isDark = theme === 'dark'

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
    { id: 'overview', label: isFil ? 'Buod' : 'Overview', icon: IconGrid },
    { id: 'sensors', label: isFil ? 'Mga Sensor' : 'Sensors', icon: IconPulse },
    { id: 'calibration', label: isFil ? 'Serbisyo' : 'Service', icon: IconWrench },
    { id: 'logs', label: isFil ? 'Talaan' : 'Logs', icon: IconFileText },
  ]

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className={`fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 border-t px-3 py-2 shadow-2xl h-16 flex items-center justify-around font-sans transition-colors ${
        isDark ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-white border-zinc-200'
      }`}
    >
      <div className="grid grid-cols-4 gap-1 w-full items-center">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer relative min-h-[48px] ${
                isActive
                  ? 'text-[#00E676]'
                  : isDark
                  ? 'text-[#9CA3AF] hover:text-white'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Alert Indicator Dot */}
              {tab.id === 'overview' && hasAlert && (
                <span className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              )}

              <Icon
                size={19}
                className={`transition-transform duration-150 ${
                  isActive ? 'scale-110 text-[#00E676]' : isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                }`}
              />
              <span
                className={`text-[10px] font-bold mt-1 truncate max-w-full tracking-wide ${
                  isActive ? 'text-[#00E676] font-extrabold' : isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
