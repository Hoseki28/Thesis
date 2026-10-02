import { HardwareState, TelemetryData } from '../types/telemetry'

export type HardwareDataCallback = (raw: {
  rawStoveTemp: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawTegVoltage: number
  rawTegCurrent: number
  relays: {
    dcBus?: boolean
    lights: boolean
    fans: boolean
    aux: boolean
  }
  operatingHours?: number
  systemHealthPct?: number
  timestamp: number
  source: TelemetryData['source']
}) => void

export class HardwareBridge {
  private state: HardwareState
  private port: any = null
  private reader: any = null
  private writer: any = null
  private readableStreamClosed: any = null
  private writableStreamClosed: any = null
  private socket: WebSocket | null = null
  private httpPollTimer: number | null = null

  private onDataCallback?: HardwareDataCallback
  private onStateChangeCallback?: (state: HardwareState) => void

  constructor(
    onData?: HardwareDataCallback,
    onStateChange?: (state: HardwareState) => void
  ) {
    this.onDataCallback = onData
    this.onStateChangeCallback = onStateChange

    this.state = {
      status: 'standby',
      transport: 'none',
      portInfo: 'None (Standby Mode)',
      baudRate: 115200,
      packetsReceived: 0,
      bytesReceived: 0,
      lastPacketTime: null,
      lastError: null,
      rawLogs: [
        {
          id: 'init-1',
          timestamp: new Date().toLocaleTimeString(),
          type: 'sys',
          text: 'Hardware Bridge initialized. Standby mode active.',
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
    // Keep last 100 entries
    const updatedLogs = [...this.state.rawLogs, entry].slice(-100)
    this.state.rawLogs = updatedLogs
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

  /**
   * Connect to physical microcontroller via Web Serial API
   */
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
      this.appendLog('sys', `Requesting serial port (Baud: ${baud})...`)

      // @ts-ignore - Web Serial API
      this.port = await navigator.serial.requestPort()
      await this.port.open({ baudRate: baud })

      this.state.status = 'connected'
      this.state.transport = 'serial'
      this.state.portInfo = `USB Serial (${baud} baud)`
      this.state.lastError = null
      this.appendLog('sys', `Connected successfully to serial port at ${baud} baud.`)
      this.notifyState()

      // Start read loop
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
          // Keep incomplete tail
          buffer = lines.pop() || ''

          for (const line of lines) {
            const cleanLine = line.trim()
            if (cleanLine.length > 0) {
              this.state.packetsReceived++
              this.state.lastPacketTime = Date.now()
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

  /**
   * Disconnect from serial port
   */
  public async disconnectSerial() {
    try {
      if (this.reader) {
        await this.reader.cancel()
        this.reader = null
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
      this.appendLog('sys', 'Serial port disconnected. Switched to Standby.')
      this.notifyState()
    }
  }

  /**
   * Connect to ESP32 over WiFi WebSocket
   */
  public connectWebSocket(url: string = 'ws://192.168.4.1/ws') {
    try {
      if (this.socket) {
        this.socket.close()
      }

      this.state.status = 'connecting'
      this.appendLog('sys', `Connecting to WebSocket: ${url}`)
      this.notifyState()

      this.socket = new WebSocket(url)

      this.socket.onopen = () => {
        this.state.status = 'connected'
        this.state.transport = 'websocket'
        this.state.portInfo = `WiFi WebSocket (${url})`
        this.appendLog('sys', `Connected to WebSocket: ${url}`)
        this.notifyState()
      }

      this.socket.onmessage = (event) => {
        const text = String(event.data).trim()
        if (text) {
          this.state.packetsReceived++
          this.state.lastPacketTime = Date.now()
          this.appendLog('in', text)
          this.parseIncomingPayload(text, 'network')
        }
      }

      this.socket.onerror = (err) => {
        this.state.lastError = 'WebSocket connection error'
        this.appendLog('err', 'WebSocket connection failed.')
        this.notifyState()
      }

      this.socket.onclose = () => {
        this.state.status = 'standby'
        this.state.transport = 'none'
        this.state.portInfo = 'None (Standby Mode)'
        this.appendLog('sys', 'WebSocket closed. Reverted to Standby.')
        this.notifyState()
      }
    } catch (err: any) {
      this.state.status = 'standby'
      this.appendLog('err', `WebSocket Error: ${err?.message || err}`)
      this.notifyState()
    }
  }

  public disconnectWebSocket() {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.state.status = 'standby'
    this.state.transport = 'none'
    this.state.portInfo = 'None (Standby Mode)'
    this.notifyState()
  }

  /**
   * Parse incoming telemetry payload (JSON or CSV)
   */
  private parseIncomingPayload(line: string, source: TelemetryData['source']) {
    try {
      // 1. Try parsing JSON format:
      // {"stoveTemp":185.2,"ambientTemp":29.1,"humidity":65,"batteryV":12.4,"tegVoltage":4.5,"tegCurrent":0.8,"relays":{"lights":1,"fans":0}}
      if (line.startsWith('{') && line.endsWith('}')) {
        const json = JSON.parse(line)
        const parsed = {
          rawStoveTemp: Number(json.stoveTemp ?? json.stove_temp ?? json.stove ?? 0),
          rawAmbientTemp: Number(json.ambientTemp ?? json.ambient_temp ?? json.dht_temp ?? 25),
          rawHumidity: Number(json.humidity ?? json.dht_hum ?? 60),
          rawBatteryVoltage: Number(json.batteryV ?? json.battery_voltage ?? json.v_batt ?? 12.0),
          rawTegVoltage: Number(json.tegVoltage ?? json.v_teg ?? 0),
          rawTegCurrent: Number(json.tegCurrent ?? json.i_teg ?? 0),
          relays: {
            dcBus: Boolean(json.relays?.dcBus ?? json.dcBus ?? true),
            lights: Boolean(json.relays?.lights ?? json.lights ?? true),
            fans: Boolean(json.relays?.fans ?? json.fans ?? false),
            aux: Boolean(json.relays?.aux ?? json.aux ?? false),
          },
          timestamp: Date.now(),
          source,
        }
        if (this.onDataCallback) {
          this.onDataCallback(parsed)
        }
        return
      }

      // 2. Try parsing Comma Separated CSV:
      // stoveTemp, ambientTemp, humidity, batteryV, tegVoltage, tegCurrent, lights, fans
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim())
        if (parts.length >= 4) {
          const parsed = {
            rawStoveTemp: parseFloat(parts[0]) || 0,
            rawAmbientTemp: parseFloat(parts[1]) || 25,
            rawHumidity: parseFloat(parts[2]) || 60,
            rawBatteryVoltage: parseFloat(parts[3]) || 12.0,
            rawTegVoltage: parseFloat(parts[4]) || 0,
            rawTegCurrent: parseFloat(parts[5]) || 0,
            relays: {
              dcBus: true,
              lights: parts[6] === '1' || parts[6]?.toLowerCase() === 'true',
              fans: parts[7] === '1' || parts[7]?.toLowerCase() === 'true',
              aux: parts[8] === '1' || parts[8]?.toLowerCase() === 'true',
            },
            timestamp: Date.now(),
            source,
          }
          if (this.onDataCallback) {
            this.onDataCallback(parsed)
          }
        }
      }
    } catch (err) {
      // Non-telemetry log message from microcontroller (e.g. "Booting ESP32...")
      // Already logged in terminal
    }
  }

  /**
   * Send a command string to microcontroller over Serial or WebSocket
   */
  public async sendCommand(command: string): Promise<boolean> {
    const formatted = command.endsWith('\n') ? command : command + '\n'
    this.appendLog('out', command.trim())

    try {
      // Serial writer
      if (this.port && this.port.writable) {
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        await writer.write(encoder.encode(formatted))
        writer.releaseLock()
        return true
      }

      // WebSocket sender
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

  /**
   * Helper to toggle hardware relay
   */
  public async sendRelayCommand(relay: 'dcBus' | 'lights' | 'fans' | 'aux', state: boolean) {
    const cmd = JSON.stringify({ cmd: 'RELAY', relay, state: state ? 1 : 0 })
    return this.sendCommand(cmd)
  }

  /**
   * Send calibration offsets to hardware EEPROM
   */
  public async sendCalibrationCommand(calJson: object) {
    const cmd = JSON.stringify({ cmd: 'CALIB', config: calJson })
    return this.sendCommand(cmd)
  }
}
