import { FeedstockType, HardwareState, TelemetryData } from '../types/telemetry'

export type HardwareDataCallback = (raw: {
  rawStoveTemp: number
  rawColdFaceTemp?: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawBatteryCurrent?: number
  rawTegVoltage: number
  rawTegCurrent: number
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

  // WebSocket frame buffering and reconnection state
  private wsBuffer: string = ''
  private wsReconnectTimer: any = null
  private wsReconnectAttempts: number = 0
  private wsMaxReconnectAttempts: number = 8
  private wsTargetUrl: string = 'ws://192.168.4.1/ws'
  private isIntentionalDisconnect: boolean = false

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
      reconnectAttempts: 0,
      isAutoReconnecting: false,
      sensorFault: false,
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
  // 3. WI-FI NETWORK (WebSocket & Local IP with Auto-Reconnection & Frame Buffering)
  // ─────────────────────────────────────────────────────────────────────────────
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

        // Reassemble fragmented frames split across packets or concatenated by newline
        const lines = this.wsBuffer.split('\n')
        // Incomplete tail remains in buffer
        this.wsBuffer = lines.pop() || ''

        for (const line of lines) {
          const clean = line.trim()
          if (clean.length > 0) {
            this.recordPacket()
            this.appendLog('in', clean)
            this.parseIncomingPayload(clean, 'network')
          }
        }

        // Handle case where ESP32 sends raw JSON without newlines: '}{' delimiter
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

        // Handle unintentional connection drops with exponential backoff auto-reconnect
        if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
          this.wsReconnectAttempts++
          // Exponential backoff: 1.5s, 2.25s, 3.37s, 5.06s... up to 15s max
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
          // Reconnection attempts exhausted
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

  /**
   * Parse and sanitize incoming telemetry payload (JSON or CSV)
   * Enforces strict NaN checking, operational boundary limits, and sensorFault flags.
   */
  private parseIncomingPayload(line: string, source: TelemetryData['source']) {
    try {
      let sensorFault = false

      // 1. Try parsing JSON format:
      // {"stoveTemp":185.2,"coldFaceTemp":26.4,"ambientTemp":29.1,"humidity":65,"batteryV":12.4,"tegVoltage":4.5,"tegCurrent":0.8,"feedstock":"wood_waste"}
      if (line.startsWith('{') && line.endsWith('}')) {
        const json = JSON.parse(line)

        // Parse & Sanitize Stove Temperature (MAX6675 / Thermocouple)
        // Operational window: 0°C to 350°C. Fault if NaN, negative, or > 350°C (open circuit)
        const rawStoveVal = Number(json.stoveTemp ?? json.stove_temp ?? json.stove ?? json.hot_side)
        let safeStove = 25
        if (Number.isFinite(rawStoveVal) && rawStoveVal >= 0 && rawStoveVal <= 350) {
          safeStove = rawStoveVal
        } else {
          sensorFault = true
          safeStove = Number.isFinite(rawStoveVal) ? Math.min(350, Math.max(0, rawStoveVal)) : 25
        }

        // Parse & Sanitize Cold Face Temperature (Heatsink water block)
        // Operational window: 5°C to 95°C
        const rawColdVal = Number(json.coldFaceTemp ?? json.cold_temp ?? json.cold_side ?? json.t_cold)
        let safeColdFace: number | undefined = undefined
        if (Number.isFinite(rawColdVal) && rawColdVal >= 5 && rawColdVal <= 95) {
          safeColdFace = rawColdVal
        } else if (Number.isFinite(rawColdVal)) {
          sensorFault = true
          safeColdFace = Math.min(95, Math.max(5, rawColdVal))
        }

        // Parse & Sanitize Ambient Air Temperature (DHT11)
        const rawAmbientVal = Number(json.ambientTemp ?? json.ambient_temp ?? json.dht_temp)
        let safeAmbient = 28
        if (Number.isFinite(rawAmbientVal) && rawAmbientVal >= -10 && rawAmbientVal <= 65) {
          safeAmbient = rawAmbientVal
        } else {
          sensorFault = true
          safeAmbient = 28
        }

        // Parse & Sanitize Humidity (DHT11 RH %)
        const rawHumVal = Number(json.humidity ?? json.dht_hum)
        const safeHumidity = Number.isFinite(rawHumVal) ? Math.min(100, Math.max(0, rawHumVal)) : 60

        // Parse & Sanitize Battery Voltage (ADC)
        const rawBattVVal = Number(json.batteryV ?? json.battery_voltage ?? json.v_batt)
        let safeBattV = 12.0
        if (Number.isFinite(rawBattVVal) && rawBattVVal >= 7.0 && rawBattVVal <= 16.5) {
          safeBattV = rawBattVVal
        } else {
          sensorFault = true
          safeBattV = Number.isFinite(rawBattVVal) ? Math.min(16.5, Math.max(7.0, rawBattVVal)) : 12.0
        }

        // Parse & Sanitize TEG Electrical Readings
        const rawTegVVal = Number(json.tegVoltage ?? json.v_teg)
        const safeTegV = Number.isFinite(rawTegVVal) && rawTegVVal >= 0 && rawTegVVal <= 28.0 ? rawTegVVal : 0

        const rawTegIVal = Number(json.tegCurrent ?? json.i_teg)
        const safeTegI = Number.isFinite(rawTegIVal) && rawTegIVal >= 0 && rawTegIVal <= 5.0 ? rawTegIVal : 0

        // Parse Physical Battery Current (if shunt/Hall is present)
        const rawBattIVal = Number(json.batteryCurrent ?? json.i_batt ?? json.battery_current)
        const safeBattI = Number.isFinite(rawBattIVal) ? rawBattIVal : undefined
        const isPhysicalCurrent = safeBattI !== undefined

        // Feedstock & Run ID metadata
        const feedstock: FeedstockType =
          json.feedstock === 'wood_waste' || json.feedstock === 'coconut_husk'
            ? json.feedstock
            : 'unassigned'
        const runId = typeof json.runId === 'string' ? json.runId : typeof json.run_id === 'string' ? json.run_id : 'RUN-01'
        const fuelMassKg = Number.isFinite(Number(json.fuelMassKg ?? json.fuel_mass)) ? Number(json.fuelMassKg ?? json.fuel_mass) : 1.5

        // MQ-7 Carbon Monoxide PPM
        const rawCoVal = Number(json.co_ppm ?? json.coPpm ?? json.co ?? json.mq7_ppm)
        const safeCoPpm = Number.isFinite(rawCoVal) && rawCoVal >= 0 && rawCoVal <= 1000 ? rawCoVal : 14

        // Fuel Hopper Servo Actuation
        const hopperServoActive = Boolean(json.hopperServoActive ?? json.hopper_servo ?? json.servo_active)
        const feedCycles = Number.isFinite(Number(json.feedCycles ?? json.feed_cycles)) ? Number(json.feedCycles ?? json.feed_cycles) : undefined

        // Cold-Side Fan PWM
        const coolingFanPwm = Number.isFinite(Number(json.fan_pwm ?? json.coolingFanPwm)) ? Number(json.fan_pwm ?? json.coolingFanPwm) : undefined

        // 4-Channel Load Currents (mA)
        const channelCurrentsMa = Array.isArray(json.channel_currents)
          ? (json.channel_currents.map((v: any) => Number(v) || 0) as [number, number, number, number])
          : undefined

        this.state.sensorFault = sensorFault

        const parsed = {
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
        }

        if (this.onDataCallback) {
          this.onDataCallback(parsed)
        }
        return
      }

      // 2. Try parsing Comma Separated CSV:
      // stoveTemp, coldFaceTemp, ambientTemp, humidity, batteryV, tegVoltage, tegCurrent, lights, fans
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim())
        if (parts.length >= 4) {
          const rawStove = parseFloat(parts[0])
          const rawCold = parseFloat(parts[1])
          const rawAmb = parseFloat(parts[2])
          const rawHum = parseFloat(parts[3])
          const rawBattV = parseFloat(parts[4])
          const rawTegV = parseFloat(parts[5])
          const rawTegI = parseFloat(parts[6])

          const safeStove = Number.isFinite(rawStove) && rawStove >= 0 && rawStove <= 350 ? rawStove : 25
          if (!Number.isFinite(rawStove) || rawStove > 350) sensorFault = true

          this.state.sensorFault = sensorFault

          const parsed = {
            rawStoveTemp: safeStove,
            rawColdFaceTemp: Number.isFinite(rawCold) ? rawCold : undefined,
            rawAmbientTemp: Number.isFinite(rawAmb) ? rawAmb : 28,
            rawHumidity: Number.isFinite(rawHum) ? Math.min(100, Math.max(0, rawHum)) : 60,
            rawBatteryVoltage: Number.isFinite(rawBattV) && rawBattV >= 7.0 ? rawBattV : 12.0,
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

  public async sendPulseFeedCommand(): Promise<boolean> {
    const cmd = JSON.stringify({ cmd: 'FEED_SERVO' })
    return this.sendCommand(cmd)
  }

  public async sendCalibrationCommand(calJson: object) {
    const cmd = JSON.stringify({ cmd: 'CALIB', config: calJson })
    return this.sendCommand(cmd)
  }
}
