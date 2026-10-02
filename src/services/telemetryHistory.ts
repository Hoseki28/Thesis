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
  private fullLog: Array<TelemetryData & { isoTime: string }> = []
  private stats: TelemetryStats

  constructor(maxPoints: number = 60) {
    this.maxPoints = maxPoints
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

    const pt: TelemetryPoint = {
      time: timeStr,
      timestamp: data.timestamp,
      stoveTemp: data.stoveTemp,
      ambientTemp: data.ambientTemp,
      humidity: data.humidity,
      batteryPct: data.batteryPct,
      batteryVoltage: data.batteryVoltage,
      tegPower: data.tegPower,
      loadPower: data.loadPower,
    }

    this.points.push(pt)
    if (this.points.length > this.maxPoints) {
      this.points.shift()
    }

    // Keep full log for CSV export (up to 5,000 samples)
    this.fullLog.push({
      ...data,
      isoTime: new Date(data.timestamp).toISOString(),
    })
    if (this.fullLog.length > 5000) {
      this.fullLog.shift()
    }

    // Update session statistics
    this.stats.sampleCount++
    if (data.stoveTemp > this.stats.peakStoveTemp) this.stats.peakStoveTemp = data.stoveTemp
    if (data.tegPower > this.stats.peakTegPower) this.stats.peakTegPower = data.tegPower
    if (data.batteryPct < this.stats.minBatteryPct) this.stats.minBatteryPct = data.batteryPct

    // Integrate Wh (assuming ~1 second per tick = watts * (1/3600))
    this.stats.totalEnergyGeneratedWh += (data.tegPower / 3600)
    this.stats.avgAmbientTemp =
      ((this.stats.avgAmbientTemp * (this.stats.sampleCount - 1)) + data.ambientTemp) / this.stats.sampleCount
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
   * Export all recorded telemetry points to a CSV file for thesis analysis
   */
  public exportCsv(filenamePrefix: string = 'padayon_telemetry'): boolean {
    if (this.fullLog.length === 0) {
      return false
    }

    const headers = [
      'Timestamp_ISO',
      'Epoch_MS',
      'Data_Source',
      'Stove_Temp_C',
      'Ambient_Temp_C',
      'Humidity_Pct',
      'Battery_Voltage_V',
      'Battery_Pct',
      'TEG_Voltage_V',
      'TEG_Current_A',
      'TEG_Power_W',
      'Load_Power_W',
      'Net_Current_A',
      'Lights_Relay',
      'Fans_Relay',
    ]

    const rows = this.fullLog.map((row) => [
      row.isoTime,
      row.timestamp,
      row.source,
      row.stoveTemp.toFixed(1),
      row.ambientTemp.toFixed(1),
      row.humidity.toFixed(0),
      row.batteryVoltage.toFixed(2),
      row.batteryPct,
      row.tegVoltage.toFixed(2),
      row.tegCurrent.toFixed(2),
      row.tegPower.toFixed(2),
      row.loadPower.toFixed(2),
      row.netCurrent.toFixed(2),
      row.relays.lights ? 1 : 0,
      row.relays.fans ? 1 : 0,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filenamePrefix}_${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return true
  }
}
