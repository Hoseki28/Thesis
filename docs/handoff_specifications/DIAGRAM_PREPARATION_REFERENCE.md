# Codex Diagram Preparation Reference Manual
**Padayon Power Monitor: Smart Biomass-Powered Thermoelectric Energy System**  
**Document Purpose:** Exact Textual Node, Transition, Schema, and DFD Specifications for Codex Visual Diagram Rendering  
**Document Revision:** 2.1 (October 2026)  
**Author:** Senior Systems Analyst, Embedded IoT Software Documentation Specialist & Systems Architect  

---

## 1. System Prefix and Identifier Standards

To ensure precise, unambiguous translation into graph modeling languages (Mermaid, PlantUML, Graphviz, or Draw.io), all diagram elements are assigned standardized, unique alphanumeric identifiers:

| Identifier Prefix | Diagram Domain | Description |
| :--- | :--- | :--- |
| **`PWA-FC-xxx`** | Flowchart | Main Progressive Web App Operational Workflow |
| **`HW-FC-xxx`** | Flowchart | Hardware Transport Connection & Handshake Flow |
| **`CAL-FC-xxx`** | Flowchart | Sensor Calibration & Offset Computation Flow |
| **`HW-SM-xxx`** | State Machine | Multi-Transport Hardware Lifecycle States |
| **`PWA-E-xxx`** | Data Flow Diagram | External Entities (Outside System Boundary) |
| **`PWA-P-xxx`** | Data Flow Diagram | Processes and Subprocesses (Transformation Steps) |
| **`PWA-D-xxx`** | Data Flow Diagram | Data Stores (In-Memory Buffers and Browser Storage) |
| **`PWA-F-xxx`** | Data Flow Diagram | Directed Data Flow Vectors across Boundaries |

---

## 2. Application Flowcharts (PWA-FC, HW-FC, CAL-FC)

### 2.1 Main Application Workflow Flowchart (`PWA-FC`)

```
[ PWA-FC-001: User Opens App ]
             |
             v
[ PWA-FC-002: Service Worker Precache Check (sw.js) ]
             |
             v
[ PWA-FC-003: Check Display Mode & Install State ]
             |
             v
[ PWA-FC-004: Hydrate LocalStorage (Theme & Lang) ]
             |
             v
[ PWA-FC-005: Initialize TelemetryHistoryManager (60/36k) ]
             |
             v
[ PWA-FC-006: Initialize SystemLogManager (50-Cap) ]
             |
             v
[ PWA-FC-007: Load CalibrationConfig from padayon_calibration_v3 ]
             |
             v
[ PWA-FC-008: Instantiate HardwareBridge & SimulationEngine ]
             |
             v
[ PWA-FC-009: Start 1 Hz Physics Simulation Tick Loop ]
             |
             v
[ PWA-FC-010: Is Physical Hardware Connected? ]
            / \
     Yes   /   \  No
          /     \
         v       v
[ PWA-FC-011:   [ PWA-FC-012:
  Ingest Stream   Ingest 1 Hz Sim
  from Bridge ]   Physics Tick ]
         \       /
          \     /
           v   v
[ PWA-FC-013: Execute applyCalibration() Transformation ]
             |
             v
[ PWA-FC-014: Append Point to TelemetryHistoryManager ]
             |
             v
[ PWA-FC-015: Evaluate Safety Thresholds (Stove, Batt, CO) ]
             |
             v
[ PWA-FC-016: State Transition Breach Detected? ]
            / \
     Yes   /   \  No
          /     \
         v       v
[ PWA-FC-017:   [ PWA-FC-019:
  Trigger Alert   Bypass Event
  & Dispatch Log] Dispatch ]
         \       /
          \     /
           v   v
[ PWA-FC-018: Is Battery SoC <= 15% Cutoff? ]
            / \
     Yes   /   \  No
          /     \
         v       v
[ PWA-FC-020:   [ PWA-FC-021:
  Force Shed      Maintain Operator
  Tier 2 Aux ]    Aux Switch State ]
         \       /
          \     /
           v   v
[ PWA-FC-022: Resolve Active Navigation Tab (Overview/Sensors/Service/Logs) ]
             |
             v
[ PWA-FC-023: Re-render UI Viewports & SVG Sparklines ]
             |
             v
[ PWA-FC-024: Await Next 1 Hz Tick or User Actuator Interaction ]
             |
             v
[ PWA-FC-025: Loop Back to Ingestion (PWA-FC-010) ]
```

