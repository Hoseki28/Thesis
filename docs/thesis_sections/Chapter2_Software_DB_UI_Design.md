# Chapter 2: System Design and Methodology (Sections 2.7.5 to 2.7.7)

**Repository & System Under Study:** Biomass Gasifier and Thermoelectric Generator (B-TEG) Battery Charger (`Thesis-main` / TEG Monitoring PWA)  
**Target Deployment Site:** Off-Grid Field Node #01, Upper Wawa Dam, Rodriguez, Rizal, Philippines  
**Microcontroller & Firmware:** ESP32 Dev Module (`firmware/thesis_updated.ino` & Dual BLE NUS / Serial Firmware)  
**Client Application:** React 19.0.0 + TypeScript 5.7.0 + Vite 8.0.5 + Tailwind CSS 4.0.0 Progressive Web Application (`teg-monitoring-pwa-v4.15`)  

---

## 2.7.5 Software Design

### 2.7.5.1 Two-Tier Edge-to-Client Architecture

The software architecture of the Biomass-TEG Hybrid Charging System is partitioned into two strictly decoupled execution tiers: (1) an autonomous, deterministic **Embedded Edge Tier** executing on an ESP32 microcontroller (`firmware/thesis_updated.ino`), and (2) an interactive **Human-Machine Interface (HMI) Client Tier** implemented as an offline-capable React 19 and TypeScript Progressive Web Application (PWA).

This separation of concerns ensures that all safety-critical battery charging protections, thermal interlocks, and hardware watchdog timers execute autonomously inside the microcontroller at deterministic 250 ms control intervals (`tSense >= 250`), independent of whether a client browser or smartphone is connected. The PWA operates purely as a supervisory telemetry monitor, field data logger, and calibration terminal. If the serial or Bluetooth link is disconnected during field operation at Upper Wawa Dam, the ESP32 continues to enforce cycle voltage limits, overcurrent latching, and ambient temperature cutoffs without interruption.

> **[Figure 2.7.5-1: Two-Tier Edge-to-Client Software Architecture Block Diagram]**  
> *Diagram Specification for Manuscript Layout:* A three-column block diagram illustrating: (Left Column: Physical Transducers & Actuators) Type-K Hot/Cold Thermocouples on MAX31855 modules (`CS GPIO5`, `CS GPIO17`, shared `SCK GPIO18`, `MISO GPIO19`), DHT22 (`GPIO23`), Battery Divider `47k/10k` (`GPIO32`), TEG Divider `150k/10k` (`GPIO33`), ACS712-5A Current Sensor with `10k/15k` level shifter (`GPIO35`), 1-Channel Active-LOW Charging Relay (`GPIO14`), Buzzer (`GPIO12`), Status LEDs (`GPIO25`, `GPIO26`, `GPIO27`), and `16x2` I2C LCD (`GPIO21/22`, `0x27`/`0x3F`); (Middle Column: ESP32 Deterministic Firmware Engine) `readSensors()` acquisition, NIST ITS-90 Type-K polynomial linearization and 5-sample median filter, `chargeControl()` 7-state finite state machine, NVS `Preferences ("cal")`, and `MirrorOut` dual-stream dispatcher; (Right Column: React 19 PWA Client) `HardwareBridge` (Web Serial / Bluetooth SPP / WebSocket), `applyCalibration()` transform, `TelemetryHistoryManager` (60-point chart ring buffer and 36,000-point CSV buffer), and four mobile viewports (`OverviewTab`, `SensorsTab`, `ServiceTab`/`CalibrationStudio`, `LogsTab`).

```
+-----------------------------------------------------------------------------------+
| TIER 1: EMBEDDED EDGE CONTROLLER (ESP32 Dev Module - firmware/thesis_updated.ino) |
|                                                                                   |
|  [Sensors: 250 ms Polling]         [Deterministic Core]        [Local Actuators]  |
|  - GPIO32: Vbat (47k/10k, x5.7) -> readSensors()            -> GPIO14: Relay (LOW)|
|  - GPIO33: Vteg (150k/10k,x16)  -> tcLinearize() (ITS-90)   -> GPIO21/22: I2C LCD |
|  - GPIO35: ACS712-5A (10k/15k)  -> median5() Spike Filter   -> GPIO25/26/27: LEDs |
|  - GPIO5/17/18/19: 2x MAX31855  -> chargeControl() (7-State)-> GPIO12: Buzzer     |
|  - GPIO23: DHT22 (2000 ms)      -> NVS Preferences ("cal")  -> 8 s Hardware WDT   |
+-----------------------------------------+-----------------------------------------+
                                          |
                 Bidirectional UART / RFCOMM Stream (115200 Baud)
                 - Uplink: Compact Text, Detailed Block, or JSON Telemetry (1000 ms)
                 - Downlink: Single-Line ASCII Commands (B, G, I, TH, TC, TX, X, a, c, o, k, r, v, z, t, m, d, j, h)
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| TIER 2: SUPERVISORY CLIENT PWA (React 19 + TypeScript 5.7 + Vite 8 + Tailwind v4) |
|                                                                                   |
|  [Transport Layer]    -> [State & Storage Services]   -> [HMI Viewports]          |
|  - hardwareBridge.ts     - calibrationStorage.ts         - OverviewTab.tsx        |
|  - simulationEngine.ts   - telemetryHistory.ts           - SensorsTab.tsx         |
|  - sw.js (Cache v4.15)   - systemLogService.ts           - ServiceTab.tsx         |
|                          - localStorage / sessionStorage - CalibrationStudio.tsx  |
|                                                          - LogsTab.tsx            |
+-----------------------------------------------------------------------------------+
```

### 2.7.5.2 Embedded Firmware Design (`firmware/thesis_updated.ino`)

The ESP32 firmware is structured as a non-blocking, event-driven super-loop supervised by the Espressif Task Watchdog Timer (`esp_task_wdt`) configured with an 8-second timeout (`WDT_SECONDS = 8`, `trigger_panic = true`). The firmware executes five cooperative tasks at fixed millisecond intervals tracked via `millis()`:

1. **Initialization and Peripheral Self-Test (`setup()`, lines 735 to 823):**
   Upon power-on reset, the firmware immediately drives the charging relay pin (`GPIO14`) to its safe open state (`relayWrite(false)`, outputting logic `HIGH` for active-LOW hardware, `RELAY_ACTIVE_LOW = 1`) and illuminates all three status LEDs (`GPIO25` Green, `GPIO26` Yellow, `GPIO27` Red) for a 1.5-second lamp test. It initializes USB hardware serial (`Serial.begin(115200)`) and Classic Bluetooth Serial Port Profile (`BT.begin("TEG_Charger")`), mediated by a custom `MirrorOut` class (`lines 56 to 68`) that subclasses `Print` to duplicate every character across both USB UART and Bluetooth RFCOMM whenever a client is connected (`BT.hasClient()`). The ADC subsystem is configured to 12-bit resolution (`0` to `4095`) with `ADC_11db` attenuation across `GPIO32`, `GPIO33`, and `GPIO35`. Because the relay is guaranteed open at boot, `setup()` samples `GPIO35` (64-sample factory-calibrated `analogReadMilliVolts()` average multiplied by divider ratio `ACS_K = 1.6667`) to establish the initial zero-current reference voltage `acsZero` and verifies that it falls within the valid window `[2.30 V, 2.70 V]`. The I2C bus (`GPIO21` SDA, `GPIO22` SCL at 100 kHz) scans addresses `0x27` and `0x3F` to auto-detect the `16x2` character LCD.

