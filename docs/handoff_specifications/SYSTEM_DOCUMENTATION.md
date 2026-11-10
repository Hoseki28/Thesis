# Systems Engineering Documentation: Padayon Power Monitor PWA
**Smart Biomass-Powered Thermoelectric Energy System (B-TEG Core)**  
**Document Classification:** System Specification & Codex Visual Architecture Reference  
**Deployment Context:** Field Research Node #01, Upper Wawa Dam, Rodriguez, Rizal  
**Document Revision:** 2.1 (October 2026)  
**Author:** Senior Systems Analyst, Embedded IoT Software Documentation Specialist & Hardware-Software Integration Architect  

---

## Section 1: Architecture and Data Flow

### 1.1 System Boundary Definition
The Smart Biomass-Powered Thermoelectric Energy System is partitioned strictly across physical and computational boundaries:

```
+========================================================================================+
| PHYSICAL SENSOR & COMBUSTION LAYER (Outside System Boundary)                          |
|                                                                                        |
|   +--------------------------+    +-----------------------+    +--------------------+  |
|   | Biomass Stove Chamber    |    | Thermoelectric Module |    | LiFePO4 Battery    |  |
|   | (Wood Waste/Coconut Husk)|    | Array (Seebeck Effect)|    | 12V 50Ah Bank      |  |
|   +--------------------------+    +-----------------------+    +--------------------+  |
|                 |                             |                           |            |
|                 v                             v                           v            |
|         Type-K Thermocouple            Direct DC Leads             Battery Shunt       |
+========================================================================================+
                                          |
                                          v
+========================================================================================+
| EMBEDDED MICROCONTROLLER HARDWARE LAYER (Outside System Boundary)                      |
|                                                                                        |
|   [ ESP32 MCU Node / NodeMCU-32S ]                                                     |
|   - MAX31855 / MAX6675 SPI Thermocouple Driver (0°C to 350°C)                          |
|   - DHT22 / DHT11 One-Wire Driver (Ambient Temp & Relative Humidity)                   |
|   - MQ-7 Analog Gas ADC Driver (CO Concentration 0 to 1000 PPM)                        |
|   - INA219 / ACS712 Current Sensor Driver (TEG & Battery Shunts)                       |
|   - 4-Channel Relay / Optocoupler Driver (DC Bus, Lights, Cooling Fans, Aux USB)       |
|   - Hopper Fuel Feed Servo PWM Driver (SG90 / MG996R)                                  |
|   - Transports: USB-UART CDC (115200 baud), BLE Nordic UART, SoftAP WebSocket Server   |
+========================================================================================+
                                          |
        Physical Wire (USB/UART) / 2.4 GHz RF (BLE GATT / Wi-Fi 802.11b/g/n)
        Payload: ASCII Delimited JSON Streams / Comma-Separated CSV Lines
                                          |
                                          v
+========================================================================================+
| PROGRESSIVE WEB APPLICATION (PWA) SYSTEM (Inside System Boundary)                      |
|                                                                                        |
|   +--------------------------------------------------------------------------------+   |
|   | Hardware Abstraction Layer: hardwareBridge.ts                                 |   |
|   | - Web Serial API Reader (navigator.serial)                                     |   |
|   | - Web Bluetooth API GATT Client (navigator.bluetooth)                          |   |
|   | - WebSocket Reconnecting Client (ws://192.168.4.1/ws)                          |   |
|   | - Frame Reassembly, String Sanitization, and Boundary Limit Clamping          |   |
|   +--------------------------------------------------------------------------------+   |
|                 |                                             ^                        |
|                 | rawHardwareData                             | Downlink Commands      |
|                 v                                             | (RELAY, FEED, CALIB)   |
|   +-----------------------------------------------------------+--------------------+   |
|   | React Application Root Orchestrator: src/App.tsx                               |   |
|   | - Fallback: Simulation Engine (simulationEngine.ts) if Standby/Disconnected     |   |
|   | - State: TelemetryData, HardwareState, CalibrationConfig, SystemLogEntry[]      |   |
|   +--------------------------------------------------------------------------------+   |
|                 |                                             |                        |
|                 v                                             v                        |
|   +---------------------------------------+     +----------------------------------+   |
|   | Calibration Engine:                   |     | Historical Time-Series Storage:  |   |
|   | calibrationStorage.ts                 |     | telemetryHistory.ts              |   |
|   | - applyCalibration() Transform        |     | - 60-Point Rolling Buffer (UI)   |   |
|   | - LocalStorage: padayon_calibration_v3|     | - 36,000-Point Full Log (Thesis) |   |
|   +---------------------------------------+     +----------------------------------+   |
|                 |                                             |                        |
|                 v                                             v                        |
|   +--------------------------------------------------------------------------------+   |
|   | UI Presentation Viewports:                                                     |   |
|   | - Header.tsx: Real-time PHT Clock, Status Badge, Transport Indicator           |   |
|   | - OverviewTab.tsx: Master Power Switch, Two-Tier Load Shedding, 2x2 Grid       |   |
|   | - SensorsTab.tsx: Battery Voltage Gauge, 5M Trend SVG Chart, 4-Channel Loads   |   |
|   | - ServiceTab.tsx & CalibrationStudio.tsx: 2-Point Bench Helpers, ADC Tuning    |   |
|   | - LogsTab.tsx: Event Buffer Viewport, Severity Filters, 15-Column CSV Exporter |   |
|   | - ConnectionModal.tsx: Transport Configuration & Telemetry Diagnostic Stats    |   |
|   | - BottomNav.tsx: Primary View Routing with Edge-Triggered Alert Indicator Dot  |   |
|   +--------------------------------------------------------------------------------+   |
|                 |                                                                      |
|                 v                                                                      |
|   +--------------------------------------------------------------------------------+   |
|   | Browser Persistence & Offline Cache Layer:                                     |   |
|   | - Service Worker: public/sw.js (Precache v2.2 with background cache revalidation)|   |
|   | - Web App Manifest: public/manifest.json (Standalone PWA runtime configuration)|   |
|   | - LocalStorage: padayon_calibration_v3, padayon_theme, padayon_lang            |   |
|   +--------------------------------------------------------------------------------+   |
+========================================================================================+
```