#### Node-by-Node Specification:
- **`PWA-FC-001`**: Start node. Operator navigates to application URL via browser.
- **`PWA-FC-002`**: Service Worker inspection. `public/sw.js` checks cache `padayon-pwa-v2.2`; serves precached static shell if offline.
- **`PWA-FC-003`**: Evaluation of `window.matchMedia('(display-mode: standalone)')` and `beforeinstallprompt` event hook.
- **`PWA-FC-004`**: State hydration. Reads `padayon_theme` and `padayon_lang` from `localStorage`.
- **`PWA-FC-005`**: Instantiates `TelemetryHistoryManager` with `maxPoints = 60` and `maxFullLog = 36000`.
- **`PWA-FC-006`**: Instantiates `SystemLogManager` with `MAX_SYSTEM_LOGS = 50`. Formats initial events in Asia/Manila (PHT).
- **`PWA-FC-007`**: Invokes `loadCalibration()`. Returns parsed `padayon_calibration_v3` or `DEFAULT_CALIBRATION`.
- **`PWA-FC-008`**: Instantiates `HardwareBridge` and `SimulationEngine` passing active calibration reference.
- **`PWA-FC-009`**: Launches 1-second interval timer `setInterval(..., 1000)` inside `SimulationEngine`.
- **`PWA-FC-010`**: Decision node. Checks `bridge.getState().status === 'connected'`.
- **`PWA-FC-011`**: Execution node. Ingests raw data packet parsed by `HardwareBridge`.
- **`PWA-FC-012`**: Execution node. Ingests synthetic physics telemetry generated by `SimulationEngine`.
- **`PWA-FC-013`**: Computation node. Invokes `applyCalibration(raw, cal)`, computing calibrated $T_{\text{stove}}$, $V_{\text{batt}}$, $\Delta T$, SoC, $P_{\text{teg}}$, and $P_{\text{load}}$.
- **`PWA-FC-014`**: Storage node. Invokes `historyManager.addPoint(calibrated)`, updating 60-point FIFO and 36k thesis buffer.
- **`PWA-FC-015`**: Assessment node. Evaluates `stoveTemp > stoveOverheatThreshold` (230°C), `stoveTemp < stoveLowHeatThreshold` (100°C), and `batteryPct <= batteryCutoffPct` (15%).
- **`PWA-FC-016`**: Decision node. Compares current alert flags against previous tick references (`prevOverheatRef`, `prevLowBattRef`).
- **`PWA-FC-017`**: Event generation node. Appends formatted `SystemLogEntry` to `systemLogManager`.
- **`PWA-FC-018`**: Safety interlock decision node. Checks if `batteryPct <= calibration.batteryCutoffPct`.
- **`PWA-FC-019`**: Pass-through node. No edge-triggered threshold transition detected.
- **`PWA-FC-020`**: Actuator protection node. Enforces `relays.fans = false`, `relays.aux = false`, and sets `auxLockout = true`. Dispatches hardware shed command if live.
- **`PWA-FC-021`**: Pass-through node. Auxiliary loads remain in operator-selected state.
- **`PWA-FC-022`**: Routing node. Directs state to active component tab (`OverviewTab`, `SensorsTab`, `ServiceTab`, or `LogsTab`).
- **`PWA-FC-023`**: Visual presentation node. DOM updates, SVG trend curves redraw, gauges update.
- **`PWA-FC-024`**: Idle wait state. Listens for user gestures (relay toggles, pulse feed button, tab navigation).
- **`PWA-FC-025`**: Cycle return loop back to `PWA-FC-010`.