2. **Analog & Digital Sensor Acquisition (`readSensors()`, lines 394 to 463, every 250 ms):**
   - *Battery and TEG Voltages:* `readPinV()` averages 32 successive 12-bit ADC conversions separated by `50 us` settling delays. Battery voltage on `GPIO32` (`R9 = 47 kOhm`, `R10 = 10 kOhm`, `K_BAT = 5.7`) and TEG voltage on `GPIO33` (`R11 = 150 kOhm`, `R12 = 10 kOhm`, `K_TEG = 16.0`) are scaled by their respective multimeter calibration multipliers (`batTrim`, default `1.1011`; `tegTrim`, default `1.1679`). Peak harvested voltage is tracked in `vTegPeak`.
   - *Charge Current and Zero-Drift Tracking:* `readPinMv()` averages 64 millivolt readings on `GPIO35` (`ADC1_CH7`, which remains operational alongside Bluetooth radio activity) and scales by `ACS_K = (10.0 + 15.0) / 15.0 = 1.6667`. Whenever the charging relay is open (`!relayOn`) and the sensor voltage lies within `2.30 V` to `2.70 V`, an exponential moving average (`acsZero += (acsVolts - acsZero) * 0.05f`) continuously tracks thermal zero drift of the ACS712-5A Hall-effect sensor. Raw current is computed at sensitivity `ACS_V_PER_A = 0.185 V/A`, multiplied by `curTrim` (`calI = rawI * curTrim`), and clamped to `0.0 A` if below the noise deadband (`I_DEADBAND = 0.08 A`). Harvested power (`pTeg = vTeg * iTeg`) and battery input power (`pBat = vBat * iTeg`) are integrated into cumulative watt-hours (`whTotal`, `whHarv`) over each 250 ms interval (`pTeg * (now - tLast) / 3600000.0f`).
   - *MAX31855 K-Type Thermocouple Acquisition & NIST ITS-90 Linearization (`tcReadFrame()`, `tcLinearize()`, `tcUpdate()`, lines 287 to 391):* Both MAX31855 cold-junction compensated thermocouple-to-digital converters share `SCK (GPIO18)` and `MISO/SO (GPIO19)` with independent chip-select lines (`PIN_CS_HOT = GPIO5`, `PIN_CS_COLD = GPIO17`). Rather than performing two separate SPI transfers for probe and die temperatures, `tcReadFrame()` shifts a single atomic 32-bit frame per sensor. The driver validates frame integrity by rejecting all-zero (`0x00000000`), stuck-high (`0xFFFFFFFF`), reserved non-zero bits (`D17` or `D3`, mask `0x00020008`), and fault flag `D16` (`D2` short-to-VCC, `D1` short-to-GND, `D0` open circuit). Faults are debounced across `TC_FAULT_HOLD = 3` consecutive bad frames (`0.75 s`) before latching `hotFault` or `coldFault`. For valid frames, the 14-bit signed thermocouple field (`D31..D18`, `0.25 C/LSB`) and 12-bit signed cold-junction die field (`D15..D4`, `0.0625 C/LSB`) are extracted. Because the MAX31855 hardware assumes a linear sensitivity of `41.276 uV/C`, `tcLinearize()` reconstructs the true Seebeck electromotive force in millivolts (`mv = (rawC - cjC) * 0.041276 + kTypeMv(cjC)`) using the 10-term NIST ITS-90 Type-K forward polynomial plus the magnetic-ordering exponential term, and inverts it back to degrees Celsius via the 9/10/7-term NIST ITS-90 inverse polynomial `kTypeC()`. Single-sample electromagnetic spikes exceeding `TC_SPIKE_C = 25.0 C` from the running median are rejected (up to 2 consecutive spikes), and the output is smoothed through a 5-sample sliding insertion-sort median filter (`median5()`) before adding the user reference offset (`tc.offset`).
   - *Ambient Temperature Compensation (`DHT22`, `GPIO23`, every 2000 ms):* The DHT22 sensor is polled every 2 seconds with a 10-second stale-data timeout (`now - tDhtGood > 10000`). Above the `25.0 C` reference temperature of the **Tianneng TNE12-15 (12 V, 15 Ah AGM-GEL)** battery datasheet, charging voltage thresholds are dynamically reduced using separate cycle and float temperature coefficients:
     - Cycle Limit (`vOpenNow`): `14.60 V - (tAmb - 25.0) * 0.024 V/C` (`-24 mV/C`)
     - Float Reconnect Limit (`vCloseNow`): `13.70 V - (tAmb - 25.0) * 0.018 V/C` (`-18 mV/C`)
     - Hard Overvoltage Ceiling (`vHardNow`): `14.80 V - (tAmb - 25.0) * 0.024 V/C` (`-24 mV/C`)
     If the DHT22 fails (`!dhtOK`), `vOpenNow` drops to a conservative fallback of `14.40 V`. Hysteretic battery thermal shutdown latches `batHot = true` at `tAmb >= 40.0 C` (`BAT_TEMP_STOP_C`) and clears only when ambient temperature cools to `<= 37.0 C` (`BAT_TEMP_RESUME_C`).

3. **Deterministic Charge Control Finite State Machine (`chargeControl()`, lines 466 to 551):**
   Evaluated immediately after `readSensors()` every 250 ms, `chargeControl()` governs the active-LOW charging relay on `GPIO14` across seven discrete states (`state 0` through `state 6`):
   - **State 6 (`OVERCURRENT`):** Highest priority. If `iTeg >= 2.25 A` (`I_OVER_A`, corresponding to the `0.15C` maximum charge current rating of the 15 Ah TNE12-15 battery) persists continuously for `2000 ms` (`I_OVER_MS`), `overcurrentLatched` is set to `true` and the relay opens immediately. It remains latched until cleared via command `r`.
   - **State 0 (`NO BATTERY`):** Triggered if `vBat < 6.0 V` (`V_BAT_VALID_MIN`) or `vBat > 16.5 V` (`V_BAT_VALID_MAX`). Opens the relay and cancels any reconnect dwell timer.
   - **State 5 (`BATTERY HOT`):** Triggered when `batHot` is true (`tAmb >= 40.0 C`). Opens the relay until ambient temperature cools to `<= 37.0 C`.
   - **State 4 (`FORCED OFF`):** Triggered when operator override `forceMode == 2` (command `o`) is active.
   - **State 1 (`CHARGING`):** Relay is closed (`GPIO14 = LOW`). Entered in automatic mode (`forceMode == 0`) when battery voltage is below `vOpenNow`, or in forced-on mode (`forceMode == 1`, command `c`) provided `vBat < vHardNow`.
   - **State 2 (`FULL-HOLD`):** Entered when `vBat >= vOpenNow` (or `vBat >= vHardNow`). The relay opens and starts a 60-second reconnect dwell timer (`RECONNECT_DWELL_MS = 60000`). Once the timer expires, the controller remains in `FULL-HOLD` until `vBat <= vCloseNow` (`13.70 V` nominal float reconnect), preventing relay chatter.
   - **State 3 (`WAITING`):** Active during the 60-second `RECONNECT_DWELL_MS` window immediately after opening at full charge.

> **[Figure 2.7.5-2: ESP32 Charge Control & Protection Loop Flowchart]**  
> *Diagram Specification for Manuscript Layout:* A vertical decision flowchart starting at `loop() [Every 250 ms: esp_task_wdt_reset()]` -> `readSensors()` -> Decision 1: `iTeg >= 2.25 A for >= 2000 ms OR overcurrentLatched?` (Yes -> `State 6: OVERCURRENT, Relay OPEN`); Decision 2: `vBat < 6.0 V OR vBat > 16.5 V?` (Yes -> `State 0: NO BATTERY, Relay OPEN`); Decision 3: `batHot (tAmb >= 40.0 C, resume <= 37.0 C)?` (Yes -> `State 5: BATTERY HOT, Relay OPEN`); Decision 4: `forceMode == 2 (Cmd 'o')?` (Yes -> `State 4: FORCED OFF, Relay OPEN`); Decision 5: `forceMode == 1 (Cmd 'c')?` (Yes -> `vBat >= vHardNow?` -> `State 2` else `State 1: CHARGING, Relay CLOSED`); Automatic Mode Branch: If `relayOn` and `vBat >= vOpenNow`, open relay, set `dwellActive = true`, enter `State 2: FULL-HOLD`; if `!relayOn` and `dwellActive` (`< 60 s`), remain in `State 3: WAITING`; once dwell expires, if `vBat <= vCloseNow`, close relay and enter `State 1: CHARGING`.

4. **Local Audiovisual & LCD Feedback (`updateLcd()` every 500 ms, LED/Buzzer logic lines 881 to 908):**
   An 11-bit alarm mask (`alarmMask()`, lines 225 to 239) evaluates all non-critical warnings (`A_LOWBAT = 1` at `< 11.8 V`, `A_HIGHBAT = 2`, `A_HOTTC = 32`, `A_COLDTC = 64`, `A_DHT = 512`, `A_ACS = 2048`) and critical alarms (`A_HOT = 8` at `> 230.0 C`, `A_TEGV = 16` at `> 45.0 V`, `A_BATHOT = 128` at `>= 40.0 C`, `A_OVERI = 256` at `> 2.25 A`, `A_COLD = 1024` at `> 60.0 C`). Any active critical alarm pulses the piezo buzzer (`GPIO12`) and blinks the Red LED (`GPIO27`) at a 300 ms cadence (`(now / 300) % 2 == 0`) unless muted (`muted`). The `16x2` I2C LCD updates every 500 ms with a fixed two-row layout (`Row 0: T:13.1V B:10.24V`, `Row 1: P:15.5W  I:1.18A`).

#### Table 2.7.5-1: Embedded Firmware Pin Assignment, Sensor Constants, and Protection Thresholds (`firmware/thesis_updated.ino`)