### 1.2 Component Hierarchy and Unidirectional Reactive Data Flow
Data flows strictly unidirectionally from hardware transport streams or simulated physical ticks downward through pure state hooks into leaf display components:

```
                [ Physical ESP32 MCU ]     [ SimulationEngine ]
                          |                         |
                          +-----------+-------------+
                                      |
                                      v
                             [ HardwareBridge ]
                                      |
                                      v (rawHardwareData)
                            [ applyCalibration() ]
                                      |
                                      v (TelemetryData)
                            +--------------------+
                            |   App.tsx State    |
                            +--------------------+
                                      |
      +----------------+--------------+---------------+----------------+
      |                |                              |                |
      v                v                              v                v
[ Header.tsx ]  [ OverviewTab.tsx ]            [ SensorsTab.tsx ]  [ ServiceTab.tsx ]
      |                |                              |                |
      |                |                              |                +-> [ CalibrationStudio.tsx ]
      v                v                              v
[ ConnectionModal ]  [ BottomNav.tsx ]         [ LogsTab.tsx ]
```

1. **Ingestion:** `hardwareBridge.ts` receives chunks from `SerialPort.readable`, `BluetoothRemoteGATTCharacteristic`, or `WebSocket`. Chunks are buffered, split across newline delimiters (`\n`), sanitized, and dispatched via `onDataCallback`.
2. **Arbitration:** In `src/App.tsx`, if `hardwareState.status === 'connected'`, hardware data overrides simulated ticks. If disconnected or in standby, `simulationEngine.ts` ticks at 1 Hz, generating synthetic physics data.
3. **Normalization:** Raw sensor values pass through `applyCalibration(raw, calibrationRef.current)`. All offset additions, gain scalings, and mathematical derivations ($\Delta T$, SoC, $P_{\text{teg}}$, $P_{\text{load}}$, $I_{\text{net}}$) are computed synchronously.
4. **Buffering & Logging:** The calibrated `TelemetryData` object is passed to `telemetryHistoryRef.current.addPoint(calibrated)`. Simultaneously, edge-triggered threshold listeners in `App.tsx` evaluate whether safety boundaries (`tooHot`, `lowBattery`, `lowHeat`) have transitioned from false to true, dispatching immutable `SystemLogEntry` records to `systemLogManager`.
5. **Rendering:** React propagates state updates to the active tab (`OverviewTab`, `SensorsTab`, `ServiceTab`, or `LogsTab`). All visual controls, gauges, and SVG charts re-render cleanly without layout thrashing.
6. **Downlink Dispatch:** When an operator clicks an actuator toggle (e.g., cooling fans), a hopper feed pulse, or a calibration save, the UI invokes methods on `bridgeRef.current` (e.g., `sendRelayCommand('fans', true)`), which formats a JSON packet and writes it to the active transport stream.

### 1.3 Transport Abstraction Layer Architecture
`HardwareBridge` serves as an polymorphic facade hiding the transport complexity from consumer components:
- **Web Serial Adapter:** Uses `navigator.serial.requestPort()` and `port.open({ baudRate })`. Data is piped through a `TextDecoderStream` into a line reader loop.
- **Web Bluetooth Adapter:** Uses `navigator.bluetooth.requestDevice()` filtering for Nordic UART Service UUID (`6e400001-b5a3-f393-e0a9-e50e24dcca9e`). Establishes GATT connection, subscribes to TX characteristic (`6e400003-...`) notifications, and writes downlink commands to RX characteristic (`6e400002-...`).
- **WebSocket Adapter:** Connects to `ws://192.168.4.1/ws`. Implements fragmented frame reassembly, concatenated object boundary splitting (`}{`), and an exponential backoff auto-reconnect engine.
- **Unified Interface Contract:** Consumer components interact exclusively with `getState()`, `sendCommand()`, `sendRelayCommand()`, `sendPulseFeedCommand()`, and `sendCalibrationCommand()`. Consumers are agnostic to whether the underlying connection is physical copper, BLE RF, or Wi-Fi.

