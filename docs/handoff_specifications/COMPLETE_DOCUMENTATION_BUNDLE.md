# Complete Documentation Bundle: Padayon Power Monitor PWA
**Smart Biomass-Powered Thermoelectric Energy System (B-TEG Core)**  
**Field Research Node #01:** Upper Wawa Dam, Rodriguez, Rizal  
**Document Revision:** 2.1 (October 2026)  
**Compilation Scope:** Consolidated Master Document containing Operator Manual, Systems Engineering Architecture, Communication Protocols, Mathematical Models, Evidence Register, and Codex Diagram Preparation Blueprints.

---

# Table of Contents
1. [PART I: Operator Manual & Field Guide](#part-i-operator-manual--field-guide)
   - 1.1 System Introduction & Safety Precautions
   - 1.2 System Requirements & Browser Compatibility
   - 1.3 Connection Guide (USB Serial, Bluetooth BLE, Wi-Fi, Simulation)
   - 1.4 Operator Monitoring Procedures (Overview & Sensors)
   - 1.5 Sensor Calibration Procedures & Bench Workflows
   - 1.6 Service, Maintenance & Diagnostic Logging
   - 1.7 Field Troubleshooting Guide
   - 1.8 Technical Glossary
2. [PART II: Systems Engineering & Architectural Specification](#part-ii-systems-engineering--architectural-specification)
   - 2.1 System Boundary Definition & Data Flow
   - 2.2 Component Hierarchy & Unidirectional Reactive Flow
   - 2.3 Data Models, TypeScript Schemas & LocalStorage
   - 2.4 Hardware Protocols, Framing & Transports
   - 2.5 Mathematical Models & Calibration Transfer Functions
   - 2.6 Fault Tolerance, Error Handling & Limitations
   - 2.7 Evidence Register (`EV-001` through `EV-036`)
3. [PART III: Codex Diagram Preparation Reference](#part-iii-codex-diagram-preparation-reference)
   - 3.1 Node Prefix & Identifier Standards
   - 3.2 Main Application Flowchart (`PWA-FC-001` to `PWA-FC-025`)
   - 3.3 Hardware Connection Flowchart (`HW-FC-001` to `HW-FC-025`)
   - 3.4 Sensor Calibration Flowchart (`CAL-FC-001` to `CAL-FC-021`)
   - 3.5 Hardware Connection State Machine (`HW-SM-001` to `HW-SM-007`)
   - 3.6 Data Flow Diagrams (Context, DFD Level 0, DFD Level 1)
   - 3.7 Traceability Cross-Reference Matrix

---

# PART I: Operator Manual & Field Guide

## 1. System Introduction and Safety Precautions
The Padayon Power Monitor is a Progressive Web App (PWA) engineered for real-time telemetry observation, sensor calibration, diagnostic logging, and load management of an off-grid biomass cookstove integrated with thermoelectric generator (TEG) modules and a 12V 50Ah Lithium Iron Phosphate (LiFePO4) battery bank.

### Operating Limits and Envelopes
- **Stove Hot Junction ($T_{\text{hot}}$):** Operational envelope 140.0°C to 220.0°C. Warning below 100.0°C (low flame). Emergency alarm above 230.0°C. Physical thermal fuse trips at 310.0°C.
- **Cold Junction Heatsink ($T_{\text{cold}}$):** Operational envelope 25.0°C to 45.0°C. Warning above 55.0°C. Stagnation trip above 70.0°C.
- **Temperature Gradient ($\Delta T$):** Optimal range 100.0°C to 180.0°C. Below 40.0°C, TEG generation ceases.
- **Carbon Monoxide (CO):** Safe below 50 PPM (Green). Warning from 50 to 100 PPM (Amber). Critical evacuation alarm above 100 PPM (Red).
- **Battery Storage (LiFePO4 12V 50Ah):** Nominal voltage 12.80V to 13.60V. Deep-discharge cutoff at 10.00V (0% SoC). Absorption maximum at 14.60V (100% SoC). Automated load shedding activates whenever SoC $\le 15\%$.

### Two-Tier Load Management Protocol
1. **Tier 1 (Guarded Critical Lighting):** Primary 12V LED campsite lighting is strictly guarded and non-sheddable. It remains energized as long as the DC Main Bus is closed, ensuring campsite safety during deep nighttime operations.
2. **Tier 2 (Sheddable Auxiliary Loads):** Secondary auxiliary circuits (cooling radiator fans, fuel feed servo, and 5V USB charging ports) are automatically locked out whenever the battery SoC falls to 15% or below. Operators cannot manually override auxiliary activation while the battery remains in deep-discharge lockout.

---

## 2. System Requirements and Browser Compatibility
- **Chromium Requirement:** Web Serial (`navigator.serial`) and Web Bluetooth (`navigator.bluetooth`) APIs require Google Chrome (v89+), Microsoft Edge (v89+), or Opera (v75+).
- **iOS / Safari Compatibility:** Apple iOS Safari does not support Web Serial or Web Bluetooth. Operators using iPhone or iPad devices connect via the local ESP32 Wi-Fi SoftAP WebSocket (`ws://192.168.4.1/ws`).
- **PWA Offline Operation:** Equipped with a service worker (`/sw.js`) and manifest (`/manifest.json`). Clicking **INSTALL BIOMASS PWA** creates a standalone application on the home screen that runs completely offline in remote field areas.

---

## 3. Connection Guide

### 3.1 Wired USB Serial (Web Serial)
1. Connect ESP32 via USB Type-C cable.
2. Click the connection pill in the header to open the **ESP32 Connection Hub**.
3. Select the **Wired USB** tab and choose **115200** baud.
4. Click **Connect USB Serial** and select the ESP32 COM port in the browser prompt.
5. Green toast confirms: `Confirmed: ESP32 connected via USB Serial!`.

### 3.2 Wireless Bluetooth (Web Bluetooth BLE)
1. Power on the ESP32 (advertises Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`).
2. In the Connection Hub, select the **Bluetooth BLE** tab.
3. Click **Scan & Connect BLE**, select the matching node (e.g., `B-TEG-NODE-01`), and click **Pair**.
4. Telemetry notifications stream automatically via characteristic TX (`6e400003-...`).

### 3.3 Wi-Fi WebSocket Link
1. Connect operator device to Wi-Fi SSID `Padayon_BTEG_AP` (Password: `padayon2026`).
2. In the Connection Hub, select **Wi-Fi** and confirm URL `ws://192.168.4.1/ws`.
3. Click **Connect Wi-Fi Link**. Built-in exponential backoff handles reconnection automatically.

### 3.4 Internal Physics Simulation Mode
If no hardware is connected, the internal 1 Hz simulation engine automatically runs, modeling combustion thermodynamics, Seebeck voltage curves, and battery charging dynamics.

---

## 4. Operator Monitoring Procedures

### Overview Tab Viewport
- **System Status Banner:** Displays `SYSTEM GOOD: RUNNING` (Green), `SYSTEM DEFICIT: LOW FLAME` (Amber), `SYSTEM ALERT: CORE OVERHEAT` (Red), or `SYSTEM ALERT: LOW BATTERY CUTOFF` (Red).
- **DC Main Power Switch:** Master toggle for the DC electrical bus.
- **Two-Tier Load Breakdown:** Shows Guarded Tier 1 LED light status and Sheddable Tier 2 cooling fan switch.
- **Run Hours Card:** Displays cumulative running hours (1,248 hrs) and inspection progress toward 2,000-hour overhaul.
- **2x2 Telemetry Grid:** Real-time gauges for Battery SoC % & Voltage, TEG Generation Watts, Heat Differential ($\Delta T$ °C), and Cold Sink Temperature (°C).
- **Environment & Site Safety:** MQ-7 Carbon Monoxide concentration (PPM) and DHT22 dry-bulb temperature / relative humidity.
- **Fuel Hopper Servo Control:** Cycle counter and momentary **PULSE FEED** actuation button (`{"cmd": "FEED_SERVO"}`).

### Sensors Tab Viewport
- **Battery Voltage Gauge:** High-precision digital terminal voltage.
- **Power Trend Chart:** 5-minute rolling SVG trend curve scaling 0 to 40 Watts.
- **Load vs TEG Generation Tiles:** Direct comparison of load demand vs harvest.
- **4-Channel Load Controller Breakdown:**
  - Channel 1: 12V LED Critical Light (Non-sheddable, ~400 mA)
  - Channel 2: Cold-Side Water Fan (Sheddable, ~1000 mA)
  - Channel 3: Hopper Fuel Feed Servo (Sheddable, ~650 mA during pulse)
  - Channel 4: 5V USB Charging Ports (Sheddable, ~415 mA)

---

## 5. Sensor Calibration Procedures (Service -> Open Studio)
The **Calibration Studio** allows bench and field adjustment of analog sensor parameters:
1. **Stove Thermocouple (MAX31855 / MAX6675):**
   - **Ice Bath Calibration:** Submerge probe in distilled ice bath, click **Set 0.0°C Ice Bath** to calculate zero offset $b = 0.0 - T_{\text{raw}}$.
   - **Boiling Water Calibration:** Submerge probe in boiling water, click **Set 100.0°C Boiling** to calculate gain $m = 100.0 / (T_{\text{raw}} + b)$.
2. **Cold Sink / Ambient Sensor (DHT11 / DHT22):** Offset temperature and humidity against reference digital meters.
3. **Battery Voltage Divider:** Tune **Divider Gain** against digital multimeter (DMM) readings; verify $V_{\min} = 10.0\text{V}$, $V_{\max} = 14.6\text{V}$.
4. **Current Sensor (ACS712 / INA219):** Ensure zero current through shunt, click **Tare Current to Zero** (averages 10 samples to eliminate thermal zero-drift).
5. **2x2 Action Strip:**
   - **Save to Storage:** Writes coefficients to `localStorage` key `padayon_calibration_v3`.
   - **Send to ESP32:** Dispatches downlink JSON command `{"cmd": "CALIB", "config": {...}}` to MCU EEPROM/NVS.
   - **Export C++ Header:** Copies complete `PADAYON_CALIBRATION_H` to clipboard for firmware compilation.
   - **Reset Defaults:** Reverts all parameters to factory standards.

---

## 6. Service, Maintenance & Diagnostic Logging
- **Weekly Checklist:** Inspect and check off TEG heatsink cleanliness, battery terminal torque, cooling pipes, and load connections.
- **Service Milestones:** Last service at 1,200 hrs; next at 1,500 hrs; overhaul at 2,000 hrs.
- **Logs Tab:** Circular buffer of 50 diagnostic events timestamped strictly in Asia/Manila (PHT, UTC+8) with severity filters (`ALL`, `INFO`, `WARN`, `ERROR`).
- **Research CSV Export:** Click **EXPORT CSV** to download complete 15-column historical telemetry data matching thesis Chapter 4 requirements:
  `Timestamp, Run_ID, Feedstock, Hot_Side_C, Cold_Side_C, Delta_T_C, Ambient_C, TEG_Voltage_V, TEG_Current_mA, TEG_Power_W, Batt_Voltage_V, Batt_Current_mA, Load_Power_W, SoC_Pct, Aux_Load_State`.

---

# PART II: Systems Engineering & Architectural Specification

## 1. System Boundary and Data Flow Architecture

### Boundary Definitions
- **Inside Boundary:** React 19 PWA components, Web Serial / Bluetooth / WebSocket adapters in `hardwareBridge.ts`, internal `simulationEngine.ts`, `calibrationStorage.ts`, `telemetryHistory.ts`, `systemLogService.ts`, and Service Worker (`sw.js`).
- **Outside Boundary:** Physical ESP32 microcontroller, MAX31855 thermocouple interface, DHT22 sensor, MQ-7 gas sensor, INA219 current shunt, TEG semiconductor modules, biomass stove combustion chamber, and host operating system device drivers.

### Unidirectional Data Flow
```
[ Hardware Transport / Simulation Engine ]
                   |
                   v (raw measurements)
         [ applyCalibration() ]
                   |
                   v (TelemetryData)
             [ App.tsx ]
         /        |        \
        v         v         v
   [Overview]  [Sensors]  [Logs]
```

---

## 2. Telemetry Data Schemas & Local Persistence

### `TelemetryData` Interface (Key Properties)
- `stoveTemp`: Hot junction temperature (°C)
- `coldFaceTemp`: Cold junction heatsink temperature (°C)
- `deltaT`: Computed thermal gradient ($T_{\text{stove}} - T_{\text{cold}}$)
- `ambientTemp` & `humidity`: DHT22 dry-bulb temperature (°C) and relative humidity (%)
- `batteryVoltage` & `batteryPct`: LiFePO4 terminal voltage (V) and State of Charge (0-100%)
- `isPhysicalCurrent` & `batteryCurrentSigned`: INA219 shunt measurement flag and signed amperes
- `tegVoltage`, `tegCurrent`, `tegPower`: Generation metrics
- `loadPower`, `loadCurrent`, `netCurrent`: Consumption and net power balance
- `relays`: `{ dcBus, lights, fans, aux }`
- `criticalLoadActive`: Guarded boolean (always true)
- `auxLockout`: Safety lockout boolean (true if SoC $\le 15\%$)
- `feedstock`: `'wood_waste' | 'coconut_husk' | 'unassigned'`
- `runId` & `fuelMassKg`: Trial metadata for Chapter 4 research

### Storage Schema & Buffer Policies
- `padayon_calibration_v3` (`localStorage`): JSON serialization of `CalibrationConfig`.
- `padayon_theme` & `padayon_lang`: Client UI appearance and language preferences.
- `points: TelemetryPoint[]`: 60-point rolling FIFO buffer for reactive UI graphs.
- `fullLog: TelemetryData[]`: 36,000-point full log buffer (~10 hours continuous 1 Hz recording) for thesis research CSV export.
- `logs: SystemLogEntry[]`: 50-entry LIFO event buffer with PHT timestamps.

---

## 3. Hardware Protocol and Communication Contract

### Inbound Telemetry Payload (JSON Delimited by `\n`)
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
  "relays": { "dcBus": 1, "lights": 1, "fans": 1, "aux": 0 },
  "feedstock": "wood_waste",
  "runId": "RUN-01"
}
```

### Outbound Actuation Commands (JSON Delimited by `\n`)
- Relay Command: `{"cmd": "RELAY", "relay": "fans", "state": 1}`
- Servo Pulse Command: `{"cmd": "FEED_SERVO"}`
- Calibration Commit Command: `{"cmd": "CALIB", "config": {...}}`

### BLE Nordic UART UUIDs
- Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- RX Characteristic (Write): `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- TX Characteristic (Notify): `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

---

## 4. Mathematical Models & Calibration Logic

### Sensor Transfer Functions
1. Stove Temperature: $T_{\text{stove}} = (T_{\text{raw}} \cdot m_{\text{stove}}) + b_{\text{stove}}$
2. Ambient Temperature: $T_{\text{amb}} = T_{\text{raw}} + b_{\text{dht\_temp}}$
3. Relative Humidity: $\text{RH} = \text{clamp}(0, 100, \text{RH}_{\text{raw}} + b_{\text{dht\_hum}})$
4. Temperature Differential: $\Delta T = \max(0, T_{\text{stove}} - T_{\text{cold}})$
5. Battery Voltage: $V_{\text{batt}} = V_{\text{raw}} \cdot m_{\text{batt\_v}}$
6. LiFePO4 State of Charge: $\text{SoC} = \text{clamp}\left(0, 100, \frac{V_{\text{batt}} - 10.0}{14.6 - 10.0} \cdot 100\right)$
7. TEG Current: $I_{\text{teg}} = \max(0, (I_{\text{raw}} - I_{\text{zero}}) \cdot m_{\text{teg\_i}})$
8. TEG Generation Power: $P_{\text{teg}} = V_{\text{teg}} \cdot I_{\text{teg}}$
9. Load Power: $P_{\text{load}} = 4.8\text{W (lights)} + 12.0\text{W (fans)} + 7.8\text{W (servo)} + 5.0\text{W (aux)}$
10. Net Electrical Current: $I_{\text{net}} = I_{\text{teg}} - (P_{\text{load}} / V_{\text{batt}})$
11. Energy Harvest Integration: $E_{\text{Wh}} = \sum \left(P_{\text{teg}} \cdot \frac{\Delta t}{3600}\right)$

### Physical Simulation Algorithms
- Thermal combustion ramp-up: $T(t + \Delta t) = T(t) + (T_{\text{target}} - T(t)) \cdot (0.05 \cdot \Delta t) + \text{jitter}$
- Cold-face thermal coupling: $T_{\text{cold}} = T_{\text{amb}} + \min(18, (T_{\text{stove}} - T_{\text{amb}}) \cdot 0.08)$
- Seebeck voltage curve: $V_{\text{teg}} = \min(14.8, (\Delta T - 40) \cdot 0.075)$ for $\Delta T > 40^\circ\text{C}$
- Coulomb counting: $\Delta \text{Ah} = (P_{\text{net}} / V_{\text{nom}}) \cdot (\Delta t / 3600)$

---

## 5. Evidence Register

| Evidence ID | File Path | Symbols / Interfaces | Line Range | Supporting Architectural Claim |
| :--- | :--- | :--- | :--- | :--- |
| **EV-001** | `package.json` | `dependencies` | Lines 12-27 | Vite 8, React 19, TypeScript 5.7, Tailwind CSS v4 stack verified. |
| **EV-002** | `index.html` | `<meta>`, `<link>` | Lines 8-28 | PWA meta tags, theme color `#09090b`, standalone mode verified. |
| **EV-003** | `public/manifest.json` | Web App Manifest | Lines 1-39 | Standalone PWA, portrait-primary orientation, icons verified. |
| **EV-004** | `public/sw.js` | Service Worker | Lines 1-68 | Cache-first offline asset strategy (`padayon-pwa-v2.2`) verified. |
| **EV-005** | `src/main.tsx` | Service Worker Register | Lines 7-18 | Automatic registration of `/sw.js` on window load verified. |
| **EV-006** | `src/types/telemetry.ts` | `TelemetryData` | Lines 19-117 | Complete 41-field telemetry schema contract verified. |
| **EV-007** | `src/types/telemetry.ts` | `CalibrationConfig` | Lines 119-141 | Calibration coefficients, thresholds, and timestamp verified. |
| **EV-008** | `src/types/telemetry.ts` | `HardwareState` | Lines 143-159 | Connection status, transport types, packet counters verified. |
| **EV-009** | `src/types/telemetry.ts` | `LoadChannel` | Lines 11-17 | 4-channel load controller schema contract verified. |
| **EV-010** | `src/types/telemetry.ts` | `SystemLogEntry` | Lines 189-198 | System log schema, severity levels, PHT timestamp verified. |
| **EV-011** | `src/services/hardwareBridge.ts` | `NORDIC_UART_SERVICE` | Lines 34-38 | Nordic BLE UART Service, RX, and TX UUIDs verified. |
| **EV-012** | `src/services/hardwareBridge.ts` | `connectSerial()` | Lines 151-189 | Web Serial API integration and baud rate setting verified. |
| **EV-013** | `src/services/hardwareBridge.ts` | `startSerialReadLoop()` | Lines 191-229 | TextDecoderStream, line splitting on `\n`, packet recording verified. |
| **EV-014** | `src/services/hardwareBridge.ts` | `connectBluetooth()` | Lines 256-349 | Web Bluetooth API, device filtering, GATT connection verified. |
| **EV-015** | `src/services/hardwareBridge.ts` | `connectWebSocket()` | Lines 374-518 | WebSocket frame reassembly, backoff auto-reconnect verified. |
| **EV-016** | `src/services/hardwareBridge.ts` | `parseIncomingPayload()` | Lines 560-733 | JSON & CSV telemetry parsing, boundary clamping, NaN handling. |
| **EV-017** | `src/services/hardwareBridge.ts` | `sendCommand()` | Lines 738-771 | Multi-transport downlink command packet dispatch verified. |
| **EV-018** | `src/services/hardwareBridge.ts` | `sendRelayCommand()` | Lines 773-776 | Actuator relay command formatting `{"cmd": "RELAY"}` verified. |
| **EV-019** | `src/services/hardwareBridge.ts` | `sendPulseFeedCommand()` | Lines 778-781 | Fuel hopper servo pulse command `{"cmd": "FEED_SERVO"}` verified. |
| **EV-020** | `src/services/hardwareBridge.ts` | `sendCalibrationCommand()`| Lines 783-786 | Calibration command formatting `{"cmd": "CALIB"}` verified. |
| **EV-021** | `src/services/simulationEngine.ts` | `INITIAL_SIM_STATE` | Lines 29-49 | Physics baseline constants (185°C stove, 42.5Ah batt) verified. |
| **EV-022** | `src/services/simulationEngine.ts` | `tickPhysics()` | Lines 186-273 | Thermal approach, Seebeck generation, Coulomb counting verified. |
| **EV-023** | `src/services/simulationEngine.ts` | `toggleRelay()` | Lines 123-137 | Low battery lockout interlock for auxiliary relays verified. |
| **EV-024** | `src/services/calibrationStorage.ts`| `DEFAULT_CALIBRATION` | Lines 5-26 | Default parameters (LiFePO4 10V-14.6V, 15% cutoff) verified. |
| **EV-025** | `src/services/calibrationStorage.ts`| `applyCalibration()` | Lines 95-294 | Full sensor calibration transformation math verified. |
| **EV-026** | `src/services/calibrationStorage.ts`| `generateCppCalibrationHeader()`| Lines 299-325| C++ header generator for ESP32 firmware verified. |
| **EV-027** | `src/services/telemetryHistory.ts` | `TelemetryHistoryManager`| Lines 13-118 | 60-point UI window and 36,000-point full log buffer verified. |
| **EV-028** | `src/services/telemetryHistory.ts` | `exportCsv()` | Lines 146-208 | 15-column Chapter 4 research CSV export verified. |
| **EV-029** | `src/services/systemLogService.ts` | `formatLogTimestamp()` | Lines 8-21 | Strict `YYYY-MM-DD HH:mm` Asia/Manila (PHT) formatting verified. |
| **EV-030** | `src/services/systemLogService.ts` | `SystemLogManager` | Lines 71-160 | 50-entry capped event buffer with listener subscription verified. |
| **EV-031** | `src/App.tsx` | State Orchestration | Lines 32-253 | Root coordination of bridge, sim engine, history, and logs verified. |
| **EV-032** | `src/App.tsx` | Threshold Observers | Lines 380-450 | Edge-triggered alert logging and automated load shedding verified. |
| **EV-033** | `src/components/OverviewTab.tsx` | Two-Tier Load Controls | Lines 210-270 | Guarded Tier 1 critical light and shed Tier 2 fans verified. |
| **EV-034** | `src/components/SensorsTab.tsx` | 4-Channel Load Controller | Lines 210-270 | Channel breakdown (LED, Fans, Servo, USB) verified. |
| **EV-035** | `src/components/CalibrationStudio.tsx`| 2-Point Bench Helpers | Lines 66-90 | Ice bath (0°C) and boiling water (100°C) calibration math verified. |
| **EV-036** | `src/components/ServiceLogsTab.tsx` | Deprecation Notice | Lines 1-20 | Confirmed deprecated stub kept for backward compatibility. |

---

# PART III: Codex Diagram Preparation Reference

## 1. Flowchart Identifiers & Blueprints

### Main Application Flowchart (`PWA-FC-001` to `PWA-FC-025`)
- `PWA-FC-001`: User opens application URL.
- `PWA-FC-002`: Service Worker precache check (`public/sw.js`).
- `PWA-FC-003`: Display mode inspection (`standalone` vs browser tab).
- `PWA-FC-004`: State hydration from `localStorage` (`padayon_theme`, `padayon_lang`).
- `PWA-FC-005`: Initialize `TelemetryHistoryManager` (60 UI / 36,000 full log).
- `PWA-FC-006`: Initialize `SystemLogManager` (50 capped events).
- `PWA-FC-007`: Load `CalibrationConfig` from `padayon_calibration_v3`.
- `PWA-FC-008`: Instantiate `HardwareBridge` and `SimulationEngine`.
- `PWA-FC-009`: Launch 1 Hz simulation tick loop.
- `PWA-FC-010`: Check if physical hardware is connected.
- `PWA-FC-011`: Ingest stream packet from `HardwareBridge`.
- `PWA-FC-012`: Ingest synthetic tick from `SimulationEngine`.
- `PWA-FC-013`: Execute `applyCalibration(raw, cal)` transformation.
- `PWA-FC-014`: Append point to history manager buffers.
- `PWA-FC-015`: Evaluate safety thresholds (overheat, low heat, low battery, CO).
- `PWA-FC-016`: Edge-triggered state transition detected?
- `PWA-FC-017`: Trigger visual alarm and append event log.
- `PWA-FC-018`: Is battery SoC $\le 15\%$ cutoff?
- `PWA-FC-019`: Bypass event logging.
- `PWA-FC-020`: Enforce automated secondary load shedding (`auxLockout = true`).
- `PWA-FC-021`: Maintain operator auxiliary switch selections.
- `PWA-FC-022`: Resolve active navigation tab (`overview`, `sensors`, `calibration`, `logs`).
- `PWA-FC-023`: Re-render UI viewports and redraw SVG trend curves.
- `PWA-FC-024`: Await next 1 Hz tick or user gesture.
- `PWA-FC-025`: Cycle back to ingestion (`PWA-FC-010`).

---

### Hardware Connection Flowchart (`HW-FC-001` to `HW-FC-025`)
- `HW-FC-001`: Operator clicks connection trigger in header.
- `HW-FC-002`: Render `ConnectionModal` dialog.
- `HW-FC-003`: Operator selects transport (`wired`, `bluetooth`, `wifi`).
- `HW-FC-004`: Select baud rate (115200 default).
- `HW-FC-005`: Check `navigator.bluetooth` support.
- `HW-FC-006`: Input WebSocket URL (`ws://192.168.4.1/ws`).
- `HW-FC-007`: Invoke `navigator.serial.requestPort()`.
- `HW-FC-008`: Invoke `navigator.bluetooth.requestDevice()`.
- `HW-FC-009`: Open WebSocket socket connection.
- `HW-FC-010`: User grants serial port access?
- `HW-FC-011`: User selects target BLE peripheral?
- `HW-FC-012`: WebSocket `onopen` event fired?
- `HW-FC-013`: User cancels serial prompt; abort to Standby.
- `HW-FC-014`: Open serial port stream reader via `TextDecoderStream`.
- `HW-FC-015`: User cancels BLE prompt; abort to Standby.
- `HW-FC-016`: Connect GATT server; subscribe to TX characteristic (`6e400003-...`).
- `HW-FC-017`: WebSocket error; launch exponential backoff auto-reconnect.
- `HW-FC-018`: Connection confirmed (`status = 'connected'`).
- `HW-FC-019`: Set error state and log failure reason.
- `HW-FC-020`: Accumulate incoming chunks into stream buffer.
- `HW-FC-021`: Split buffer across newline `\n` delimiter; preserve tail.
- `HW-FC-022`: Is string valid JSON or comma-separated CSV?
- `HW-FC-023`: Parse and sanitize numbers with `Number.isFinite()`, clamp boundaries.
- `HW-FC-024`: Discard corrupt bytes or append to raw terminal logs.
- `HW-FC-025`: Emit clean `rawHardwareData` to `onDataCallback`.

---

### Sensor Calibration Flowchart (`CAL-FC-001` to `CAL-FC-021`)
- `CAL-FC-001`: Operator expands Sensor Calibration Studio drawer.
- `CAL-FC-002`: Initialize form state with active configuration.
- `CAL-FC-003`: Display live raw vs calibrated values side-by-side.
- `CAL-FC-004`: Select calibration mode (Ice Bath, Boiling Water, Zero Tare, Sliders).
- `CAL-FC-005`: Submerge thermocouple probe in distilled ice bath (0.0°C).
- `CAL-FC-006`: Submerge thermocouple probe in boiling water (100.0°C).
- `CAL-FC-007`: Isolate electrical current load ($I = 0.00\text{ A}$).
- `CAL-FC-008`: Direct numeric or range slider adjustment.
- `CAL-FC-009`: Calculate offset: $b = 0.0 - T_{\text{raw}}$.
- `CAL-FC-010`: Calculate gain: $m = 100.0 / (T_{\text{raw}} + b)$.
- `CAL-FC-011`: Sample 10 consecutive ADC samples and compute average zero-drift.
- `CAL-FC-012`: Update form state and display preview.
- `CAL-FC-013`: Select action button in 2x2 grid.
- `CAL-FC-014`: Action: Save to Storage.
- `CAL-FC-015`: Action: Send to ESP32.
- `CAL-FC-016`: Action: Export C++ Header.
- `CAL-FC-017`: Action: Reset Defaults.
- `CAL-FC-018`: Write serialized JSON to `padayon_calibration_v3`.
- `CAL-FC-019`: Transmit downlink packet `{"cmd": "CALIB", "config": {...}}`.
- `CAL-FC-020`: Copy `PADAYON_CALIBRATION_H` to clipboard.
- `CAL-FC-021`: Display confirmation banner and update active telemetry pipeline.

---

## 2. Hardware Connection State Machine (`HW-SM-001` to `HW-SM-007`)
- **`HW-SM-001` (STANDBY_MODE):** Hardware idle; telemetry fed by `SimulationEngine`.
- **`HW-SM-002` (PROMPTING_USER):** Browser device picker open awaiting user selection.
- **`HW-SM-003` (CONFIGURING_PORT):** Handshaking baud rate, opening GATT, or upgrading WebSocket.
- **`HW-SM-004` (STREAMING_LIVE):** Active streaming at 1 Hz to 10 Hz; reader loop running.
- **`HW-SM-005` (FRAME_ERROR_DRAIN):** Malformed byte recovery; drains buffer to next `\n`.
- **`HW-SM-006` (STALL_TIMEOUT):** No packets received for > 3.0 seconds.
- **`HW-SM-007` (RECONNECTING_BACKOFF):** Exponential backoff auto-reconnect ($1.5\text{s} \times 1.5^{(\text{attempt}-1)}$, max 15s, 8 retries).

---

## 3. Data Flow Diagrams (DFD)

### Context Diagram (Level 0 Boundary)
- **External Entities:**
  - `PWA-E-001`: Human Operator (user gestures, visual monitoring).
  - `PWA-E-002`: Physical ESP32 Microcontroller & Biomass TEG Hardware.
  - `PWA-E-003`: Browser LocalStorage (`padayon_calibration_v3`).
- **Data Flows:**
  - `PWA-F-001`: Operator Actuation & Calibration Commands.
  - `PWA-F-002`: Raw Microcontroller Stream Buffer.
  - `PWA-F-003`: Visual Alarms & Threshold Notifications.
  - `PWA-F-004`: Real-Time Dashboard Viewports & SVG Sparklines.
  - `PWA-F-005`: Outbound Downlink Command Strings (`RELAY`, `FEED`, `CALIB`).
  - `PWA-F-006`: Committed Calibration Parameters.

### DFD Level 0 Subsystems
- **Process 1.0:** Hardware Stream Ingestion & Packet Parsing (`hardwareBridge.ts`)
- **Process 2.0:** Telemetry Normalization & Calibration Transformation (`calibrationStorage.ts`)
- **Process 3.0:** Real-Time State Management & UI Rendering (`src/App.tsx` & Viewports)
- **Process 4.0:** Diagnostic Logging & Historical Research Archival (`systemLogService.ts` & `telemetryHistory.ts`)
- **Data Stores:**
  - `PWA-D-001`: 60-Point In-Memory Rolling Buffer
  - `PWA-D-002`: 36,000-Point Full Thesis Research Buffer
  - `PWA-D-003`: Browser LocalStorage (`padayon_calibration_v3`)
  - `PWA-D-004`: 50-Entry Diagnostic Event Buffer

### DFD Level 1 (Decomposition of Process 2.0 - Sensor Calibration)
- **Subprocess 2.1:** Raw Sensor Ingest & Range Clamping (NaN sanitation, boundary checks).
- **Subprocess 2.2:** Retrieve Active Calibration Coefficients from `PWA-D-003`.
- **Subprocess 2.3:** Execute Transfer Functions & Derived Metrics ($T_{\text{stove}}$, $\Delta T$, SoC, $P_{\text{teg}}$, $P_{\text{load}}$, $I_{\text{net}}$).
- **Subprocess 2.4:** Subsystem Composition & 4-Channel Load Controller Breakdown.

---

## 4. Traceability Cross-Reference Matrix

| Feature / Subsystem | Source File | Flowchart Nodes | State Machine Nodes | Data Store IDs | DFD Process ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PWA App Shell & SW** | `src/main.tsx`, `public/sw.js` | `PWA-FC-001..003` | N/A | `PWA-D-008` | `3.0` |
| **State Orchestrator** | `src/App.tsx` | `PWA-FC-004..010` | `HW-SM-001..007` | `PWA-D-003..007` | `3.0` |
| **USB Serial Transport** | `src/services/hardwareBridge.ts` | `HW-FC-004..014` | `HW-SM-001..004` | `PWA-D-005` | `1.0` |
| **Bluetooth BLE UART** | `src/services/hardwareBridge.ts` | `HW-FC-005..016` | `HW-SM-001..004` | `PWA-D-005` | `1.0` |
| **Wi-Fi WebSocket** | `src/services/hardwareBridge.ts` | `HW-FC-006..018` | `HW-SM-003, 007` | `PWA-D-005` | `1.0` |
| **Simulation Engine** | `src/services/simulationEngine.ts` | `PWA-FC-009, 012` | `HW-SM-001` | `PWA-D-005` | `1.0` |
| **Calibration Engine** | `src/services/calibrationStorage.ts`| `CAL-FC-001..021` | N/A | `PWA-D-003` | `2.0 (2.1-2.4)`|
| **Two-Tier Load Shed** | `src/components/OverviewTab.tsx` | `PWA-FC-018..020` | N/A | `PWA-D-005` | `3.0, 4.0` |
| **Fuel Hopper Servo** | `src/components/OverviewTab.tsx` | `PWA-FC-024` | `HW-SM-004` | `PWA-D-005` | `3.0, 4.0` |
| **5M Power Trend Chart**| `src/components/SensorsTab.tsx` | `PWA-FC-014, 023` | N/A | `PWA-D-001` | `3.0` |
| **4-Channel Controller**| `src/components/SensorsTab.tsx` | `PWA-FC-013, 023` | N/A | `PWA-D-005` | `2.4, 3.0` |
| **Bench Calibration** | `src/components/CalibrationStudio.tsx`| `CAL-FC-002..012`| N/A | `PWA-D-003` | `2.0` |
| **Event Diagnostic Logs**| `src/components/LogsTab.tsx` | `PWA-FC-016..017` | N/A | `PWA-D-004` | `4.0` |
| **Thesis CSV Exporter** | `src/services/telemetryHistory.ts` | `PWA-FC-014` | N/A | `PWA-D-002` | `4.0` |
| **Connection Modal** | `src/components/ConnectionModal.tsx` | `HW-FC-001..003` | `HW-SM-001..007` | `PWA-D-005` | `1.0` |
| **Header Clock & Lang**| `src/components/Header.tsx` | `PWA-FC-004, 023` | N/A | `PWA-D-006, 007` | `3.0` |
| **Bottom Navigation** | `src/components/BottomNav.tsx` | `PWA-FC-022` | N/A | `PWA-D-005` | `3.0` |