---

### 2.2 Hardware Connection & Handshake Flowchart (`HW-FC`)

```
[ HW-FC-001: Operator Clicks Connect Button in Header ]
                         |
                         v
[ HW-FC-002: Render ConnectionModal Dialog ]
                         |
                         v
[ HW-FC-003: Operator Selects Transport Tab (Serial / BLE / Wi-Fi) ]
           /             |             \
          /              |              \
   Wired /           BLE |               \ Wi-Fi
        v                v                v
[ HW-FC-004:      [ HW-FC-005:      [ HW-FC-006:
  Select Baud       Check Web         Input WebSocket
  (e.g., 115200) ]  Bluetooth API ]   URL (ws://192...)]
        |                |                |
        v                v                v
[ HW-FC-007:      [ HW-FC-008:      [ HW-FC-009:
  Invoke Web        Request BLE       Open WebSocket
  Serial Prompt ]   Device Scan ]     Connection ]
        |                |                |
        v                v                v
[ HW-FC-010:      [ HW-FC-011:      [ HW-FC-012:
  User Grants       User Selects      Socket onopen
  Port Access? ]    Target Device? ]  Event Fired? ]
        |                |                |
   No / | \ Yes     No / | \ Yes     No / | \ Yes
     v  |  v          v  |  v          v  |  v
[HW-FC-013: [HW-FC-014: [HW-FC-015: [HW-FC-016: [HW-FC-017: [HW-FC-018:
 Abort Port   Open Serial  Abort BLE   Connect GATT   Start Re-    Set State
 Access]      Stream]      Pairing]    & Notify]      connect]     Connected]
        \       |         /      \        |          /             |
         \      |        /        \       |         /              |
          v     v       v          v      v        v               v
     [ HW-FC-019: Set Error ]    [ HW-FC-020: Accumulate Incoming Stream Buffer ]
                                          |
                                          v
                                 [ HW-FC-021: Split Stream on Newline \n Delimiter ]
                                          |
                                          v
                                 [ HW-FC-022: Is String Valid JSON or CSV? ]
                                        /   \
                                 Yes   /     \  No
                                      /       \
                                     v         v
                             [ HW-FC-023:   [ HW-FC-024:
                               Parse & Sanitize   Discard String /
                               Telemetry Data ]   Raw Text Log ]
                                     |
                                     v
                             [ HW-FC-025: Emit Parsed Telemetry to onDataCallback ]
```

#### Node-by-Node Specification:
- **`HW-FC-001`**: Operator triggers connection modal via header status pill.
- **`HW-FC-002`**: Modal opens with `isOpen = true` in `ConnectionModal.tsx`.
- **`HW-FC-003`**: Operator chooses between Wired USB (`wired`), Bluetooth (`bluetooth`), or Wi-Fi (`wifi`).
- **`HW-FC-004`**: Operator configures baud rate (default 115,200).
- **`HW-FC-005`**: Checks `navigator.bluetooth` compatibility.
- **`HW-FC-006`**: Sets WebSocket URL (`ws://192.168.4.1/ws`).
- **`HW-FC-007`**: Calls `navigator.serial.requestPort()` (requires user gesture).
- **`HW-FC-008`**: Calls `navigator.bluetooth.requestDevice({ filters: [...] })`.
- **`HW-FC-009`**: Instantiates `new WebSocket(url)`.
- **`HW-FC-010`**: Port selection prompt result.
- **`HW-FC-011`**: Bluetooth peripheral selection prompt result.
- **`HW-FC-012`**: WebSocket network connection result.
- **`HW-FC-013`**: Serial connection aborted; reverts state to Standby.
- **`HW-FC-014`**: Opens serial port: `await port.open({ baudRate })`.
- **`HW-FC-015`**: Bluetooth selection cancelled; reverts to Standby.
- **`HW-FC-016`**: Connects GATT server; subscribes to TX characteristic (`6e400003-...`).
- **`HW-FC-017`**: WebSocket failed; launches exponential backoff timer.
- **`HW-FC-018`**: Connection confirmed: `status = 'connected'`.
- **`HW-FC-019`**: Logs error and notifies state listeners.
- **`HW-FC-020`**: Appends chunk bytes to internal stream buffer.
- **`HW-FC-021`**: Splits accumulated buffer on `\n`; preserves tail.
- **`HW-FC-022`**: Checks if clean line starts with `{` or contains commas `,`.
- **`HW-FC-023`**: Sanitizes numbers with `Number.isFinite()`, clamps boundaries.
- **`HW-FC-024`**: Discards malformed bytes or appends to raw serial terminal logs.
- **`HW-FC-025`**: Dispatches structured raw telemetry to `App.tsx`.