---

## Section 2: Data Models and Storage Schema

### 2.1 Complete Field-by-Field Reference of `TelemetryData`
Defined in `src/types/telemetry.ts` (lines 19 to 117):

| Field Name | Type | Unit | Origin / Description |
| :--- | :--- | :--- | :--- |
| `rawStoveTemp` | `number` | °C | Raw ADC / MAX31855 hot junction reading |
| `rawColdFaceTemp` | `number \| undefined` | °C | Raw cold-side water heatsink reading |
| `rawAmbientTemp` | `number` | °C | Raw DHT22 ambient dry-bulb reading |
| `rawHumidity` | `number` | % RH | Raw DHT22 relative humidity reading |
| `rawBatteryVoltage`| `number` | VDC | Raw voltage divider ADC reading |
| `rawBatteryCurrent`| `number \| undefined` | A | Raw INA219 battery shunt reading (if equipped) |
| `rawTegVoltage` | `number` | VDC | Raw TEG array output voltage |
| `rawTegCurrent` | `number` | A | Raw TEG generation current |
| `rawCoPpm` | `number \| undefined` | PPM | Raw MQ-7 carbon monoxide concentration |
| `stoveTemp` | `number` | °C | Calibrated hot junction temperature: $(T_{\text{raw}} \cdot m_{\text{stove}}) + b_{\text{stove}}$ |
| `coldFaceTemp` | `number` | °C | Calibrated cold junction temperature |
| `deltaT` | `number` | °C | Computed gradient: $\max(0, T_{\text{stove}} - T_{\text{cold}})$ |
| `ambientTemp` | `number` | °C | Calibrated ambient air temperature: $T_{\text{amb}} + b_{\text{dht\_temp}}$ |
| `humidity` | `number` | % RH | Calibrated relative humidity: $\text{clamp}(0, 100, \text{RH} + b_{\text{dht\_hum}})$ |
| `batteryVoltage` | `number` | VDC | Calibrated battery terminal voltage: $V_{\text{raw}} \cdot m_{\text{batt\_v}}$ |
| `batteryPct` | `number` | 0-100% | Computed SoC based on LiFePO4 10.0V to 14.6V curve |
| `isPhysicalCurrent`| `boolean` | Flag | True if battery current is physically measured via shunt |
| `batteryCurrentSigned`| `number`| A | Signed current: (+) Net Charging, (-) Net Discharging |
| `tegVoltage` | `number` | VDC | Calibrated TEG generator voltage |
| `tegCurrent` | `number` | A | Calibrated TEG generator current: $(I_{\text{raw}} - I_{\text{zero}}) \cdot m_{\text{teg\_i}}$ |
| `tegPower` | `number` | W | Computed generation wattage: $V_{\text{teg}} \cdot I_{\text{teg}}$ |
| `loadCurrent` | `number` | A | Computed load current draw: $P_{\text{load}} / V_{\text{batt}}$ |
| `loadPower` | `number` | W | Aggregate active load consumption (Lights + Fans + Servo + Aux) |
| `netCurrent` | `number` | A | Net electrical current: $I_{\text{teg}} - I_{\text{load}}$ |
| `ambient` | `object` | Struct | `{ tempC: number, humidityPct: number }` (Subsystem 1) |
| `safety` | `object` | Struct | `{ coPpm: number, coAlert: boolean, thermalFuseTripped: boolean }` |
| `fuelSystem` | `object` | Struct | `{ hopperServoActive: boolean, feedCycles: number }` |
| `cooling` | `object` | Struct | `{ fanActive: boolean, fanPwm: number }` |
| `battery` | `object` | Struct | `{ voltage: number, currentSignedMa: number, socPct: number, chemistry: 'LiFePO4_12V_50Ah' }` |
| `loadChannels` | `LoadChannel[4]` | Array | Structured array of four individual load circuits |
| `criticalLoadActive`| `boolean` | Flag | Guarded flag: Primary 12V LED lighting (always true) |
| `auxLoadActive` | `boolean` | Flag | Secondary auxiliary circuits active flag |
| `auxLockout` | `boolean` | Flag | Deep-discharge safety lockout: true if $\text{SoC} \le \text{cutoffPct}$ |
| `relays` | `object` | Struct | `{ dcBus: boolean, lights: boolean, fans: boolean, aux: boolean }` |
| `feedstock` | `FeedstockType` | Enum | `'wood_waste' \| 'coconut_husk' \| 'unassigned'` |
| `runId` | `string` | ID | Experimental trial identifier (e.g., `'RUN-01'`) |
| `fuelMassKg` | `number` | kg | Biomass fuel charge mass for Chapter 4 research |
| `sensorFault` | `boolean` | Flag | Hardware error flag (open-circuit thermocouple, out-of-bounds ADC) |
| `operatingHours` | `number` | hrs | Cumulative system running hours |
| `systemHealthPct` | `number` | % | Overall system health index |
| `timestamp` | `number` | ms | Unix epoch millisecond timestamp |
| `source` | `DataSource` | Enum | `'simulated' \| 'serial' \| 'bluetooth' \| 'network' \| 'manual'` |

