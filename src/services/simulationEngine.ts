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
  batteryChargeAh: number // Amp-hours stored (12V 50Ah LiFePO4 battery)
  maxBatteryAh: number

  // Actuator states
  hopperServoActive: boolean
  feedCycles: number

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
  humidityBase: 64.0,
  batteryChargeAh: 42.5, // 85% of 50Ah LiFePO4
  maxBatteryAh: 50.0,
  hopperServoActive: false,
  feedCycles: 18,

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
        this.state.batteryChargeAh = 42.5
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
        this.state.batteryChargeAh = 6.0 // 12% of 50Ah (Below 15% LiFePO4 Cutoff)
        // Load shedding automatically disconnects auxiliary loads
        this.state.relays.fans = false
        this.state.relays.aux = false
        break
      case 'tegPeak':
        this.state.stoveTempTarget = 222.0
        this.state.currentStoveTemp = 220.0
        this.state.batteryChargeAh = 35.0
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
    if ((key === 'fans' || key === 'aux') && currentPct <= this.cal.batteryCutoffPct && !this.state.relays[key]) {
      // Shed interlock prevented turning on
      return false
    }

    this.state.relays[key] = !this.state.relays[key]
    return true
  }

  /**
   * Trigger simulated fuel hopper servo pulse
   */
  public pulseServo(): boolean {
    this.state.hopperServoActive = true
    this.state.feedCycles++
    setTimeout(() => {
      this.state.hopperServoActive = false
    }, 1200)
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
    // 1. Stove Thermal Physics: Exponential approach toward target + small combustion noise
    const approachSpeed = 0.05 * dtSeconds
    const jitter = (Math.random() - 0.48) * 0.6
    this.state.currentStoveTemp += (this.state.stoveTempTarget - this.state.currentStoveTemp) * approachSpeed + jitter
    this.state.currentStoveTemp = Math.max(20, Math.min(320, this.state.currentStoveTemp))

    // 2. DHT22 Ambient conditions (micro drift)
    const ambientJitter = (Math.random() - 0.5) * 0.08
    const ambientTemp = Math.round((this.state.ambientTempBase + ambientJitter) * 10) / 10
    const humidityJitter = (Math.random() - 0.5) * 0.2
    const humidity = Math.min(99, Math.max(20, Math.round(this.state.humidityBase + humidityJitter)))

    // 3. TEG Thermoelectric Physics (Seebeck Effect)
    // Delta T = StoveTemp - Heatsink Cold Face Temp
    const heatsinkColdFace = Math.round((ambientTemp + Math.min(18, (this.state.currentStoveTemp - ambientTemp) * 0.08)) * 10) / 10
    const deltaT = Math.max(0, this.state.currentStoveTemp - heatsinkColdFace)
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
    const lightW = isBusOn && this.state.relays.lights ? 4.8 : 4.8
    const fanW = isBusOn && this.state.relays.fans ? 12.0 : 0
    const servoW = isBusOn && this.state.hopperServoActive ? 7.8 : 0
    const auxW = isBusOn && this.state.relays.aux ? 5.0 : 0
    const totalLoadW = lightW + fanW + servoW + auxW

    // 5. 12V 50Ah LiFePO4 State of Charge (SoC) integration
    const tegW = rawTegVoltage * rawTegCurrent
    // Net power balance (+ charging, - discharging)
    const netW = tegW - totalLoadW

    // Approximate LiFePO4 nominal voltage based on SoC (10.0V cutoff to 14.6V absorption)
    const currentSocRatio = Math.max(0, Math.min(1, this.state.batteryChargeAh / this.state.maxBatteryAh))
    const nominalV = this.cal.batteryVMin + (currentSocRatio * (this.cal.batteryVMax - this.cal.batteryVMin))

    if (dtSeconds > 0) {
      const deltaAh = (netW / nominalV) * (dtSeconds / 3600)
      this.state.batteryChargeAh = Math.max(0, Math.min(this.state.maxBatteryAh, this.state.batteryChargeAh + deltaAh))

      // Automated Load Shedding: If battery drops <= cutoffPct, disconnect secondary loads
      const currentPct = (this.state.batteryChargeAh / this.state.maxBatteryAh) * 100
      if (currentPct <= this.cal.batteryCutoffPct) {
        if (this.state.relays.fans) this.state.relays.fans = false
        if (this.state.relays.aux) this.state.relays.aux = false
      }
    }

    const rawBatteryVoltage = Math.round(nominalV * 100) / 100

    // 6. MQ-7 Carbon Monoxide Simulation (PPM)
    let targetCo = 14
    if (this.state.currentStoveTemp < 95) {
      targetCo = 68 // Smoldering / incomplete combustion
    } else if (this.state.currentStoveTemp > 240) {
      targetCo = 35
    }
    const coJitter = (Math.random() - 0.5) * 2.5
    const rawCoPpm = Math.max(0, Math.round(targetCo + coJitter))

    // 7. Simulated thesis.ino ESP32 State Machine and Counters
    const vOpen = 14.4 - 0.018 * Math.max(0, ambientTemp - 25.0)
    const vClose = 13.6 - 0.018 * Math.max(0, ambientTemp - 25.0)
    const vHard = 14.6 - 0.018 * Math.max(0, ambientTemp - 25.0)

    let simState = 1
    let simStateName = 'CHARGING'
    let simStateReason = 'charging allowed, relay closed'

    if (rawBatteryVoltage < 6.0 || rawBatteryVoltage > 16.5) {
      simState = 0
      simStateName = 'NO BATTERY'
      simStateReason = 'no valid battery reading (needs 6 to 16.5 V at the battery divider)'
    } else if (ambientTemp >= 45.0) {
      simState = 5
      simStateName = 'BATTERY HOT'
      simStateReason = 'battery temperature too high'
    } else if (!isBusOn) {
      simState = 4
      simStateName = 'FORCED OFF'
      simStateReason = 'charging forced OFF by command'
    } else if (rawBatteryVoltage >= vOpen) {
      simState = 2
      simStateName = 'FULL-HOLD'
      simStateReason = 'battery reached its limit, relay open'
    }

    const simRelayClosed = simState === 1
    const pBatSim = Math.round(rawBatteryVoltage * rawTegCurrent * 10) / 10
    const pHarvSim = Math.round(rawTegVoltage * rawTegCurrent * 10) / 10

    const simAlarms: string[] = []
    if (rawBatteryVoltage < 11.8) simAlarms.push('battery low (<11.8 V)')
    if (rawBatteryVoltage >= vOpen) simAlarms.push('battery at charge limit')
    if (this.state.currentStoveTemp > 230) simAlarms.push('hot side over 230 C')
    if (heatsinkColdFace > 60) simAlarms.push('cold side over 60 C')
    if (rawTegVoltage > 45) simAlarms.push('TEG voltage over 45 V')

    return applyCalibration(
      {
        rawStoveTemp: Math.round(this.state.currentStoveTemp * 10) / 10,
        rawColdFaceTemp: heatsinkColdFace,
        rawAmbientTemp: ambientTemp,
        rawHumidity: humidity,
        rawBatteryVoltage: rawBatteryVoltage,
        rawTegVoltage: Math.round(rawTegVoltage * 100) / 100,
        rawTegCurrent: Math.round(rawTegCurrent * 100) / 100,
        rawCoPpm,
        hopperServoActive: this.state.hopperServoActive,
        feedCycles: this.state.feedCycles,
        relays: {
          dcBus: simRelayClosed,
          lights: this.state.relays.lights,
          fans: simRelayClosed,
          aux: this.state.relays.aux,
        },
        esp32: {
          stateCode: simState,
          stateName: simStateName,
          stateReason: simStateReason,
          relayClosed: simRelayClosed,
          forceMode: isBusOn ? 0 : 2,
          uptimeStr: new Date().toTimeString().split(' ')[0],
          pBatW: pBatSim,
          pHarvW: pHarvSim,
          whTotal: Math.round(pBatSim * 0.12 * 100) / 100,
          whHarv: Math.round(pHarvSim * 0.14 * 100) / 100,
          vTegPeak: Math.max(14.8, rawTegVoltage),
          hotFault: false,
          coldFault: false,
          hotWhy: 'ok',
          coldWhy: 'ok',
          dhtOk: true,
          ts1Tripped: false,
          overcurrentLatched: false,
          batHot: ambientTemp >= 45,
          vOpenNow: Math.round(vOpen * 100) / 100,
          vCloseNow: Math.round(vClose * 100) / 100,
          vHardNow: Math.round(vHard * 100) / 100,
          batTrim: 1.1011,
          tegTrim: 1.1679,
          curTrim: 1.0,
          acsVolts: 2.5 + rawTegCurrent * 0.185,
          acsZero: 2.5,
          alarmsText: simAlarms.length ? simAlarms.join(', ') : 'none',
          activeAlarms: simAlarms,
          note: simState === 1 && rawTegCurrent === 0 ? 'TEG voltage is too low to charge' : undefined,
        },
        timestamp: Date.now(),
        source: 'simulated',
      },
      this.cal
    )
  }
}
