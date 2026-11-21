import { SystemLogEntry, SystemLogLevel } from '../types/telemetry'

export const MAX_SYSTEM_LOGS = 50

/**
 * Format timestamps as `YYYY-MM-DD h:mm:ss AM/PM` in Asia/Manila (PHT, UTC+8) - strictly 12-hour format.
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
      second: '2-digit',
      hour12: true,
    })
    const parts = formatter.formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const hour = get('hour') || '12'
    const minute = get('minute') || '00'
    const second = get('second') || '00'
    const period = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || (date.getHours() >= 12 ? 'PM' : 'AM')
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${minute}:${second} ${period}`
  } catch {
    return date.toLocaleString('en-US', { hour12: true })
  }
}

/**
 * Split a timestamp into Excel-safe Date and Time parts (Asia/Manila PHT).
 */
export function formatPhtDateAndTime(date: Date): { dateStr: string; timeStr: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    const parts = formatter.formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const period = get('dayPeriod').toUpperCase() || (date.getHours() >= 12 ? 'PM' : 'AM')
    return {
      dateStr: `${get('year')}-${get('month')}-${get('day')}`,
      timeStr: `${get('hour')}:${get('minute')}:${get('second')} ${period}`,
    }
  } catch {
    const iso = date.toISOString()
    return { dateStr: iso.slice(0, 10), timeStr: iso.slice(11, 19) }
  }
}

/**
 * Generate initial system logs dynamically relative to current runtime:
 * -180m (3 hrs ago), -90m (1.5 hrs ago), -45m (45 mins ago), and -10m (10 mins ago).
 */
export function getInitialSystemLogs(): SystemLogEntry[] {
  const now = Date.now()

  return [
    {
      id: 'init-1',
      timestamp: formatLogTimestamp(new Date(now)),
      timestampMs: now,
      level: 'info',
      message: 'TEG Monitoring ready. Connect ESP32 via Bluetooth BLE ("TEG_Charger") or USB Serial (115200 baud).',
      messageFil: 'Handa na ang TEG Monitoring. Ikabit ang ESP32 sa Bluetooth BLE ("TEG_Charger") o USB Serial (115200 baud).',
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
   * Export the current dynamic log list as an Excel-friendly CSV.
   * Date and Time are split and wrapped in Excel text formulas (`="..."`)
   * so Microsoft Excel never converts them into numeric date serials that render as `#########`.
   */
  public exportCsv(filename = 'bteg_system_logs'): boolean {
    if (this.logs.length === 0) return false

    const headers = ['Date (PHT)', 'Time (PHT)', 'Level', 'Event Description', 'Source', 'Log ID']
    const rows = this.logs.map((log) => {
      const { dateStr, timeStr } = formatPhtDateAndTime(new Date(log.timestampMs || Date.now()))
      return [
        `="${dateStr}"`,
        `="${timeStr}"`,
        `"${log.level.toUpperCase()}"`,
        `"${log.message.replace(/"/g, '""')}"`,
        `"${log.source || 'system'}"`,
        `"${log.id}"`,
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    // Prepend UTF-8 BOM (\uFEFF) for Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const { dateStr, timeStr } = formatPhtDateAndTime(new Date())
    const fileStamp = `${dateStr}_${timeStr.replace(/[: ]/g, '-')}`
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `${filename}_${fileStamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  }
}

export const systemLogManager = new SystemLogManager()