| Subsystem / Parameter | Firmware Identifier | GPIO / Value | Engineering Specification & Code Grounding |
| :--- | :--- | :--- | :--- |
| **Charging Relay Output** | `PIN_RELAY` | `GPIO14` | Active-LOW (`RELAY_ACTIVE_LOW = 1`), `LOW` = Closed (charging), `HIGH` = Open |
| **Battery Voltage ADC** | `PIN_VBAT`, `K_BAT`, `BAT_TRIM` | `GPIO32` (`ADC1_CH4`) | Divider `R9 = 47k / R10 = 10k` (`K_BAT = 5.7`), default `BAT_TRIM = 1.1011f` |
| **TEG Voltage ADC** | `PIN_VTEG`, `K_TEG`, `TEG_TRIM` | `GPIO33` (`ADC1_CH5`) | Divider `R11 = 150k / R12 = 10k` (`K_TEG = 16.0`), default `TEG_TRIM = 1.1679f` |
| **ACS712-5A Current ADC** | `PIN_ACS`, `ACS_K`, `ACS_V_PER_A` | `GPIO35` (`ADC1_CH7`) | `R17 = 10k / R18 = 15k` (`ACS_K = 1.6667`), `0.185 V/A`, zero window `2.30-2.70 V`, deadband `0.08 A` |
| **Hot Side MAX31855** | `PIN_CS_HOT`, `PIN_SCK`, `PIN_MISO` | `CS: GPIO5`, `SCK: 18`, `SO: 19` | 32-bit frame, NIST ITS-90 Type-K linearized, 5-sample median, alarm `HOT_ALARM_C = 230.0 C` |
| **Cold Side MAX31855** | `PIN_CS_COLD`, `PIN_SCK`, `PIN_MISO` | `CS: GPIO17`, `SCK: 18`, `SO: 19` | 32-bit frame, NIST ITS-90 Type-K linearized, 5-sample median, alarm `COLD_ALARM_C = 60.0 C` |
| **Battery Area DHT22** | `PIN_DHT` | `GPIO23` | Polled every `2000 ms`, `10 s` timeout, drives dynamic voltage temperature compensation |
| **I2C 16x2 Character LCD** | `LCD_ADDR_A`, `LCD_ADDR_B` | `SDA: GPIO21`, `SCL: GPIO22` | 100 kHz I2C auto-discovery at `0x27` or `0x3F`, 500 ms refresh (`updateLcd()`) |
| **Status LEDs & Buzzer** | `PIN_LED_G/Y/R`, `PIN_BUZZ` | `GPIO25 / 26 / 27`, `GPIO12` | Green (Full/Hold), Yellow (Charging), Red + Buzzer 300 ms blink (Critical Alarm) |
| **TNE12-15 Voltage Limits** | `V_BAT_OPEN / CLOSE / HARD` | `14.60 V / 13.70 V / 14.80 V` | Cycle limit `14.60 V` (`-24 mV/C` >25 C), Float `13.70 V` (`-18 mV/C`), No-temp `14.40 V` |
| **Battery Operating Window** | `V_BAT_VALID_MIN / MAX`, `LOW_WARN` | `6.0 V to 16.5 V`, `11.8 V` | Detection window `6.0-16.5 V`, low warning `11.8 V`, 100% DOD reference `V_BAT_CUTOFF = 10.8 V` |
| **Overcurrent & Thermal Limits** | `I_OVER_A`, `BAT_TEMP_STOP_C` | `2.25 A` (`2000 ms`), `40.0 C` | `0.15C` of 15 Ah (`2.25 A` for 2 s latches State 6); charge stop `>= 40.0 C`, resume `<= 37.0 C` |
| **Timers & Watchdog** | `WDT_SECONDS`, `RECONNECT_DWELL_MS` | `8 s`, `60000 ms` | Hardware task WDT panic at `8 s`; `60 s` dwell after full charge; `250 ms` sense; `1000 ms` print |

---

### 2.7.5.3 Progressive Web Application (PWA) Client Architecture

The client application is built with **React 19.0.0**, **TypeScript 5.7.0** (configured with `"strict": true` targeting `ES2020`), **Vite 8.0.5**, and **Tailwind CSS 4.0.0** (`@tailwindcss/vite`). The codebase follows a unidirectional data-flow architecture divided into four layers:

1. **Strict Type Contract Layer (`src/types/telemetry.ts`, 281 lines):**
   Defines the canonical interfaces `Esp32HardwareStatus`, `TelemetryData`, `CalibrationConfig`, `HardwareState`, `TelemetryPoint`, and `SystemLogEntry`. `TelemetryData` preserves both raw hardware truth properties emitted directly by `thesis_updated.ino` (`vTeg`, `vBat`, `iBat`, `pBat`, `pHarv`, `whTotal`, `whHarv`, `vTegPeak`, `tHot`, `tCold`, `dT`, `tAmb`, `hum`, `hotFault`, `coldFault`, `hotWhy`, `coldWhy`, `dhtOk`, `relayOn`, `stateCode`, `stateName`, `stateReason`, `forceMode`, `batTrim`, `tegTrim`, `curTrim`, `vOpenNow`, `vCloseNow`, `vHardNow`, `acsVolts`, `acsZero`, `inaOk`) and calibrated domain properties (`stoveTemp`, `coldFaceTemp`, `deltaT`, `batteryVoltage`, `batteryPct`, `tegPower`, `loadChannels`).

2. **Hardware Transport & Protocol Parser Layer (`src/services/hardwareBridge.ts`, 1,748 lines):**
   Encapsulates four transport drivers behind a single callback interface (`onDataCallback`, `onStateChangeCallback`, `onSystemEventCallback`):
   - *USB Web Serial (`connectSerial()`):* Opens a browser serial port via `navigator.serial.requestPort()` at 115200 baud (configurable to 9600, 57600, 115200, or 230400) and streams incoming bytes through a `TextDecoderStream` line buffer.
   - *Classic Bluetooth SPP over Web Serial (`connectBluetoothSerial()`):* Requests an RFCOMM Serial Port Profile (`00001101-0000-1000-8000-00805f9b34fb`) or OS-paired virtual COM port for `"TEG_Charger"`, explicitly asserting `dataTerminalReady: true` and `requestToSend: true` via `port.setSignals()` so Windows `BTHENUM` drivers transmit bidirectional frames.
   - *Web Bluetooth BLE GATT (`connectBluetooth()`):* Implements a Nordic UART Service (`6e400001-b5a3-f393-e0a9-e50e24dcca9e`) GATT client with automatic 3-attempt connection retry.
   - *Wi-Fi WebSocket (`connectWebSocket()`):* Connects to an ESP32 SoftAP/station endpoint (default `ws://192.168.4.1/ws`) with exponential backoff auto-reconnection (up to 5 attempts).
   - *Multi-Format Stream Parser (`parseIncomingPayload()` & `tryParseThesisInoLine()`):* Automatically parses all three output formats emitted by `thesis_updated.ino`: (a) 1 Hz compact pipe-delimited status lines (`[HH:MM:SS] STATE | TEG ... | BAT ... | I ... | PWR ... | HARVEST ... | HOT ... | COLD ... | dT ... | AMB ... | ALARMS: ...`), (b) multi-line detailed blocks (`STATE :`, `VOLTAGE :`, `SENSOR :`, `CURRENT :`, `POWER :`, `TEMPERATURE:`, `BATTERY AREA:`, `LIMITS :`, `ALARMS :`), (c) structured JSON lines (`{"type":"telemetry",...}`), and (d) asynchronous event notifications (`[HH:MM:SS] >>> ...`).

3. **Domain Services Layer (`src/services/`):**
   - `calibrationStorage.ts` (576 lines): Manages browser persistence of `CalibrationConfig` under `localStorage` key `'padayon_calibration_v5'`, implements the piecewise-linear Tianneng TNE12-15 AGM-GEL open-circuit/charging State-of-Charge (SoC) curve (`10.80 V = 0%`, `11.50 V = 20%`, `11.80 V = 35%`, `12.10 V = 50%`, `12.50 V = 75%`, `12.90 V = 100%` resting or `vOpenNow` while actively charging at `> 0.08 A`), and generates downloadable C++ header code (`generateCppCalibrationHeader()`).
   - `telemetryHistory.ts` (320 lines): Maintains a 60-point rolling window (`points`) for UI state tracking and a 36,000-point extended session buffer (`fullLog`, supporting 10 hours of continuous 1 Hz field testing), plus a **20-column UTF-8 BOM (`\uFEFF`) CSV exporter** with selectable downsampling intervals (`15m` default, `5m`, `1m`, `1s` via `filterByInterval()`) and split `Date (PHT)` (`="YYYY-MM-DD"`) and `Time (PHT)` (`="hh:mm:ss AM/PM"`) formula strings that prevent Microsoft Excel `#########` column-width truncation.
   - `systemLogService.ts` (170 lines): Implements an observable 50-entry circular event buffer (`MAX_SYSTEM_LOGS = 50`) with 12-hour `YYYY-MM-DD hh:mm AM/PM` PHT timestamps and CSV export.
   - `simulationEngine.ts` (349 lines): Provides a 1 Hz thermodynamic and electrical physics engine with six scenario presets (`normal`, `lowHeat`, `overheat`, `lowBatt`, `tegPeak`, `custom`) for offline bench testing. Note that `App.tsx` (line 256) intentionally keeps the simulation engine dormant by default so that the live dashboard displays strict zero/standby values (`getOfflineTelemetry()`) until a physical ESP32 connects.

#### Table 2.7.5-2: Complete Codebase Module Breakdown

