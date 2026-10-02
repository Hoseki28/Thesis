import { useState } from 'react'
import { HardwareBridge } from '../services/hardwareBridge'
import { TelemetryHistoryManager, TelemetryStats } from '../services/telemetryHistory'
import { HardwareState, Lang, TelemetryPoint } from '../types/telemetry'
import {
  IconTerminal,
  IconUsb,
  IconDownload,
  IconLamp,
  IconFan,
  IconCode,
  IconCheck,
  IconActivity,
  IconPower,
} from './Icons'

interface ServiceLogsTabProps {
  bridge: HardwareBridge
  hardwareState: HardwareState
  historyManager: TelemetryHistoryManager
  points: TelemetryPoint[]
  stats: TelemetryStats
  lang: Lang
}

export function ServiceLogsTab({
  bridge,
  hardwareState,
  historyManager,
  points,
  stats,
  lang,
}: ServiceLogsTabProps) {
  const isFil = lang === 'fil'
  const isSupported = bridge.isWebSerialSupported()
  const isConnected = hardwareState.status === 'connected'
  const isConnecting = hardwareState.status === 'connecting'

  const [baud, setBaud] = useState<number>(hardwareState.baudRate || 115200)
  const [customCmd, setCustomCmd] = useState<string>('')
  const [exportedNotice, setExportedNotice] = useState<boolean>(false)
  const [copiedCode, setCopiedCode] = useState<boolean>(false)
  const [showFirmware, setShowFirmware] = useState<boolean>(false)

  // Bench test relay states
  const [testRelayLight, setTestRelayLight] = useState<boolean>(true)
  const [testRelayFan, setTestRelayFan] = useState<boolean>(false)

  const handleConnectSerial = async () => {
    bridge.setBaudRate(baud)
    await bridge.connectSerial(baud)
  }

  const handleDisconnect = async () => {
    if (hardwareState.transport === 'serial') {
      await bridge.disconnectSerial()
    } else if (hardwareState.transport === 'websocket') {
      bridge.disconnectWebSocket()
    }
  }

  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customCmd.trim()) return
    await bridge.sendCommand(customCmd)
    setCustomCmd('')
  }

  const handleToggleLight = async () => {
    const next = !testRelayLight
    setTestRelayLight(next)
    await bridge.sendRelayCommand('lights', next)
  }

  const handleToggleFan = async () => {
    const next = !testRelayFan
    setTestRelayFan(next)
    await bridge.sendRelayCommand('fans', next)
  }

  const handleExportCsv = () => {
    const ok = historyManager.exportCsv('padayon_biomass_teg_telemetry')
    if (ok) {
      setExportedNotice(true)
      setTimeout(() => setExportedNotice(false), 3000)
    }
  }

  const firmwareCode = `// ESP32 Biomass-TEG Telemetry Node
#include <Arduino.h>
#include <DHT.h>
#include <max6675.h>

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

const int thermoDO = 19, thermoCS = 23, thermoCLK = 5;
MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);

#define PIN_BATT_ADC 34
#define PIN_TEG_ADC 35
#define PIN_ACS_ADC 32
#define RELAY_LIGHTS 26
#define RELAY_FANS 27

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(RELAY_LIGHTS, OUTPUT);
  pinMode(RELAY_FANS, OUTPUT);
}

void loop() {
  float stove = thermocouple.readCelsius();
  float amb = dht.readTemperature();
  float hum = dht.readHumidity();
  float batt = (analogRead(PIN_BATT_ADC) / 4095.0) * 3.3 * 4.3;
  float tegV = (analogRead(PIN_TEG_ADC) / 4095.0) * 3.3 * 2.0;
  float tegI = ((analogRead(PIN_ACS_ADC) * 3.3 / 4095.0) - 2.5) / 0.185;

  // JSON Telemetry Stream
  Serial.printf("{\\"stoveTemp\\":%.1f,\\"ambientTemp\\":%.1f,\\"humidity\\":%.1f,\\"batteryVoltage\\":%.2f,\\"tegVoltage\\":%.2f,\\"tegCurrent\\":%.2f}\\n",
    stove, amb, hum, batt, tegV, tegI);
  delay(1000);
}`

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(firmwareCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2500)
    } catch {
      // fallback
    }
  }

  // SVG Chart points
  const width = 360
  const height = 90
  const getSvgPath = (pts: TelemetryPoint[], accessor: (p: TelemetryPoint) => number, minVal: number, maxVal: number) => {
    if (pts.length < 2) return ''
    const range = Math.max(1, maxVal - minVal)
    const stepX = width / (pts.length - 1)
    return pts
      .map((pt, i) => {
        const x = Math.round(i * stepX)
        const normalized = (accessor(pt) - minVal) / range
        const y = Math.round(height - normalized * (height - 12) - 6)
        return `${x},${y}`
      })
      .join(' ')
  }

  const stovePath = getSvgPath(points, (p) => p.stoveTemp, 0, 300)
  const tegPowerPath = getSvgPath(points, (p) => p.tegPower, 0, 20)
  const battPctPath = getSvgPath(points, (p) => p.batteryPct, 0, 100)

  return (
    <div className="flex flex-col gap-3.5 font-mono">
      {/* ── 1. HARDWARE SERIAL INTERFACE ─────────────────────────────── */}
      <section className="rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
              <IconUsb size={16} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
                COMMUNICATION CHANNEL
              </span>
              <h3 className="text-xs font-black text-zinc-100 uppercase tracking-tight">
                {isFil ? 'Web Serial USB Interface' : 'Web Serial Hardware Interface'}
              </h3>
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${
            isConnected
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
              : isConnecting
              ? 'bg-amber-950/60 border-amber-700 text-amber-300'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
          }`}>
            {isConnected ? 'SERIAL ONLINE' : isConnecting ? 'CONNECTING...' : 'STANDBY (NO HW)'}
          </span>
        </div>

        {/* Port Status info */}
        <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-[10px] text-zinc-400 flex items-center justify-between">
          <span>PORT: <span className="text-zinc-200 font-bold">{hardwareState.portInfo}</span></span>
          <span>PACKETS: <span className="text-zinc-200 font-bold tabular-nums">{hardwareState.packetsReceived}</span></span>
          <span>BAUD: <span className="text-zinc-200 font-bold">{hardwareState.baudRate}</span></span>
        </div>

        {/* Serial Action Controls */}
        <div className="flex items-center gap-2">
          <select
            value={baud}
            onChange={(e) => setBaud(Number(e.target.value))}
            disabled={isConnected}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-100 font-mono min-h-[44px]"
            aria-label="Serial Baud Rate"
          >
            <option value={115200}>115200 BAUD</option>
            <option value={9600}>9600 BAUD</option>
            <option value={57600}>57600 BAUD</option>
          </select>

          {isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex-1 py-2 px-3 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all min-h-[44px]"
            >
              DISCONNECT SERIAL
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectSerial}
              disabled={!isSupported}
              className="flex-1 py-2 px-3 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-200 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all disabled:opacity-40 min-h-[44px]"
            >
              CONNECT USB SERIAL
            </button>
          )}
        </div>
      </section>

      {/* ── 2. DIAGNOSTIC RELAY BENCH ACTUATORS ──────────────────────── */}
      <section className="rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconPower size={15} className="text-zinc-400" />
            <h3 className="text-xs font-black text-zinc-100 uppercase tracking-tight">
              Diagnostic Relay Bench Test
            </h3>
          </div>
          <span className="text-[10px] text-zinc-400">GPIO 26 / 27</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleToggleLight}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all min-h-[48px] ${
              testRelayLight
                ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconLamp size={16} className={testRelayLight ? 'text-amber-400' : 'text-zinc-500'} />
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase block">LIGHTS RELAY</span>
                <span className="text-[9px]">{testRelayLight ? 'ENERGIZED' : 'OPEN'}</span>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full ${testRelayLight ? 'bg-amber-400' : 'bg-zinc-600'}`} />
          </button>

          <button
            type="button"
            onClick={handleToggleFan}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all min-h-[48px] ${
              testRelayFan
                ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <IconFan size={16} className={testRelayFan ? 'text-cyan-400 animate-spin' : 'text-zinc-500'} />
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase block">FAN RELAY</span>
                <span className="text-[9px]">{testRelayFan ? 'ENERGIZED' : 'OPEN'}</span>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full ${testRelayFan ? 'bg-cyan-400' : 'bg-zinc-600'}`} />
          </button>
        </div>
      </section>

      {/* ── 3. ROLLING TELEMETRY SPARKLINE CHARTS ───────────────────── */}
      <section className="rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconActivity size={15} className="text-zinc-400" />
            <h3 className="text-xs font-black text-zinc-100 uppercase tracking-tight">
              Telemetry Rolling Horizon (60s)
            </h3>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/70 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <IconDownload size={12} />
            <span>{exportedNotice ? 'EXPORTED' : 'CSV EXPORT'}</span>
          </button>
        </div>

        {/* 4 Quick Stat Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-zinc-400 block">PEAK STOVE</span>
            <span className="text-xs font-bold text-orange-400 tabular-nums">
              {(stats?.peakStoveTemp ?? 0).toFixed(1)}°C
            </span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-zinc-400 block">PEAK TEG</span>
            <span className="text-xs font-bold text-amber-400 tabular-nums">
              {(stats?.peakTegPower ?? 0).toFixed(1)} W
            </span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-zinc-400 block">ENERGY</span>
            <span className="text-xs font-bold text-cyan-400 tabular-nums">
              {(stats?.totalEnergyGeneratedWh ?? 0).toFixed(2)} Wh
            </span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-zinc-400 block">AVG AMBIENT</span>
            <span className="text-xs font-bold text-zinc-200 tabular-nums">
              {(stats?.avgAmbientTemp ?? 0).toFixed(1)}°C
            </span>
          </div>
        </div>

        {/* SVG Multi-Signal Trend Chart */}
        <div className="p-3 rounded-xl bg-zinc-950/90 border border-zinc-800/90 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[9px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-orange-400 inline-block" /> STOVE TEMP (0-300°C)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-amber-400 inline-block" /> TEG POWER (0-20W)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-emerald-400 inline-block" /> BATTERY SOC (0-100%)
            </span>
          </div>

          <div className="relative w-full h-[90px] overflow-hidden">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full preserve-3d" preserveAspectRatio="none">
              {/* Grid lines */}
              <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#27272a" strokeDasharray="3 3" />
              <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#27272a" strokeDasharray="3 3" />

              {/* Polylines */}
              {stovePath && (
                <polyline fill="none" stroke="#fb923c" strokeWidth="1.8" points={stovePath} />
              )}
              {tegPowerPath && (
                <polyline fill="none" stroke="#f59e0b" strokeWidth="1.8" points={tegPowerPath} />
              )}
              {battPctPath && (
                <polyline fill="none" stroke="#34d399" strokeWidth="1.8" points={battPctPath} />
              )}
            </svg>
          </div>
        </div>
      </section>

      {/* ── 4. RAW SERIAL CONSOLE / LOGS ─────────────────────────────── */}
      <section className="rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconTerminal size={15} className="text-zinc-400" />
            <h3 className="text-xs font-black text-zinc-100 uppercase tracking-tight">
              Raw Hardware Telemetry Stream
            </h3>
          </div>
          <button
            type="button"
            onClick={() => bridge.clearLogs()}
            className="text-[9px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            CLEAR LOGS
          </button>
        </div>

        {/* Terminal Window */}
        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90 font-mono text-[11px] h-36 overflow-y-auto flex flex-col gap-1">
          {hardwareState.rawLogs.length === 0 ? (
            <div className="text-zinc-500 py-4 text-center text-xs">
              STANDBY: TELEMETRY GENERATION RUNNING ON INTERNAL SIMULATION ENGINE.
              CONNECT PHYSICAL USB HARDWARE ABOVE TO STREAM LIVE SERIAL BYTES.
            </div>
          ) : (
            hardwareState.rawLogs.slice(-40).map((log) => (
              <div
                key={log.id}
                className={`leading-relaxed break-all ${
                  log.type === 'err'
                    ? 'text-rose-400'
                    : log.type === 'out'
                    ? 'text-cyan-400'
                    : log.type === 'in'
                    ? 'text-emerald-400'
                    : 'text-zinc-400'
                }`}
              >
                <span className="text-zinc-400 select-none mr-2">[{log.timestamp}]</span>
                <span>{log.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Command Input Form */}
        <form onSubmit={handleSendCustom} className="flex gap-2">
          <input
            type="text"
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            placeholder='SEND SERIAL COMMAND (E.G. {"relays":{"fans":true}})'
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono min-h-[44px]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs font-bold uppercase cursor-pointer min-h-[44px]"
          >
            SEND
          </button>
        </form>
      </section>

      {/* ── 5. ESP32 FIRMWARE SKETCH DRAWER ──────────────────────────── */}
      <section className="rounded-2xl p-4 bg-zinc-900/60 border border-zinc-800/80 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCode size={15} className="text-zinc-400" />
            <h3 className="text-xs font-black text-zinc-100 uppercase tracking-tight">
              ESP32 / Arduino Microcontroller Sketch
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowFirmware(!showFirmware)}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 uppercase font-bold cursor-pointer"
          >
            {showFirmware ? 'HIDE' : 'VIEW CODE'}
          </button>
        </div>

        {showFirmware && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1 cursor-pointer"
              >
                <IconCheck size={12} />
                <span>{copiedCode ? 'COPIED TO CLIPBOARD' : 'COPY SKETCH'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 overflow-x-auto max-h-56">
              {firmwareCode}
            </pre>
          </div>
        )}
      </section>
    </div>
  )
}
