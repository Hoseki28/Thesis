import { CalibrationConfig, ScenarioPreset, TelemetryData } from '../types/telemetry'
import { applyCalibration } from './calibrationStorage'

export interface SimulationState {
  preset: ScenarioPreset
  isRunning: boolean
  speedMultiplier: number
  
  // Internal continuous physical state variables
  stoveTempTarget: number
  currentStoveTemp: number
  ambientTempBase: number
  humidityBase: number
  batteryChargeAh: number // Amp-hours stored (e.g. max 10Ah battery)
  maxBatteryAh: number
  
  relays: {
    dcBus: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }
}

export const INITIAL_SIM_STATE: SimulationState = {
  preset: 'normal',
  isRunning: true,
  speedMultiplier: 1,

  stoveTempTarget: 185.0,
  currentStoveTemp: 185.0,
  ambientTempBase: 28.5,
  humidityBase: 68.0,
  batteryChargeAh: 7.8, // 78% of 10Ah
  maxBatteryAh: 10.0,

  relays: {
    dcBus: true,
    lights: true, // Emergency light locked on
    fans: true,
    aux: false,
  },
}

export class SimulationEngine {
  private state: SimulationState
  private cal: CalibrationConfig
  private onTickCallback?: (data: TelemetryData) => void
  private timer: number | null = null

  constructor(initialCal: CalibrationConfig, onTick?: (data: TelemetryData) => void) {
    this.state = { ...INITIAL_SIM_STATE }
    this.cal = initialCal
    this.onTickCallback = onTick
  }

  public updateCalibration(newCal: CalibrationConfig) {
    this.cal = newCal
  }

  public setScenario(preset: ScenarioPreset) {
    this.state.preset = preset
    switch (preset) {
      case 'normal':
        this.state.stoveTempTarget = 185.0
        this.state.batteryChargeAh = 7.8
        this.state.relays.lights = true
        this.state.relays.fans = true
        break
      case 'lowHeat':
        this.state.stoveTempTarget = 75.0
        this.state.currentStoveTemp = 78.0
        break
      case 'overheat':
        this.state.stoveTempTarget = 246.0
        this.state.currentStoveTemp = 244.0
        break
      case 'lowBatt':
        this.state.batteryChargeAh = 1.4 // 14%
        // Load shedding automatically disconnects fans
        this.state.relays.fans = false
        break
      case 'tegPeak':
        this.state.stoveTempTarget = 222.0
        this.state.currentStoveTemp = 220.0
        this.state.batteryChargeAh = 5.0
        break
      case 'custom':
        // Keep current values for manual tuning
        break
    }
  }

  public setManualValues(values: {
    stoveTemp?: number
    ambientTemp?: number
    humidity?: number
    batteryPct?: number
  }) {
    this.state.preset = 'custom'
    if (values.stoveTemp !== undefined) {
      this.state.currentStoveTemp = values.stoveTemp
      this.state.stoveTempTarget = values.stoveTemp
    }
    if (values.ambientTemp !== undefined) {
      this.state.ambientTempBase = values.ambientTemp
    }
    if (values.humidity !== undefined) {
      this.state.humidityBase = values.humidity
    }
    if (values.batteryPct !== undefined) {
      this.state.batteryChargeAh = (values.batteryPct / 100) * this.state.maxBatteryAh
    }
  }

  public toggleRelay(key: 'dcBus' | 'fans' | 'lights' | 'aux') {
    if (key === 'dcBus') {
      this.state.relays.dcBus = !this.state.relays.dcBus
      return true
    }
    // If battery is critically low, don't allow turning secondary loads on
    const currentPct = (this.state.batteryChargeAh / this.state.maxBatteryAh) * 100
    if (key === 'fans' && currentPct <= this.cal.batteryCutoffPct && !this.state.relays.fans) {
      // Shed interlock prevented turning on
      return false
    }

    this.state.relays[key] = !this.state.relays[key]
    return true
  }

  public setRunning(running: boolean) {
    this.state.isRunning = running
  }

  public setSpeed(multiplier: number) {
    this.state.speedMultiplier = Math.max(0.5, Math.min(10, multiplier))
  }

  public getRawSnapshot() {
    return this.tickPhysics(0)
  }