---

### 2.3 Calibration & Offset Computation Flowchart (`CAL-FC`)

```
[ CAL-FC-001: Operator Navigates to Service Tab -> Open Studio ]
                             |
                             v
[ CAL-FC-002: Render CalibrationStudio Component with Form State ]
                             |
                             v
[ CAL-FC-003: Display Live Raw vs Calibrated Values ]
                             |
                             v
[ CAL-FC-004: Select Calibration Operation ]
         /             |             \                \
        /              |              \                \
 Ice   /       Boiling |          Zero \        Manual  \
 Bath /          Water |          Tare  \       Tuning   \
     v                 v                 v                v
[ CAL-FC-005:   [ CAL-FC-006:     [ CAL-FC-007:    [ CAL-FC-008:
  Submerge Probe  Submerge Probe    Isolate Current  Adjust Gain/
  in Ice Bath ]   in Boiling ]      Load (I = 0A) ]  Offset Sliders ]
     |                 |                 |                |
     v                 v                 v                v
[ CAL-FC-009:   [ CAL-FC-010:     [ CAL-FC-011:           |
  Compute b =     Compute m =       Sample 10 ADC         |
  0.0 - T_raw ]   100 / (T_raw+b)]  Readings & Avg]       |
     \                 |                 /                |
      \                |                /                 |
       v               v               v                  v
[ CAL-FC-012: Update Local Form State & Render Preview Notice ]
                             |
                             v
[ CAL-FC-013: Select Action Button from 2x2 Grid ]
         /             |             \                \
        /              |              \                \
 Save  /      Send to  |          Copy \         Reset  \
Storage/        ESP32  |        Header  \      Defaults  \
     v                 v                 v                v
[ CAL-FC-014:   [ CAL-FC-015:     [ CAL-FC-016:    [ CAL-FC-017:
  Commit JSON     Format Downlink   Generate C++     Restore Factory
  to Storage ]    Command CALIB ]   PADAYON_CALIB_H] DEFAULT_CALIB ]
     |                 |                 |                |
     v                 v                 v                v
[ CAL-FC-018:   [ CAL-FC-019:     [ CAL-FC-020:           |
  localStorage.   bridge.send-      Write Code to         |
  setItem() ]     Command() ]       Clipboard ]           |
     \                 |                 /                /
      \                |                /                /
       v               v               v                v
[ CAL-FC-021: Display Visual Confirmation Banner & Update Active Telemetry ]
```

