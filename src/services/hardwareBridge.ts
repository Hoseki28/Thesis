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

// Standard Nordic UART BLE Service UUIDs commonly used on ESP32
const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NORDIC_UART_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e' // ESP32 Receive (Write from Web)
const NORDIC_UART_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // ESP32 Transmit (Notify to Web)

export class HardwareBridge {
  private state: HardwareState
  private port: any = null
  private reader: any = null
  private writer: any = null
  private readableStreamClosed: any = null
  private writableStreamClosed: any = null
  private socket: WebSocket | null = null
  private httpPollTimer: number | null = null

  // Bluetooth variables
  private bleDevice: any = null
  private bleRxChar: any = null
  private bleTxChar: any = null

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
      deviceName: undefined,
      baudRate: 115200,
      packetsReceived: 0,
      bytesReceived: 0,
      lastPacketTime: null,
      lastError: null,
      latencyMs: undefined,
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

  private recordPacket() {
    const now = Date.now()
    if (this.state.lastPacketTime) {
      this.state.latencyMs = Math.max(1, now - this.state.lastPacketTime)
    } else {
      this.state.latencyMs = 25 // default initial estimate
    }
    this.state.packetsReceived++
    this.state.lastPacketTime = now
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. WIRED USB SERIAL (Web Serial API)
  // ─────────────────────────────────────────────────────────────────────────────
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
      this.state.deviceName = 'ESP32 (USB Serial)'
      this.state.portInfo = `USB Serial (${baud} baud)`
      this.state.lastError = null
      this.appendLog('sys', `Connected successfully to USB serial port at ${baud} baud.`)
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. BLUETOOTH BLE (Web Bluetooth API)
  // ─────────────────────────────────────────────────────────────────────────────
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
          { namePrefix: 'Node' },
          { services: [NORDIC_UART_SERVICE] },
        ],
        optionalServices: [NORDIC_UART_SERVICE, 'generic_access'],
      }).catch(async () => {
        // Fallback: accept all devices if user wants to select un-prefixed ESP32
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
        // TX Characteristic (ESP32 notifications -> Web Dashboard)
        this.bleTxChar = await service.getCharacteristic(NORDIC_UART_TX).catch(() => null)
        // RX Characteristic (Web Dashboard commands -> ESP32)
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. WI-FI NETWORK (WebSocket & Local IP)
  // ─────────────────────────────────────────────────────────────────────────────
  public connectWebSocket(url: string = 'ws://192.168.4.1/ws') {
    try {
      if (this.socket) {
        this.socket.close()
      }

      this.state.status = 'connecting'
      this.appendLog('sys', `Connecting to WiFi WebSocket: ${url}`)
      this.notifyState()

      this.socket = new WebSocket(url)

      this.socket.onopen = () => {
        this.state.status = 'connected'
        this.state.transport = 'websocket'
        this.state.deviceName = 'ESP32 (WiFi Station/AP)'
        this.state.portInfo = `WiFi WebSocket (${url})`
        this.appendLog('sys', `Connected to WebSocket: ${url}`)
        this.notifyState()
      }

      this.socket.onmessage = (event) => {
        const text = String(event.data).trim()
        if (text) {
          this.state.bytesReceived += text.length
          this.recordPacket()
          this.appendLog('in', text)
          this.parseIncomingPayload(text, 'network')
        }
      }

      this.socket.onerror = () => {
        this.state.lastError = 'WebSocket connection error'
        this.appendLog('err', 'WebSocket connection failed.')
        this.notifyState()
      }

      this.socket.onclose = () => {
        this.state.status = 'standby'
        this.state.transport = 'none'
        this.state.portInfo = 'None (Standby Mode)'
        this.state.deviceName = undefined
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
    this.state.deviceName = undefined
    this.notifyState()
  }

  public disconnectAll() {
    if (this.state.transport === 'serial') {
      this.disconnectSerial()
    } else if (this.state.transport === 'bluetooth') {
      this.disconnectBluetooth()
    } else if (this.state.transport === 'websocket') {
      this.disconnectWebSocket()
    }
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
        const parts = line.split(',').map((p) => p.trim())
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
    } catch {
      // Non-telemetry microcontroller string log
    }
  }

  /**
   * Send a command string to microcontroller over Serial, BLE, or WebSocket
   */
  public async sendCommand(command: string): Promise<boolean> {
    const formatted = command.endsWith('\n') ? command : command + '\n'
    this.appendLog('out', command.trim())

    try {
      // 1. Serial writer
      if (this.port && this.port.writable) {
        const encoder = new TextEncoder()
        const writer = this.port.writable.getWriter()
        await writer.write(encoder.encode(formatted))
        writer.releaseLock()
        return true
      }

      // 2. Bluetooth writer
      if (this.bleRxChar) {
        const encoder = new TextEncoder()
        await this.bleRxChar.writeValue(encoder.encode(formatted))
        return true
      }

      // 3. WebSocket sender
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
    const cmd = JSON.stringify({ cmd: 'RELAY', relay, state: state ? 1 : 0 })
    return this.sendCommand(cmd)
  }

  public async sendCalibrationCommand(calJson: object) {
    const cmd = JSON.stringify({ cmd: 'CALIB', config: calJson })
    return this.sendCommand(cmd)
  }
}