| File Path | Lines | Bytes | Architectural Layer & Primary Responsibility |
| :--- | :---: | :---: | :--- |
| `firmware/thesis_updated.ino` | 911 | 42,733 | Embedded ESP32 firmware: ADC/SPI/I2C drivers, NIST ITS-90 K-type linearization, 7-state charger FSM, NVS, UART/BT telemetry |
| `src/main.tsx` | 32 | 862 | React 19 DOM root mount and Service Worker (`/sw.js`) lifecycle registration with `controllerchange` auto-reload |
| `src/App.tsx` | 587 | 23,473 | Root application orchestrator: state hooks, edge-triggered alarm logging, load-shedding dispatch, PWA install banner, tab routing |
| `src/index.css` | 116 | 2,927 | Tailwind CSS v4 entry, `--font-sans` / `--font-mono` tokens, `tabular-nums` rule, range slider styling, keyframe animations |
| `src/types/telemetry.ts` | 281 | 7,002 | Strict TypeScript data contracts for ESP32 status, telemetry frames, calibration config, history points, and system logs |
| `src/services/hardwareBridge.ts` | 1,748 | 65,113 | Multi-transport hardware bridge (Web Serial, Bluetooth SPP/BLE, WebSocket), multi-format `thesis.ino` parser, command transmitters |
| `src/services/calibrationStorage.ts` | 576 | 20,114 | `localStorage` persistence (`padayon_calibration_v5`), TNE12-15 AGM-GEL SoC curve, two-tier load calculator, C++ header generator |
| `src/services/telemetryHistory.ts` | 320 | 11,480 | 60-point ring buffer, 36,000-point 10-hour session log, `filterByInterval` (`15m`/`5m`/`1m`/`1s`), 20-column split Date/Time Excel CSV exporter |
| `src/services/systemLogService.ts` | 185 | 6,120 | Observable 50-entry event log ring buffer (`MAX_SYSTEM_LOGS = 50`) with split `Date (PHT)` and `Time (PHT)` 12-hour formatter and CSV exporter |
| `src/services/simulationEngine.ts` | 349 | 11,987 | Offline thermodynamic (Seebeck $\Delta T$) and battery charge integration simulator with 6 presets and variable speed (`0.5x-10x`) |
| `src/components/OverviewTab.tsx` | 435 | 15,820 | Primary Electrical HMI viewport: GPIO14 relay & ESP32 State Machine card, harvested Wh bar, 2x2 electrical grid (`Battery 4-Bar`, `TEG Boost`, `Current`, `Charge Power`) |
| `src/components/SensorsTab.tsx` | 396 | 14,910 | Thermal & Ambient HMI viewport: 3-zone `Thermal Safety & Cutoff Monitor` (`<230°C` / `<60°C` / `0-40°C` + $\Delta T$), `Hot TC`, `Cold TC`, `DHT22 Temp/Humidity`, and `-24/-18 mV/°C` compensation |
| `src/components/CalibrationStudio.tsx` | 448 | 17,640 | Engineering calibration drawer: live ESP32 ADC & thermocouple tiles, responsive mobile-safe reference inputs (`B`, `G`, `I`, `TH`, `TC`), and quick commands (`k`, `v`, `TX`, `X`) |
| `src/components/ServiceTab.tsx` | 295 | 12,840 | Zero-scroll hardware health & control viewport: 2x4 live ESP32 Sensor Health grid (`GPIO32/33/35/5/17/23/14/I2C`), charge mode override (`a`, `c`, `o`, `r`), and Calibration Studio drawer |
| `src/components/ConnectionModal.tsx` | 335 | 14,920 | Streamlined 2-tab transport connection dialog (`Bluetooth BLE "TEG_Charger"` and `Wired USB Serial 115200 bps`), live packet/byte counters, disconnect guard |
| `src/components/LogsTab.tsx` | 380 | 16,450 | Interval-filtered 20-column Excel CSV exporter (`15M`, `5M`, `1M`, `1S`), severity-filtered event log viewer (`ALL`, `INFO`, `WARN`, `ERROR`), and live USB/BLE Serial terminal |
| `src/components/Header.tsx` | 349 | 16,844 | Sticky top bar: microcontroller SVG emblem, EN/FIL language toggle, Dark/Light theme toggle, live PHT clock, connection pill, mobile URL modal |
| `src/components/BottomNav.tsx` | 78 | 3,010 | Fixed 4-tab mobile navigation bar (`Overview`, `Sensors`, `Service`, `Logs`) with animated rose alert badge |
| `src/components/Icons.tsx` | 596 | 27,905 | Zero-dependency custom inline SVG icon library (49 industrial and instrumentation icons) |
| `public/manifest.json` & `sw.js` | 93 | 2,676 | Standalone PWA Web App Manifest (`TEG Monitoring`) and Service Worker (`teg-monitoring-pwa-v4.15`) with app-shell precaching and network-first fallback |
| `tests/telemetry.test.mjs` | 72 | 2,486 | Automated Node.js unit test suite (`node:test`) verifying TNE12-15 thermal compensation, power separation, PNG headers, and PWA assets |

---

### 2.7.5.4 Bidirectional Communication & Command Protocol

Communication between the ESP32 and the React PWA operates over an asynchronous 115200-baud, 8-N-1 UTF-8 newline-delimited (`\n`) stream shared identically by USB CDC Serial and Classic Bluetooth SPP (`"TEG_Charger"`).

1. **Uplink Telemetry Formats (ESP32 to PWA, every `PRINT_MS = 1000 ms`):**
   - *Compact Human-Readable Line (default when `detailed == false`):*
     ```text
     [00:04:12] CHARGING   | TEG 13.10 V | BAT 12.45 V | I 1.18 A (ACS 2.718 V, zero 2.500 V) | PWR  15.5 W | HARVEST 0.425 Wh | HOT 185.2 C | COLD  32.5 C | dT 152.7 C | AMB 28.5 C | ALARMS: none
     ```
   - *Structured JSON Frame (enabled when `jsonMode == true` via command `j`):*
     ```json
     {"type":"telemetry","timestamp":"00:04:12","state":1,"stateName":"CHARGING   ","vTeg":13.10,"vBat":12.45,"iBat":1.18,"iTeg":1.18,"pBat":14.69,"pTeg":15.46,"pHarv":15.46,"whTotal":0.425,"whHarv":0.425,"vTegPeak":14.20,"tHot":185.2,"tCold":32.5,"dT":152.7,"tAmb":28.5,"hum":66.0,"relayOn":true,"rawBat":11.31,"rawTeg":11.22,"rawI":1.18,"batTrim":1.1011,"tegTrim":1.1679,"curTrim":1.0000,"inaOK":true,"hotFault":false,"coldFault":false,"hotWhy":"ok","coldWhy":"ok","tHotCJ":29.25,"tColdCJ":28.75,"alarms":0,"alarmText":"none"}
     ```

2. **Downlink Command Set (PWA to ESP32, parsed by `handleLine()`, lines 627 to 732):**
   The firmware accepts both newline-terminated commands from USB/Bluetooth and un-terminated Bluetooth packets buffered across an 80 ms idle window (`millis() - tBtRx >= 80`).

#### Table 2.7.5-3: Verified ESP32 Serial / Bluetooth Command Protocol (`handleLine()`)

| Command Syntax | PWA Bridge Method | Validation / Guard Condition in Firmware | Firmware Action & Persistence Target |
| :--- | :--- | :--- | :--- |
| `B<volts>` (e.g. `B10.24`) | `sendCalibrateBattery(v)` | `3.0 <= v <= 60.0 V`, `rawBat >= 1.0 V`, `0.50 <= trim <= 2.00` | Sets `batTrim = v / rawBat`; saves to NVS `prefs.putFloat("bat", trim)` |
| `G<volts>` (e.g. `G13.10`) | `sendCalibrateTeg(v)` | `3.0 <= v <= 60.0 V`, `rawTeg >= 1.0 V`, `0.50 <= trim <= 2.00` | Sets `tegTrim = v / rawTeg`; saves to NVS `prefs.putFloat("teg", trim)` |
| `I<amps>` (e.g. `I0.50`) | `sendCalibrateCurrent(a)` | `acsOK == true`, `0.03 <= v <= 10.0 A`, `rawI >= 0.03 A`, `0.20 <= trim <= 5.00` | Sets `curTrim = v / rawI`; saves to NVS `prefs.putFloat("cur", trim)` |
| `TH<tempC>` (e.g. `TH28.0`) | `sendCalibrateHotTc(c)` | `!tcHotS.fault`, `n >= 3`, `-20 <= ref <= 1000 C`, `abs(off) <= 15.0 C` | Sets `tcHotS.offset = ref - measured`; saves to NVS `prefs.putFloat("toh", off)` |
| `TC<tempC>` (e.g. `TC28.0`) | `sendCalibrateColdTc(c)` | `!tcColdS.fault`, `n >= 3`, `-20 <= ref <= 1000 C`, `abs(off) <= 15.0 C` | Sets `tcColdS.offset = ref - measured`; saves to NVS `prefs.putFloat("toc", off)` |
| `TX` | `sendClearTcOffsets()` | None | Resets `tcHotS.offset = 0`, `tcColdS.offset = 0`; writes `0` to NVS `"toh"` & `"toc"` |
| `X` | `sendResetCalibrations()` | None | Restores `BAT_TRIM (1.1011)`, `TEG_TRIM (1.1679)`, `CUR_TRIM (1.0)`, and `0` TC offsets in NVS |
| `k` | `sendZeroCurrent()` | `!relayOn` (refused if charging) and `2.30 <= z <= 2.70 V` | Re-tars `acsZero = readPinMv(PIN_ACS) * ACS_K` at 0 A while relay is open |
| `r` | `sendClearOvercurrent()` | None | Clears `overcurrentLatched = false` and `tOver = 0` from State 6 |
| `a` / `c` / `o` | `sendAutoCharging()` / `ForceOn` / `Off` | In `c` (Force ON), still enforces hard ceiling `vBat < vHardNow` | Sets `forceMode = 0` (Auto), `1` (Forced ON), or `2` (Forced OFF / State 4) |
| `z` | `sendResetEnergy()` | None | Resets volatile energy counters `whTotal = 0`, `whHarv = 0`, `vTegPeak = 0` |
| `v` | `sendPinCheck()` | None | Prints raw GPIO32/33/35 voltages and 32-bit MAX31855 hex frames + die temperatures |
| `t` / `m` | `sendTestLedsBuzzer()` / `Mute` | None | `t` runs 2-second LED + buzzer test (`tTest = millis() + 2000`); `m` toggles `muted` |
| `d` / `j` / `h` | `sendToggleDetailed()` / `Json` / `Help` | None | `d` toggles compact vs. detailed text; `j` toggles JSON line stream; `h` prints command help |