#### Node-by-Node Specification:
- **`CAL-FC-001`**: Operator expands sensor calibration studio drawer.
- **`CAL-FC-002`**: Initializes form state: `form = { ...config }`.
- **`CAL-FC-003`**: Displays side-by-side comparison of raw ADC vs calibrated outputs.
- **`CAL-FC-004`**: Operator initiates a calibration sequence.
- **`CAL-FC-005`**: Ice bath reference preparation (0.0°C).
- **`CAL-FC-006`**: Boiling water reference preparation (100.0°C).
- **`CAL-FC-007`**: Electrical current isolation (zero load condition).
- **`CAL-FC-008`**: Direct numerical input or range slider adjustment.
- **`CAL-FC-009`**: Calculates zero-offset: $b_{\text{stove}} = 0.0 - T_{\text{raw}}$.
- **`CAL-FC-010`**: Calculates gain: $m_{\text{stove}} = 100.0 / (T_{\text{raw}} + b_{\text{stove}})$.
- **`CAL-FC-011`**: Averages 10 consecutive current samples to determine zero-drift.
- **`CAL-FC-012`**: Updates temporary form state with newly computed parameters.
- **`CAL-FC-013`**: Operator clicks an action button in the 2x2 action strip.
- **`CAL-FC-014`**: Selects Save to Storage.
- **`CAL-FC-015`**: Selects Send to ESP32.
- **`CAL-FC-016`**: Selects Export C++ Header.
- **`CAL-FC-017`**: Selects Reset Defaults.
- **`CAL-FC-018`**: Writes JSON string to `padayon_calibration_v3`.
- **`CAL-FC-019`**: Transmits `{"cmd": "CALIB", "config": {...}}` via hardware bridge.
- **`CAL-FC-020`**: Copies C++ header string to system clipboard via `navigator.clipboard`.
- **`CAL-FC-021`**: Displays green confirmation banner and rebinds active telemetry formulas.

---

## 3. Hardware State Machine (`HW-SM`)

### 3.1 State Definitions
The connection lifecycle in `src/services/hardwareBridge.ts` operates across seven finite states:

```
+-----------------------------------------------------------------------------------+
|                        HARDWARE CONNECTION STATE MACHINE                          |
|                                                                                   |
|                  +--------------------------------+                               |
|                  |     HW-SM-001: STANDBY_MODE    |<----------------+             |
|                  +--------------------------------+                 |             |
|                       |                      ^                      |             |
|        Operator Click |                      | User Cancel / Error  |             |
|        Connect Action v                      |                      |             |
|                  +--------------------------------+                 |             |
|                  |   HW-SM-002: PROMPTING_USER    |                 |             |
|                  +--------------------------------+                 |             |
|                       |                                             |             |
|        Port Selected  v                                             |             |
|                  +--------------------------------+                 |             |
|                  |  HW-SM-003: CONFIGURING_PORT   |                 |             |
|                  +--------------------------------+                 |             |
|                       |                                             |             |
|        Port Opened /  v                                             |             |
|        GATT Connected +--------------------------+                  |             |
|                       |                          |                  |             |
|                       v                          |                  |             |
|         +---------------------------+            |                  |             |
|         | HW-SM-004: STREAMING_LIVE |            |                  |             |
|         +---------------------------+            |                  |             |
|            |          ^         |                |                  |             |
|  Malformed |          | Recover | Inactivity     | Disconnect       | Exhausted   |
|  Byte Line v          | Valid   | Timeout        | Action           | Retries     |
|         +-------------------+   |                |                  |             |
|         | HW-SM-005:        |   |                |                  |             |
|         | FRAME_ERROR_DRAIN |   |                |                  |             |
|         +-------------------+   v                v                  |             |
|                        +--------------------------------+           |             |
|                        |   HW-SM-006: STALL_TIMEOUT     |           |             |
|                        +--------------------------------+           |             |
|                                 |                                   |             |
|                  WiFi AP Drop / v                                   |             |
|                  Connection Lost                                    |             |
|                        +--------------------------------+           |             |
|                        | HW-SM-007: RECONNECTING_BACKOFF|-----------+             |
|                        +--------------------------------+                         |
+-----------------------------------------------------------------------------------+
```