### 2.2 `LoadChannel` Interface Specification
Defined in `src/types/telemetry.ts` (lines 11 to 17):
```typescript
export interface LoadChannel {
  id: 1 | 2 | 3 | 4
  name: string
  active: boolean
  sheddable: boolean
  currentMa: number
}
```
Channel Allocations:
- **Channel 1:** `"12V LED Critical Light"`, `sheddable: false` (Guarded non-sheddable life-safety lighting, ~400 mA).
- **Channel 2:** `"Cold-Side Water Fan"`, `sheddable: true` (Sheddable radiator fan, ~1000 mA).
- **Channel 3:** `"Hopper Fuel Feed Servo"`, `sheddable: true` (Sheddable fuel auger servo, ~650 mA during pulse).
- **Channel 4:** `"5V USB Charging Ports"`, `sheddable: true` (Sheddable auxiliary gadget charging, ~415 mA).

### 2.3 `CalibrationConfig` Specification
Defined in `src/types/telemetry.ts` (lines 119 to 141):

| Parameter | Type | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `stoveTempOffset` | `number` | `0.0` °C | Intercept $b$ for MAX31855 thermocouple ($Y = mX + b$) |
| `stoveTempGain` | `number` | `1.0` | Slope $m$ for MAX31855 thermocouple |
| `stoveOverheatThreshold` | `number` | `230` °C | Safety trip point triggering emergency overheat alarm |
| `stoveLowHeatThreshold` | `number` | `100` °C | Warning trip point indicating insufficient combustion |
| `dhtTempOffset` | `number` | `0.0` °C | Dry-bulb ambient temperature offset |
| `dhtHumidityOffset` | `number` | `0.0` % | Relative humidity offset |
| `batteryVMin` | `number` | `10.0` V | LiFePO4 deep-discharge cutoff voltage (0% SoC) |
| `batteryVMax` | `number` | `14.6` V | LiFePO4 absorption voltage (100% SoC) |
| `batteryVoltageGain` | `number` | `1.0` | Analog voltage divider scaling multiplier |
| `batteryCutoffPct` | `number` | `15` % | State of Charge threshold triggering automated load shedding |
| `tegCurrentZeroOffset`| `number` | `0.0` A | ACS712 / INA219 quiescent zero-current tare value |
| `tegCurrentGain` | `number` | `1.0` | Current sensor sensitivity multiplier |
| `coAlertThresholdPpm` | `number` | `50` PPM | Carbon monoxide warning threshold |
| `lastUpdated` | `number` | Unix ms | Millisecond epoch timestamp of last configuration commit |

### 2.4 Browser LocalStorage Schema
The application persists client-side operational state under three isolated keys:

1. **`padayon_calibration_v3`**:
   - **Data Format:** Serialized JSON string conforming to `CalibrationConfig`.
   - **Serialization Routine:** `saveCalibration()` (`src/services/calibrationStorage.ts:41-48`).
   - **Fallback Recovery:** If corrupted or unparseable, `loadCalibration()` catches the exception and returns `DEFAULT_CALIBRATION`.
2. **`padayon_theme`**:
   - **Data Format:** UTF-8 string: `'dark' | 'light'`. Default: `'dark'`.
   - **DOM Hook:** Sets `document.documentElement.classList.add('dark')` for Tailwind CSS v4 selector application.
3. **`padayon_lang`**:
   - **Data Format:** UTF-8 string: `'en' | 'fil'`. Default: `'en'`.
   - **Localization Hook:** Controls bilingual English / Filipino UI text rendering.

### 2.5 In-Memory Buffers and Retention Policies

```
+-----------------------------------------------------------------------------------+
| TELEMETRY RETENTION ARCHITECTURE (telemetryHistory.ts & systemLogService.ts)      |
|                                                                                   |
|   +------------------------------------+     +--------------------------------+   |
|   | 1. High-Frequency UI Rolling Buffer|     | 2. Full Thesis Research Log    |   |
|   |    Capacity: 60 Points (FIFO)      |     |    Capacity: 36,000 Points     |   |
|   |    Retention: 60 seconds @ 1 Hz    |     |    Retention: 10 Hours @ 1 Hz  |   |
|   |    Usage: SVG Sparklines & Trends  |     |    Usage: Chapter 4 CSV Export |   |
|   +------------------------------------+     +--------------------------------+   |
|                                                              |                    |
|   +------------------------------------+                     v                    |
|   | 3. System Diagnostic Event Buffer  |     [ Export CSV Action Button ]         |
|   |    Capacity: 50 Entries (LIFO)     |     Columns: Timestamp, Run_ID,          |
|   |    Formatting: Asia/Manila (PHT)   |              Feedstock, Hot_Side_C,      |
|   |    Usage: Diagnostic Traceability  |              Delta_T_C, Batt_V, etc.     |
|   +------------------------------------+                                          |
+-----------------------------------------------------------------------------------+
```

1. **Reactive UI Rolling Window (`points: TelemetryPoint[]`):**
   - **Capacity:** Hard-capped at 60 points (`maxPoints = 60`).
   - **Policy:** FIFO push-and-shift. Maintains a 60-second historical window at 1 Hz for reactive SVG sparklines without consuming excess browser memory.
