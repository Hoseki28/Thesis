import { SystemLogEntry, SystemLogLevel } from '../types/telemetry'

export const MAX_SYSTEM_LOGS = 50

/**
 * Format timestamps as `YYYY-MM-DD hh:mm AM/PM` in Asia/Manila (PHT, UTC+8) - strictly 12-hour format.
 */
export function formatLogTimestamp(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    const parts = formatter.formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const hour = get('hour') || '12'
    const minute = get('minute') || '00'
    const period = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || (date.getHours() >= 12 ? 'PM' : 'AM')
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${minute} ${period}`
  } catch {
    return date.toLocaleString('en-US', { hour12: true })
  }
}

/**
 * Generate initial system logs dynamically relative to current runtime:
 * -180m (3 hrs ago), -90m (1.5 hrs ago), -45m (45 mins ago), and -10m (10 mins ago).
 */
export function getInitialSystemLogs(): SystemLogEntry[] {
  const now = Date.now()
  const offsetTime = (mins: number) => new Date(now - mins * 60 * 1000)

  return [
    {
      id: 'init-4',
      timestamp: formatLogTimestamp(offsetTime(5)),
      timestampMs: now - 5 * 60 * 1000,
      level: 'warning',
      message: 'State Machine: HOLD/OFF (GPIO14: OPEN) · Standby awaiting battery voltage connection',
      messageFil: 'State Machine: HOLD/OFF (GPIO14: BUKAS) · Naka-standby habang naghihintay ng baterya',
      source: 'esp32',
    },
    {
      id: 'init-3',
      timestamp: formatLogTimestamp(offsetTime(15)),
      timestampMs: now - 15 * 60 * 1000,
      level: 'info',
      message: 'ACS712 Current Sensor (GPIO35) zero-drift calibrated · Multimeter trim gains armed',
      messageFil: 'ACS712 Current Sensor (GPIO35) zero-drift na-calibrate · Naka-arm ang trim gains',
      source: 'esp32',
    },
    {
      id: 'init-2',
      timestamp: formatLogTimestamp(offsetTime(30)),
      timestampMs: now - 30 * 60 * 1000,
      level: 'info',
      message: 'Environmental telemetry online: DHT22 GPIO23 (Amb: 31.2°C, 65% RH), MAX6675 SPI (Hot Face: 0°C)',
      messageFil: 'Online ang telemetriya ng paligid: DHT22 GPIO23 (31.2°C, 65% RH), MAX6675 SPI (0°C)',
      source: 'system',
    },
    {
      id: 'init-1',
      timestamp: formatLogTimestamp(offsetTime(60)),
      timestampMs: now - 60 * 60 * 1000,
      level: 'info',
      message: 'B-TEG Core Node #01 Wawa Dam initialized · Nordic UART BLE & Serial telemetry online',
      messageFil: 'B-TEG Core Node #01 Wawa Dam nag-umpisa · Aktibo ang Nordic UART BLE at Serial telemetry',
      source: 'system',
    },
  ]
}

export class SystemLogManager {
  private logs: SystemLogEntry[]
  private listeners: Array<(logs: SystemLogEntry[]) => void> = []

  constructor() {
    this.logs = getInitialSystemLogs()
  }

  public getLogs(): SystemLogEntry[] {
    return [...this.logs]
  }

  /**
   * Prepend a new system log with strictly formatted timestamp and level mapping.
   * Caps buffer at MAX_SYSTEM_LOGS (50).
   */
  public addSystemLog(
    message: string,
    level: SystemLogLevel,
    messageFil?: string,
    source: 'system' | 'esp32' | 'threshold' | 'user' = 'system'
  ): SystemLogEntry {
    const now = new Date()
    const entry: SystemLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: formatLogTimestamp(now),
      timestampMs: now.getTime(),
      level,
      message,
      messageFil,
      source,
    }

    this.logs = [entry, ...this.logs].slice(0, MAX_SYSTEM_LOGS)
    this.notify()
    return entry
  }

  public clearLogs() {
    this.logs = []
    this.notify()
  }

  public resetToDefaults() {
    this.logs = getInitialSystemLogs()
    this.notify()
  }

  public subscribe(listener: (logs: SystemLogEntry[]) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notify() {
    const snapshot = [...this.logs]
    this.listeners.forEach((listener) => listener(snapshot))
  }

  /**
   * Export the current dynamic log list as CSV.
   */
  public exportCsv(filename = 'bteg_system_logs'): boolean {
    if (this.logs.length === 0) return false

    const headers = ['Timestamp (PHT)', 'Level', 'Event Description', 'Source', 'Log ID']
    const rows = this.logs.map((log) => [
      `"${log.timestamp}"`,
      `"${log.level.toUpperCase()}"`,
      `"${log.message.replace(/"/g, '""')}"`,
      `"${log.source || 'system'}"`,
      `"${log.id}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const dateStr = formatLogTimestamp(new Date()).replace(/[: ]/g, '_')
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${filename}_${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  }
}

export const systemLogManager = new SystemLogManager()
