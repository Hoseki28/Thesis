import { SystemLogEntry, SystemLogLevel } from '../types/telemetry'

export const MAX_SYSTEM_LOGS = 50

/**
 * Strictly format timestamps as `YYYY-MM-DD HH:mm` in Asia/Manila (PHT, UTC+8).
 */
export function formatLogTimestamp(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
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
      timestamp: formatLogTimestamp(offsetTime(10)),
      timestampMs: now - 10 * 60 * 1000,
      level: 'error',
      message: 'Battery level below 20% cutoff threshold',
      messageFil: 'Mababa na sa 20% ang lebel ng baterya',
      source: 'threshold',
    },
    {
      id: 'init-3',
      timestamp: formatLogTimestamp(offsetTime(45)),
      timestampMs: now - 45 * 60 * 1000,
      level: 'info',
      message: 'Cooling pump speed increased to nominal',
      messageFil: 'Tumaas ang bilis ng cooling pump sa normal',
      source: 'system',
    },
    {
      id: 'init-2',
      timestamp: formatLogTimestamp(offsetTime(90)),
      timestampMs: now - 90 * 60 * 1000,
      level: 'warning',
      message: 'TEG temp rising above normal operating window',
      messageFil: 'Tumaas ang temperatura ng TEG kaysa normal',
      source: 'threshold',
    },
    {
      id: 'init-1',
      timestamp: formatLogTimestamp(offsetTime(180)),
      timestampMs: now - 180 * 60 * 1000,
      level: 'info',
      message: 'System started successfully and telemetry loop online',
      messageFil: 'Matagumpay na nag-umpisa ang sistema at telemetry loop',
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
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
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