2. **Long-Duration Thesis Research Buffer (`fullLog: TelemetryData[]`):**
   - **Capacity:** Expanded to 36,000 points (`maxFullLog = 36000`).
   - **Policy:** FIFO push-and-shift. Holds up to 10 hours of continuous 1 Hz field burn testing data. Enables comprehensive Chapter 4 thesis evaluation without dropping historical points.
3. **Diagnostic Event Log Buffer (`logs: SystemLogEntry[]`):**
   - **Capacity:** Hard-capped at 50 records (`MAX_SYSTEM_LOGS = 50`).
   - **Policy:** Prepend newest entries at head (`[entry, ...logs].slice(0, 50)`). Timestamps formatted strictly as `YYYY-MM-DD HH:mm` in Asia/Manila time.

---

## Section 3: Hardware Protocol and Communication Contract

### 3.1 Serial Link Framing (Web Serial API)
- **Baud Rate:** 115,200 baud (configurable to 9600, 19200, 38400, 57600).
- **Data Configuration:** 8 Data Bits, No Parity, 1 Stop Bit (8-N-1).
- **Flow Control:** None (Hardware RTS/CTS disabled).
- **Packet Delimiter:** ASCII Line Feed (`\n` or `\r\n`).
- **Buffer Line Decoding:** Incoming byte streams are piped through `TextDecoderStream`, split across `\n`, with the incomplete tail retained in `buffer` across stream chunks (`src/services/hardwareBridge.ts:191-229`).

### 3.2 Inbound Microcontroller Telemetry Payload Schema
The hardware bridge accepts two inbound packet formats:

#### Format A: Standard Delimited JSON Payload (Recommended)
Microcontrollers transmit a single-line ASCII JSON string terminated by `\n`:
```json
{
  "stoveTemp": 185.2,
  "coldFaceTemp": 26.4,
  "ambientTemp": 29.1,
  "humidity": 65,
  "batteryV": 13.24,
  "batteryCurrent": 0.35,
  "tegVoltage": 5.4,
  "tegCurrent": 1.12,
  "co_ppm": 14.5,
  "hopperServoActive": false,
  "feedCycles": 18,
  "fan_pwm": 180,
  "channel_currents": [400, 1000, 0, 415],
  "relays": { "dcBus": 1, "lights": 1, "fans": 1, "aux": 0 },
  "feedstock": "wood_waste",
  "runId": "RUN-01",
  "fuelMassKg": 1.5
}
```

Field Ingestion and Fallback Mapping:
- `stoveTemp`: Accepts `stoveTemp`, `stove_temp`, `stove`, or `hot_side`. Clamped to `[0, 350]`.
- `coldFaceTemp`: Accepts `coldFaceTemp`, `cold_temp`, `cold_side`, or `t_cold`. Clamped to `[5, 95]`.
- `ambientTemp`: Accepts `ambientTemp`, `ambient_temp`, or `dht_temp`. Clamped to `[-10, 65]`.
- `humidity`: Accepts `humidity` or `dht_hum`. Clamped to `[0, 100]`.
- `batteryV`: Accepts `batteryV`, `battery_voltage`, or `v_batt`. Clamped to `[7.0, 16.5]`.
- `batteryCurrent`: Accepts `batteryCurrent`, `i_batt`, or `battery_current` (Signed Amperes).
- `tegVoltage`: Accepts `tegVoltage` or `v_teg`. Clamped to `[0, 28.0]`.
- `tegCurrent`: Accepts `tegCurrent` or `i_teg`. Clamped to `[0, 5.0]`.
- `co_ppm`: Accepts `co_ppm`, `coPpm`, `co`, or `mq7_ppm`. Clamped to `[0, 1000]`.

#### Format B: Legacy Comma-Separated CSV Payload (Fallback)
If JSON parsing fails and the string contains commas, `hardwareBridge.ts` (lines 688 to 730) parses the line positionally:
```
stoveTemp, coldFaceTemp, ambientTemp, humidity, batteryV, tegVoltage, tegCurrent, lights, fans, aux
```
Example: `185.2, 26.4, 29.1, 65, 13.24, 5.4, 1.12, 1, 1, 0`

### 3.3 Outbound Downlink Command Schema
The dashboard issues commands to the ESP32 as single-line JSON packets terminated by `\n`:

1. **Relay Actuation Command:**
   ```json
   {"cmd": "RELAY", "relay": "fans", "state": 1}
   ```
   - Target keys: `"dcBus"`, `"lights"`, `"fans"`, `"aux"`.
   - State values: `1` (Energized / Closed), `0` (De-energized / Open).
2. **Fuel Hopper Pulse Feed Command:**
   ```json
   {"cmd": "FEED_SERVO"}
   ```
   - Triggers the ESP32 to pulse the fuel hopper feed servo for 1.2 seconds.
3. **Calibration Coefficient Flash Command:**
   ```json
   {"cmd": "CALIB", "config": { "stoveTempOffset": 0.0, "stoveTempGain": 1.0, "batteryVMin": 10.0, "batteryVMax": 14.6, ... }}
   ```
   - Instructs the ESP32 to commit the full calibration dictionary into non-volatile storage (NVS / EEPROM).

