import { TelemetryData, TelemetryPoint } from '../types/telemetry'

export interface TelemetryStats {
  peakStoveTemp: number
  peakTegPower: number
  totalEnergyGeneratedWh: number
  minBatteryPct: number
  avgAmbientTemp: number
  sampleCount: number
  startTime: number
}

export class TelemetryHistoryManager {
  private points: TelemetryPoint[] = []
  private maxPoints: number = 60
  // Expanded buffer size for 8-10 continuous hours of 1 Hz testing (up to 36,000 points)
  private fullLog: Array<TelemetryData & { isoTime: string }> = []
  private maxFullLog: number = 36000
  private stats: TelemetryStats

  constructor(maxPoints: number = 60, maxFullLog: number = 36000) {
    this.maxPoints = maxPoints
    this.maxFullLog = maxFullLog
    this.stats = {
      peakStoveTemp: 0,
      peakTegPower: 0,
      totalEnergyGeneratedWh: 0,
      minBatteryPct: 100,
      avgAmbientTemp: 0,
      sampleCount: 0,
      startTime: Date.now(),
    }
  }

  public addPoint(data: TelemetryData) {
    const timeStr = new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    // Bounds and NaN sanitization
    const safeStoveTemp = Number.isFinite(data.stoveTemp) ? data.stoveTemp : 0
    const safeColdFaceTemp = Number.isFinite(data.coldFaceTemp) ? data.coldFaceTemp : 25
    const safeDeltaT = Number.isFinite(data.deltaT) ? data.deltaT : Math.max(0, safeStoveTemp - safeColdFaceTemp)
    const safeAmbientTemp = Number.isFinite(data.ambientTemp) ? data.ambientTemp : 28
    const safeHumidity = Number.isFinite(data.humidity) ? data.humidity : 60
    const safeBattPct = Number.isFinite(data.batteryPct) ? data.batteryPct : 50
    const safeBattV = Number.isFinite(data.batteryVoltage) ? data.batteryVoltage : 12.0
    const safeBattISigned = Number.isFinite(data.batteryCurrentSigned) ? data.batteryCurrentSigned : 0
    const safeTegV = Number.isFinite(data.tegVoltage) ? data.tegVoltage : 0
    const safeTegI = Number.isFinite(data.tegCurrent) ? data.tegCurrent : 0
    const safeTegPower = Number.isFinite(data.tegPower) ? data.tegPower : 0
    const safeLoadPower = Number.isFinite(data.loadPower) ? data.loadPower : 0

    const pt: TelemetryPoint = {
      time: timeStr,
      timestamp: data.timestamp,
      stoveTemp: safeStoveTemp,
      coldFaceTemp: safeColdFaceTemp,
      deltaT: safeDeltaT,
      ambientTemp: safeAmbientTemp,
      humidity: safeHumidity,
      batteryPct: safeBattPct,
      batteryVoltage: safeBattV,
      batteryCurrentSigned: safeBattISigned,
      tegVoltage: safeTegV,
      tegCurrent: safeTegI,
      tegPower: safeTegPower,
      loadPower: safeLoadPower,
      criticalLoadActive: data.criticalLoadActive ?? true,
      auxLoadActive: data.auxLoadActive ?? false,
      auxLockout: data.auxLockout ?? false,
      feedstock: data.feedstock || 'unassigned',
      runId: data.runId || 'RUN-01',
      sensorFault: data.sensorFault ?? false,
    }

    this.points.push(pt)
    if (this.points.length > this.maxPoints) {
      this.points.shift()
    }

    // Keep full log for Chapter 4 CSV export without dropping 6-8 hr burn test records
    const sanitizedRecord: TelemetryData & { isoTime: string } = {
      ...data,
      stoveTemp: safeStoveTemp,
      coldFaceTemp: safeColdFaceTemp,
      deltaT: safeDeltaT,
      ambientTemp: safeAmbientTemp,
      humidity: safeHumidity,
      batteryPct: safeBattPct,
      batteryVoltage: safeBattV,
      batteryCurrentSigned: safeBattISigned,
      tegVoltage: safeTegV,
      tegCurrent: safeTegI,
      tegPower: safeTegPower,
      loadPower: safeLoadPower,
      isoTime: new Date(data.timestamp).toISOString(),
    }

    this.fullLog.push(sanitizedRecord)
    if (this.fullLog.length > this.maxFullLog) {
      this.fullLog.shift()
    }

    // Update session statistics safely
    this.stats.sampleCount++
    if (safeStoveTemp > this.stats.peakStoveTemp) this.stats.peakStoveTemp = safeStoveTemp
    if (safeTegPower > this.stats.peakTegPower) this.stats.peakTegPower = safeTegPower
    if (safeBattPct < this.stats.minBatteryPct) this.stats.minBatteryPct = safeBattPct

    // Integrate Wh (assuming ~1 second per tick = watts * (1/3600))
    this.stats.totalEnergyGeneratedWh += (safeTegPower / 3600)
    this.stats.avgAmbientTemp =
      ((this.stats.avgAmbientTemp * (this.stats.sampleCount - 1)) + safeAmbientTemp) / this.stats.sampleCount
  }