  public start() {
    if (this.timer) clearInterval(this.timer)
    this.timer = window.setInterval(() => {
      if (this.state.isRunning) {
        const data = this.tickPhysics(1 * this.state.speedMultiplier)
        if (this.onTickCallback) {
          this.onTickCallback(data)
        }
      }
    }, 1000)
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Physics simulation step
   * @param dtSeconds delta time in seconds
   */
  public tickPhysics(dtSeconds: number = 1): TelemetryData {
    // 1. Stove Thermal Physics: Exponential approach toward target + small random combustion noise
    const approachSpeed = 0.05 * dtSeconds
    const jitter = (Math.random() - 0.48) * 0.6
    this.state.currentStoveTemp += (this.state.stoveTempTarget - this.state.currentStoveTemp) * approachSpeed + jitter
    this.state.currentStoveTemp = Math.max(20, Math.min(320, this.state.currentStoveTemp))

    // 2. DHT11 Ambient conditions (micro drift)
    const ambientJitter = (Math.random() - 0.5) * 0.08
    const ambientTemp = Math.round((this.state.ambientTempBase + ambientJitter) * 10) / 10
    const humidityJitter = (Math.random() - 0.5) * 0.2
    const humidity = Math.min(99, Math.max(20, Math.round(this.state.humidityBase + humidityJitter)))

    // 3. TEG Thermoelectric Physics (Seebeck Effect)
    // Delta T = StoveTemp - AmbientTemp
    const deltaT = Math.max(0, this.state.currentStoveTemp - ambientTemp)
    let rawTegVoltage = 0
    let rawTegCurrent = 0

    if (deltaT > 40) {
      // TEG modules start producing above ~40°C delta T
      // Open circuit voltage ~ 0.038V per °C delta T
      rawTegVoltage = Math.min(14.8, (deltaT - 40) * 0.075)
      // Current under 12V system load
      rawTegCurrent = Math.min(1.8, (deltaT - 40) * 0.009)
    }

    // 4. Electrical Load Calculation
    const isBusOn = this.state.relays.dcBus
    const lightW = isBusOn && this.state.relays.lights ? 4.8 : 0
    const fanW = isBusOn && this.state.relays.fans ? 12.0 : 0
    const auxW = isBusOn && this.state.relays.aux ? 5.0 : 0
    const totalLoadW = lightW + fanW + auxW

    // 5. Battery State of Charge (SoC) integration
    // TEG watts generated
    const tegW = rawTegVoltage * rawTegCurrent
    // Net power balance (+ charging, - discharging)
    const netW = tegW - totalLoadW

    // Approximate battery nominal voltage based on SoC
    const currentSocRatio = Math.max(0, Math.min(1, this.state.batteryChargeAh / this.state.maxBatteryAh))
    const nominalV = this.cal.batteryVMin + (currentSocRatio * (this.cal.batteryVMax - this.cal.batteryVMin))

    if (dtSeconds > 0) {
      // delta Ah = (netW / nominalV) * (dtSeconds / 3600)
      const deltaAh = (netW / nominalV) * (dtSeconds / 3600)
      this.state.batteryChargeAh = Math.max(0, Math.min(this.state.maxBatteryAh, this.state.batteryChargeAh + deltaAh))

      // Automated Load Shedding: If battery drops <= cutoffPct, disconnect secondary loads
      const currentPct = (this.state.batteryChargeAh / this.state.maxBatteryAh) * 100
      if (currentPct <= this.cal.batteryCutoffPct && this.state.relays.fans) {
        this.state.relays.fans = false
      }
    }

    const rawBatteryVoltage = Math.round(nominalV * 100) / 100

    return applyCalibration(
      {
        rawStoveTemp: Math.round(this.state.currentStoveTemp * 10) / 10,
        rawAmbientTemp: ambientTemp,
        rawHumidity: humidity,
        rawBatteryVoltage: rawBatteryVoltage,
        rawTegVoltage: Math.round(rawTegVoltage * 100) / 100,
        rawTegCurrent: Math.round(rawTegCurrent * 100) / 100,
        relays: { ...this.state.relays },
        timestamp: Date.now(),
        source: 'simulated',
      },
      this.cal
    )
  }
}
