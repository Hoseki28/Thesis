import { useState } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { HardwareState, Lang } from '../types/telemetry'
import {
  IconUsb,
  IconBluetooth,
  IconWifi,
  IconCheckCircle,
  IconAlertTriangle,
  IconRotateCcw,
} from './Icons'

interface ConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  bridge: HardwareBridge
  hardwareState: HardwareState
  lang: Lang
  theme: 'dark' | 'light'
}

type TransportTab = 'wired' | 'bluetooth' | 'wifi'

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

  const [activeTab, setActiveTab] = useState<TransportTab>('wired')
  const [baudRate, setBaudRate] = useState<number>(hardwareState.baudRate || 115200)
  const [wifiUrl, setWifiUrl] = useState<string>('ws://192.168.4.1/ws')
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState<boolean>(false)

  if (!isOpen) return null

  const isSerialSupported = bridge.isWebSerialSupported()
  const isBluetoothSupported = bridge.isWebBluetoothSupported()

  const handleConnectWired = async () => {
    bridge.setBaudRate(baudRate)
    await bridge.connectSerial(baudRate)
  }

  const handleConnectBluetooth = async () => {
    await bridge.connectBluetooth()
  }

  const handleConnectWifi = () => {
    bridge.connectWebSocket(wifiUrl.trim())
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
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-colors ${
          isDark ? 'bg-[#12161A] border-[#222932] text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
        }`}
      >
        {/* Modal Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isDark ? 'border-[#222932] bg-[#0E1216]' : 'border-zinc-200 bg-zinc-50'
        }`}>
          <div>
            <h2 id="connection-modal-title" className="text-sm font-black uppercase tracking-wider">
              {isFil ? 'KONEKSYON NG ESP32' : 'ESP32 CONNECTION HUB'}
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              {isFil
                ? 'Pumili sa Wired USB, Bluetooth BLE, o Wi-Fi'
                : 'Select Wired USB, Bluetooth BLE, or Wi-Fi'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors cursor-pointer min-h-[44px] min-w-[44px] ${
              isDark ? 'bg-[#1E242B] text-zinc-400 hover:text-white' : 'bg-zinc-200 text-zinc-600 hover:text-zinc-900'
            }`}
            aria-label={isFil ? 'Isara ang modal' : 'Close modal'}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {/* ── 1. LIVE CONFIRMATION CARD (When Connected) ──────────────── */}
          {isConnected && (
            <div
              className={`p-4 rounded-xl border flex flex-col gap-3 shadow-md ${
                isDark
                  ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconCheckCircle size={20} className="text-emerald-500 flex-shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {isFil ? 'KUMPIRMADO: NAKAKABIT ANG ESP32' : 'CONFIRMED: ESP32 CONNECTED'}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                  {hardwareState.transport.toUpperCase()}
                </span>
              </div>

              <div className={`grid grid-cols-2 gap-2 text-[11px] font-mono p-2.5 rounded-lg border ${
                isDark ? 'bg-black/30 border-emerald-500/20' : 'bg-white/70 border-emerald-200'
              }`}>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {isFil ? 'Kagamitan' : 'Device'}
                  </span>
                  <span className="font-bold truncate block">
                    {hardwareState.deviceName || hardwareState.portInfo}
                  </span>
                </div>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {isFil ? 'Bilis ng Signal' : 'Latency'}
                  </span>
                  <span className="font-bold block tabular-nums">
                    {hardwareState.latencyMs ? `${hardwareState.latencyMs} ms` : 'Live (10 Hz)'}
                  </span>
                </div>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {isFil ? 'Napasok na Packets' : 'Packets In'}
                  </span>
                  <span className="font-bold block tabular-nums">
                    {hardwareState.packetsReceived.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className={`block text-[9px] uppercase ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {isFil ? 'Huling Datos' : 'Last Packet'}
                  </span>
                  <span className="font-bold block tabular-nums">
                    {hardwareState.lastPacketTime
                      ? `${Math.max(0, Math.round((Date.now() - hardwareState.lastPacketTime) / 100) / 10)}s nakalipas`
                      : 'Aktibo'}
                  </span>
                </div>
              </div>

              {/* Disconnect Action */}
              {!showDisconnectConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="w-full py-2.5 px-3 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer min-h-[44px]"
                >
                  {isFil ? 'Putulin ang Koneksyon (Disconnect)' : 'Disconnect Hardware'}
                </button>
              ) : (
                <div className={`p-3 rounded-lg border flex flex-col gap-2 ${
                  isDark ? 'bg-rose-950/30 border-rose-500/40' : 'bg-rose-50 border-rose-300'
                }`}>
                  <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold">
                    <IconAlertTriangle size={15} />
                    <span>{isFil ? 'Kumpirmahin ang pagputol?' : 'Confirm Disconnect?'}</span>
                  </div>
                  <p className={`text-[10px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    {isFil
                      ? 'Babalik ang dashboard sa internal physics simulation mode.'
                      : 'Dashboard will fall back to internal physics simulation mode.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setShowDisconnectConfirm(false)}
                      className={`py-2 px-3 rounded text-[11px] font-bold border transition-colors cursor-pointer min-h-[44px] ${
                        isDark ? 'bg-[#1E242B] border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-700'
                      }`}
                    >
                      {isFil ? 'Huwag muna' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDisconnect}
                      className="py-2 px-3 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold uppercase transition-colors cursor-pointer min-h-[44px]"
                    >
                      {isFil ? 'Oo, Putulin' : 'Yes, Disconnect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 2. TRANSPORT TABS SELECTOR ──────────────────────────────── */}
          {!isConnected && (
            <>
              <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl border ${
                isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-100 border-zinc-200'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveTab('wired')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'wired'
                      ? isDark
                        ? 'bg-[#1E242B] text-[#00E676] shadow-sm'
                        : 'bg-white text-emerald-700 shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <IconUsb size={16} />
                  <span className="text-[10px] uppercase">{isFil ? 'Wired USB' : 'Wired USB'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('bluetooth')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'bluetooth'
                      ? isDark
                        ? 'bg-[#1E242B] text-sky-400 shadow-sm'
                        : 'bg-white text-sky-700 shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <IconBluetooth size={16} />
                  <span className="text-[10px] uppercase">Bluetooth</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('wifi')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-colors cursor-pointer min-h-[44px] ${
                    activeTab === 'wifi'
                      ? isDark
                        ? 'bg-[#1E242B] text-amber-400 shadow-sm'
                        : 'bg-white text-amber-700 shadow-sm'
                      : isDark
                      ? 'text-zinc-400 hover:text-white'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <IconWifi size={16} />
                  <span className="text-[10px] uppercase">Wi-Fi</span>
                </button>
              </div>

              {/* ── TAB 1: WIRED USB ────────────────────────────────────── */}
              {activeTab === 'wired' && (
                <div className="flex flex-col gap-3">
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-500">
                      Web Serial API
                    </span>
                    <p className={`text-[11px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {isFil
                        ? 'Direktang ikabit ang ESP32 sa pamamagitan ng USB Type-C o Micro-USB cable sa laptop o computer.'
                        : 'Connect ESP32 directly via USB Type-C or Micro-USB cable to your laptop or PC.'}
                    </p>
                    {!isSerialSupported && (
                      <span className="text-amber-500 text-[10px] font-bold">
                        ⚠️ Web Serial is only supported in Chromium browsers (Chrome, Edge, Opera).
                      </span>
                    )}
                  </div>

                  {/* Baud Rate Picker */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="baud-rate-select"
                      className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}
                    >
                      Baud Rate (Speed)
                    </label>
                    <select
                      id="baud-rate-select"
                      value={baudRate}
                      onChange={(e) => setBaudRate(Number(e.target.value))}
                      className={`w-full p-2.5 rounded-lg border text-xs font-mono font-bold cursor-pointer min-h-[44px] ${
                        isDark ? 'bg-[#0B0F12] border-[#222932] text-zinc-200' : 'bg-white border-zinc-300 text-zinc-900'
                      }`}
                    >
                      <option value={9600}>9600 baud</option>
                      <option value={19200}>19200 baud</option>
                      <option value={38400}>38400 baud</option>
                      <option value={57600}>57600 baud</option>
                      <option value={115200}>115200 baud (Default ESP32)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={!isSerialSupported || isConnecting}
                    onClick={handleConnectWired}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg min-h-[44px]"
                  >
                    <IconUsb size={16} />
                    <span>
                      {isConnecting
                        ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                        : (isFil ? 'IKABIT ANG WIRED USB' : 'CONNECT VIA USB')}
                    </span>
                  </button>
                </div>
              )}

              {/* ── TAB 2: BLUETOOTH BLE ────────────────────────────────── */}
              {activeTab === 'bluetooth' && (
                <div className="flex flex-col gap-3">
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-sky-400">
                      Web Bluetooth (BLE UART)
                    </span>
                    <p className={`text-[11px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {isFil
                        ? 'Mag-scan ng wireless Bluetooth signal ng ESP32 (Nordic UART Service). Tamang-tama sa tablet o mobile phone sa field.'
                        : 'Wirelessly scan for ESP32 Bluetooth signals (Nordic UART). Ideal for field use with tablets or phones.'}
                    </p>
                    {!isBluetoothSupported && (
                      <span className="text-amber-500 text-[10px] font-bold">
                        ⚠️ Web Bluetooth requires Chrome, Edge, or Bluefy Browser.
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!isBluetoothSupported || isConnecting}
                    onClick={handleConnectBluetooth}
                    className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg min-h-[44px]"
                  >
                    <IconBluetooth size={16} />
                    <span>
                      {isConnecting
                        ? (isFil ? 'NAG-II-SCAN...' : 'SCANNING BLE...')
                        : (isFil ? 'I-SCAN AT IKABIT ANG BLUETOOTH' : 'SCAN & PAIR BLUETOOTH')}
                    </span>
                  </button>
                </div>
              )}

              {/* ── TAB 3: WI-FI NETWORK ────────────────────────────────── */}
              {activeTab === 'wifi' && (
                <div className="flex flex-col gap-3">
                  <div className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 ${
                    isDark ? 'bg-[#0B0F12] border-[#222932]' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-amber-400">
                      Wi-Fi WebSocket
                    </span>
                    <p className={`text-[11px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      {isFil
                        ? 'Kumonekta sa pamamagitan ng Wi-Fi SoftAP ng ESP32 (192.168.4.1) o local network IP.'
                        : 'Connect via ESP32 SoftAP hotspot (192.168.4.1) or your local Wi-Fi router IP.'}
                    </p>
                  </div>

                  {/* WebSocket URL Input */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="ws-url-input"
                      className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}
                    >
                      WebSocket URL
                    </label>
                    <input
                      id="ws-url-input"
                      type="text"
                      value={wifiUrl}
                      onChange={(e) => setWifiUrl(e.target.value)}
                      placeholder="ws://192.168.4.1/ws"
                      className={`w-full p-2.5 rounded-lg border text-xs font-mono font-bold min-h-[44px] ${
                        isDark ? 'bg-[#0B0F12] border-[#222932] text-zinc-200' : 'bg-white border-zinc-300 text-zinc-900'
                      }`}
                    />
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setWifiUrl('ws://192.168.4.1/ws')}
                      className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer min-h-[44px] ${
                        isDark ? 'bg-[#1E242B] border-[#222932] text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      ESP32 AP (192.168.4.1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setWifiUrl('ws://192.168.1.100/ws')}
                      className={`px-2.5 py-1.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer min-h-[44px] ${
                        isDark ? 'bg-[#1E242B] border-[#222932] text-zinc-300' : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      LAN IP (192.168.1.x)
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={handleConnectWifi}
                    className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg min-h-[44px]"
                  >
                    <IconWifi size={16} />
                    <span>
                      {isConnecting
                        ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                        : (isFil ? 'IKABIT ANG WI-FI' : 'CONNECT VIA WI-FI')}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Last Error Message if any */}
          {hardwareState.lastError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-start gap-2">
              <IconAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
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
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : isConnecting
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-zinc-500'
              }`}
            />
            <span className={`text-[11px] font-mono font-bold uppercase ${
              isConnected ? 'text-emerald-400' : isDark ? 'text-zinc-400' : 'text-zinc-600'
            }`}>
              {isConnected
                ? (isFil ? 'ONLINE (LIVE HARDWARE)' : 'ONLINE (LIVE HARDWARE)')
                : isConnecting
                ? (isFil ? 'KUMUKONEKTA...' : 'CONNECTING...')
                : (isFil ? 'STANDBY (SIMULATED)' : 'STANDBY (SIMULATED)')}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer min-h-[44px] ${
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
