import { Esp32HardwareStatus, FeedstockType, HardwareState, TelemetryData } from '../types/telemetry'

export type HardwareDataCallback = (raw: {
  rawStoveTemp: number
  rawColdFaceTemp?: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawBatteryCurrent?: number
  rawTegVoltage: number
  rawTegCurrent: number
  rawThermalFuseTripped?: boolean
  relays: {
    dcBus?: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }
  isPhysicalCurrent?: boolean
  feedstock?: FeedstockType
  runId?: string
  fuelMassKg?: number
  rawCoPpm?: number
  hopperServoActive?: boolean
  feedCycles?: number
  coolingFanPwm?: number
  channelCurrentsMa?: [number, number, number, number]
  sensorFault?: boolean
  operatingHours?: number
  systemHealthPct?: number
  esp32?: Esp32HardwareStatus
  timestamp: number
  source: TelemetryData['source']
}) => void

export type HardwareEventCallback = (
  message: string,
  level: 'info' | 'warning' | 'error',
  messageFil?: string
) => void

// Nordic UART BLE Service UUIDs for ESP32 wireless serial bridge
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NORDIC_UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NORDIC_UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

function mapStateNameToCode(name: string): number {
  const clean = name.trim().toUpperCase()
  if (clean.startsWith('CHARGING')) return 1
  if (clean.startsWith('FULL-HOLD')) return 2
  if (clean.startsWith('WAITING')) return 3
  if (clean.startsWith('FORCED OFF')) return 4
  if (clean.startsWith('BATTERY HOT')) return 5
  if (clean.startsWith('OVERCURRENT')) return 6
  return 0
}

function defaultStateReason(stateCode: number): string {
  switch (stateCode) {
    case 0:
      return 'voltage out of range (6-16.5 V)'
    case 1:
      return 'normal charging'
    case 2:
      return 'reached full voltage limit'
    case 3:
      return 'waiting for reconnect dwell timer'
    case 4:
      return 'manually disabled (send a)'
    case 5:
      return 'ambient temperature >= 45 C'
    case 6:
      return 'current exceeded 2.2 A (send r)'
    default:
      return ''
  }
}

export class HardwareBridge {
  private state: HardwareState
  private port: any = null
  private reader: any = null
  private readableStreamClosed: any = null
  private socket: WebSocket | null = null

  private wsBuffer: string = ''
  private wsReconnectTimer: any = null
  private wsReconnectAttempts: number = 0
  private wsMaxReconnectAttempts: number = 8
  private wsTargetUrl: string = 'ws://192.168.4.1/ws'
  private isIntentionalDisconnect: boolean = false

  private bleDevice: any = null
  private bleRxChar: any = null
  private bleTxChar: any = null

  private onDataCallback?: HardwareDataCallback
  private onStateChangeCallback?: (state: HardwareState) => void
  private onEventCallback?: HardwareEventCallback

  // Cached state assembled from thesis.ino compact, detailed, and event serial lines
  private esp32Cache: Esp32HardwareStatus & {
    vTeg: number
    vBat: number
    iBat: number
    tHot: number
    tCold: number
    tAmb: number
    hum: number
    lastIntegrationMs: number
  } = {
    stateCode: 0,
    stateName: 'NO BATTERY',
    stateReason: defaultStateReason(0),
    relayClosed: false,
    forceMode: 0,
    uptimeStr: '00:00:00',
    vTeg: 0,
    vBat: 12.6,
    iBat: 0,
    pBatW: 0,
    pHarvW: 0,
    whTotal: 0,
    whHarv: 0,
    vTegPeak: 0,
    tHot: 25,
    tCold: 25,
    tAmb: 28,
    hum: 65,
    hotFault: false,
    coldFault: false,
    hotWhy: 'ok',
    coldWhy: 'ok',
    dhtOk: true,
    ts1Tripped: false,
    overcurrentLatched: false,
    batHot: false,
    vOpenNow: 14.4,
    vCloseNow: 13.6,
    vHardNow: 14.6,
    batTrim: 1.1011,
    tegTrim: 1.1679,
    curTrim: 1.0,
    acsVolts: 2.5,
    acsZero: 2.5,
    alarmsText: 'none',
    activeAlarms: [],
    note: undefined,
    inaOk: false,
    lastIntegrationMs: 0,
  }

  constructor(
    onData?: HardwareDataCallback,
    onStateChange?: (state: HardwareState) => void,
    onEvent?: HardwareEventCallback
  ) {
    this.onDataCallback = onData
    this.onStateChangeCallback = onStateChange
    this.onEventCallback = onEvent

    this.state = {
      status: 'standby',
      transport: 'none',
      portInfo: 'None (Standby Mode)',
      deviceName: undefined,
      baudRate: 115200,
      packetsReceived: 0,
      bytesReceived: 0,
      lastPacketTime: null,
      lastError: null,
      latencyMs: undefined,
      reconnectAttempts: 0,
      isAutoReconnecting: false,
      sensorFault: false,
      rawLogs: [
        {
          id: 'init-1',
          timestamp: new Date().toLocaleTimeString(),
          type: 'sys',
          text: 'Hardware Bridge initialized (115200 baud, thesis.ino protocol ready).',
        },
      ],
    }
  }

  public getState(): HardwareState {
    return { ...this.state }
  }