> **[Figure 2.7.5-3: Bidirectional Telemetry and Calibration Sequence Diagram]**  
> *Diagram Specification for Manuscript Layout:* A three-lifeline UML sequence diagram (`Operator / React PWA`, `HardwareBridge (Web Serial / BT SPP)`, `ESP32 Firmware & NVS Flash`) showing: (1) Connection phase (`navigator.serial.requestPort()` -> `port.open({baudRate: 115200})` -> `port.setSignals({dataTerminalReady: true, requestToSend: true})`); (2) Continuous 1 Hz telemetry loop (`printStatus()` -> compact/JSON frame -> `parseIncomingPayload()` -> `applyCalibration()` -> `TelemetryHistoryManager.addPoint()` -> React UI render); (3) Interactive multimeter calibration (`User clicks Send B12.65` -> `sendCalibrateBattery(12.65)` -> writes `"B12.65\n"` -> `handleLine("B12.65")` -> computes `trim = 12.65 / rawBat`, persists `prefs.putFloat("bat", trim)` in NVS `"cal"`, emits `"[HH:MM:SS] >>> Battery calibration saved: factor ..."` -> `HardwareBridge` parses factor, updates `esp32Cache.batTrim`, and logs confirmation toast).

---

## 2.7.6 Database Design

### 2.7.6.1 Architectural Justification for a Serverless, Local-First Persistence Model

The target deployment environment at **Padayon Campsite, Upper Wawa Dam (Rodriguez, Rizal)** is an off-grid mountainous river-basin location characterized by the absence of utility grid power and unreliable or non-existent cellular data coverage. In accordance with embedded systems engineering principles, a remote cloud or client-server relational database management system (such as MySQL, PostgreSQL, or Firebase Cloud Firestore) is deliberately excluded from the architecture for four technical reasons:

1. **Zero Network Dependency:** Safety-critical charging parameters, sensor calibration factors, and historical field trial logs must remain 100% accessible without internet connectivity or local Wi-Fi routers.
2. **Power Budget Conservation:** Eliminating continuous Wi-Fi/cellular TLS handshakes and external database polling minimizes ESP32 current draw, preserving harvested thermoelectric energy for the 12 V battery bank.
3. **Deterministic Zero-Latency Control:** Reading calibration trims directly from on-chip flash memory during `setup()` guarantees immediate, deterministic sensor scaling within milliseconds of boot.
4. **Research Portability:** Exporting experimental trial runs directly from browser memory to standardized UTF-8 BOM Comma-Separated Values (`.csv`) files enables immediate post-test analysis in Microsoft Excel or MATLAB without database export middleware.

Instead of an external DBMS, the system implements a **Three-Tier Embedded and Client-Side Persistence Architecture** comprising: (Tier 1) ESP32 Non-Volatile Storage (NVS) flash partitions, (Tier 2) Browser Web Storage (`localStorage` and `sessionStorage`), and (Tier 3) Volatile In-Memory Ring Buffers paired with the browser Cache Storage API (`teg-monitoring-pwa-v4.15`).

---

### 2.7.6.2 Tier 1: Embedded Non-Volatile Storage (ESP32 NVS `Preferences`)

On the microcontroller, persistent key-value storage is implemented using the Espressif NVS library (`#include <Preferences.h>`) mounted in read-write mode under the namespace `"cal"` (`prefs.begin("cal", false)`, line 751). To prevent flash wear, NVS write operations are executed strictly on explicit operator calibration commands (`B`, `G`, `I`, `TH`, `TC`, `TX`, `X`) or during the one-time legacy factor migration check at startup (`lines 757 to 764`), never inside the 250 ms polling loop.

#### Table 2.7.6-1: Tier 1 Embedded NVS Data Dictionary (`Preferences` Namespace: `"cal"`)

| Namespace | NVS Key | C++ Data Type | Default Constant | Validation / Accepted Range | Functional Purpose in Firmware (`thesis_updated.ino`) |
| :---: | :---: | :---: | :---: | :---: | :--- |
| `"cal"` | `"bat"` | `float` (32-bit IEEE 754) | `BAT_TRIM = 1.1011f` | Input `3.0-60.0 V`, `rawBat >= 1.0 V`, factor `0.50-2.00` | Multiplier applied to `GPIO32` battery divider reading (`vBat = rawBat * batTrim`) |
| `"cal"` | `"teg"` | `float` (32-bit IEEE 754) | `TEG_TRIM = 1.1679f` | Input `3.0-60.0 V`, `rawTeg >= 1.0 V`, factor `0.50-2.00` | Multiplier applied to `GPIO33` TEG divider reading (`vTeg = rawTeg * tegTrim`) |
| `"cal"` | `"cur"` | `float` (32-bit IEEE 754) | `CUR_TRIM = 1.0000f` | Input `0.03-10.0 A`, `rawI >= 0.03 A`, factor `0.20-5.00` | Multiplier applied to `GPIO35` ACS712-5A current (`calI = rawI * curTrim`) |
| `"cal"` | `"toh"` | `float` (32-bit IEEE 754) | `0.0f` | Reference `-20.0 to 1000.0 C`, offset `abs(off) <= 15.0 C` | Additive reference offset (`C`) applied to linearized Hot MAX31855 (`CS GPIO5`) |
| `"cal"` | `"toc"` | `float` (32-bit IEEE 754) | `0.0f` | Reference `-20.0 to 1000.0 C`, offset `abs(off) <= 15.0 C` | Additive reference offset (`C`) applied to linearized Cold MAX31855 (`CS GPIO17`) |

---

### 2.7.6.3 Tier 2: Client-Side Web Storage (`localStorage` and `sessionStorage`)

On the client device, persistent user preferences and software-side calibration profiles are stored in the W3C Web Storage API across four verified keys in `src/App.tsx` and `src/services/calibrationStorage.ts`.

#### Table 2.7.6-2: Tier 2 Client Web Storage Data Dictionary

| Storage API | Key Identifier | Source File & Line | Data Format / Schema | Persistence Scope | Functional Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `localStorage` | `'padayon_calibration_v5'` | `calibrationStorage.ts:3` | JSON-serialized `CalibrationConfig` object (16 fields) | Permanent across browser restarts | Stores client-side sensor offsets, gains, alarm thresholds, and TNE12-15 SoC curve limits |
| `localStorage` | `'padayon_theme'` | `App.tsx:35, 44` | String enum: `'dark'` \| `'light'` (Default: `'dark'`) | Permanent across browser restarts | Persists high-contrast dark or daylight theme selection and toggles root `.dark` class |
| `localStorage` | `'padayon_lang'` | `App.tsx:39, 53` | String enum: `'en'` \| `'fil'` (Default: `'en'`) | Permanent across browser restarts | Persists bilingual UI localization (English vs. Filipino) |
| `sessionStorage` | `'bteg_session_start_ms'` | `App.tsx:127, 131` | Base-10 integer string (Unix epoch timestamp in ms) | Per browser tab session | Anchors the continuous `HH:MM:SS` session stopwatch so connect/disconnect cycles do not reset uptime |

#### Table 2.7.6-3: Schema of JSON Document `'padayon_calibration_v5'` (`CalibrationConfig`)