- **`HW-SM-001` (STANDBY_MODE):** No physical hardware connected. Telemetry is fed exclusively by `SimulationEngine` at 1 Hz. `status = 'standby'`.
- **`HW-SM-002` (PROMPTING_USER):** Browser device picker prompt is open awaiting operator selection. `status = 'connecting'`.
- **`HW-SM-003` (CONFIGURING_PORT):** Port selected; establishing baud rate handshake, opening GATT server, or resolving WebSocket HTTP upgrade.
- **`HW-SM-004` (STREAMING_LIVE):** Active bidirectional communication. Stream reader loop active, packets arriving at 1 Hz to 10 Hz. `status = 'connected'`.
- **`HW-SM-005` (FRAME_ERROR_DRAIN):** Malformed byte sequence, unparseable JSON fragment, or framing parity mismatch. Stream buffer drains up to next `\n` delimiter without breaking the active stream.
- **`HW-SM-006` (STALL_TIMEOUT):** Connected transport has ceased transmitting bytes for > 3.0 seconds. Flagged via `lastPacketTime` comparison.
- **`HW-SM-007` (RECONNECTING_BACKOFF):** Physical link lost unintentionally. WebSocket client attempts exponential backoff reconnection up to 8 iterations.

### 3.2 State Transition Matrix

| Current State | Trigger Event | Guard Condition | Next State | Actions & Output Side-Effects |
| :--- | :--- | :--- | :--- | :--- |
| `HW-SM-001` | Operator invokes `connectSerial()` or `connectBluetooth()` | Browser supports target Web API | `HW-SM-002` | Set `status = 'connecting'`, append system log. |
| `HW-SM-001` | Operator invokes `connectWebSocket()` | Valid URL provided | `HW-SM-003` | Open `WebSocket` instance, set `wsReconnectAttempts = 0`. |
| `HW-SM-002` | Device selection approved | Port or BLE device handle returned | `HW-SM-003` | Call `port.open()` or `device.gatt.connect()`. |
| `HW-SM-002` | User cancels browser prompt | Device handle is null | `HW-SM-001` | Revert `status = 'standby'`, record cancellation log. |
| `HW-SM-003` | Stream initialization succeeds | Reader acquired & notifications active | `HW-SM-004` | Set `status = 'connected'`, trigger confirmation toast. |
| `HW-SM-003` | Port open fails or baud invalid | Error caught in catch block | `HW-SM-001` | Set `status = 'error'`, record `lastError` message. |
| `HW-SM-004` | Malformed chunk received | `JSON.parse` fails & no CSV comma | `HW-SM-005` | Append line to raw terminal log, retain remaining buffer. |
| `HW-SM-004` | Stream inactive > 3000 ms | `Date.now() - lastPacketTime > 3000` | `HW-SM-006` | Set warning indicator, log stream stall. |
| `HW-SM-004` | Operator invokes `disconnectAll()` | `isIntentionalDisconnect = true` | `HW-SM-001` | Close port/socket, revert to Standby simulation. |
| `HW-SM-004` | Physical USB cable unplugged | `reader.read()` throws stream error | `HW-SM-001` | Close reader, log serial stream fault, revert to Standby. |
| `HW-SM-004` | WebSocket dropped by network | `socket.onclose` fires & not intentional | `HW-SM-007` | Launch backoff timer: $1500 \cdot 1.5^{(\text{attempts}-1)}$ ms. |
| `HW-SM-005` | Next newline character read | Buffer contains `\n` | `HW-SM-004` | Recover packet alignment, continue reading. |
| `HW-SM-006` | New valid packet arrives | `cleanLine.length > 0` | `HW-SM-004` | Clear stall warning, update latency metric. |
| `HW-SM-007` | Backoff timer expires | `wsReconnectAttempts < 8` | `HW-SM-003` | Re-attempt `connectWebSocket()`. |
| `HW-SM-007` | Retry limit reached | `wsReconnectAttempts >= 8` | `HW-SM-001` | Exhausted retries, log failure, revert to Standby. |

---

## 4. Entity and Data Store Specifications (`PWA-D`)

### 4.1 Data Store Reference Table