  public getPoints(): TelemetryPoint[] {
    return [...this.points]
  }

  public getStats(): TelemetryStats {
    return { ...this.stats }
  }

  public clearHistory() {
    this.points = []
    this.fullLog = []
    this.stats = {
      peakStoveTemp: 0,
      peakTegPower: 0,
      totalEnergyGeneratedWh: 0,
      minBatteryPct: 100,
      avgAmbientTemp: 0,
      sampleCount: 0,
      startTime: Date.now(),
    }
  }

  /**
   * Export all recorded telemetry points to a CSV file for Chapter 4 thesis analysis.
   * Conforms strictly to thesis requirements:
   * Timestamp,Run_ID,Feedstock,Hot_Side_C,Cold_Side_C,Delta_T_C,Ambient_C,TEG_Voltage_V,TEG_Current_mA,TEG_Power_W,Batt_Voltage_V,Batt_Current_mA,Load_Power_W,SoC_Pct,Aux_Load_State
   */
  public exportCsv(feedstock?: string, runId?: string, filenamePrefix: string = 'padayon_biomass_teg'): boolean {
    if (this.fullLog.length === 0) {
      return false
    }

    const headers = [
      'Timestamp',
      'Run_ID',
      'Feedstock',
      'Hot_Side_C',
      'Cold_Side_C',
      'Delta_T_C',
      'Ambient_C',
      'TEG_Voltage_V',
      'TEG_Current_mA',
      'TEG_Power_W',
      'Batt_Voltage_V',
      'Batt_Current_mA',
      'Load_Power_W',
      'SoC_Pct',
      'Aux_Load_State',
    ]

    const rows = this.fullLog.map((row) => {
      const activeFeedstock = feedstock || row.feedstock || 'unassigned'
      const activeRunId = runId || row.runId || 'RUN-01'
      const auxState = row.auxLoadActive ? 'ON' : row.auxLockout ? 'LOCKED_OUT' : 'OFF'

      return [
        row.isoTime,
        activeRunId,
        activeFeedstock,
        row.stoveTemp.toFixed(1),
        row.coldFaceTemp.toFixed(1),
        row.deltaT.toFixed(1),
        row.ambientTemp.toFixed(1),
        row.tegVoltage.toFixed(2),
        Math.round(row.tegCurrent * 1000), // Converted to mA
        row.tegPower.toFixed(2),
        row.batteryVoltage.toFixed(2),
        Math.round(row.batteryCurrentSigned * 1000), // Converted to signed mA
        row.loadPower.toFixed(2),
        Math.round(row.batteryPct),
        auxState,
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const effectiveTag = feedstock ? `_${feedstock}` : ''
    link.setAttribute('href', url)
    link.setAttribute('download', `${filenamePrefix}${effectiveTag}_${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return true
  }
}
