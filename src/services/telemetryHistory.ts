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
    const timeStr = new Date(data.timestamp).toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    const phtTimestamp = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date(data.timestamp))

    // Hardware truth & bounds sanitization
    const safeBattV = Number.isFinite(data.vBat)
      ? (data.vBat as number)
      : Number.isFinite(data.batteryVoltage)
      ? data.batteryVoltage
      : 0.0
    const safeBattPct = Number.isFinite(data.batteryPct) ? Math.max(0, Math.min(100, Math.round(data.batteryPct))) : 0

    const safeTegV = Number.isFinite(data.vTeg)
      ? (data.vTeg as number)
      : Number.isFinite(data.tegVoltage)
      ? data.tegVoltage
      : 0.0
    const safeTegI = Number.isFinite(data.iBat)
      ? (data.iBat as number)
      : Number.isFinite(data.rawTegCurrent)
      ? (data.rawTegCurrent as number)
      : Number.isFinite(data.tegCurrent)
      ? data.tegCurrent
      : 0.0
    const safeTegPower = Number.isFinite(data.pHarv)
      ? (data.pHarv as number)
      : data.tegPower > 0
      ? data.tegPower
      : Math.round(safeTegV * safeTegI * 10) / 10
    const safeWhHarv = Number.isFinite(data.whHarv) ? (data.whHarv as number) : 0.0

    const safeHotTemp = Number.isFinite(data.tHot)
      ? (data.tHot as number)
      : Number.isFinite(data.stoveTemp)
      ? data.stoveTemp
      : 0.0
    const safeColdTemp = Number.isFinite(data.tCold)
      ? (data.tCold as number)
      : Number.isFinite(data.coldFaceTemp)
      ? (data.coldFaceTemp as number)
      : 25.0
    const safeDeltaT = Number.isFinite(data.dT)
      ? (data.dT as number)
      : Number.isFinite(data.deltaT)
      ? data.deltaT
      : Math.max(0, Math.round((safeHotTemp - safeColdTemp) * 10) / 10)

    const safeAmbientTemp = Number.isFinite(data.tAmb)
      ? (data.tAmb as number)
      : Number.isFinite(data.ambientTemp)
      ? data.ambientTemp
      : 31.2
    const safeHumidity = Number.isFinite(data.hum)
      ? (data.hum as number)
      : Number.isFinite(data.humidity)
      ? data.humidity
      : 65.0

    const isRelayClosed = Boolean(data.relayOn ?? data.relays?.dcBus)
    const relayStateStr = isRelayClosed ? 'CLOSED (Charging Active)' : 'OPEN (Standby / Hold)'
    const espStateStr = (data.stateName || data.esp32?.stateName || (isRelayClosed ? 'CHARGING' : 'HOLD/OFF')).trim()
    const alarmsStr = (data.activeAlarms && data.activeAlarms.length > 0)
      ? data.activeAlarms.join('; ')
      : data.alarmsText || 'NOMINAL'

    const pt: TelemetryPoint = {
      time: timeStr,
      timestamp: data.timestamp,
      stoveTemp: safeHotTemp,
      coldFaceTemp: safeColdTemp,
      deltaT: safeDeltaT,
      ambientTemp: safeAmbientTemp,
      humidity: safeHumidity,
      batteryPct: safeBattPct,
      batteryVoltage: safeBattV,
      batteryCurrentSigned: safeTegI,
      tegVoltage: safeTegV,
      tegCurrent: safeTegI,
      tegPower: safeTegPower,
      loadPower: data.loadPower ?? 0,
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

    // Extended record for Excel analysis
    const sanitizedRecord: TelemetryData & { isoTime: string; phtTime: string; relayStr: string; espStateStr: string; alarmsStr: string } = {
      ...data,
      stoveTemp: safeHotTemp,
      coldFaceTemp: safeColdTemp,
      deltaT: safeDeltaT,
      ambientTemp: safeAmbientTemp,
      humidity: safeHumidity,
      batteryPct: safeBattPct,
      batteryVoltage: safeBattV,
      tegVoltage: safeTegV,
      tegCurrent: safeTegI,
      tegPower: safeTegPower,
      whHarv: safeWhHarv,
      isoTime: new Date(data.timestamp).toISOString(),
      phtTime: phtTimestamp,
      relayStr: relayStateStr,
      espStateStr: espStateStr,
      alarmsStr: alarmsStr,
    }

    this.fullLog.push(sanitizedRecord)
    if (this.fullLog.length > this.maxFullLog) {
      this.fullLog.shift()
    }

    // Update session statistics safely
    this.stats.sampleCount++
    if (safeHotTemp > this.stats.peakStoveTemp) this.stats.peakStoveTemp = safeHotTemp
    if (safeTegPower > this.stats.peakTegPower) this.stats.peakTegPower = safeTegPower
    if (safeBattPct < this.stats.minBatteryPct) this.stats.minBatteryPct = safeBattPct
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
   * Filter chronological records to at most one sample per `intervalSeconds` (e.g. 900s = 15 minutes).
   * Always keeps the first sample (t = 0) and then the first sample at or after each interval boundary.
   * Passing `intervalSeconds <= 0` returns all recorded samples.
   */
  public filterByInterval<T extends { timestamp?: number }>(records: T[], intervalSeconds: number): T[] {
    if (!records.length || intervalSeconds <= 0) return records
    const intervalMs = intervalSeconds * 1000
    const selected: T[] = [records[0]]
    let lastTs = records[0].timestamp ?? 0

    for (let i = 1; i < records.length; i++) {
      const ts = records[i].timestamp ?? 0
      if (ts - lastTs >= intervalMs) {
        selected.push(records[i])
        lastTs = ts
      }
    }
    return selected
  }

  public getExportRowCount(intervalSeconds: number = 900): number {
    const base = this.fullLog.length > 0 ? this.fullLog : this.points
    if (base.length === 0) return 0
    return this.filterByInterval(base, intervalSeconds).length
  }

  /**
   * Export recorded telemetry points to a clean CSV file specifically formatted for Excel analysis.
   * Defaults to 15-minute (900s) intervals so multi-hour thesis runs produce clean, compact Excel tables.
   * Prepends UTF-8 BOM (\uFEFF) so Excel on Windows immediately opens columns without delimiter confusion.
   */
  public exportCsv(
    feedstock?: string,
    runId?: string,
    filenamePrefix: string = 'bteg_esp32_readings_excel',
    fallbackCurrent?: TelemetryData,
    intervalSeconds: number = 900
  ): boolean {
    const rawRecords = this.fullLog.length > 0
      ? this.fullLog
      : this.points.length > 0
      ? this.points.map((pt) => ({
          ...pt,
          vBat: pt.batteryVoltage,
          vTeg: pt.tegVoltage,
          iBat: pt.tegCurrent,
          pBat: Math.round(pt.batteryVoltage * pt.tegCurrent * 100) / 100,
          pHarv: pt.tegPower,
          whHarv: 0.0,
          tHot: pt.stoveTemp,
          tCold: pt.coldFaceTemp,
          dT: pt.deltaT,
          tAmb: pt.ambientTemp,
          hum: pt.humidity,
          phtTime: pt.time,
          relayStr: 'STANDBY (OPEN)',
          espStateStr: 'HOLD/OFF',
          alarmsStr: 'NOMINAL',
        }))
      : fallbackCurrent
      ? [
          {
            ...fallbackCurrent,
            relayStr: (fallbackCurrent.relayOn ?? fallbackCurrent.relays?.dcBus)
              ? 'CLOSED (Charging Active)'
              : 'OPEN (Standby / Hold)',
            espStateStr: fallbackCurrent.stateName || fallbackCurrent.esp32?.stateName || 'HOLD/OFF',
            alarmsStr:
              fallbackCurrent.activeAlarms && fallbackCurrent.activeAlarms.length > 0
                ? fallbackCurrent.activeAlarms.join('; ')
                : fallbackCurrent.alarmsText || 'NOMINAL',
          },
        ]
      : []

    if (rawRecords.length === 0) {
      return false
    }

    const records = this.filterByInterval(rawRecords, intervalSeconds)
    const firstTs = records[0].timestamp || Date.now()

    const headers = [
      'Date (PHT)',
      'Time (PHT)',
      'Elapsed_Min',
      'Run_ID',
      'Feedstock',
      'Battery_Voltage_V',
      'Battery_SOC_Percent',
      'TEG_Voltage_V',
      'TEG_Current_A',
      'In_Battery_Power_W',
      'TEG_Power_W',
      'Harvested_Energy_Wh',
      'Stove_Hot_Face_Temp_C',
      'Cold_Sink_Temp_C',
      'Delta_T_Seebeck_C',
      'Ambient_Temp_C',
      'Relative_Humidity_Percent',
      'Charger_Relay_GPIO14',
      'ESP32_State_Machine',
      'Active_Alarms',
    ]

    const formatExcelDateTime = (tsMs: number) => {
      try {
        const d = new Date(tsMs)
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).formatToParts(d)
        const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
        const period = get('dayPeriod').toUpperCase() || (d.getHours() >= 12 ? 'PM' : 'AM')
        return {
          dateStr: `${get('year')}-${get('month')}-${get('day')}`,
          timeStr: `${get('hour')}:${get('minute')}:${get('second')} ${period}`,
        }
      } catch {
        const iso = new Date(tsMs).toISOString()
        return { dateStr: iso.slice(0, 10), timeStr: iso.slice(11, 19) }
      }
    }

    const rows = records.map((row: any) => {
      const activeFeedstock = feedstock || row.feedstock || 'Biomass_Charcoal'
      const activeRunId = runId || row.runId || 'RUN-01'
      const rowTs = row.timestamp || Date.now()
      const { dateStr, timeStr } = formatExcelDateTime(rowTs)
      const elapsedMin = Math.max(0, (rowTs - firstTs) / 60000).toFixed(1)

      const vBatNum = Number.isFinite(row.vBat) ? Number(row.vBat) : Number(row.batteryVoltage || 0)
      const vTegNum = Number.isFinite(row.vTeg) ? Number(row.vTeg) : Number(row.tegVoltage || 0)
      const iBatNum = Number.isFinite(row.iBat) ? Number(row.iBat) : Number(row.tegCurrent || 0)
      const pBatNum = Number.isFinite(row.pBat) ? Number(row.pBat) : vBatNum * iBatNum
      const pHarvNum = Number.isFinite(row.pHarv) ? Number(row.pHarv) : Number(row.tegPower || vTegNum * iBatNum)

      const vBat = vBatNum.toFixed(2)
      const soc = Math.round(row.batteryPct ?? 0)
      const vTeg = vTegNum.toFixed(2)
      const iBat = iBatNum.toFixed(3)
      const pBat = pBatNum.toFixed(2)
      const pHarv = pHarvNum.toFixed(2)
      const whHarv = Number.isFinite(row.whHarv) ? Number(row.whHarv).toFixed(4) : '0.0000'
      const tHot = Number.isFinite(row.tHot) ? Number(row.tHot).toFixed(1) : Number(row.stoveTemp || 0).toFixed(1)
      const tCold = Number.isFinite(row.tCold) ? Number(row.tCold).toFixed(1) : Number(row.coldFaceTemp || 25).toFixed(1)
      const dT = Number.isFinite(row.dT) ? Number(row.dT).toFixed(1) : Number(row.deltaT || 0).toFixed(1)
      const tAmb = Number.isFinite(row.tAmb) ? Number(row.tAmb).toFixed(1) : Number(row.ambientTemp || 31.2).toFixed(1)
      const hum = Math.round(row.hum ?? row.humidity ?? 65)

      const relay = row.relayStr || (row.relayOn ? 'CLOSED (Charging Active)' : 'OPEN (Standby / Hold)')
      const espState = row.espStateStr || row.stateName || 'HOLD/OFF'
      const alarms = row.alarmsStr || 'NOMINAL'

      return [
        `="${dateStr}"`,
        `="${timeStr}"`,
        elapsedMin,
        `"${activeRunId}"`,
        `"${activeFeedstock}"`,
        vBat,
        soc,
        vTeg,
        iBat,
        pBat,
        pHarv,
        whHarv,
        tHot,
        tCold,
        dT,
        tAmb,
        hum,
        `"${relay}"`,
        `"${espState}"`,
        `"${alarms}"`,
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    // Prepend \uFEFF Byte Order Mark for Microsoft Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const intervalTag = intervalSeconds > 0 ? `${Math.round(intervalSeconds / 60)}min` : '1s'
    const link = document.createElement('a')
    const nowPht = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filenamePrefix}_${intervalTag}_${nowPht}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return true
  }
}