| Store ID | Physical Storage Location | Lifetime / Scope | Memory Retention Capacity | Schema / Type |
| :--- | :--- | :--- | :--- | :--- |
| **`PWA-D-001`** | RAM: `TelemetryHistoryManager` | Session / In-Memory | 60 Points (FIFO) | `TelemetryPoint[]` |
| **`PWA-D-002`** | RAM: `TelemetryHistoryManager` | Session / In-Memory | 36,000 Records (FIFO, ~10 Hours) | `(TelemetryData & { isoTime })[]` |
| **`PWA-D-003`** | Browser `localStorage` | Persistent across sessions | Key: `padayon_calibration_v3` (~600 B) | `CalibrationConfig` JSON |
| **`PWA-D-004`** | RAM: `SystemLogManager` | Session / In-Memory | 50 Records (LIFO Head Push) | `SystemLogEntry[]` |
| **`PWA-D-005`** | React State: `src/App.tsx` | Active Runtime Component | Single Live Instance | `TelemetryData` |
| **`PWA-D-006`** | Browser `localStorage` | Persistent across sessions | Key: `padayon_theme` ('dark' \| 'light') | UTF-8 String |
| **`PWA-D-007`** | Browser `localStorage` | Persistent across sessions | Key: `padayon_lang` ('en' \| 'fil') | UTF-8 String |
| **`PWA-D-008`** | CacheStorage: `sw.js` | Persistent Offline | Cache Name: `padayon-pwa-v2.2` | Shell Assets (`/`, `index.html`, etc.) |

---

## 5. Data Flow Diagrams (DFD)

### 5.1 DFD Context Diagram (System Level Boundary)

```
                       +-----------------------------------+
                       |           PWA-E-001               |
                       |         Human Operator            |
                       +-----------------------------------+
                         |                 ^           ^
         Downlink Toggles|                 |           | Display Telemetry,
         & Calibration   |                 | Alerts    | Trends & Logs
         (PWA-F-001)     v                 | (PWA-F-003)| (PWA-F-004)
                       +-----------------------------------+
                       |                                   |
                       |             SYSTEM 0.0            |
                       |       Padayon Power Monitor       |
                       |         (Progressive Web          |
                       |           Application)            |
                       |                                   |
                       +-----------------------------------+
                         ^                 |           |
            Raw Telemetry|                 | Relay &   | Persist Config
            Byte Stream  |                 | Feed Cmds | (PWA-F-006)
            (PWA-F-002)  |                 v (PWA-F-005)v
       +-------------------------------+   +-------------------------------+
       |           PWA-E-002           |   |           PWA-E-003           |
       |  Physical ESP32 Microcontrol- |   |     Browser LocalStorage      |
       |  ler & Biomass TEG Hardware   |   |   (padayon_calibration_v3)    |
       +-------------------------------+   +-------------------------------+
```

#### Boundary Specifications:
- **`PWA-E-001` (Human Operator):** Interacts via touch or mouse inputs. Dispatches actuator overrides (PWA-F-001), receives safety alerts (PWA-F-003), and observes real-time metric visualizers (PWA-F-004).
- **`PWA-E-002` (Physical ESP32 & Sensors):** External embedded controller. Transmits raw serial JSON/CSV stream (PWA-F-002) across USB/BLE/Wi-Fi and executes received relay/servo commands (PWA-F-005).
- **`PWA-E-003` (Browser LocalStorage):** Client browser non-volatile storage preserving calibration parameters (PWA-F-006).

---

### 5.2 DFD Level 0: Primary Subsystems Decomposition