### 3.4 Web Bluetooth BLE GATT UUID Specifications
The dashboard communicates with ESP32 BLE peripherals using the Nordic Semiconductor UART Service:
- **Primary Service UUID:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **RX Characteristic UUID (Web Dashboard -> ESP32 Write):** `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
  - Properties: `write`, `writeWithoutResponse`.
- **TX Characteristic UUID (ESP32 -> Web Dashboard Notify):** `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
  - Properties: `notify`. Notifications are converted from raw byte buffers via `TextDecoder` and split on `\n`.

### 3.5 Wi-Fi WebSocket Protocol & Frame Reassembly
- **Default Endpoint:** `ws://192.168.4.1/ws` (ESP32 SoftAP default gateway).
- **Frame Buffering:** Incomplete chunks are stored in `wsBuffer`. When new chunks arrive, `wsBuffer` is split on `\n`. If the microcontroller transmits multiple un-delimited JSON objects (`}{`), the bridge regex splits on boundary pattern `\}\{` -> `}\n{` to prevent JSON parse exceptions.
- **Exponential Backoff Reconnection:** Upon unintended socket closure, the bridge increments `wsReconnectAttempts` and schedules reconnection:
  $$T_{\text{delay}} = \min\left(15000\text{ ms}, 1500 \cdot 1.5^{(\text{attempts} - 1)}\right)$$
  Max retries: 8 attempts. If exhausted, the system safely falls back to Standby mode.

---

## Section 4: Mathematical Models and Calibration Logic

### 4.1 Calibration Transfer Functions
Located in `src/services/calibrationStorage.ts` (lines 95 to 157):

1. **Stove Thermocouple Calibration:**
   $$T_{\text{calibrated}} = \text{round}_1\left((T_{\text{raw}} \cdot m_{\text{stove}}) + b_{\text{stove}}\right)$$
2. **Cold Sink & Ambient Temperature Calibration:**
   $$T_{\text{amb, cal}} = \text{round}_1(T_{\text{amb, raw}} + b_{\text{dht\_temp}})$$
3. **Relative Humidity Calibration:**
   $$\text{RH}_{\text{cal}} = \text{clamp}(0, 100, \text{round}_0(\text{RH}_{\text{raw}} + b_{\text{dht\_hum}}))$$
4. **Seebeck Temperature Gradient ($\Delta T$):**
   $$\Delta T = \max(0, \text{round}_1(T_{\text{calibrated}} - T_{\text{cold}}))$$
   *If physical cold-face sensor is absent, cold face defaults to $T_{\text{amb, cal}} + 1.2^\circ\text{C}$.*
5. **Battery Terminal Voltage:**
   $$V_{\text{batt}} = \text{round}_2(V_{\text{raw}} \cdot m_{\text{batt\_v}})$$
6. **LiFePO4 State of Charge (SoC %):**
   $$\text{SoC} = \text{clamp}\left(0, 100, \text{round}_0\left(\frac{V_{\text{batt}} - V_{\min}}{V_{\max} - V_{\min}} \cdot 100\right)\right)$$
   *Default thresholds: $V_{\min} = 10.00\text{ V}$, $V_{\max} = 14.60\text{ V}$.*
7. **TEG Generation Current & Power:**
   $$I_{\text{teg}} = \max(0, \text{round}_2((I_{\text{raw}} - I_{\text{zero}}) \cdot m_{\text{teg\_i}}))$$
   $$P_{\text{teg}} = \text{round}_1(V_{\text{teg}} \cdot I_{\text{teg}})$$
8. **Electrical Load Power & Current Draw:**
   $$P_{\text{load}} = P_{\text{light}} + P_{\text{fan}} + P_{\text{servo}} + P_{\text{aux}}$$
   Where:
   - $P_{\text{light}} = 4.8\text{ W}$ (Guarded Tier 1 emergency lighting, always energized).
   - $P_{\text{fan}} = 12.0\text{ W}$ (Tier 2 cooling radiator fans, sheddable).
   - $P_{\text{servo}} = 7.8\text{ W}$ (Tier 2 fuel feed servo during active pulse, sheddable).
   - $P_{\text{aux}} = 5.0\text{ W}$ (Tier 2 5V USB charging ports, sheddable).
   $$I_{\text{load}} = \begin{cases} \text{round}_2(P_{\text{load}} / V_{\text{batt}}) & \text{if } V_{\text{batt}} > 0 \\ 0 & \text{otherwise} \end{cases}$$
   $$I_{\text{net}} = \text{round}_2(I_{\text{teg}} - I_{\text{load}})$$
9. **Cumulative Energy Integration (Watt-Hours):**
   $$E_{\text{generated}} = \sum_{k=1}^{N} \left(P_{\text{teg}, k} \cdot \frac{\Delta t_k}{3600}\right)$$

### 4.2 Simulation Engine Physical Algorithms
Located in `src/services/simulationEngine.ts` (lines 186 to 273):

