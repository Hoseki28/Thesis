import { useState, useEffect } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { HardwareState, Lang } from '../types/telemetry'
import {
  IconUsb,
  IconBluetooth,
  IconCheckCircle,
  IconAlertTriangle,
} from './Icons'

interface ConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  bridge: HardwareBridge
  hardwareState: HardwareState
  lang: Lang
  theme: 'dark' | 'light'
}

type TransportTab = 'bluetooth' | 'wired'

export function ConnectionModal({
  isOpen,
  onClose,
  bridge,
  hardwareState,
  lang,
  theme,
}: ConnectionModalProps) {
  const isDark = theme === 'dark'
  const isFil = lang === 'fil'
  const isConnected = hardwareState.status === 'connected'
  const isConnecting = hardwareState.status === 'connecting'

  const [activeTab, setActiveTab] = useState<TransportTab>('bluetooth')
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState<boolean>(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isSerialSupported = bridge.isWebSerialSupported()
  const isBluetoothSupported = bridge.isWebBluetoothSupported()

  const handleConnectWired = async () => {
    bridge.setBaudRate(115200)
    const ok = await bridge.connectSerial(115200)
    if (ok) onClose()
  }

  const handleConnectBluetooth = async () => {
    const ok = await bridge.connectBluetooth()
    if (ok) onClose()
  }

  const handleConfirmDisconnect = () => {
    bridge.disconnectAll()
    setShowDisconnectConfirm(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connection-modal-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${
          isDark ? 'bg-[#12161A] border-[#222932] text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
        }`}
      >
        {/* Modal Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-[#222932] bg-[#0E1216]' : 'border-zinc-200 bg-zinc-50'
        }`}>
          <div>
            <h2 id="connection-modal-title" className="text-sm font-black uppercase tracking-wider">
              {isFil ? 'KONEKSYON NG ESP32' : 'ESP32 CONNECTION'}
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil
                ? 'Bluetooth BLE ("TEG_Charger") o Wired USB (115200 baud)'
                : 'Bluetooth BLE ("TEG_Charger") or Wired USB (115200 baud)'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg flex items-center justify-center text-xs font-bold transition-colors cursor-pointer min-h-[44px] min-w-[44px] ${
              isDark ? 'bg-[#1E242B] text-zinc-300 hover:text-white' : 'bg-zinc-200 text-zinc-700 hover:text-zinc-900'
            }`}
            aria-label={isFil ? 'Isara ang modal' : 'Close modal'}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 flex flex-col gap-3.5">
          {isConnected ? (
            <div
              className={`p-3.5 rounded-xl border flex flex-col gap-3 shadow-md ${
                isDark
                  ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconCheckCircle size={18} className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} flex-shrink-0`} />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {isFil ? 'NAKAKABIT ANG ESP32' : 'ESP32 CONNECTED'}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                    isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {hardwareState.transport === 'bluetooth' ? 'BLE UART' : 'USB SERIAL'}
                </span>
              </div>

              <div className={`grid grid-cols-2 gap-2 text-[11px] font-mono p-2.5 rounded-lg border ${
                isDark ? 'bg-black/30 border-emerald-500/20' : 'bg-white/80 border-emerald-200'
              }`}>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    Device
                  </span>
                  <span className="font-bold truncate block">
                    {hardwareState.deviceName || hardwareState.portInfo}
                  </span>
                </div>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    {isFil ? 'Packets' : 'Packets In'}
                  </span>
                  <span className="font-bold block tabular-nums">
                    {hardwareState.packetsReceived.toLocaleString()}
                  </span>
                </div>
              </div>

              {!showDisconnectConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  className={`w-full py-2.5 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer min-h-[44px] ${
                    isDark
                      ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                      : 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700'
                  }`}
                >
                  {isFil ? 'Putulin ang Koneksyon' : 'Disconnect ESP32'}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDisconnectConfirm(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer min-h-[44px] ${
                      isDark ? 'bg-[#1E242B] border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-700'
                    }`}
                  >
                    {isFil ? 'Kanselahin' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDisconnect}
                    className="py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase transition-colors cursor-pointer min-h-[44px]"
                  >
                    {isFil ? 'Putulin' : 'Disconnect'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
                isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-100 border-zinc-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveTab('bluetooth')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'bluetooth'
                      ? isDark
                        ? 'bg-[#1E242B] text-sky-400 shadow-sm'
                        : 'bg-white text-sky-700 shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <IconBluetooth size={15} />
                  <span className="text-[11px] uppercase">Bluetooth BLE</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('wired')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'wired'
                      ? isDark
                        ? 'bg-[#1E242B] text-[#00E676] shadow-sm'
                        : 'bg-white text-emerald-700 shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <IconUsb size={15} />
                  <span className="text-[11px] uppercase">Wired USB</span>
                </button>
              </div>

              {activeTab === 'bluetooth' && (
                <div className="flex flex-col gap-3">
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-[11px] uppercase tracking-wider ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                        BLE UART · TEG_Charger
                      </span>
                      <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        Nordic UART
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {isFil
                        ? 'Buksan ang Bluetooth ng phone o laptop, pindutin ang button sa ibaba, at piliin ang "TEG_Charger" sa popup.'
                        : 'Turn on Bluetooth on your phone or PC, click the button below, and select "TEG_Charger" from the popup.'}
                    </p>
                    {!isBluetoothSupported && (
                      <span className={`text-[10.5px] font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        {isFil
                          ? 'Gumamit ng Chrome o Edge browser para sa Web Bluetooth.'
                          : 'Use Chrome or Edge browser for Web Bluetooth support.'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!isBluetoothSupported || isConnecting}
                    onClick={handleConnectBluetooth}
                    className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg min-h-[46px]"
                  >
                    <IconBluetooth size={16} />
                    <span>
                      {isConnecting
                        ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                        : (isFil ? 'IKABIT ANG BLUETOOTH (TEG_CHARGER)' : 'CONNECT BLUETOOTH (TEG_CHARGER)')}
                    </span>
                  </button>
                </div>
              )}

              {activeTab === 'wired' && (
                <div className="flex flex-col gap-3">
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-[11px] uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        USB Serial · 115200 Baud
                      </span>
                      <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        Web Serial
                      </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {isFil
                        ? 'Isaksak ang ESP32 gamit ang USB data cable sa laptop o PC at piliin ang COM port.'
                        : 'Plug the ESP32 via USB data cable into your laptop or PC and select the COM port.'}
                    </p>
                    {!isSerialSupported && (
                      <span className={`text-[10.5px] font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        {isFil
                          ? 'Sa desktop Chrome o Edge lang gumagana ang Wired USB. Gamitin ang Bluetooth BLE sa mobile.'
                          : 'Wired USB requires desktop Chrome or Edge. Use Bluetooth BLE on mobile.'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!isSerialSupported || isConnecting}
                    onClick={handleConnectWired}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg min-h-[46px]"
                  >
                    <IconUsb size={16} />
                    <span>
                      {isConnecting
                        ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                        : (isFil ? 'IKABIT ANG USB SERIAL' : 'CONNECT USB SERIAL')}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Last Error Message if any */}
          {hardwareState.lastError && (
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                isDark
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-rose-50 border-rose-300 text-rose-700'
              }`}
            >
              <IconAlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span className="leading-tight">{hardwareState.lastError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between text-xs ${
          isDark ? 'border-[#222932] bg-[#0E1216]' : 'border-zinc-200 bg-zinc-50'
        }`}>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? isDark ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-600 animate-pulse'
                  : isConnecting
                  ? isDark ? 'bg-amber-400 animate-ping' : 'bg-amber-600 animate-ping'
                  : 'bg-zinc-500'
              }`}
            />
            <span
              className={`text-[11px] font-mono font-bold uppercase ${
                isConnected
                  ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                  : isDark ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              {isConnected
                ? (isFil ? 'NAKAKABIT SA ESP32' : 'ESP32 ONLINE')
                : isConnecting
                ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                : (isFil ? 'HINDI NAKAKABIT' : 'DISCONNECTED')}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer min-h-[44px] min-w-[64px] ${
              isDark ? 'bg-[#1E242B] border-zinc-700 text-zinc-300 hover:text-white' : 'bg-white border-zinc-300 text-zinc-700 hover:text-zinc-900'
            }`}
          >
            {isFil ? 'Isara' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