```
                        [ PWA-E-002: ESP32 MCU ]
                                   |
                                   | PWA-F-002: Raw Stream Buffer
                                   v
+------------------------------------------------------------------------------------+
| 1.0 Hardware Stream Ingestion & Parsing (hardwareBridge.ts)                        |
|     - Demux Serial / BLE / WebSocket chunks                                        |
|     - Split on \n, sanitize numbers, clamp hardware boundaries                     |
+------------------------------------------------------------------------------------+
       |                                              ^
       | PWA-F-007: Raw Measurements                  | PWA-F-005: Outbound Commands
       v                                              |
+------------------------------------------------------------------------------------+
| 2.0 Telemetry Normalization & Calibration (calibrationStorage.ts)                  |
|     - Apply transfer functions (Y = mX + b)                                        |
|     - Derive Delta T, battery SoC %, and net electrical power                      |
+------------------------------------------------------------------------------------+
       |                           ^
       | PWA-F-008: Calibrated     | PWA-F-006: Active Coefficients
       | Normalized Telemetry      |
       v                           +--- [ PWA-D-003: LocalStorage Calibration ]
+------------------------------------------------------------------------------------+
| 3.0 Real-Time State Management & UI Rendering (App.tsx / Viewports)                |
|     - Two-Tier load shedding arbitration                                           |
|     - SVG chart path synthesis & digital gauge updates                             |
+------------------------------------------------------------------------------------+
       |                                   |                           |
       | PWA-F-009: Trend Points           | PWA-F-010: Event Log      | PWA-F-001:
       v                                   v                           v Controls
[ PWA-D-001: 60-Point Ring Buffer ]  [ PWA-D-004: Event Log Buffer ] [ PWA-E-001: User]
[ PWA-D-002: 36k Research Buffer ]
       |
       v
+------------------------------------------------------------------------------------+
| 4.0 Diagnostic Logging & Research Archival (systemLogService.ts / telemetryHistory)|
|     - Format PHT timestamps, filter severity levels                                |
|     - 15-Column Chapter 4 research CSV file export                                 |
+------------------------------------------------------------------------------------+
```

---

### 5.3 DFD Level 1: Decomposition of Process 2.0 (Sensor Calibration Engine)

```
        PWA-F-007: Raw Measurements (rawStoveTemp, rawColdFaceTemp, rawBattV, etc.)
                                    |
                                    v
+------------------------------------------------------------------------------------+
| Subprocess 2.1: Raw Sensor Ingest & Range Clamping                                 |
| - Verify Number.isFinite()                                                         |
| - Clamp stoveTemp to [0, 350], coldFace to [5, 95], battV to [7.0, 16.5]           |
+------------------------------------------------------------------------------------+
                                    |
                                    | PWA-F-011: Clamped Safe Raw Values
                                    v
+------------------------------------------------------------------------------------+
| Subprocess 2.2: Retrieve Active Calibration Coefficients                           |
| - Read stoveTempOffset, stoveTempGain, dhtTempOffset, batteryVMin, batteryVMax     |
|   from PWA-D-003 (padayon_calibration_v3)                                          |
+------------------------------------------------------------------------------------+
                                    |
                                    | PWA-F-012: Coefficients + Raw Tuple
                                    v
+------------------------------------------------------------------------------------+
| Subprocess 2.3: Execute Transfer Functions & Derived Electrical Metrics            |
| - T_stove = (T_raw * m) + b                                                        |
| - Delta T = max(0, T_stove - T_cold)                                               |
| - SoC % = ((V_batt - V_min) / (V_max - V_min)) * 100                               |
| - P_teg = V_teg * I_teg                                                            |
| - P_load = P_light (4.8W) + P_fan (12W) + P_servo (7.8W) + P_aux (5W)              |
| - I_net = I_teg - (P_load / V_batt)                                                |
+------------------------------------------------------------------------------------+
                                    |
                                    | PWA-F-013: Fully Calibrated Metrics
                                    v
+------------------------------------------------------------------------------------+
| Subprocess 2.4: Subsystem Composition & Load Channel Structuring                   |
| - Form loadChannels array (Ch 1: 12V Light, Ch 2: Fan, Ch 3: Servo, Ch 4: USB)    |
| - Compose ambient, safety, cooling, fuelSystem, and battery structs               |
+------------------------------------------------------------------------------------+
                                    |
                                    | PWA-F-008: Normalized TelemetryData Pipe
                                    v
                               [ Output to 3.0 ]
```

---

## 6. Traceability Cross-Reference Matrix

This matrix establishes complete bi-directional traceability connecting UI features, source code implementation files, flowchart nodes, data stores, and DFD processes:

| Feature / UI Component | Source File | Flowchart Nodes | State Machine Nodes | Data Store IDs | DFD Process ID |
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
