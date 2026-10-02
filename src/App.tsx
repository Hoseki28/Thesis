import { useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { OverviewTab } from './components/OverviewTab'
import { SensorsTab } from './components/SensorsTab'
import { ServiceTab } from './components/ServiceTab'
import { LogsTab } from './components/LogsTab'
import { ConnectionModal } from './components/ConnectionModal'
import { IconDownload, IconCheckCircle } from './components/Icons'
import {
  applyCalibration,
  loadCalibration,
  resetCalibration,
  saveCalibration,
} from './services/calibrationStorage'
import { HardwareBridge } from './services/hardwareBridge'
import { SimulationEngine } from './services/simulationEngine'
import { TelemetryHistoryManager } from './services/telemetryHistory'
import { systemLogManager } from './services/systemLogService'
import {
  CalibrationConfig,
  HardwareState,
  Lang,
  ScenarioPreset,
  SystemLogEntry,
  SystemLogLevel,
  TabId,
  TelemetryData,
  TelemetryPoint,
} from './types/telemetry'

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('padayon_theme')
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  })
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('padayon_lang')
    return saved === 'fil' || saved === 'en' ? saved : 'en'
  })

  useEffect(() => {
    localStorage.setItem('padayon_theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    localStorage.setItem('padayon_lang', lang)
  }, [lang])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const [currentTab, setCurrentTab] = useState<TabId>('overview')
  const [calibration, setCalibration] = useState<CalibrationConfig>(loadCalibration)
  const [scenario, setScenario] = useState<ScenarioPreset>('normal')
  const [simSpeed, setSimSpeed] = useState<number>(1)

  // PWA Install Prompt state
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false)

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setIsAppInstalled(true)
      setInstallPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsAppInstalled(true)
    }
    setInstallPrompt(null)
  }

  // Service instances created once
  const historyManagerRef = useRef<TelemetryHistoryManager>(new TelemetryHistoryManager(60))
  const [historyPoints, setHistoryPoints] = useState<TelemetryPoint[]>([])

  // ESP32 Multi-Transport Connection Modal & Toast state
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState<boolean>(false)
  const [connectToast, setConnectToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)

  // Hardware state
  const [hardwareState, setHardwareState] = useState<HardwareState>({
    status: 'standby',
    transport: 'none',
    portInfo: 'None (Standby Mode)',
    baudRate: 115200,
    packetsReceived: 0,
    bytesReceived: 0,
    lastPacketTime: null,
    lastError: null,
    rawLogs: [],
  })

  // System logs dynamic state
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>(() => systemLogManager.getLogs())

  useEffect(() => {
    return systemLogManager.subscribe((updatedLogs) => {
      setSystemLogs(updatedLogs)
    })
  }, [])

  // Track connection change to show confirmation toast and system log
  const prevStatusRef = useRef(hardwareState.status)
  useEffect(() => {
    if (prevStatusRef.current !== hardwareState.status) {
      const transportName =
        hardwareState.transport === 'serial'
          ? 'USB Serial'
          : hardwareState.transport === 'bluetooth'
          ? 'Bluetooth BLE'
          : hardwareState.transport === 'websocket'
          ? 'Wi-Fi'
          : 'None'

      if (hardwareState.status === 'connected') {
        const msg =
          lang === 'fil'
            ? `Kumpirmado: Nakakabit na ang ESP32 via ${transportName}!`
            : `Confirmed: ESP32 connected via ${transportName}!`
        setConnectToast({ message: msg, type: 'success' })
        const timer = setTimeout(() => setConnectToast(null), 4500)

        systemLogManager.addSystemLog(
          `ESP32 hardware link established via ${transportName} (${hardwareState.portInfo})`,
          'info',
          `Nakakabit na ang ESP32 via ${transportName} (${hardwareState.portInfo})`,
          'esp32'
        )
        return () => clearTimeout(timer)
      } else if (prevStatusRef.current === 'connected' && hardwareState.status === 'standby') {
        systemLogManager.addSystemLog(
          'ESP32 disconnected. Telemetry reverted to simulation mode.',
          'warning',
          'Naputol ang ESP32. Bumalik sa simulation mode ang telemetry.',
          'esp32'
        )
      } else if (hardwareState.status === 'error') {
        systemLogManager.addSystemLog(
          `ESP32 interface fault: ${hardwareState.lastError || 'Unknown connection error'}`,
          'error',
          `Problema sa koneksyon ng ESP32: ${hardwareState.lastError || 'Error sa koneksyon'}`,
          'esp32'
        )
      }
    }
    prevStatusRef.current = hardwareState.status
  }, [hardwareState.status, hardwareState.transport, hardwareState.portInfo, hardwareState.lastError, lang])

  // Hardware Bridge ref
  const bridgeRef = useRef<HardwareBridge | null>(null)
  // Simulation Engine ref
  const simRef = useRef<SimulationEngine | null>(null)
  // Calibration ref to avoid stale closure in hardware listeners
  const calibrationRef = useRef<CalibrationConfig>(calibration)

  // Active Telemetry State
  const [telemetry, setTelemetry] = useState<TelemetryData>(() => {
    const dummyCal = loadCalibration()
    return applyCalibration(
      {
        rawStoveTemp: 185.0,
        rawAmbientTemp: 28.5,
        rawHumidity: 68.0,
        rawBatteryVoltage: 13.19,
        rawTegVoltage: 5.2,
        rawTegCurrent: 1.15,
        relays: { dcBus: true, lights: true, fans: true, aux: false },
        operatingHours: 1248,
        systemHealthPct: 96,
        source: 'simulated',
      },
      dummyCal
    )
  })

  useEffect(() => {
    calibrationRef.current = calibration
    if (simRef.current) {
      simRef.current.updateCalibration(calibration)
    }
  }, [calibration])

  // Initialize Services
  useEffect(() => {
    // 1. Initialize Hardware Bridge
    const bridge = new HardwareBridge(
      (rawHardwareData) => {
        setTelemetry((prev) => {
          const merged = {
            ...rawHardwareData,
            relays: {
              ...prev.relays,
              ...(rawHardwareData.relays || {}),
            },
            operatingHours: prev.operatingHours,
            systemHealthPct: prev.systemHealthPct,
          }
          const calibrated = applyCalibration(merged, calibrationRef.current)
          historyManagerRef.current.addPoint(calibrated)
          setHistoryPoints(historyManagerRef.current.getPoints())
          return calibrated
        })
      },
      (newHardwareState) => {
        setHardwareState(newHardwareState)
      }
    )
    bridgeRef.current = bridge

    // 2. Initialize Simulation Engine
    const sim = new SimulationEngine(calibrationRef.current, (simulatedData) => {
      if (bridge.getState().status !== 'connected') {
        setTelemetry(simulatedData)
        historyManagerRef.current.addPoint(simulatedData)
        setHistoryPoints(historyManagerRef.current.getPoints())
      }
    })
    simRef.current = sim
    sim.start()

    return () => {
      sim.stop()
      bridge.disconnectAll()
    }
  }, [])

  // Change simulation speed
  useEffect(() => {
    if (simRef.current) {
      simRef.current.setSpeed(simSpeed)
    }
  }, [simSpeed])

  // Handle Scenario preset change
  const handleScenarioChange = (newPreset: ScenarioPreset) => {
    setScenario(newPreset)
    if (simRef.current) {
      simRef.current.setScenario(newPreset)
    }
  }

  // Handle manual slider inputs
  const handleManualSlider = (key: 'stoveTemp' | 'ambientTemp' | 'humidity' | 'batteryPct', val: number) => {
    setScenario('custom')
    if (simRef.current) {
      simRef.current.setManualValues({ [key]: val })
    }
  }

  // Appliance relay toggling (Fan)
  const handleToggleFans = async () => {
    const next = !telemetry.relays.fans
    if (hardwareState.status === 'connected' && bridgeRef.current) {
      await bridgeRef.current.sendRelayCommand('fans', next)
    } else if (simRef.current) {
      simRef.current.toggleRelay('fans')
    }
    setTelemetry((prev) => ({
      ...prev,
      relays: { ...prev.relays, fans: next },
    }))
  }

  // Main DC Power Bus toggle
  const handleToggleDcBus = async () => {
    const next = !telemetry.relays.dcBus
    if (hardwareState.status === 'connected' && bridgeRef.current) {
      await bridgeRef.current.sendRelayCommand('dcBus', next)
    } else if (simRef.current) {
      simRef.current.toggleRelay('dcBus')
    }
    setTelemetry((prev) => ({
      ...prev,
      relays: { ...prev.relays, dcBus: next },
    }))
  }

  // Calibration Actions
  const handleSaveCalibration = (updated: CalibrationConfig) => {
    setCalibration(updated)
    saveCalibration(updated)
  }

  const handleResetDefaults = () => {
    const def = resetCalibration()
    setCalibration(def)
  }

  const handleSendCalToHardware = async (cal: CalibrationConfig): Promise<boolean> => {
    if (bridgeRef.current && hardwareState.status === 'connected') {
      return bridgeRef.current.sendCalibrationCommand(cal)
    }
    return false
  }

  // Compute Alerts
  const tooHot = telemetry.stoveTemp > calibration.stoveOverheatThreshold
  const lowHeat = telemetry.stoveTemp < calibration.stoveLowHeatThreshold
  const lowBattery = telemetry.batteryPct <= calibration.batteryCutoffPct
  const hasAlert = tooHot || lowHeat || lowBattery
  const isLive = hardwareState.status === 'connected'

  // Edge-triggered threshold breaches logging (prevents spamming every second)
  const prevOverheatRef = useRef(false)
  const prevLowBattRef = useRef(false)
  const prevLowHeatRef = useRef(false)

  useEffect(() => {
    if (!prevOverheatRef.current && tooHot) {
      systemLogManager.addSystemLog(
        `Overheat breach: Stove temp reached ${telemetry.stoveTemp.toFixed(1)}°C (Limit: ${calibration.stoveOverheatThreshold}°C)`,
        'error',
        `Babala sa init: Umabot sa ${telemetry.stoveTemp.toFixed(1)}°C ang kalan (Limit: ${calibration.stoveOverheatThreshold}°C)`,
        'threshold'
      )
    } else if (prevOverheatRef.current && !tooHot) {
      systemLogManager.addSystemLog(
        `Thermal recovery: Stove temperature stabilized at ${telemetry.stoveTemp.toFixed(1)}°C`,
        'info',
        `Bumaba na sa normal ang temperatura ng kalan (${telemetry.stoveTemp.toFixed(1)}°C)`,
        'threshold'
      )
    }
    prevOverheatRef.current = tooHot

    if (!prevLowBattRef.current && lowBattery) {
      systemLogManager.addSystemLog(
        `Battery threshold alert: SOC dropped to ${telemetry.batteryPct}% (${telemetry.batteryVoltage.toFixed(2)}V)`,
        'error',
        `Mababang lebel ng baterya: Bumababa sa ${telemetry.batteryPct}% (${telemetry.batteryVoltage.toFixed(2)}V)`,
        'threshold'
      )
    } else if (prevLowBattRef.current && !lowBattery) {
      systemLogManager.addSystemLog(
        `Battery recovery: SOC restored to ${telemetry.batteryPct}% (${telemetry.batteryVoltage.toFixed(2)}V)`,
        'info',
        `Naka-recover ang baterya: Umabot sa ${telemetry.batteryPct}% (${telemetry.batteryVoltage.toFixed(2)}V)`,
        'threshold'
      )
    }
    prevLowBattRef.current = lowBattery

    if (!prevLowHeatRef.current && lowHeat) {
      systemLogManager.addSystemLog(
        `Low heat alert: Stove temp fell to ${telemetry.stoveTemp.toFixed(1)}°C (Threshold: ${calibration.stoveLowHeatThreshold}°C)`,
        'warning',
        `Mababang init ng kalan: Bumababa sa ${telemetry.stoveTemp.toFixed(1)}°C`,
        'threshold'
      )
    } else if (prevLowHeatRef.current && !lowHeat) {
      systemLogManager.addSystemLog(
        `Heat recovery: Stove temp nominal at ${telemetry.stoveTemp.toFixed(1)}°C`,
        'info',
        `Bumalik sa sapat na init ang kalan (${telemetry.stoveTemp.toFixed(1)}°C)`,
        'threshold'
      )
    }
    prevLowHeatRef.current = lowHeat
  }, [tooHot, lowHeat, lowBattery, telemetry.stoveTemp, telemetry.batteryPct, telemetry.batteryVoltage, calibration.stoveOverheatThreshold, calibration.stoveLowHeatThreshold])

  return (
    <div className={`flex justify-center items-start min-h-screen transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#0B0F12] text-zinc-100' : 'bg-[#F3F4F6] text-zinc-900'
    } antialiased font-sans`}>
      {/* Mobile-first centered container: max-w-md (430px) */}
      <div className={`flex flex-col min-h-screen w-full max-w-md border-x relative pb-24 transition-colors duration-200 ${
        theme === 'dark' ? 'bg-[#0B0F12] border-[#1E242B]' : 'bg-[#F9FAFB] border-zinc-200 shadow-sm'
      }`}>
        {/* ── HEADER ────────────────────────────────────────────────── */}
        <Header
          lang={lang}
          onLanguageChange={setLang}
          theme={theme}
          onToggleTheme={toggleTheme}
          status={hardwareState.status}
          hasAlert={hasAlert}
          transport={hardwareState.transport}
          onOpenConnectionModal={() => setIsConnectionModalOpen(true)}
        />

        {/* ── CONFIRMATION TOAST ────────────────────────────────────── */}
        {connectToast && (
          <div className="mx-3 mt-2.5 p-3 rounded-xl bg-emerald-600 text-white shadow-xl flex items-center justify-between gap-2 text-xs font-bold animate-fade-in border border-emerald-400/40">
            <div className="flex items-center gap-2 min-w-0">
              <IconCheckCircle size={18} className="flex-shrink-0 text-white" />
              <span className="truncate">{connectToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setConnectToast(null)}
              className="text-white/80 hover:text-white p-1 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── PWA INSTALL BANNER ────────────────────────────────────── */}
        {installPrompt && !isAppInstalled && (
          <div className={`mx-3 mt-2.5 p-3 rounded-xl border flex items-center justify-between gap-2 shadow-lg transition-colors ${
            theme === 'dark' ? 'bg-[#13171B] border-[#1E242B]' : 'bg-white border-zinc-200'
          }`}>
            <div className="flex items-center gap-2">
              <IconDownload size={16} className="text-[#00E676] flex-shrink-0" />
              <div>
                <span className={`text-[11px] font-bold uppercase tracking-wider block ${
                  theme === 'dark' ? 'text-white' : 'text-zinc-900'
                }`}>
                  {lang === 'fil' ? 'I-INSTALL ANG BIOMASS PWA' : 'INSTALL BIOMASS PWA'}
                </span>
                <span className={`text-[10px] block ${
                  theme === 'dark' ? 'text-[#9CA3AF]' : 'text-zinc-500'
                }`}>
                  {lang === 'fil' ? 'I-save sa cellphone para sa offline field telemetriya' : 'Add to home screen for offline field telemetry'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="py-1.5 px-3 rounded-lg bg-[#00E676]/20 hover:bg-[#00E676]/30 border border-[#00E676] text-[#00E676] text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors min-h-[44px]"
            >
              {lang === 'fil' ? 'I-INSTALL' : 'INSTALL'}
            </button>
          </div>
        )}

        {/* ── MAIN CONTENT TABS ─────────────────────────────────────── */}
        <main className="flex-1 px-3 pt-3 flex flex-col gap-3">
          {/* TAB 1: OVERVIEW */}
          {currentTab === 'overview' && (
            <OverviewTab
              telemetry={telemetry}
              lang={lang}
              theme={theme}
              scenario={scenario}
              simSpeed={simSpeed}
              isLive={isLive}
              hasAlert={hasAlert}
              tooHot={tooHot}
              lowHeat={lowHeat}
              lowBattery={lowBattery}
              onToggleFans={handleToggleFans}
              onToggleDcBus={handleToggleDcBus}
              onScenarioChange={handleScenarioChange}
              onSimSpeedChange={setSimSpeed}
              onManualSlider={handleManualSlider}
            />
          )}

          {/* TAB 2: SENSORS */}
          {currentTab === 'sensors' && (
            <SensorsTab
              telemetry={telemetry}
              calibration={calibration}
              historyPoints={historyPoints}
              lang={lang}
              theme={theme}
            />
          )}

          {/* TAB 3: SERVICE */}
          {currentTab === 'calibration' && (
            <ServiceTab
              telemetry={telemetry}
              calibration={calibration}
              lang={lang}
              theme={theme}
              onSaveCalibration={handleSaveCalibration}
              onResetDefaults={handleResetDefaults}
              onSendToHardware={handleSendCalToHardware}
            />
          )}

          {/* TAB 4: LOGS */}
          {currentTab === 'logs' && bridgeRef.current && (
            <LogsTab
              bridge={bridgeRef.current}
              hardwareState={hardwareState}
              historyManager={historyManagerRef.current}
              logs={systemLogs}
              onAddLog={(msg, lvl, fil) => systemLogManager.addSystemLog(msg, lvl, fil)}
              onClearLogs={() => systemLogManager.clearLogs()}
              onExportCsv={() => systemLogManager.exportCsv('padayon_system_logs')}
              lang={lang}
              theme={theme}
            />
          )}
        </main>

        {/* ── CONNECTION MODAL ─────────────────────────────────────── */}
        {bridgeRef.current && (
          <ConnectionModal
            isOpen={isConnectionModalOpen}
            onClose={() => setIsConnectionModalOpen(false)}
            bridge={bridgeRef.current}
            hardwareState={hardwareState}
            lang={lang}
            theme={theme}
          />
        )}

        {/* ── FIXED BOTTOM NAVIGATION ───────────────────────────────── */}
        <BottomNav
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          lang={lang}
          theme={theme}
          hasAlert={hasAlert}
        />
      </div>
    </div>
  )
}