| JSON Field | TypeScript Type | Default Value | Unit | Engineering Role in `applyCalibration()` |
| :--- | :---: | :---: | :---: | :--- |
| `stoveTempOffset` | `number` | `0.0` | `°C` | Additive zero-point offset for hot-side thermocouple (simulation/fallback path) |
| `stoveTempGain` | `number` | `1.0` | Ratio | Linear slope multiplier for hot-side thermocouple |
| `stoveOverheatThreshold` | `number` | `230` | `°C` | Upper thermal alarm limit triggering `tooHot` alert in `App.tsx:351` |
| `stoveLowHeatThreshold` | `number` | `100` | `°C` | Lower combustion deficit threshold triggering `lowHeat` warning in `App.tsx:352` |
| `dhtTempOffset` | `number` | `0.0` | `°C` | Additive ambient temperature offset for DHT22 |
| `dhtHumidityOffset` | `number` | `0.0` | `% RH` | Additive relative humidity offset for DHT22 (clamped `0-100%`) |
| `batteryVMin` | `number` | `10.8` | `V DC` | 0% SoC (100% DOD at 20-hr rate, `1.80 V/cell`) floor for Tianneng TNE12-15 |
| `batteryVMax` | `number` | `14.6` | `V DC` | 100% SoC cycle charge limit (`14.60 V` at `25 °C`) for Tianneng TNE12-15 |
| `batteryVoltageGain` | `number` | `1.1011` | Ratio | Battery ADC divider trim factor matching ESP32 `BAT_TRIM` |
| `batteryCutoffPct` | `number` | `20` | `%` | Low-battery SoC lockout threshold (`~11.50 V`, 80% DOD reserve) for auxiliary load shedding |
| `tegVoltageGain` | `number` | `1.1679` | Ratio | TEG ADC divider trim factor matching ESP32 `TEG_TRIM` |
| `tegCurrentZeroOffset` | `number` | `0.0` | `A` | ACS712-5A software tare offset |
| `tegCurrentGain` | `number` | `1.0` | Ratio | ACS712-5A current sensitivity multiplier matching ESP32 `CUR_TRIM` |
| `coAlertThresholdPpm` | `number` | `50` | `PPM` | Carbon monoxide safety threshold for simulation/auxiliary gas monitoring |
| `lastUpdated` | `number` | `Date.now()` | `ms` | Epoch timestamp of last configuration save |

---

### 2.7.6.4 Tier 3: Volatile Runtime Buffers, Service Worker Cache, and Cross-Tier Synchronization

1. **In-Memory Time-Series and Event Ring Buffers:**
   - *UI Rolling Window Buffer (`TelemetryHistoryManager.points`, `maxPoints = 60`):* Retains the latest 60 telemetry snapshots (1 minute at 1 Hz) for instant UI statistics.
   - *Extended Experimental Trial Buffer (`TelemetryHistoryManager.fullLog`, `maxFullLog = 36,000`):* Stores up to 36,000 sanitized records (10 continuous hours at 1 Hz) in RAM. Invoking `exportCsv(runId, feedstock, intervalSec)` filters `fullLog` by the selected sampling interval (`15m` = `900 s` default, `5m` = `300 s`, `1m` = `60 s`, or `1s`) via `filterByInterval()` and serializes a **20-column Excel `.CSV` file** (`Date (PHT)`, `Time (PHT)`, `Elapsed_Sec`, `Elapsed_Min`, `Transport_Source`, `Battery_Voltage_V`, `Battery_SOC_Percent`, `TEG_Voltage_V`, `TEG_Current_A`, `In_Battery_Power_W`, `TEG_Power_W`, `Harvested_Energy_Wh`, `Stove_Hot_Face_Temp_C`, `Cold_Sink_Temp_C`, `Delta_T_Seebeck_C`, `Ambient_Temp_C`, `Relative_Humidity_Percent`, `Charger_Relay_GPIO14`, `ESP32_State_Machine`, `Active_Alarms`) prefixed with UTF-8 BOM `\uFEFF` and Excel text formulas (`="YYYY-MM-DD"` and `="hh:mm:ss AM/PM"`) to eliminate Excel `#########` column-width errors.
   - *System Event Log Buffer (`SystemLogManager.logs`, `MAX_SYSTEM_LOGS = 50`):* Retains the 50 most recent system, threshold, and ESP32 state-transition events.
   - *Raw Serial Frame Buffer (`HardwareState.rawLogs`, capped at 100 entries in `hardwareBridge.ts:241`):* Stores raw incoming (`in`), outgoing (`out`), system (`sys`), and error (`err`) serial strings for the expandable terminal in `LogsTab.tsx`.