1. **Combustion Thermal Approach Equation:**
   $$T_{\text{stove}}(t + \Delta t) = T_{\text{stove}}(t) + \left(T_{\text{target}} - T_{\text{stove}}(t)\right) \cdot (0.05 \cdot \Delta t) + \text{jitter}$$
   Where $\text{jitter} = (\text{rand}() - 0.48) \cdot 0.6$, clamped to $[20.0^\circ\text{C}, 320.0^\circ\text{C}]$.
2. **Heatsink Cold Face Thermal Coupling:**
   $$T_{\text{cold}} = \text{round}_1\left(T_{\text{amb}} + \min\left(18, (T_{\text{stove}} - T_{\text{amb}}) \cdot 0.08\right)\right)$$
3. **Seebeck Voltage Generation Model:**
   $$\text{If } \Delta T > 40.0^\circ\text{C}:$$
   $$V_{\text{teg, raw}} = \min(14.8\text{ V}, (\Delta T - 40.0) \cdot 0.075)$$
   $$I_{\text{teg, raw}} = \min(1.80\text{ A}, (\Delta T - 40.0) \cdot 0.009)$$
   *Below $\Delta T = 40.0^\circ\text{C}$, generation is 0.0V and 0.0A.*
4. **LiFePO4 Coulomb Counting Integration:**
   $$P_{\text{net}} = P_{\text{teg}} - P_{\text{load}}$$
   $$\Delta \text{Ah} = \frac{P_{\text{net}}}{V_{\text{nom}}} \cdot \frac{\Delta t}{3600}$$
   $$\text{Charge}_{\text{Ah}}(t + \Delta t) = \text{clamp}\left(0, 50.0\text{ Ah}, \text{Charge}_{\text{Ah}}(t) + \Delta \text{Ah}\right)$$

---

## Section 5: Fault Tolerance, Error Handling and Limitations

### 5.1 Fault Detection and Boundary Clamping
To prevent application crashes and corrupted SVG graphs:
- **NaN Sanitation:** All numerical inputs are validated with `Number.isFinite()`. If `NaN` is detected, safe fallback defaults are substituted.
- **Thermocouple Open-Circuit Detection:** Type-K thermocouple amplifiers (MAX6675/MAX31855) return high values or `NaN` when disconnected. If $T_{\text{stove}} > 350.0^\circ\text{C}$ or $T_{\text{stove}} < 0.0^\circ\text{C}$, the bridge flags `sensorFault = true`, clamps temperature to safety limits, and warns the operator.
- **Battery Deep-Discharge Lockout:** If battery SoC drops $\le 15\%$ (`batteryCutoffPct`), `auxLockout` is set to `true`. Auxiliary relays (`fans`, `aux`) are forcibly cleared, and manual operator overrides are locked out until charging restores SoC above 15%.

### 5.2 Browser Sandbox Restrictions
- **User-Gesture Requirement:** Web Serial (`navigator.serial.requestPort()`) and Web Bluetooth (`navigator.bluetooth.requestDevice()`) can only be invoked in response to a direct user gesture (such as clicking the Connect button). They cannot be triggered automatically on page load.
- **Platform Incompatibilities:** Apple iOS Safari does not support Web Serial or Web Bluetooth APIs. Operators using iOS devices must connect via the Wi-Fi WebSocket bridge (`ws://192.168.4.1/ws`).

### 5.3 Limitations and Unverified Firmware Assumptions
- **Firmware Implementation:** Embedded C++ source code is outside this repository. Client code assumes standard 115,200 baud serial output and Nordic UART BLE service UUIDs.
- **No Cloud Backend:** The system operates completely client-side in the browser. No cloud databases or multi-tenant backends exist; all historical records reside in browser memory and local storage.

---

## Section 6: Evidence Register

Every architectural claim, interface property, and mathematical equation in this specification is mapped to exact file paths and source lines in the table below:

| ID | Repository-Relative Path | Symbol / Function / Interface | Approximate Lines | Claim Supported & Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **EV-001** | `package.json` | `dependencies`, `devDependencies` | Lines 12-27 | Vite 8, React 19, TypeScript 5.7, Tailwind CSS v4 stack verified. |
| **EV-002** | `index.html` | `<link rel="manifest">`, `<meta>` | Lines 8-28 | PWA meta tags, theme color `#09090b`, standalone mode verified. |
| **EV-003** | `public/manifest.json` | Web App Manifest | Lines 1-39 | Standalone PWA, portrait-primary orientation, icons verified. |
| **EV-004** | `public/sw.js` | Service Worker Implementation | Lines 1-68 | Cache-first offline asset strategy (`padayon-pwa-v2.2`) verified. |
| **EV-005** | `src/main.tsx` | Service Worker Registration | Lines 7-18 | Automatic registration of `/sw.js` on window load verified. |
| **EV-006** | `src/types/telemetry.ts` | `TelemetryData` interface | Lines 19-117 | Complete 41-field telemetry schema contract verified. |
| **EV-007** | `src/types/telemetry.ts` | `CalibrationConfig` interface | Lines 119-141 | Calibration coefficients, thresholds, and timestamp verified. |
| **EV-008** | `src/types/telemetry.ts` | `HardwareState` interface | Lines 143-159 | Connection status, transport types, packet counters verified. |
| **EV-009** | `src/types/telemetry.ts` | `LoadChannel` interface | Lines 11-17 | 4-channel load controller schema contract verified. |
| **EV-010** | `src/types/telemetry.ts` | `SystemLogEntry` interface | Lines 189-198 | System log schema, severity levels, PHT timestamp verified. |
| **EV-011** | `src/services/hardwareBridge.ts`| `NORDIC_UART_SERVICE` UUIDs | Lines 34-38 | Nordic BLE UART Service, RX, and TX UUIDs verified. |
| **EV-012** | `src/services/hardwareBridge.ts`| `connectSerial()` | Lines 151-189 | Web Serial API integration and baud rate setting verified. |
| **EV-013** | `src/services/hardwareBridge.ts`| `startSerialReadLoop()` | Lines 191-229 | TextDecoderStream, line splitting on `\n`, packet recording verified. |
| **EV-014** | `src/services/hardwareBridge.ts`| `connectBluetooth()` | Lines 256-349 | Web Bluetooth API, device filtering, GATT connection verified. |
| **EV-015** | `src/services/hardwareBridge.ts`| `connectWebSocket()` | Lines 374-518 | WebSocket frame reassembly, backoff auto-reconnect verified. |
| **EV-016** | `src/services/hardwareBridge.ts`| `parseIncomingPayload()` | Lines 560-733 | JSON & CSV telemetry parsing, boundary clamping, NaN handling. |
| **EV-017** | `src/services/hardwareBridge.ts`| `sendCommand()` | Lines 738-771 | Multi-transport downlink command packet dispatch verified. |
| **EV-018** | `src/services/hardwareBridge.ts`| `sendRelayCommand()` | Lines 773-776 | Actuator relay command formatting `{"cmd": "RELAY"}` verified. |
| **EV-019** | `src/services/hardwareBridge.ts`| `sendPulseFeedCommand()` | Lines 778-781 | Fuel hopper servo pulse command `{"cmd": "FEED_SERVO"}` verified. |
| **EV-020** | `src/services/hardwareBridge.ts`| `sendCalibrationCommand()` | Lines 783-786 | Calibration command formatting `{"cmd": "CALIB"}` verified. |
| **EV-021** | `src/services/simulationEngine.ts`| `INITIAL_SIM_STATE` | Lines 29-49 | Physics baseline constants (185°C stove, 42.5Ah batt) verified. |
| **EV-022** | `src/services/simulationEngine.ts`| `tickPhysics()` | Lines 186-273 | Thermal approach, Seebeck generation, Coulomb counting verified. |
| **EV-023** | `src/services/simulationEngine.ts`| `toggleRelay()` | Lines 123-137 | Low battery lockout interlock for auxiliary relays verified. |
| **EV-024** | `src/services/calibrationStorage.ts`| `DEFAULT_CALIBRATION` | Lines 5-26 | Default parameters (LiFePO4 10V-14.6V, 15% cutoff) verified. |
| **EV-025** | `src/services/calibrationStorage.ts`| `applyCalibration()` | Lines 95-294 | Full sensor calibration transformation math verified. |
| **EV-026** | `src/services/calibrationStorage.ts`| `generateCppCalibrationHeader()`| Lines 299-325 | C++ header generator for ESP32 firmware verified. |
| **EV-027** | `src/services/telemetryHistory.ts`| `TelemetryHistoryManager` | Lines 13-118 | 60-point UI window and 36,000-point full log buffer verified. |
| **EV-028** | `src/services/telemetryHistory.ts`| `exportCsv()` | Lines 146-208 | 15-column Chapter 4 research CSV export verified. |
| **EV-029** | `src/services/systemLogService.ts`| `formatLogTimestamp()` | Lines 8-21 | Strict `YYYY-MM-DD HH:mm` Asia/Manila (PHT) formatting verified. |
| **EV-030** | `src/services/systemLogService.ts`| `SystemLogManager` | Lines 71-160 | 50-entry capped event buffer with listener subscription verified. |
| **EV-031** | `src/App.tsx` | State Orchestration Hooks | Lines 32-253 | Root coordination of bridge, sim engine, history, and logs verified. |
| **EV-032** | `src/App.tsx` | Threshold Safety Observers | Lines 380-450 | Edge-triggered alert logging and automated load shedding verified. |
| **EV-033** | `src/components/OverviewTab.tsx` | Two-Tier Load Controls | Lines 210-270 | Guarded Tier 1 critical light and shed Tier 2 fans verified. |
| **EV-034** | `src/components/SensorsTab.tsx` | 4-Channel Load Controller | Lines 210-270 | Channel breakdown (LED, Fans, Servo, USB) verified. |
| **EV-035** | `src/components/CalibrationStudio.tsx`| 2-Point Bench Helpers | Lines 66-90 | Ice bath (0°C) and boiling water (100°C) calibration math verified. |
| **EV-036** | `src/components/ServiceLogsTab.tsx` | Component Deprecation Notice | Lines 1-20 | Confirmed deprecated stub kept for backward compatibility. |