  public isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
  }

  public isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  public setBaudRate(baud: number) {
    this.state.baudRate = baud
    this.notifyState()
  }

  private appendLog(type: 'in' | 'out' | 'sys' | 'err', text: string) {
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      text,
    }
    this.state.rawLogs = [...this.state.rawLogs, entry].slice(-100)
    this.notifyState()
  }

  public clearLogs() {
    this.state.rawLogs = []
    this.notifyState()
  }

  private notifyState() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.state })
    }
  }

  private recordPacket() {
    const now = Date.now()
    if (this.state.lastPacketTime) {
      this.state.latencyMs = Math.max(1, now - this.state.lastPacketTime)
    } else {
      this.state.latencyMs = 25
    }
    this.state.packetsReceived++
    this.state.lastPacketTime = now
  }

  public async connectSerial(baudRate?: number): Promise<boolean> {
    if (!this.isWebSerialSupported()) {
      this.state.status = 'error'
      this.state.lastError = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.'
      this.appendLog('err', this.state.lastError)
      return false
    }

    const baud = baudRate || this.state.baudRate

    try {
      this.state.status = 'connecting'
      this.notifyState()
      this.appendLog('sys', `Requesting USB serial port (Baud: ${baud})...`)

      // @ts-ignore - Web Serial API
      this.port = await navigator.serial.requestPort()
      await this.port.open({ baudRate: baud })

      this.state.status = 'connected'
      this.state.transport = 'serial'
      this.state.deviceName = 'ESP32 TEG Charger (USB Serial)'
      this.state.portInfo = `USB Serial (${baud} baud)`
      this.state.lastError = null
      this.appendLog('sys', `Connected to ESP32 over USB Serial at ${baud} baud.`)
      this.notifyState()

      this.startSerialReadLoop()
      return true
    } catch (err: any) {
      this.state.status = 'standby'
      this.state.transport = 'none'
      this.state.lastError = err?.message || 'Failed to open serial port'
      this.appendLog('err', `Serial Connection Error: ${this.state.lastError}`)
      this.notifyState()
      return false
    }
  }

  private async startSerialReadLoop() {
    try {
      // @ts-ignore
      const textDecoder = new TextDecoderStream()
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable)
      this.reader = textDecoder.readable.getReader()

      let buffer = ''

      while (this.port && this.port.readable) {
        const { value, done } = await this.reader.read()
        if (done) {
          break
        }
        if (value) {
          buffer += value
          this.state.bytesReceived += value.length

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const cleanLine = line.trim()
            if (cleanLine.length > 0) {
              this.recordPacket()
              this.appendLog('in', cleanLine)
              this.parseIncomingPayload(cleanLine, 'serial')
            }
          }
        }
      }
    } catch (err: any) {
      if (this.state.status === 'connected') {
        this.appendLog('err', `Serial Stream Error: ${err?.message || err}`)
      }
    } finally {
      this.disconnectSerial()
    }
  }

  public async disconnectSerial() {
    try {
      if (this.reader) {
        await this.reader.cancel()
        this.reader = null
      }
      if (this.readableStreamClosed) {
        await this.readableStreamClosed.catch(() => {})
        this.readableStreamClosed = null
      }
      if (this.port) {
        await this.port.close()
        this.port = null
      }
    } catch (err) {
      console.warn('Error closing port', err)
    } finally {
      this.state.status = 'standby'
      this.state.transport = 'none'
      this.state.portInfo = 'None (Standby Mode)'
      this.state.deviceName = undefined
      this.appendLog('sys', 'Serial port disconnected. Switched to Standby.')
      this.notifyState()
    }
  }

  public async connectBluetooth(): Promise<boolean> {
    if (!this.isWebBluetoothSupported()) {
      this.state.status = 'error'
      this.state.lastError = 'Web Bluetooth API is not supported in this browser. Please use Chrome or Edge.'
      this.appendLog('err', this.state.lastError)
      return false
    }

    try {
      this.state.status = 'connecting'
      this.notifyState()
      this.appendLog('sys', 'Scanning for ESP32 Bluetooth device...')

      // @ts-ignore - Web Bluetooth API
      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'ESP32' },
          { namePrefix: 'B-TEG' },
          { namePrefix: 'Padayon' },
          { namePrefix: 'TEG' },
          { services: [NORDIC_UART_SERVICE] },
        ],
        optionalServices: [NORDIC_UART_SERVICE, 'generic_access'],
      }).catch(async () => {
        // @ts-ignore
        return await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [NORDIC_UART_SERVICE, 'generic_access'],
        })
      })

      if (!this.bleDevice) {
        throw new Error('Bluetooth device selection cancelled')
      }

      const devName = this.bleDevice.name || 'ESP32 BLE Node'
      this.appendLog('sys', `Pairing with ${devName}... Connecting to GATT Server...`)

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.appendLog('sys', `Bluetooth device ${devName} disconnected.`)
        this.disconnectBluetooth()
      })

      const server = await this.bleDevice.gatt.connect()
      this.appendLog('sys', `GATT Server connected. Getting Telemetry UART Service...`)

      const service = await server.getPrimaryService(NORDIC_UART_SERVICE).catch(() => null)
      if (service) {
        this.bleTxChar = await service.getCharacteristic(NORDIC_UART_TX).catch(() => null)
        this.bleRxChar = await service.getCharacteristic(NORDIC_UART_RX).catch(() => null)

        if (this.bleTxChar) {
          await this.bleTxChar.startNotifications()
          let bleBuffer = ''
          this.bleTxChar.addEventListener('characteristicvaluechanged', (e: any) => {
            const rawBytes = e.target.value
            const decoder = new TextDecoder()
            bleBuffer += decoder.decode(rawBytes)
            this.state.bytesReceived += rawBytes.byteLength

            const lines = bleBuffer.split('\n')
            bleBuffer = lines.pop() || ''
            for (const line of lines) {
              const clean = line.trim()
              if (clean.length > 0) {
                this.recordPacket()
                this.appendLog('in', clean)
                this.parseIncomingPayload(clean, 'bluetooth')
              }
            }
          })
        }
      }

      this.state.status = 'connected'
      this.state.transport = 'bluetooth'
      this.state.deviceName = devName
      this.state.portInfo = `BLE: ${devName}`
      this.state.lastError = null
      this.appendLog('sys', `ESP32 Bluetooth connection confirmed! Receiving telemetry stream.`)
      this.notifyState()
      return true
    } catch (err: any) {
      this.state.status = 'standby'
      this.state.transport = 'none'
      this.state.lastError = err?.message || 'Bluetooth connection failed'
      this.appendLog('err', `BLE Error: ${this.state.lastError}`)
      this.notifyState()
      return false
    }
  }

  public disconnectBluetooth() {
    try {
      if (this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected) {
        this.bleDevice.gatt.disconnect()
      }
      this.bleDevice = null
      this.bleRxChar = null
      this.bleTxChar = null
    } catch (err) {
      console.warn('Error disconnecting BLE', err)
    } finally {
      this.state.status = 'standby'
      this.state.transport = 'none'
      this.state.portInfo = 'None (Standby Mode)'
      this.state.deviceName = undefined
      this.appendLog('sys', 'Bluetooth disconnected. Switched to Standby.')
      this.notifyState()
    }
  }

  public connectWebSocket(url: string = 'ws://192.168.4.1/ws', isAutoRetry: boolean = false) {
    this.wsTargetUrl = url
    if (!isAutoRetry) {
      this.isIntentionalDisconnect = false
      this.wsReconnectAttempts = 0
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer)
        this.wsReconnectTimer = null
      }
    }

    try {
      if (this.socket) {
        this.socket.onclose = null
        this.socket.onerror = null
        this.socket.onmessage = null
        this.socket.onopen = null
        this.socket.close()
        this.socket = null
      }

      this.state.status = 'connecting'
      this.state.reconnectAttempts = this.wsReconnectAttempts
      this.state.isAutoReconnecting = this.wsReconnectAttempts > 0
      if (!isAutoRetry) {
        this.appendLog('sys', `Connecting to WiFi WebSocket: ${url}`)
      } else {
        this.appendLog('sys', `Auto-reconnecting to WiFi WebSocket (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})...`)
      }
      this.notifyState()

      this.socket = new WebSocket(url)
      this.wsBuffer = ''

      this.socket.onopen = () => {
        this.wsReconnectAttempts = 0
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer)
          this.wsReconnectTimer = null
        }

        this.state.status = 'connected'
        this.state.transport = 'websocket'
        this.state.deviceName = 'ESP32 (WiFi Station/AP)'
        this.state.portInfo = `WiFi WebSocket (${url})`
        this.state.lastError = null
        this.state.reconnectAttempts = 0
        this.state.isAutoReconnecting = false
        this.appendLog('sys', `Connected to WebSocket: ${url}`)
        this.notifyState()
      }

      this.socket.onmessage = (event) => {
        const rawChunk = String(event.data)
        if (!rawChunk) return

        this.state.bytesReceived += rawChunk.length
        this.wsBuffer += rawChunk

        const lines = this.wsBuffer.split('\n')
        this.wsBuffer = lines.pop() || ''

        for (const line of lines) {
          const clean = line.trim()
          if (clean.length > 0) {
            this.recordPacket()
            this.appendLog('in', clean)
            this.parseIncomingPayload(clean, 'network')
          }
        }

        if (this.wsBuffer.includes('}{')) {
          const splitObjects = this.wsBuffer.replace(/\}\{/g, '}\n{').split('\n')
          this.wsBuffer = splitObjects.pop() || ''
          for (const item of splitObjects) {
            const clean = item.trim()
            if (clean.length > 0) {
              this.recordPacket()
              this.appendLog('in', clean)
              this.parseIncomingPayload(clean, 'network')
            }
          }
        }
      }

      this.socket.onerror = () => {
        this.state.lastError = 'WebSocket connection error'
        this.appendLog('err', 'WebSocket link connection error.')
        this.notifyState()
      }

      this.socket.onclose = () => {
        this.socket = null
        if (this.isIntentionalDisconnect) {
          this.state.status = 'standby'
          this.state.transport = 'none'
          this.state.portInfo = 'None (Standby Mode)'
          this.state.deviceName = undefined
          this.state.isAutoReconnecting = false
          this.appendLog('sys', 'WebSocket closed by operator. Reverted to Standby.')
          this.notifyState()
          return
        }

        if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
          this.wsReconnectAttempts++
          const backoffDelay = Math.min(15000, Math.round(1500 * Math.pow(1.5, this.wsReconnectAttempts - 1)))

          this.state.status = 'connecting'
          this.state.reconnectAttempts = this.wsReconnectAttempts
          this.state.isAutoReconnecting = true
          this.appendLog(
            'sys',
            `WiFi AP dropped. Retrying link in ${(backoffDelay / 1000).toFixed(1)}s (Attempt ${this.wsReconnectAttempts}/${this.wsMaxReconnectAttempts})...`
          )
          this.notifyState()

          this.wsReconnectTimer = setTimeout(() => {
            if (!this.isIntentionalDisconnect) {
              this.connectWebSocket(this.wsTargetUrl, true)
            }
          }, backoffDelay)
        } else {
          this.state.status = 'standby'
          this.state.transport = 'none'
          this.state.portInfo = 'None (Standby Mode)'
          this.state.deviceName = undefined
          this.state.isAutoReconnecting = false
          this.state.lastError = 'Auto-reconnect exhausted. Reverted to Standby.'
          this.appendLog('err', 'WiFi auto-reconnect attempts exhausted. Switched to Standby.')
          this.notifyState()
        }
      }
    } catch (err: any) {
      this.state.status = 'standby'
      this.appendLog('err', `WebSocket Exception: ${err?.message || err}`)
      this.notifyState()
    }
  }

  public disconnectWebSocket() {
    this.isIntentionalDisconnect = true
    this.wsReconnectAttempts = 0
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
    this.state.status = 'standby'
    this.state.transport = 'none'
    this.state.portInfo = 'None (Standby Mode)'
    this.state.deviceName = undefined
    this.state.reconnectAttempts = 0
    this.state.isAutoReconnecting = false
    this.notifyState()
  }

  public disconnectAll() {
    this.isIntentionalDisconnect = true
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.state.transport === 'serial') {
      this.disconnectSerial()
    } else if (this.state.transport === 'bluetooth') {
      this.disconnectBluetooth()
    } else if (this.state.transport === 'websocket') {
      this.disconnectWebSocket()
    }
  }

  // Emit assembled thesis.ino cache to the dashboard callback
  private emitFromEsp32Cache(source: TelemetryData['source']) {
    const c = this.esp32Cache
    const hasSensorFault = c.hotFault || c.coldFault || !c.dhtOk
    this.state.sensorFault = hasSensorFault

    const snapshot: Esp32HardwareStatus = {
      stateCode: c.stateCode,
      stateName: c.stateName,
      stateReason: c.stateReason,
      relayClosed: c.relayClosed,
      forceMode: c.forceMode,
      uptimeStr: c.uptimeStr,
      pBatW: c.pBatW,
      pHarvW: c.pHarvW,
      whTotal: c.whTotal,
      whHarv: c.whHarv,
      vTegPeak: c.vTegPeak,
      hotFault: c.hotFault,
      coldFault: c.coldFault,
      hotWhy: c.hotWhy,
      coldWhy: c.coldWhy,
      dhtOk: c.dhtOk,
      ts1Tripped: c.ts1Tripped,
      overcurrentLatched: c.overcurrentLatched,
      batHot: c.batHot,
      vOpenNow: c.vOpenNow,
      vCloseNow: c.vCloseNow,
      vHardNow: c.vHardNow,
      batTrim: c.batTrim,
      tegTrim: c.tegTrim,
      curTrim: c.curTrim,
      acsVolts: c.acsVolts,
      acsZero: c.acsZero,
      alarmsText: c.alarmsText,
      activeAlarms: [...c.activeAlarms],
      note: c.note,
      inaOk: c.inaOk,
    }

    if (this.onDataCallback) {
      this.onDataCallback({
        rawStoveTemp: c.hotFault ? 0 : c.tHot,
        rawColdFaceTemp: c.coldFault ? c.tAmb : c.tCold,
        rawAmbientTemp: c.tAmb,
        rawHumidity: c.hum,
        rawBatteryVoltage: c.vBat,
        rawBatteryCurrent: c.iBat,
        rawTegVoltage: c.vTeg,
        rawTegCurrent: c.iBat,
        rawThermalFuseTripped: c.ts1Tripped,
        isPhysicalCurrent: true,
        sensorFault: hasSensorFault,
        relays: {
          dcBus: c.relayClosed,
          lights: true,
          fans: c.relayClosed,
          aux: false,
        },
        esp32: snapshot,
        inaOk: c.inaOk,
        timestamp: Date.now(),
        source,
      })
    }
  }

  private parseAlarmsField(rawAlarmsAndNote: string) {
    let text = rawAlarmsAndNote.trim()
    let note: string | undefined = undefined

    const notePatterns = [
      '(TEG voltage is too low to charge)',
      '(relay closed, no current yet)',
    ]
    for (const pat of notePatterns) {
      const idx = text.indexOf(pat)
      if (idx !== -1) {
        note = pat.slice(1, -1)
        text = text.slice(0, idx).trim()
      }
    }

    this.esp32Cache.note = note
    this.esp32Cache.alarmsText = text || 'none'
    if (!text || text.toLowerCase() === 'none') {
      this.esp32Cache.activeAlarms = []
    } else {
      this.esp32Cache.activeAlarms = text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const lower = text.toLowerCase()
    this.esp32Cache.ts1Tripped = lower.includes('ts1')
    this.esp32Cache.overcurrentLatched =
      this.esp32Cache.stateCode === 6 || lower.includes('overcurrent')
    this.esp32Cache.batHot =
      this.esp32Cache.stateCode === 5 || lower.includes('battery too hot')
    this.esp32Cache.dhtOk = !lower.includes('dht22 not reading')
    if (lower.includes('hot thermocouple fault')) {
      this.esp32Cache.hotFault = true
    }
    if (lower.includes('cold thermocouple fault')) {
      this.esp32Cache.coldFault = true
    }
  }

  private updateTempCompLimits() {
    if (this.esp32Cache.dhtOk && this.esp32Cache.tAmb > 25.0) {
      const drop = (this.esp32Cache.tAmb - 25.0) * 0.018
      this.esp32Cache.vOpenNow = Math.round((14.4 - drop) * 100) / 100
      this.esp32Cache.vCloseNow = Math.round((13.6 - drop) * 100) / 100
      this.esp32Cache.vHardNow = Math.round((14.6 - drop) * 100) / 100
    } else if (!this.esp32Cache.dhtOk) {
      this.esp32Cache.vOpenNow = 14.2
      this.esp32Cache.vCloseNow = 13.6
      this.esp32Cache.vHardNow = 14.6
    } else {
      this.esp32Cache.vOpenNow = 14.4
      this.esp32Cache.vCloseNow = 13.6
      this.esp32Cache.vHardNow = 14.6
    }
  }

  private parseIncomingPayload(line: string, source: TelemetryData['source']) {
    try {
      // 1. Parse thesis.ino one-off event messages: [HH:MM:SS] >>> ...
      const eventMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*>>>\s*(.+)$/)
      if (eventMatch) {
        this.esp32Cache.uptimeStr = eventMatch[1]
        const msg = eventMatch[2].trim()

        if (msg.startsWith('STATE:')) {
          const stateBody = msg.slice(6).trim()
          const dashIdx = stateBody.indexOf('-')
          if (dashIdx !== -1) {
            const sName = stateBody.slice(0, dashIdx).trim()
            const sReason = stateBody.slice(dashIdx + 1).trim()
            const sCode = mapStateNameToCode(sName)
            this.esp32Cache.stateName = sName
            this.esp32Cache.stateCode = sCode
            this.esp32Cache.stateReason = sReason
            this.esp32Cache.relayClosed = sCode === 1
          }
          this.emitFromEsp32Cache(source)
          if (this.onEventCallback) {
            this.onEventCallback(`ESP32 ${msg}`, 'info')
          }
          return
        }

        if (msg.startsWith('Charging: AUTOMATIC')) {
          this.esp32Cache.forceMode = 0
          this.emitFromEsp32Cache(source)
        } else if (msg.startsWith('Charging: FORCED ON')) {
          this.esp32Cache.forceMode = 1
          this.esp32Cache.relayClosed = true
          this.emitFromEsp32Cache(source)
        } else if (msg.startsWith('Charging: FORCED OFF')) {
          this.esp32Cache.forceMode = 2
          this.esp32Cache.relayClosed = false
          this.emitFromEsp32Cache(source)
        } else if (msg.startsWith('Overcurrent latch cleared')) {
          this.esp32Cache.overcurrentLatched = false
          this.emitFromEsp32Cache(source)
        } else if (msg.startsWith('Energy counters and peak voltage reset')) {
          this.esp32Cache.whTotal = 0
          this.esp32Cache.whHarv = 0
          this.esp32Cache.vTegPeak = 0
          this.emitFromEsp32Cache(source)
        }

        const calSaved = msg.match(/^(Battery|TEG|Current) calibration saved:\s*factor\s*([-\d.]+)/i)
        if (calSaved) {
          const kind = calSaved[1].toLowerCase()
          const factor = parseFloat(calSaved[2])
          if (Number.isFinite(factor)) {
            if (kind === 'battery') this.esp32Cache.batTrim = factor
            else if (kind === 'teg') this.esp32Cache.tegTrim = factor
            else if (kind === 'current') this.esp32Cache.curTrim = factor
          }
          this.emitFromEsp32Cache(source)
        }

        if (msg.startsWith('Calibration reset')) {
          this.esp32Cache.batTrim = 1.1011
          this.esp32Cache.tegTrim = 1.1679
          this.esp32Cache.curTrim = 1.0
          this.emitFromEsp32Cache(source)
        }

        const zeroSaved = msg.match(/^(?:Current sensor zeroed at|ACS712 current sensor tared to zero:?)\s*([-\d.]+)\s*V/i)
        if (zeroSaved) {
          const z = parseFloat(zeroSaved[1])
          if (Number.isFinite(z)) this.esp32Cache.acsZero = z
          this.emitFromEsp32Cache(source)
        }

        const hotTcWhy = msg.match(/^hot thermocouple:\s*(.+)$/i)
        if (hotTcWhy) {
          this.esp32Cache.hotWhy = hotTcWhy[1].trim()
          this.esp32Cache.hotFault = true
          this.emitFromEsp32Cache(source)
        }

        const coldTcWhy = msg.match(/^cold thermocouple:\s*(.+)$/i)
        if (coldTcWhy) {
          this.esp32Cache.coldWhy = coldTcWhy[1].trim()
          this.esp32Cache.coldFault = true
          this.emitFromEsp32Cache(source)
        }

        if (this.onEventCallback) {
          const lvl =
            msg.startsWith('ALARM:') || msg.includes('refused')
              ? 'error'
              : msg.startsWith('WARNING:') || msg.startsWith('Not zeroed')
              ? 'warning'
              : 'info'
          this.onEventCallback(`ESP32: ${msg}`, lvl)
        }
        return
      }

      // 2. Parse thesis.ino compact status line:
      // [00:01:24] CHARGING   | TEG 14.80 V | BAT 12.65 V | I 0.45 A | IN-BAT   5.7 W | HARVEST   6.7 W 0.123 Wh | HOT 185 C | COLD  32 C | dT 153 C | AMB 28.4 C | ALARMS: none
      if (line.includes('| TEG ') && line.includes('| BAT ') && line.includes('| ALARMS:')) {
        const firstPipe = line.indexOf('|')
        const prefix = line.slice(0, firstPipe).trim()
        const prefixMatch = prefix.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.+)$/)
        if (prefixMatch) {
          this.esp32Cache.uptimeStr = prefixMatch[1]
          const sName = prefixMatch[2].trim()
          const sCode = mapStateNameToCode(sName)
          this.esp32Cache.stateName = sName
          this.esp32Cache.stateCode = sCode
          this.esp32Cache.stateReason = defaultStateReason(sCode)
          this.esp32Cache.relayClosed = sCode === 1
        }

        const segments = line.slice(firstPipe + 1).split('|')
        for (const rawSeg of segments) {
          const seg = rawSeg.trim()
          if (seg.startsWith('TEG ')) {
            const m = seg.match(/TEG\s+([-\d.]+)\s*V/i)
            if (m) {
              const v = parseFloat(m[1])
              if (Number.isFinite(v)) {
                this.esp32Cache.vTeg = v
                if (v > this.esp32Cache.vTegPeak) this.esp32Cache.vTegPeak = v
              }
            }
          } else if (seg.startsWith('BAT ')) {
            const m = seg.match(/BAT\s+([-\d.]+)\s*V/i)
            if (m) {
              const v = parseFloat(m[1])
              if (Number.isFinite(v)) this.esp32Cache.vBat = v
            }
          } else if (seg.startsWith('I ')) {
            const m = seg.match(/I\s+([-\d.]+)\s*A/i)
            if (m) {
              const v = parseFloat(m[1])
              if (Number.isFinite(v)) this.esp32Cache.iBat = v
            }
            const mAcs = seg.match(/ACS\s+([-\d.]+)\s*V,\s*zero\s+([-\d.]+)\s*V/i)
            if (mAcs) {
              const acsV = parseFloat(mAcs[1])
              const zeroV = parseFloat(mAcs[2])
              if (Number.isFinite(acsV)) this.esp32Cache.acsVolts = acsV
              if (Number.isFinite(zeroV)) this.esp32Cache.acsZero = zeroV
            }
          } else if (seg.startsWith('PWR ')) {
            const m = seg.match(/PWR\s+([-\d.]+)\s*W/i)
            if (m) {
              const p = parseFloat(m[1])
              if (Number.isFinite(p)) {
                this.esp32Cache.pHarvW = p
                this.esp32Cache.pBatW = Math.round(this.esp32Cache.vBat * this.esp32Cache.iBat * 10) / 10
              }
            }
          } else if (seg.startsWith('IN-BAT ')) {
            const m = seg.match(/IN-BAT\s+([-\d.]+)\s*W/i)
            if (m) {
              const p = parseFloat(m[1])
              if (Number.isFinite(p)) {
                const nowMs = Date.now()
                if (this.esp32Cache.lastIntegrationMs > 0) {
                  const dtHours = Math.min(10, (nowMs - this.esp32Cache.lastIntegrationMs) / 1000) / 3600
                  this.esp32Cache.whTotal = Math.round((this.esp32Cache.whTotal + p * dtHours) * 1000) / 1000
                }
                this.esp32Cache.lastIntegrationMs = nowMs
                this.esp32Cache.pBatW = p
              }
            }
          } else if (seg.startsWith('HARVEST ')) {
            const mFull = seg.match(/HARVEST\s+([-\d.]+)\s*W\s+([-\d.]+)\s*Wh/i)
            if (mFull) {
              const ph = parseFloat(mFull[1])
              const wh = parseFloat(mFull[2])
              if (Number.isFinite(ph)) this.esp32Cache.pHarvW = ph
              if (Number.isFinite(wh)) this.esp32Cache.whHarv = wh
            } else {
              const mWh = seg.match(/HARVEST\s+([-\d.]+)\s*Wh/i)
              if (mWh) {
                const wh = parseFloat(mWh[1])
                if (Number.isFinite(wh)) this.esp32Cache.whHarv = wh
              }
            }
          } else if (seg.startsWith('HOT ')) {
            const m = seg.match(/HOT\s+(\S+)\s*C/i)
            if (m) {
              if (m[1] === '---') {
                this.esp32Cache.hotFault = true
              } else {
                const th = parseFloat(m[1])
                if (Number.isFinite(th)) {
                  this.esp32Cache.tHot = th
                  this.esp32Cache.hotFault = false
                  this.esp32Cache.hotWhy = 'ok'
                }
              }
            }
          } else if (seg.startsWith('COLD ')) {
            const m = seg.match(/COLD\s+(\S+)\s*C/i)
            if (m) {
              if (m[1] === '---') {
                this.esp32Cache.coldFault = true
              } else {
                const tc = parseFloat(m[1])
                if (Number.isFinite(tc)) {
                  this.esp32Cache.tCold = tc
                  this.esp32Cache.coldFault = false
                  this.esp32Cache.coldWhy = 'ok'
                }
              }
            }
          } else if (seg.startsWith('AMB ')) {
            const m = seg.match(/AMB\s+([-\d.]+)\s*C/i)
            if (m) {
              const ta = parseFloat(m[1])
              if (Number.isFinite(ta) && ta > 0) this.esp32Cache.tAmb = ta
            }
          } else if (seg.startsWith('ALARMS:')) {
            this.parseAlarmsField(seg.slice(7))
          }
        }

        this.updateTempCompLimits()
        this.emitFromEsp32Cache(source)
        return
      }

      // 3. Parse thesis.ino detailed block lines & startup lines
      const headerMatch = line.match(/^----------------\s*(\d{2}:\d{2}:\d{2})\s*----------------$/)
      if (headerMatch) {
        this.esp32Cache.uptimeStr = headerMatch[1]
        return
      }

      if (line.startsWith('STATE     :')) {
        const m = line.match(/^STATE\s*:\s*(.+?)\(relay\s+(CLOSED|OPEN)\)\s*(.+)$/i)
        if (m) {
          const sName = m[1].trim()
          const sCode = mapStateNameToCode(sName)
          this.esp32Cache.stateName = sName
          this.esp32Cache.stateCode = sCode
          this.esp32Cache.relayClosed = m[2].toUpperCase() === 'CLOSED'
          this.esp32Cache.stateReason = m[3].trim()
        }
        return
      }

      if (line.startsWith('VOLTAGE   :')) {
        const m = line.match(/TEG\s+([-\d.]+)\s*V.*BATTERY\s+([-\d.]+)\s*V/i)
        if (m) {
          const vt = parseFloat(m[1])
          const vb = parseFloat(m[2])
          if (Number.isFinite(vt)) this.esp32Cache.vTeg = vt
          if (Number.isFinite(vb)) this.esp32Cache.vBat = vb
        }
        return
      }

      if (line.startsWith('SENSOR    :')) {
        const m = line.match(/ACS712 output\s*([-\d.]+)\s*V,\s*zero level\s*([-\d.]+)\s*V/i)
        if (m) {
          const sv = parseFloat(m[1])
          const zv = parseFloat(m[2])
          if (Number.isFinite(sv)) this.esp32Cache.acsVolts = sv
          if (Number.isFinite(zv)) this.esp32Cache.acsZero = zv
        }
        return
      }

      if (line.startsWith('CURRENT   :')) {
        const m = line.match(/CURRENT\s*:\s*(?:TEG\s*)?([-\d.]+)\s*A/i)
        if (m) {
          const ib = parseFloat(m[1])
          if (Number.isFinite(ib)) this.esp32Cache.iBat = ib
        }
        const mTrim = line.match(/factor\s*([-\d.]+)/i)
        if (mTrim) {
          const ct = parseFloat(mTrim[1])
          if (Number.isFinite(ct)) this.esp32Cache.curTrim = ct
        }
        const mSens = line.match(/sensor\s*([-\d.]+)\s*V/i)
        if (mSens) {
          const sv = parseFloat(mSens[1])
          if (Number.isFinite(sv)) this.esp32Cache.acsVolts = sv
        }
        const mZero = line.match(/zero\s*([-\d.]+)\s*V/i)
        if (mZero) {
          const zv = parseFloat(mZero[1])
          if (Number.isFinite(zv)) this.esp32Cache.acsZero = zv
        }
        return
      }

      if (line.startsWith('POWER     :')) {
        const m = line.match(/into battery\s*([-\d.]+)\s*W\s*\(([-\d.]+)\s*Wh\)\s*harvested from TEG\s*([-\d.]+)\s*W\s*\(([-\d.]+)\s*Wh\)\s*peak TEG\s*([-\d.]+)\s*V/i)
        if (m) {
          const pb = parseFloat(m[1])
          const wht = parseFloat(m[2])
          const ph = parseFloat(m[3])
          const whh = parseFloat(m[4])
          const pk = parseFloat(m[5])
          if (Number.isFinite(pb)) this.esp32Cache.pBatW = pb
          if (Number.isFinite(wht)) this.esp32Cache.whTotal = wht
          if (Number.isFinite(ph)) this.esp32Cache.pHarvW = ph
          if (Number.isFinite(whh)) this.esp32Cache.whHarv = whh
          if (Number.isFinite(pk)) this.esp32Cache.vTegPeak = pk
        } else {
          const mSimple = line.match(/TEG power\s*([-\d.]+)\s*W\s+harvested energy\s*([-\d.]+)\s*Wh\s+peak TEG\s*([-\d.]+)\s*V/i)
          if (mSimple) {
            const ph = parseFloat(mSimple[1])
            const whh = parseFloat(mSimple[2])
            const pk = parseFloat(mSimple[3])
            if (Number.isFinite(ph)) {
              this.esp32Cache.pHarvW = ph
              this.esp32Cache.pBatW = ph
            }
            if (Number.isFinite(whh)) this.esp32Cache.whHarv = whh
            if (Number.isFinite(pk)) this.esp32Cache.vTegPeak = pk
          } else {
            const mAlt = line.match(/TEG\s+([-\d.]+)\s*W.*into battery\s+([-\d.]+)\s*W.*harvested\s+([-\d.]+)\s*Wh.*peak TEG\s+([-\d.]+)\s*V/i)
            if (mAlt) {
              const ph = parseFloat(mAlt[1])
              const pb = parseFloat(mAlt[2])
              const whh = parseFloat(mAlt[3])
              const pk = parseFloat(mAlt[4])
              if (Number.isFinite(ph)) this.esp32Cache.pHarvW = ph
              if (Number.isFinite(pb)) this.esp32Cache.pBatW = pb
              if (Number.isFinite(whh)) this.esp32Cache.whHarv = whh
              if (Number.isFinite(pk)) this.esp32Cache.vTegPeak = pk
            }
          }
        }
        return
      }

      if (line.startsWith('TEMPERATURE:')) {
        const m = line.match(/hot\s+(\S+)\s*C\s*\(([^)]+)\)\s*cold\s+(\S+)\s*C\s*\(([^)]+)\)/i)
        if (m) {
          this.esp32Cache.hotWhy = m[2].trim()
          if (m[1] === '---') {
            this.esp32Cache.hotFault = true
          } else {
            const th = parseFloat(m[1])
            if (Number.isFinite(th)) {
              this.esp32Cache.tHot = th
              this.esp32Cache.hotFault = false
            }
          }
          this.esp32Cache.coldWhy = m[4].trim()
          if (m[3] === '---') {
            this.esp32Cache.coldFault = true
          } else {
            const tc = parseFloat(m[3])
            if (Number.isFinite(tc)) {
              this.esp32Cache.tCold = tc
              this.esp32Cache.coldFault = false
            }
          }
        }
        return
      }

      if (line.startsWith('BATTERY AREA:')) {
        const m = line.match(/BATTERY AREA:\s*([-\d.]+)\s*C\s+humidity\s+([-\d.]+)\s*%\s*\(([^)]+)\)(?:\s*TS1:\s*(\S+))?/i)
        if (m) {
          const ta = parseFloat(m[1])
          const hm = parseFloat(m[2])
          const dhtStatus = m[3].trim().toLowerCase()
          const ts1Status = (m[4] || '').trim().toLowerCase()
          this.esp32Cache.dhtOk = dhtStatus.includes('ok')
          if (Number.isFinite(ta) && this.esp32Cache.dhtOk) this.esp32Cache.tAmb = ta
          if (Number.isFinite(hm) && hm >= 0) this.esp32Cache.hum = hm
          this.esp32Cache.ts1Tripped = ts1Status.includes('tripped')
        }
        return
      }

      if (line.startsWith('LIMITS    :')) {
        const m = line.match(/open\s*([-\d.]+)\s*V,\s*close\s*([-\d.]+)\s*V,\s*hard\s*([-\d.]+)\s*V/i)
        if (m) {
          const vo = parseFloat(m[1])
          const vc = parseFloat(m[2])
          const vh = parseFloat(m[3])
          if (Number.isFinite(vo)) this.esp32Cache.vOpenNow = vo
          if (Number.isFinite(vc)) this.esp32Cache.vCloseNow = vc
          if (Number.isFinite(vh)) this.esp32Cache.vHardNow = vh
        }
        return
      }

      if (line.startsWith('ALARMS    :')) {
        this.parseAlarmsField(line.slice(11))
        this.emitFromEsp32Cache(source)
        return
      }

      // Startup banner lines in thesis.ino
      const startupCal = line.match(/^Calibration\s*:\s*battery\s*x([-\d.]+),\s*TEG\s*x([-\d.]+),\s*current\s*x([-\d.]+)/i)
      if (startupCal) {
        const bt = parseFloat(startupCal[1])
        const tt = parseFloat(startupCal[2])
        const ct = parseFloat(startupCal[3])
        if (Number.isFinite(bt)) this.esp32Cache.batTrim = bt
        if (Number.isFinite(tt)) this.esp32Cache.tegTrim = tt
        if (Number.isFinite(ct)) this.esp32Cache.curTrim = ct
        return
      }

      // 4. Parse JSON format (supports both thesis.ino JSON and generic telemetry JSON)
      if (line.startsWith('{') && line.endsWith('}')) {
        const json = JSON.parse(line)

        if (json.type === 'telemetry' || json.vTeg !== undefined || json.vBat !== undefined || json.stateName !== undefined) {
          if (typeof json.timestamp === 'string') this.esp32Cache.uptimeStr = json.timestamp
          if (typeof json.uptime === 'string') this.esp32Cache.uptimeStr = json.uptime
          if (typeof json.stateName === 'string') {
            this.esp32Cache.stateName = json.stateName.trim()
            this.esp32Cache.stateCode =
              typeof json.state === 'number' ? json.state : mapStateNameToCode(json.stateName)
            this.esp32Cache.stateReason = json.stateReason || defaultStateReason(this.esp32Cache.stateCode)
          } else if (typeof json.state === 'number') {
            this.esp32Cache.stateCode = json.state
            this.esp32Cache.stateReason = defaultStateReason(json.state)
          }
          if (typeof json.relayOn === 'boolean') this.esp32Cache.relayClosed = json.relayOn
          if (typeof json.forceMode === 'number') this.esp32Cache.forceMode = json.forceMode as 0 | 1 | 2
          if (Number.isFinite(Number(json.vTeg))) this.esp32Cache.vTeg = Number(json.vTeg)
          if (Number.isFinite(Number(json.vBat))) this.esp32Cache.vBat = Number(json.vBat)
          if (Number.isFinite(Number(json.iBat))) this.esp32Cache.iBat = Number(json.iBat)
          if (Number.isFinite(Number(json.iTeg))) this.esp32Cache.iBat = Number(json.iTeg)
          if (Number.isFinite(Number(json.pBat))) this.esp32Cache.pBatW = Number(json.pBat)
          if (Number.isFinite(Number(json.pHarv))) this.esp32Cache.pHarvW = Number(json.pHarv)
          if (Number.isFinite(Number(json.pTeg))) this.esp32Cache.pHarvW = Number(json.pTeg)
          if (Number.isFinite(Number(json.whTotal))) this.esp32Cache.whTotal = Number(json.whTotal)
          if (Number.isFinite(Number(json.whHarv))) this.esp32Cache.whHarv = Number(json.whHarv)
          if (Number.isFinite(Number(json.vTegPeak))) this.esp32Cache.vTegPeak = Number(json.vTegPeak)
          if (typeof json.hotFault === 'boolean') this.esp32Cache.hotFault = json.hotFault
          if (typeof json.coldFault === 'boolean') this.esp32Cache.coldFault = json.coldFault
          if (typeof json.hotWhy === 'string') this.esp32Cache.hotWhy = json.hotWhy
          if (typeof json.coldWhy === 'string') this.esp32Cache.coldWhy = json.coldWhy
          if (json.tHot !== undefined && Number.isFinite(Number(json.tHot))) {
            const th = Number(json.tHot)
            if (th < 0) {
              this.esp32Cache.hotFault = true
            } else {
              this.esp32Cache.tHot = th
              this.esp32Cache.hotFault = false
              this.esp32Cache.hotWhy = 'ok'
            }
          }
          if (json.tCold !== undefined && Number.isFinite(Number(json.tCold))) {
            const tc = Number(json.tCold)
            if (tc < 0) {
              this.esp32Cache.coldFault = true
            } else {
              this.esp32Cache.tCold = tc
              this.esp32Cache.coldFault = false
              this.esp32Cache.coldWhy = 'ok'
            }
          }
          if (json.tAmb !== undefined && Number.isFinite(Number(json.tAmb))) {
            const ta = Number(json.tAmb)
            if (ta < 0) {
              this.esp32Cache.dhtOk = false
            } else {
              this.esp32Cache.tAmb = ta
              this.esp32Cache.dhtOk = true
            }
          }
          if (json.hum !== undefined && Number.isFinite(Number(json.hum)) && Number(json.hum) >= 0) {
            this.esp32Cache.hum = Number(json.hum)
          }
          if (typeof json.dhtOK === 'boolean') this.esp32Cache.dhtOk = json.dhtOK
          if (typeof json.ts1 === 'boolean') this.esp32Cache.ts1Tripped = json.ts1
          if (typeof json.overcurrent === 'boolean') this.esp32Cache.overcurrentLatched = json.overcurrent
          if (typeof json.batHot === 'boolean') this.esp32Cache.batHot = json.batHot
          if (Number.isFinite(Number(json.vOpen))) this.esp32Cache.vOpenNow = Number(json.vOpen)
          if (Number.isFinite(Number(json.vClose))) this.esp32Cache.vCloseNow = Number(json.vClose)
          if (Number.isFinite(Number(json.vHard))) this.esp32Cache.vHardNow = Number(json.vHard)
          if (Number.isFinite(Number(json.batTrim))) this.esp32Cache.batTrim = Number(json.batTrim)
          if (Number.isFinite(Number(json.tegTrim))) this.esp32Cache.tegTrim = Number(json.tegTrim)
          if (Number.isFinite(Number(json.curTrim))) this.esp32Cache.curTrim = Number(json.curTrim)
          if (Number.isFinite(Number(json.acsZero))) this.esp32Cache.acsZero = Number(json.acsZero)
          if (Number.isFinite(Number(json.acsVolts))) this.esp32Cache.acsVolts = Number(json.acsVolts)
          if (typeof json.inaOK === 'boolean') this.esp32Cache.inaOk = json.inaOK
          if (typeof json.alarmText === 'string') {
            this.parseAlarmsField(json.alarmText)
          } else if (typeof json.alarms === 'string') {
            this.parseAlarmsField(json.alarms)
          }
          if (typeof json.alarms === 'number') {
            const mask = json.alarms
            this.esp32Cache.hotFault = this.esp32Cache.hotFault || Boolean(mask & 32)
            this.esp32Cache.coldFault = this.esp32Cache.coldFault || Boolean(mask & 64)
            this.esp32Cache.batHot = Boolean(mask & 128) || this.esp32Cache.stateCode === 5
            this.esp32Cache.overcurrentLatched = Boolean(mask & 256) || this.esp32Cache.stateCode === 6
            if (mask & 512) this.esp32Cache.dhtOk = false
          }

          if (json.vOpen === undefined) {
            this.updateTempCompLimits()
          }
          this.emitFromEsp32Cache(source)
          return
        }

        let sensorFault = false
        const rawStoveVal = Number(json.stoveTemp ?? json.stove_temp ?? json.stove ?? json.hot_side)
        let safeStove = 25
        if (Number.isFinite(rawStoveVal) && rawStoveVal >= 0 && rawStoveVal <= 350) {
          safeStove = rawStoveVal
        } else {
          sensorFault = true
          safeStove = Number.isFinite(rawStoveVal) ? Math.min(350, Math.max(0, rawStoveVal)) : 25
        }

        const rawColdVal = Number(json.coldFaceTemp ?? json.cold_temp ?? json.cold_side ?? json.t_cold)
        let safeColdFace: number | undefined = undefined
        if (Number.isFinite(rawColdVal) && rawColdVal >= 0 && rawColdVal <= 120) {
          safeColdFace = rawColdVal
        } else if (Number.isFinite(rawColdVal)) {
          sensorFault = true
          safeColdFace = Math.min(120, Math.max(0, rawColdVal))
        }

        const rawAmbientVal = Number(json.ambientTemp ?? json.ambient_temp ?? json.dht_temp)
        let safeAmbient = 28
        if (Number.isFinite(rawAmbientVal) && rawAmbientVal >= -10 && rawAmbientVal <= 65) {
          safeAmbient = rawAmbientVal
        } else {
          sensorFault = true
          safeAmbient = 28
        }

        const rawHumVal = Number(json.humidity ?? json.dht_hum)
        const safeHumidity = Number.isFinite(rawHumVal) ? Math.min(100, Math.max(0, rawHumVal)) : 60

        const rawBattVVal = Number(json.batteryV ?? json.battery_voltage ?? json.v_batt)
        let safeBattV = 12.0
        if (Number.isFinite(rawBattVVal) && rawBattVVal >= 6.0 && rawBattVVal <= 16.5) {
          safeBattV = rawBattVVal
        } else {
          sensorFault = true
          safeBattV = Number.isFinite(rawBattVVal) ? Math.min(16.5, Math.max(6.0, rawBattVVal)) : 12.0
        }

        const rawTegVVal = Number(json.tegVoltage ?? json.v_teg)
        const safeTegV = Number.isFinite(rawTegVVal) && rawTegVVal >= 0 && rawTegVVal <= 60.0 ? rawTegVVal : 0

        const rawTegIVal = Number(json.tegCurrent ?? json.i_teg)
        const safeTegI = Number.isFinite(rawTegIVal) && rawTegIVal >= 0 && rawTegIVal <= 10.0 ? rawTegIVal : 0

        const rawBattIVal = Number(json.batteryCurrent ?? json.i_batt ?? json.battery_current)
        const safeBattI = Number.isFinite(rawBattIVal) ? rawBattIVal : undefined
        const isPhysicalCurrent = safeBattI !== undefined

        const feedstock: FeedstockType =
          json.feedstock === 'wood_waste' || json.feedstock === 'coconut_husk'
            ? json.feedstock
            : 'unassigned'
        const runId = typeof json.runId === 'string' ? json.runId : typeof json.run_id === 'string' ? json.run_id : 'RUN-01'
        const fuelMassKg = Number.isFinite(Number(json.fuelMassKg ?? json.fuel_mass)) ? Number(json.fuelMassKg ?? json.fuel_mass) : 1.5

        const rawCoVal = Number(json.co_ppm ?? json.coPpm ?? json.co ?? json.mq7_ppm)
        const safeCoPpm = Number.isFinite(rawCoVal) && rawCoVal >= 0 && rawCoVal <= 1000 ? rawCoVal : 14

        const hopperServoActive = Boolean(json.hopperServoActive ?? json.hopper_servo ?? json.servo_active)
        const feedCycles = Number.isFinite(Number(json.feedCycles ?? json.feed_cycles)) ? Number(json.feedCycles ?? json.feed_cycles) : undefined
        const coolingFanPwm = Number.isFinite(Number(json.fan_pwm ?? json.coolingFanPwm)) ? Number(json.fan_pwm ?? json.coolingFanPwm) : undefined

        const channelCurrentsMa = Array.isArray(json.channel_currents)
          ? (json.channel_currents.map((v: any) => Number(v) || 0) as [number, number, number, number])
          : undefined

        this.state.sensorFault = sensorFault

        if (this.onDataCallback) {
          this.onDataCallback({
            rawStoveTemp: safeStove,
            rawColdFaceTemp: safeColdFace,
            rawAmbientTemp: safeAmbient,
            rawHumidity: safeHumidity,
            rawBatteryVoltage: safeBattV,
            rawBatteryCurrent: safeBattI,
            rawTegVoltage: safeTegV,
            rawTegCurrent: safeTegI,
            rawCoPpm: safeCoPpm,
            hopperServoActive,
            feedCycles,
            coolingFanPwm,
            channelCurrentsMa,
            isPhysicalCurrent,
            feedstock,
            runId,
            fuelMassKg,
            sensorFault,
            relays: {
              dcBus: Boolean(json.relays?.dcBus ?? json.dcBus ?? true),
              lights: Boolean(json.relays?.lights ?? json.lights ?? true),
              fans: Boolean(json.relays?.fans ?? json.fans ?? false),
              aux: Boolean(json.relays?.aux ?? json.aux ?? false),
            },
            timestamp: Date.now(),
            source,
          })
        }
        return
      }

      // 5. Parse comma-separated CSV
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim())
        if (parts.length >= 4 && !Number.isNaN(parseFloat(parts[0]))) {
          const rawStove = parseFloat(parts[0])
          const rawCold = parseFloat(parts[1])
          const rawAmb = parseFloat(parts[2])
          const rawHum = parseFloat(parts[3])
          const rawBattV = parseFloat(parts[4])
          const rawTegV = parseFloat(parts[5])
          const rawTegI = parseFloat(parts[6])

          let sensorFault = false
          const safeStove = Number.isFinite(rawStove) && rawStove >= 0 && rawStove <= 350 ? rawStove : 25
          if (!Number.isFinite(rawStove) || rawStove > 350) sensorFault = true

          this.state.sensorFault = sensorFault

          if (this.onDataCallback) {
            this.onDataCallback({
              rawStoveTemp: safeStove,
              rawColdFaceTemp: Number.isFinite(rawCold) ? rawCold : undefined,
              rawAmbientTemp: Number.isFinite(rawAmb) ? rawAmb : 28,
              rawHumidity: Number.isFinite(rawHum) ? Math.min(100, Math.max(0, rawHum)) : 60,
              rawBatteryVoltage: Number.isFinite(rawBattV) && rawBattV >= 6.0 ? rawBattV : 12.0,
              rawTegVoltage: Number.isFinite(rawTegV) && rawTegV >= 0 ? rawTegV : 0,
              rawTegCurrent: Number.isFinite(rawTegI) && rawTegI >= 0 ? rawTegI : 0,
              sensorFault,
              relays: {
                dcBus: true,
                lights: parts[7] === '1' || parts[7]?.toLowerCase() === 'true',
                fans: parts[8] === '1' || parts[8]?.toLowerCase() === 'true',
                aux: parts[9] === '1' || parts[9]?.toLowerCase() === 'true',
              },
              timestamp: Date.now(),
              source,
            })
          }
        }
      }
    } catch {
      // Ignore non-telemetry banner lines
    }
  }

  public async sendCommand(command: string): Promise<boolean> {
    const trimmed = command.trim()
    if (!trimmed) return false
    const formatted = trimmed + '\n'
    this.appendLog('out', trimmed)

    try {
      if (this.port && this.port.writable) {
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        await writer.write(encoder.encode(formatted))
        writer.releaseLock()
        return true
      }

      if (this.bleRxChar) {
        const encoder = new TextEncoder()
        await this.bleRxChar.writeValue(encoder.encode(formatted))
        return true
      }

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(formatted)
        return true
      }

      this.appendLog('err', 'Cannot send command: No hardware connected.')
      return false
    } catch (err: any) {
      this.appendLog('err', `Send error: ${err?.message || err}`)
      return false
    }
  }

  public async sendRelayCommand(relay: 'dcBus' | 'lights' | 'fans' | 'aux', state: boolean) {
    if (relay === 'dcBus') {
      return this.sendCommand(state ? 'c' : 'o')
    }
    const cmd = JSON.stringify({ cmd: 'RELAY', relay, state: state ? 1 : 0 })
    return this.sendCommand(cmd)
  }

  // ── ESP32 Native Commands (thesis.ino) ──────────────────────────────────
  public async sendAutoCharging(): Promise<boolean> {
    return this.sendCommand('a')
  }

  public async sendForceChargingOn(): Promise<boolean> {
    return this.sendCommand('c')
  }

  public async sendForceChargingOff(): Promise<boolean> {
    return this.sendCommand('o')
  }

  public async sendClearOvercurrent(): Promise<boolean> {
    return this.sendCommand('r')
  }

  public async sendZeroCurrent(): Promise<boolean> {
    return this.sendCommand('k')
  }

  public async sendResetEnergy(): Promise<boolean> {
    return this.sendCommand('z')
  }

  public async sendMuteBuzzer(): Promise<boolean> {
    return this.sendCommand('m')
  }

  public async sendTestLedsBuzzer(): Promise<boolean> {
    return this.sendCommand('t')
  }

  public async sendToggleOutputDetail(): Promise<boolean> {
    return this.sendCommand('d')
  }

  public async sendPinCheck(): Promise<boolean> {
    return this.sendCommand('v')
  }

  public async sendCalibrateBattery(volts: number): Promise<boolean> {
    return this.sendCommand(`B${volts.toFixed(2)}`)
  }

  public async sendCalibrateTeg(volts: number): Promise<boolean> {
    return this.sendCommand(`G${volts.toFixed(2)}`)
  }

  public async sendCalibrateCurrent(amps: number): Promise<boolean> {
    return this.sendCommand(`I${amps.toFixed(2)}`)
  }

  public async sendResetCalibrations(): Promise<boolean> {
    return this.sendCommand('X')
  }

  public async sendPulseFeedCommand(): Promise<boolean> {
    const cmd = JSON.stringify({ cmd: 'FEED_SERVO' })
    return this.sendCommand(cmd)
  }

  public async sendCalibrationCommand(calJson: object) {
    const cmd = JSON.stringify({ cmd: 'CALIB', config: calJson })
    return this.sendCommand(cmd)
  }
}