2. **Service Worker Offline Asset Cache (`public/sw.js`, Cache Name: `'teg-monitoring-pwa-v4.15'`):**
   On `install`, the Service Worker precaches the 7 core app-shell assets (`'/'`, `'/index.html'`, `'/manifest.json'`, `'/icon-192.png'`, `'/icon-512.png'`, `'/icon-192.svg'`, `'/icon-512.svg'`). On `activate`, it purges any cache key not matching `'teg-monitoring-pwa-v4.15'`. On `fetch`, it applies a network-first strategy that clones and caches every `200 OK` same-origin response (including Vite's hashed `/assets/index-*.js` and `/assets/index-*.css` bundles), falling back to the cached response or `/index.html` when offline.

3. **Cross-Tier Calibration Synchronization Workflow:**
   When live hardware is connected (`isLiveHardware === true` in `calibrationStorage.ts:244`), `applyCalibration()` treats the ESP32's NVS-trimmed readings (`vBat`, `vTeg`, `iBat`, `tHot`, `tCold`, `batTrim`, `tegTrim`, `curTrim`) as the authoritative hardware truth, preventing double-multiplication of gains. When the operator dispatches a calibration command (`B`, `G`, `I`, `TH`, `TC`, `X`) from `CalibrationStudio.tsx`, the ESP32 updates its NVS `"cal"` partition and echoes confirmation (`"... calibration saved: factor ..."`), which `HardwareBridge` parses in real time (`lines 951 to 966`) to update `esp32Cache.batTrim`, `tegTrim`, and `curTrim` across the UI.

---

## 2.7.7 User Interface Design

### 2.7.7.1 HMI Design Philosophy, Color System, and Typography

The User Interface is engineered as an industrial handheld Human-Machine Interface (HMI) optimized for outdoor field operation at Upper Wawa Dam. The visual system adheres to four functional engineering constraints:

1. **Mobile-First Single-Column Viewport (`max-w-md` / 448 px):**
   `App.tsx` constrains the primary layout container to `w-full max-w-md border-x min-h-screen pb-24` (`line 431`), matching the portrait ergonomics of a smartphone (`"orientation": "portrait-primary"` in `manifest.json`) while remaining centered on desktop workbenches. All interactive buttons enforce a minimum touch target height of `min-h-[44px]` (`48px` on `BottomNav.tsx`) to prevent mis-taps in field conditions.

2. **High-Contrast Dark/Light Industrial Palette:**
   The default dark theme reduces OLED power consumption and glare during nighttime stove operation, while a single-tap theme toggle in `Header.tsx` switches to a high-luminance daylight palette for direct sunlight readability:
   - *Dark Mode Surfaces:* Primary background `#0B0F12` (root body `#09090b`), card surface `#13171B`, inset panel `#0E1216`, structural border `#1E242B`, custom token `--color-zinc-850: #202024`.
   - *Light Mode Surfaces:* App background `#F3F4F6`, container `#F9FAFB`, card surface `#FFFFFF`, border `border-zinc-200` (`#E4E4E7`).
   - *Semantic Status Accents:* Nominal/Charging Emerald `#00E676` and `#10B981`; Warning/Float Amber `#F59E0B` (`amber-400`/`500`); Critical Fault/Cutoff Rose `#EF4444` (`rose-400`/`500`); Bluetooth Transport Sky `#38BDF8` (`sky-400`).

3. **Zero-Jitter Tabular Monospace Instrumentation (`src/index.css:25-28`):**
   Every numerical sensor readout, clock display, and threshold badge applies `.font-mono` with `font-variant-numeric: tabular-nums`. Enforcing fixed-width glyphs prevents horizontal layout jitter during 1 Hz telemetry updates.

4. **Bilingual English / Filipino Localization (`Lang = 'en' | 'fil'`):**
   Every heading, status banner, alarm description, and instruction string supports instant switching between English (`EN`) and Filipino (`FIL`) via the header translation button, stored in `localStorage('padayon_lang')`.

---

### 2.7.7.2 Navigation & Global Layout Architecture

The application shell consists of three persistent structural regions:
- **Sticky Top Header (`src/components/Header.tsx`):** Displays the custom microcontroller SVG emblem, system title (`B-TEG CORE v2.0 • Node #01 • Wawa Dam`), a Mobile PWA Access URL modal button, the `EN`/`FIL` language toggle, and the Dark/Light theme toggle. A secondary sub-bar renders a live 1 Hz digital clock strictly formatted in 12-hour Philippine Standard Time (`hh:mm:ss AM/PM PHT • Weekday, Month Day`) alongside an interactive connection status pill (`CONNECT ESP32` in standby, `CONNECTING...` with amber pulse, or `ESP32 LIVE (SERIAL/BLUETOOTH/WEBSOCKET)` with emerald pulse).
- **Dynamic Notification & PWA Install Banners (`src/App.tsx:446-488`):** Renders a dismissible emerald confirmation toast for 4.5 seconds upon hardware connection and an `INSTALL BIOMASS PWA` banner whenever the browser fires `beforeinstallprompt`.
- **Fixed Bottom Navigation Bar (`src/components/BottomNav.tsx`):** A 4-column fixed footer (`z-40`, safe-area inset padded) providing single-tap switching across the four primary tabs (`Overview`, `Sensors`, `Service`, `Logs`), with an animated `bg-rose-500 animate-ping` alert dot on the `Overview` icon whenever `hasAlert` (`tooHot || lowHeat || lowBattery`) is active.

---

### 2.7.7.3 Screen-by-Screen Functional Specification

#### Table 2.7.7-1: UI View Specification and Component Mapping

| View / Component | Source File | Primary Functional Purpose | Displayed Telemetry Metrics | Interactive Controls | Fault & Offline States |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Overview Tab** | `src/components/OverviewTab.tsx` (435 lines) | Pure electrical & battery charging supervision (zero-scroll layout) | GPIO14 relay state (`OPEN`/`CLOSED`), ESP32 6-state machine row, `whHarv` (Wh) progress bar, 2x2 electrical grid: `Battery (GPIO32)` with 4-bar graphical battery indicator (no % text), `TEG Boost (GPIO33)` with peak voltage, `Current (GPIO35, ACS712-5A)`, and `Charge Power (W)` (`Bat W` vs `TEG W`) | Read-only hardware status badges (relay is autonomously controlled by ESP32 FSM) | Shows `0.00V` / `0.00A` / `0.0W` and `0` active battery bars when offline; `Low <1.0V` amber warning when TEG voltage is below `1.0 V`; `ACS712 fault` if `inaOk === false` |
| **2. Sensors Tab** | `src/components/SensorsTab.tsx` (396 lines) | Pure thermal & ambient sensor diagnostics and cutoff supervision | 3-Zone `Thermal Safety & Cutoff Monitor` (`STOVE <230°C`, `SINK <60°C`, `BATTERY 0-40°C`) with `Temp Difference (Hot - Cold ΔT)` footer; `Hot TC (CS GPIO5)` & `Cold TC (CS GPIO17)`; `DHT22 Battery Temp (0-40°C)` & `Humidity (% RH)`; `Thermal Voltage Compensation (-24/-18 mV/°C)` (`OPEN`, `CLOSE`, `HARD CUTOFF`) | Passive diagnostic viewport updated at 1 Hz from live ESP32 telemetry | Shows `-- °C` and `STANDBY` when disconnected; `TEMP LOCKOUT` in rose if battery area is outside `0-40°C` or DHT22 errors; `FAULT` + reason on MAX31855 probe fault |
| **3. Service Tab** | `src/components/ServiceTab.tsx` (295 lines) | Compact zero-scroll ESP32 sensor health grid and direct override commands | 2x4 Live ESP32 Sensor Health Grid (`GPIO32`, `GPIO33`, `GPIO35`, `GPIO5`, `GPIO17`, `GPIO23`, `GPIO14`, `I2C LCD & LEDs`), active faults pill, comm link status | Charge Mode buttons (`a` Auto, `c` Force ON, `o` Force OFF, `r` Clear Latch); quick hardware buttons (`z` Reset Wh, `t` Test LEDs, `m` Mute); Calibration Studio drawer toggle | Flashes `Clear Latch (r)` button in rose (`animate-pulse`) during State 6 (`OVERCURRENT`); shows live `OK` / `FAULT` / `OFF` badges across all 8 hardware subsystems |
| **4. Calibration Studio** | `src/components/CalibrationStudio.tsx` (448 lines) | Responsive mobile-safe multimeter & reference thermometer calibration drawer | 6 live ESP32 ADC & thermocouple tiles: `Battery (GPIO32)` + `batTrim`, `TEG Boost (GPIO33)` + `tegTrim`, `ACS712 (GPIO35)` + `curTrim`, `ACS Zero (~2.50V)`, `Hot TC (CS GPIO5)`, and `Cold TC (CS GPIO17)` | Responsive flex inputs (`min-w-0 w-full`): `B<V>`, `G<V>`, `I<A>`, `TH<°C>`, `TC<°C>`, plus 4 quick hardware buttons (`Zero (k)`, `Pins (v)`, `Clear TC (TX)`, `Reset (X)`) | Flags `Fault` in amber/rose if `acsZero` is outside `[2.30 V, 2.70 V]` or if a MAX31855 probe is open/shorted |
| **5. Logs Tab** | `src/components/LogsTab.tsx` (380 lines) | Interval-downsampled 20-column Excel CSV export, serial monitor, and event log | Recorded row counter, PHT timestamps, severity badges (`INFO`, `WARNING`, `ERROR`), port status, last 25 raw serial frames | CSV Interval Selector (`15M`, `5M`, `1M`, `1S`), single `EXPORT ESP32 EXCEL` button, `USB SERIAL` console toggle, filter pills (`ALL`, `INFO`, `WARN`, `ERROR`), `Clear log buffer` | Empty-category placeholder state; color-coded cards (Emerald Info, Amber Warning, Rose Error) |
| **6. Connection Modal** | `src/components/ConnectionModal.tsx` (335 lines) | Clean 2-tab hardware pairing dialog (`Bluetooth BLE` and `Wired USB`) | Link status, active transport, device/port info, packets received, KB received, last packet age | 2 transport tabs (`Bluetooth BLE` for `"TEG_Charger"` Nordic UART / SPP, and `Wired USB` at `9600-230400` baud); two-step disconnect confirmation | Displays browser compatibility hints and human-readable connection error boxes (`lastError`) |

> **[Figure 2.7.7-1: Mobile PWA Screen Wireframes and Visual Hierarchy (4-Tab Zero-Scroll Layout)]**  
> *Diagram Specification for Manuscript Layout:* A four-panel side-by-side mobile screenshot figure (`430 px` portrait width each) showing: (Panel A: `OverviewTab` - Electrical & Charging) Charger Relay GPIO14 card with `ESP32 State Machine` row, Harvested Energy Wh progress card, and the 2x2 electrical grid (`BATTERY GPIO32` with 4-bar battery graphic and `12V 15Ah` badge, `TEG BOOST GPIO33` in Volts, `CURRENT GPIO35` in Amps, and `CHARGE POWER` in Watts); (Panel B: `SensorsTab` - Thermal & Ambient) 3-zone `THERMAL SAFETY & CUTOFF MONITOR` (`STOVE <230°C`, `SINK <60°C`, `BATTERY 0-40°C`, and `Temp Difference ΔT`), `HOT TC (CS GPIO5)` and `COLD TC (CS GPIO17)`, `BATTERY TEMP (GPIO23)` and `HUMIDITY (DHT22)`, and `THERMAL VOLTAGE COMPENSATION (-24/-18mV/°C)`; (Panel C: `ServiceTab` + `CalibrationStudio`) Compact 2x4 ESP32 Sensor Health Grid, ESP32 Charger Mode Override (`Auto`, `Force ON`, `Force OFF`, `Clear Latch`), and responsive Multimeter & Thermocouple Calibration (`B`, `G`, `I`, `TH`, `TC`, `Zero (k)`, `Pins (v)`, `Clear TC`, `Reset (X)`); (Panel D: `LogsTab` + `ConnectionModal`) `15M / 5M / 1M / 1S` interval selector with single `EXPORT ESP32 EXCEL` button, expandable raw USB/BLE Serial terminal, and the 2-tab `Bluetooth BLE` / `Wired USB` Connection Hub.

---

### 2.7.7.4 Accessibility, Offline UX, and Fault Visualization

1. **WCAG AA Accessibility & Keyboard Navigation:**
   Interactive controls include semantic ARIA attributes (`role="banner"`, `role="dialog"`, `aria-modal="true"`, `role="progressbar"`, `role="meter"`, `aria-current="page"`, `aria-labelledby`), keyboard `Escape` modal dismissal (`ConnectionModal.tsx:77`), and a high-visibility custom focus ring (`outline: 2px solid #10B981; outline-offset: 2px` in `src/index.css:101-104`).
2. **Honest Offline & Fault Visualization:**
   To prevent operator misinterpretation during field testing, the UI distinguishes between a legitimate `0.0 °C` measurement and an unpowered or faulted sensor. When the ESP32 is disconnected (`!isConnected`), the thermocouple cards display `-- °C` with subtitle `Standby`. When connected, if either MAX31855 reports a fault bit (`D2` short to VCC, `D1` short to GND, `D0` open probe, or SPI frame error), the card switches its primary readout to `FAULT` in rose (`text-rose-400`) and displays the exact diagnostic string (`telemetry.hotWhy` or `telemetry.coldWhy`) in the subtitle.

---

## Appendix A: Codebase Verification & Technical Audit Summary

During the Phase 1 and Phase 2 source-code inspection, every file in `firmware/`, `src/`, `public/`, and `docs/` was cross-checked for protocol alignment, type safety, and documentation consistency. Table A-1 catalogues the verified engineering findings in the current workspace, followed by a summary of historical documentation discrepancies that were resolved or superseded by the actual code.

#### Table A-1: Verified Code-Level Audit Findings & Recommended Remediations

| ID | Severity | File Path & Line / Symbol | Verified Technical Finding | Recommended Engineering Fix |
| :---: | :---: | :--- | :--- | :--- |
| **AUD-01** | **Medium** | `src/components/ConnectionModal.tsx:385` & `src/services/hardwareBridge.ts:423` (`connectBluetooth`) | **BLE GATT Client vs. Classic Bluetooth SPP Firmware:** The PWA exposes an optional `SCAN VIA DIRECT WEB BLUETOOTH (BLE)` button targeting Nordic UART Service UUID `6e400001-...`, whereas `firmware/thesis_updated.ino` (`line 48, 743`) compiles only Classic Bluetooth SPP (`BluetoothSerial.h`, `"TEG_Charger"`). Direct Web Bluetooth BLE scans will not discover the ESP32 unless connected via the primary `CONNECT BLUETOOTH SERIAL (COM PORT)` Web Serial button. | Retain `CONNECT BLUETOOTH SERIAL (COM PORT)` as the primary desktop workflow, and label the BLE button as requiring optional dual-mode BLE firmware. |
| **AUD-02** | **Medium** | `src/components/SensorsTab.tsx:289-313` (`CH3: GPIO4 TS1 150°C Thermal Switch`) | **Unimplemented Hardware Channel in UI:** `SensorsTab.tsx` displays a status row for `CH3: GPIO4 TS1 150°C Thermal Switch`, and `calibrationStorage.ts:371` synthesizes `thermalFuseTripped` at `stoveTemp >= 310°C`. However, `firmware/thesis_updated.ino` does not read `GPIO4` (thermal protection is enforced via `HOT_ALARM_C = 230.0 C`, `COLD_ALARM_C = 60.0 C`, and `BAT_TEMP_STOP_C = 40.0 C`). | Replace the `CH3: GPIO4 TS1` row in `SensorsTab.tsx` with the actual firmware thermal cutoffs (`MAX31855 Hot >230°C / Cold >60°C & DHT22 >=40°C`). |
| **AUD-03** | **Medium** | `src/App.tsx:549-557` & `src/components/LogsTab.tsx:81-91` (`handleExportEvents`) | **LogsTab CSV Button Exports Event Logs Only:** In `LogsTab.tsx:81`, `handleExportEvents()` prioritizes `onExportEventLogs()` (`systemLogManager.exportCsv('bteg_event_logs')`) over `onExportCsv()` (`historyManager.exportCsv()`). Thus, the 17-column numerical sensor CSV exporter in `telemetryHistory.ts:206` is shadowed in the UI. | Render two separate export buttons in `LogsTab.tsx`: one for `TELEMETRY DATA CSV` (`onExportCsv`) and one for `EVENT LOGS CSV` (`onExportEventLogs`). |
| **AUD-04** | **Medium** | `src/services/hardwareBridge.ts:1734-1744` (`sendPulseFeedCommand`, `sendCalibrationCommand`) & `sendRelayCommand` | **Unhandled JSON Downlink Commands in Firmware:** `HardwareBridge` defines JSON command transmitters (`{"cmd":"CALIB",...}`, `{"cmd":"FEED_SERVO"}`, `RELAY ...`), whereas `handleLine()` in `firmware/thesis_updated.ino:627` parses single-letter ASCII commands (`B`, `G`, `I`, `TH`, `TC`, `TX`, `X`, `a`, `c`, `o`, `k`, `r`, `v`, `z`, `t`, `m`, `d`, `j`, `h`). | Have `handleSendCalToHardware` dispatch the individual `B`, `G`, `I`, `TH`, `TC` ASCII commands, or remove unused JSON command stubs. |
| **AUD-05** | **Low** | `src/components/SensorsTab.tsx:159` (`['10:00', '10:05', '10:10', '10:15', '10:20']`) | **Static X-Axis Labels on 5-Minute Power Chart:** While the SVG trend path dynamically plots the latest 12 `historyPoints`, the X-axis labels are static strings `'10:00'` through `'10:20'` rather than `pt.time` timestamps. | Bind the X-axis `<text>` labels to `pointsToRender.map(p => p.time)`. |
| **AUD-06** | **Low** | `src/types/telemetry.ts:163`, `src/services/calibrationStorage.ts:177, 401`, `src/services/simulationEngine.ts:14, 38-39, 256` | **Legacy `LiFePO4_12V_50Ah` & `14.4 V` Constants in Simulation Engine:** While live firmware and `OverviewTab.tsx` are calibrated for the **Tianneng TNE12-15 (12 V, 15 Ah AGM-GEL)** battery (`14.60 V` open, `13.70 V` close, `-24/-18 mV/C`), `simulationEngine.ts` still models a `50.0 Ah` bank with `14.4 V / -18 mV/C` thresholds, and `telemetry.ts:163` types `chemistry: 'LiFePO4_12V_50Ah'`. | Update `simulationEngine.ts` (`maxBatteryAh = 15.0`, `vOpen = 14.6 - 0.024 * ...`) and `telemetry.ts` (`chemistry: 'AGM_GEL_12V_15Ah'`) for full parity. |
| **AUD-07** | **Low** | `firmware/thesis_updated.ino:175` (`V_BAT_CUTOFF = 10.8f`) | **Unused `V_BAT_CUTOFF` Constant in Firmware:** `V_BAT_CUTOFF = 10.8f` is declared on line 175 (since low-voltage load disconnect is handled externally by the HX-M609 module while the ESP32 controls the charging relay), so `V_BAT_CUTOFF` is not referenced in `chargeControl()`. | Document that `10.80 V` is enforced by the external HX-M609 load-cutoff module and used by the PWA as `batteryVMin` (`0%` SoC). |
| **AUD-08** | **Low** | `package.json:13` (`"lucide-react": "^1.47.0"`) & `src/components/ServiceLogsTab.tsx` | **Unused Dependency & Deprecated Stub Component:** All UI icons are imported from `src/components/Icons.tsx` (0 imports of `lucide-react` across `src/`), and `ServiceLogsTab.tsx` (19 lines) is an unused deprecated wrapper around `LogsTab.tsx`. | Remove `"lucide-react"` from `package.json` dependencies and delete `src/components/ServiceLogsTab.tsx`. |
| **AUD-09** | **Low** | `src/services/hardwareBridge.ts` (1,748 lines, 19 `any` annotations, 5 `@ts-ignore` directives) | **Monolithic Bridge Module & Web Serial/Bluetooth Type Suppressions:** Because standard DOM `lib.dom.d.ts` omits experimental Web Serial (`navigator.serial`) and Web Bluetooth (`navigator.bluetooth`) types, `hardwareBridge.ts` uses 5 `@ts-ignore` comments and 19 `any` casts. | Add a dedicated `src/types/web-serial-bluetooth.d.ts` ambient declaration file and split `hardwareBridge.ts` into transport and parser submodules. |

#### Table A-2: Discrepancies Between Legacy Documentation (`Audit_Report.md` / `SYSTEM_DOCUMENTATION.md`) and Actual Source Code

| Legacy Document Claim | Actual Verified Codebase State (Single Source of Truth) |
| :--- | :--- |
| `Audit_Report.md` (CRIT-01 to CRIT-04) claims load power is multiplied by `12x` (`'239.4'`), `coldFaceTemp`/`deltaT` are missing, and `fullLog` is capped at `5,000` points. | **Already Resolved in Current Code:** `OverviewTab.tsx` and `SensorsTab.tsx` compute true $P = V \times I$ (`pBat = vBat * iTeg`, `pHarv = vTeg * iTeg`), `tCold` and `dT` are first-class properties in `telemetry.ts`, and `telemetryHistory.ts:18` caps `fullLog` at `36,000` points (10 hours at 1 Hz). |
| `SYSTEM_DOCUMENTATION.md` references `MAX6675`, `INA219`, `MQ-7`, a 4-channel relay, a fuel hopper servo, `padayon_calibration_v3`, and `sw.js v2.2`. | **Superseded by Actual Hardware & Firmware:** `firmware/thesis_updated.ino` uses **two MAX31855** K-type thermocouple modules (`GPIO5`, `GPIO17`), an **ACS712-5A** analog current sensor (`GPIO35`), a **DHT22** (`GPIO23`), a **1-channel active-LOW relay** (`GPIO14`), `localStorage` key `'padayon_calibration_v5'`, and Service Worker cache `'padayon-pwa-v4.1'`. |
| External ZIP audit flagged six `131-132 byte` PDFs, two `129-byte` PNG icons, dual lockfiles (`package-lock.json` + `pnpm-lock.yaml`), and zero test files. | **Resolved in Commit `3f4eebd`:** `.pdf` and `.png` were removed from Git LFS in `.gitattributes` and committed as full binaries (`icon-192.png` = `1,743 B`, `icon-512.png` = `7,554 B`, PDFs = `316 KB to 1.05 MB`), `package-lock.json` and `.agents`/`.gemini` bloat were removed, and `tests/telemetry.test.mjs` (`4/4` passing unit tests) was added. |
