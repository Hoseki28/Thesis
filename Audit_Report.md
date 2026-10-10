# Systems Architecture & Codebase Audit Report
**Project:** Padayon Power Monitor · Biomass-TEG Hybrid System  
**Deployment Target:** Off-Grid Field Testing at Upper Wawa Dam, Rodriguez, Rizal  
**Auditor:** Principal Embedded & Full-Stack Systems Architect  
**Evaluation Scope:** Thesis Requirements Verification (Load Management, Telemetry Modeling, Edge/Transport Bridge Resilience, Chapter 4 Research Readiness)  
**Date:** October 10, 2026  

---

## 1. Executive Summary & Audit Verdict

| Assessment Category | Thesis Compliance Status | Risk Level |
| :--- | :---: | :---: |
| **Two-Tier Load Management** | ❌ **Non-Compliant** | **CRITICAL** |
| **Telemetry & Thermodynamic Models** | ⚠️ **Partial Compliance** | **MAJOR** |
| **Edge Bridge & Transport Resilience** | ⚠️ **Partial Compliance** | **MAJOR** |
| **Research & Field Evaluation (CSV/Feedstock)** | ❌ **Non-Compliant** | **CRITICAL** |

### Overall Verdict: **CONDITIONAL FAIL / NOT DEPLOYMENT-READY**
While the frontend interface demonstrates polished styling and reactive telemetry hooks, an in-depth audit reveals **fatal mathematical errors, missing hardware protection interlocks, non-isolated critical loads, and non-existent experimental data tagging**. 

Specifically:
1. **Catastrophic Power Calculation Bug:** In `OverviewTab.tsx` and `SensorsTab.tsx`, load power is erroneously multiplied by 12, artificially inflating a ~20 W real load to **>240 W**, and falling back to a hardcoded string `'239.4'`.
2. **Breach of Two-Tier Safety Protocol:** The Primary Critical Load (12V LED lighting) is not isolated or guarded. An operator toggling the master switch kills emergency lighting, and secondary auxiliary loads (fans, 5V USB) lack discrete, software-lockout-protected controls on the main dashboard.
3. **No Field Feedstock Tagging:** The CSV export mechanism does not expose biomass feedstock classification (wood waste vs. coconut husk) or trial run metadata, preventing systematic data collection for Chapter 4 thesis results.
4. **Thermodynamic Model Conflation:** The data model conflates ambient air temperature (DHT11) with TEG cold-face temperature, omitting dedicated $\Delta T$ and signed battery current properties from the primary data structure and exports.

---

## 2. Thesis Requirements Checklist & Audit Findings

### 2.1 Telemetry Data Model & Calculations
- **Hot-face, Cold-face, and $\Delta T$ Properties:**
  - *Current Implementation:* `src/types/telemetry.ts` (lines 19–21) defines `stoveTemp` (hot junction) and `ambientTemp` ("Cold sink sync / DHT11"). It **completely omits** `coldFaceTemp` and `deltaT` from `TelemetryData` and `TelemetryPoint`.
  - *Deficiency:* Thermodynamically, cold-face heat sink temperature ($T_{\text{cold}}$) is distinct from environmental dry-bulb ambient temperature ($T_{\text{amb}}$). $\Delta T$ is computed on-the-fly inside `OverviewTab.tsx` line 53, but is never persisted in `TelemetryPoint` or exported in CSV logs.
- **Battery Current Representation:**
  - *Current Implementation:* `TelemetryData` defines `netCurrent` (line 29) calculated as `tegCurrent - loadCurrent`.
  - *Deficiency:* There is no signed physical `batteryCurrent` channel. Hardware packets (`hardwareBridge.ts` lines 436–443) only report `tegCurrent` and `batteryVoltage`. `loadPower` is synthetically estimated using static relay constants (4.8W, 12W, 5W) rather than physical shunt/Hall sensing (e.g., INA219/INA226).
- **Sensor Faults & NaN Handling:**
  - *Current Implementation:* Open-circuit thermocouples (MAX6675) or corrupted microcontroller strings parse as `NaN` via `Number(json.stoveTemp)`.
  - *Deficiency:* No `isFinite` sanitation exists. `NaN` propagates into `OverviewTab.tsx` (silently defeating the `tooHot` safety alarm at line 325) and corrupts the SVG path string in `SensorsTab.tsx` line 53 (`M 0 NaN`), crashing chart rendering.

### 2.2 Two-Tier Load Management Implementation
- **Differentiation Between Critical vs. Auxiliary Loads:**
  - *Current Implementation:* `relays` schema contains `dcBus`, `lights`, `fans`, `aux`.
  - *Deficiency:* In `OverviewTab.tsx`, only the master `DC MAIN POWER` toggle is exposed. The prop `onToggleFans` is accepted but never rendered in JSX. `aux` (5V USB) has no toggle handler in `App.tsx` or `OverviewTab.tsx`.
- **Primary Critical Load Guarding:**
  - *Current Implementation:* Toggling `DC MAIN POWER` off sets `dcBus = false`, which sets `lightW = 0` (`calibrationStorage.ts` line 101).
  - *Deficiency:* The user can easily shut down the non-sheddable emergency light. There is no software or hardware interlock reserving the 12V LED rail as always-on.
- **Deep-Discharge Safety Lockout:**
  - *Current Implementation:* In `simulationEngine.ts` (line 123), a partial check prevents turning `fans` on if battery $\le$ `batteryCutoffPct`.
  - *Deficiency:* `aux` (5V USB) is not checked. More critically, in `App.tsx` line 279, when connected to **live hardware**, `handleToggleFans` sends relay commands directly with **zero battery threshold verification**, bypassing the cutoff interlock. Furthermore, during live hardware execution, `lowBattery` only triggers a log message; it never dispatches an automated hardware shed command (`RELAY fans 0`) to the ESP32.

### 2.3 Edge Transport & Hardware Bridge Resilience
- **Transport Protocols Supported:**
  - *Supported:* WebSerial (USB), Web Bluetooth (BLE Nordic UART Service), WebSockets (`ws://192.168.4.1/ws`).
  - *Omitted:* MQTT is completely absent.
- **Fallback on Mobile / Non-Chromium Browsers:**
  - *Current Implementation:* WebSerial displays an error banner and disables the connect button on non-Chromium browsers.
  - *Deficiency:* If WebSerial is unavailable on iOS Safari or Android Firefox, Web Bluetooth is also unsupported on iOS Safari. WebSocket works over local Wi-Fi AP, but lacks any automatic reconnection logic upon packet drops.
- **Packet Sanitization & Frame Reassembly:**
  - *Deficiency:* In `hardwareBridge.ts` line 374, `socket.onmessage` assumes 1 WebSocket packet = 1 complete JSON object. If multiple frames arrive concatenated by newlines or fragmented, `JSON.parse` throws an unhandled error.
- **Memory Safety & Continuous Streaming Buffers:**
  - *Deficiency:* In `telemetryHistory.ts` line 61, `fullLog` is hard-capped at 5,000 samples. At 1 Hz, after 83.3 minutes, old samples are discarded (`shift()`). A 6-hour thesis trial will lose the first 4.6 hours of data.

### 2.4 Research & Field Evaluation Readiness
- **Feedstock Tagging & CSV Export:**
  - *Current Implementation:* `App.tsx` line 513 binds the export button to `systemLogManager.exportCsv('padayon_system_logs')`.
  - *Deficiency:* The UI exports event text logs (e.g. "System started..."), **completely stranding the numerical sensor history** in `telemetryHistory.ts`. Neither the history manager nor the UI has any field or input for feedstock type ("Wood Waste" vs. "Coconut Husk"), trial identifier, or fuel mass.

---

## 3. Ranked Architectural Flaws & Vulnerabilities

### 🔴 CRITICAL SEVERITY

#### [CRIT-01] Erroneous 12× Load Power Multiplication & Mock Fallback
- **File & Lines:**
  - [`src/components/OverviewTab.tsx:150`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/OverviewTab.tsx#L150)
  - [`src/components/SensorsTab.tsx:24`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/SensorsTab.tsx#L24), [`src/components/SensorsTab.tsx:50`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/SensorsTab.tsx#L50)
- **Problematic Code:**
  ```tsx
  // OverviewTab.tsx:150
  {telemetry.relays.dcBus ? (telemetry.loadPower > 0 ? (telemetry.loadPower * 12).toFixed(1) : '239.4') : '0.0'}

  // SensorsTab.tsx:24 & 50
  const loadWattage = telemetry.relays.dcBus
    ? (telemetry.loadPower > 0 ? Math.round(telemetry.loadPower * 12) : 229)
    : 0
  const val = 'loadPower' in pt ? (pt as any).loadPower * 12 : pt.val
  ```
- **Root Cause & Impact:** `loadPower` is already calculated in Watts (e.g. $4.8 + 12.0 = 16.8\text{ W}$). Multiplying by 12 artificially computes $16.8 \times 12 = 201.6\text{ W}$. If load is 0, it falls back to hardcoded strings `'239.4'` and `229`. This invalidates all power balance calculations, efficiency metrics, and thesis defense presentations.

#### [CRIT-02] Primary Critical Load Unguarded Against Inadvertent Shedding
- **File & Lines:**
  - [`src/components/OverviewTab.tsx:116-133`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/OverviewTab.tsx#L116-L133)
  - [`src/services/calibrationStorage.ts:100-104`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/calibrationStorage.ts#L100-L104)
- **Problematic Code:**
  ```ts
  const isBusOn = raw.relays.dcBus ?? true
  const lightW = isBusOn && raw.relays.lights ? 4.8 : 0
  ```
- **Root Cause & Impact:** Toggling the single UI switch `DC MAIN POWER` shuts off the DC bus completely, cutting off the Primary Critical Load (12V Emergency Lighting). In an off-grid river basin deployment (Upper Wawa Dam), critical emergency lighting must be non-sheddable and electrically decoupled from secondary shedding switches.

#### [CRIT-03] Missing Deep-Discharge Hardware Lockout & Automated Load Shedding
- **File & Lines:**
  - [`src/App.tsx:279-290`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L279-L290), [`src/App.tsx:354-370`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L354-L370)
  - [`src/services/simulationEngine.ts:121-126`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/simulationEngine.ts#L121-L126)
- **Root Cause & Impact:** When connected to live hardware, `App.tsx` sends relay toggle commands to the ESP32 without checking `telemetry.batteryPct <= calibration.batteryCutoffPct`. When `lowBattery` triggers, it only emits a system log text entry; it never dispatches an automated hardware shed command (`RELAY fans 0`, `RELAY aux 0`). This allows lead-acid/LiFePO4 batteries to experience destructive deep discharge in the field.

#### [CRIT-04] Telemetry Time-Series Export Disconnected & Absence of Feedstock Tagging
- **File & Lines:**
  - [`src/App.tsx:513`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L513)
  - [`src/services/telemetryHistory.ts:107-123`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/telemetryHistory.ts#L107-L123)
- **Problematic Code:**
  ```tsx
  // App.tsx:513
  onExportCsv={() => systemLogManager.exportCsv('padayon_system_logs')}
  ```
- **Root Cause & Impact:** Clicking "Export CSV" on the Logs tab downloads text event descriptions, while `historyManagerRef.current.exportCsv()` is never wired to the user interface. Furthermore, neither model nor UI supports tagging feedstock type (`wood_waste` vs. `coconut_husk`), preventing Chapter 4 experimental comparison of thermal-to-electrical yield.

---

### 🟠 MAJOR SEVERITY

#### [MAJ-01] Thermodynamic Model Conflation & Omission of Hot-Face, Cold-Face, and $\Delta T$
- **File & Lines:**
  - [`src/types/telemetry.ts:19-30`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/types/telemetry.ts#L19-L30), [`src/types/telemetry.ts:82-92`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/types/telemetry.ts#L82-L92)
  - [`src/components/OverviewTab.tsx:53`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/OverviewTab.tsx#L53)
- **Root Cause & Impact:** `ambientTemp` is measured by a DHT11 environmental sensor, but treated as the cold junction of the TEG. In an actual biomass-TEG system, the cold face is thermally coupled to an aluminum heatsink or water jacket, with thermal resistance $\theta_{\text{sink}}$ separating it from ambient air. $\Delta T$ is not defined in `TelemetryData` or `TelemetryPoint`, meaning historical trends and exports lack Seebeck thermal gradient records.

#### [MAJ-02] Premature Data Discard in Prolonged Burn Trials (83-Minute Ring Buffer)
- **File & Lines:**
  - [`src/services/telemetryHistory.ts:57-64`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/telemetryHistory.ts#L57-L64)
- **Problematic Code:**
  ```ts
  this.fullLog.push({ ...data, isoTime: new Date(data.timestamp).toISOString() })
  if (this.fullLog.length > 5000) {
    this.fullLog.shift()
  }
  ```
- **Root Cause & Impact:** A typical biomass combustion run at Wawa Dam spans 4–8 hours ($14,400\text{–}28,800\text{ samples}$ at 1 Hz). Discarding elements beyond 5,000 samples permanently purges the first 4–6 hours of burn data from memory.

#### [MAJ-03] Absence of Signed Physical Battery Current Channel
- **File & Lines:**
  - [`src/types/telemetry.ts:27-29`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/types/telemetry.ts#L27-L29)
  - [`src/services/calibrationStorage.ts:98-106`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/calibrationStorage.ts#L98-L106)
  - [`src/services/hardwareBridge.ts:436-443`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L436-L443)
- **Root Cause & Impact:** The hardware parser does not accept measured battery current ($I_{\text{batt}}$). Instead, it calculates $I_{\text{net}} = I_{\text{teg}} - I_{\text{load\_est}}$ using assumed relay wattage constants. Battery State-of-Charge (SoC) integration cannot account for real battery internal resistance, Coulombic efficiency, or actual variable USB loads.

#### [MAJ-04] Sensor Error (`NaN` / Open Circuit) Propagation & Rendering Breakdown
- **File & Lines:**
  - [`src/services/hardwareBridge.ts:437-442`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L437-L442)
  - [`src/components/SensorsTab.tsx:50-54`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/SensorsTab.tsx#L50-L54)
- **Root Cause & Impact:** Microcontroller faults (e.g. disconnected MAX6675 thermocouple reporting `NaN` or `-999`) are cast directly via `Number()`. If `stoveTemp` is `NaN`, `NaN > threshold` evaluates to `false`, silently disabling the overheat alarm. In `SensorsTab.tsx`, `NaN` coordinates injected into `<path d={pathD} />` cause browser SVG parse errors.

#### [MAJ-05] Fragile WebSocket Framing & Missing Reconnection Loop
- **File & Lines:**
  - [`src/services/hardwareBridge.ts:374-397`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L374-L397)
- **Root Cause & Impact:** Unlike serial and BLE readers which maintain line-splitting buffers, `socket.onmessage` directly feeds incoming strings to `parseIncomingPayload`. If TCP fragments or concatenates frames, JSON parsing fails silently. When the WebSocket connection drops, it transitions immediately to `'standby'` with no backoff reconnection loop.

---

### 🟡 MINOR SEVERITY

#### [MIN-01] Omission of MQTT Edge Transport
- **File & Lines:** [`src/services/hardwareBridge.ts:69`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L69)
- **Impact:** MQTT is standard for embedded telemetry over constrained remote links (such as LoRaWAN/Cellular backhauls at river basins). The bridge only supports direct WebSerial, BLE, and WebSockets.

#### [MIN-02] React Re-render Thrashing via Unthrottled Raw Serial Logging
- **File & Lines:** [`src/services/hardwareBridge.ts:91-102`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L91-L102)
- **Impact:** Calling `appendLog()` and `notifyState()` on every incoming line causes root `App.tsx` re-renders at 10 Hz, increasing CPU utilization and battery drain on mobile field tablets.

#### [MIN-03] Orphaned Component Technical Debt (`ServiceLogsTab.tsx`)
- **File & Lines:** [`src/components/ServiceLogsTab.tsx:1-394`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/ServiceLogsTab.tsx)
- **Impact:** An entire duplicate tab component (`ServiceLogsTab`) exists in `src/components/`, while `App.tsx` imports and uses `LogsTab.tsx`. This causes maintenance divergence and confusion.

---

## 4. Concrete Remediation Plan & Code Solutions

### Remediation Step 1: Fix Power Calculations in `OverviewTab.tsx` & `SensorsTab.tsx`
Remove the illegitimate `* 12` multiplier and hardcoded `'239.4'` fallback. Show real physical power with fallback to `0.0`.

```tsx
// src/components/OverviewTab.tsx (Lines 148-154)
<div className="flex items-baseline mt-1">
  <span className={`text-2xl font-black font-mono tabular-nums tracking-tight ${isDark ? 'text-white' : 'text-zinc-900'}`}>
    {telemetry.relays.dcBus ? telemetry.loadPower.toFixed(1) : '0.0'}
  </span>
  <span className={`text-xs font-normal ml-1 ${isDark ? 'text-[#9CA3AF]' : 'text-zinc-500'}`}>W</span>
</div>
```

```tsx
// src/components/SensorsTab.tsx (Lines 23-26 & 50)
const loadWattage = telemetry.relays.dcBus
  ? Math.round(telemetry.loadPower)
  : 0

// In chart mapper:
const val = 'loadPower' in pt ? (pt as any).loadPower : pt.val
```

---

### Remediation Step 2: Implement True Two-Tier Load Architecture with Critical Guard
Update `OverviewTab.tsx` to provide distinct sections:
1. **Primary Critical Tier (12V LED Lighting):** Non-sheddable, locked active, displaying a green shield badge indicating "EMERGENCY RESERVED".
2. **Secondary Auxiliary Tier (12V DC Fans & 5V USB Charging):** Independent toggle switches with automated deep-discharge lockout indicators.

```tsx
// Two-Tier Load Control UI in OverviewTab.tsx
<div className="flex flex-col gap-2 mt-2">
  {/* Tier 1: Primary Critical Load (Guarded) */}
  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <div>
        <span className="text-[11px] font-bold text-white uppercase block">12V LED Emergency Light</span>
        <span className="text-[9px] text-emerald-400 font-mono">PRIMARY CRITICAL · NON-SHEDDABLE</span>
      </div>
    </div>
    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">LOCKED ON</span>
  </div>

  {/* Tier 2: Secondary Auxiliary Loads (Sheddable) */}
  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
    <div>
      <span className="text-[11px] font-bold text-white uppercase block">12V DC Cooling Fans</span>
      <span className="text-[9px] text-zinc-400 font-mono">SECONDARY AUXILIARY · SHEDDABLE</span>
    </div>
    <button
      type="button"
      disabled={lowBattery && !telemetry.relays.fans}
      onClick={onToggleFans}
      className={`px-3 py-1 rounded-lg text-xs font-bold font-mono transition-colors ${
        telemetry.relays.fans
          ? 'bg-emerald-500 text-black'
          : lowBattery
          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-rose-500/30'
          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      }`}
    >
      {lowBattery && !telemetry.relays.fans ? 'LOCKED OUT' : telemetry.relays.fans ? 'ACTIVE' : 'OFF'}
    </button>
  </div>
</div>
```

---

### Remediation Step 3: Upgrade Telemetry Models for Thermal Gradient & Signed Current
Extend `src/types/telemetry.ts` to include explicit thermodynamic and electrical properties:

```ts
export type FeedstockType = 'wood_waste' | 'coconut_husk' | 'mixed' | 'unspecified'

export interface TelemetryData {
  // Raw measurements
  rawStoveTemp: number
  rawColdFaceTemp: number
  rawAmbientTemp: number
  rawHumidity: number
  rawBatteryVoltage: number
  rawBatteryCurrent: number // Signed: (+) Charging, (-) Discharging
  rawTegVoltage: number
  rawTegCurrent: number

  // Calibrated measurements
  stoveTemp: number        // °C (Hot Face / Core)
  coldFaceTemp: number     // °C (Cold Face / Heatsink)
  deltaT: number           // °C (stoveTemp - coldFaceTemp)
  ambientTemp: number      // °C (Ambient Air DHT11)
  humidity: number         // % RH
  
  batteryVoltage: number   // VDC
  batteryCurrent: number   // Signed A: (+) Net Charging, (-) Net Discharging
  batteryPct: number       // 0 - 100%
  
  tegVoltage: number       // VDC
  tegCurrent: number       // A
  tegPower: number         // W (V * I)
  
  loadCurrent: number      // A
  loadPower: number        // W
  netCurrent: number       // Signed A
  
  // Relays / Actuators
  relays: {
    dcBus: boolean
    criticalLight: boolean // Strictly non-sheddable primary
    fans: boolean          // Secondary Auxiliary 1
    auxUsb: boolean        // Secondary Auxiliary 2 (5V USB)
  }

  // Thesis Research Metadata
  feedstock: FeedstockType
  trialId: string

  timestamp: number
  source: DataSource
}
```

---

### Remediation Step 4: Stream Sanitization & Extended Burn Ring Buffer
In `telemetryHistory.ts`, expand the session buffer capacity from 5,000 to **30,000 samples** (covering 8.3 hours of 1 Hz streaming), and include all thesis fields in the CSV export:

```ts
// src/services/telemetryHistory.ts
export class TelemetryHistoryManager {
  private points: TelemetryPoint[] = []
  private maxPoints: number = 60
  private fullLog: Array<TelemetryData & { isoTime: string }> = []
  private maxFullLog: number = 30000 // 8.3 hours at 1 Hz continuous

  public addPoint(data: TelemetryData) {
    // Sanitize NaNs
    const safeData: TelemetryData = {
      ...data,
      stoveTemp: Number.isFinite(data.stoveTemp) ? data.stoveTemp : 0,
      coldFaceTemp: Number.isFinite(data.coldFaceTemp) ? data.coldFaceTemp : 25,
      deltaT: Number.isFinite(data.deltaT) ? data.deltaT : 0,
      tegPower: Number.isFinite(data.tegPower) ? data.tegPower : 0,
      loadPower: Number.isFinite(data.loadPower) ? data.loadPower : 0,
      batteryCurrent: Number.isFinite(data.batteryCurrent) ? data.batteryCurrent : 0,
    }

    this.points.push(this.mapToPoint(safeData))
    if (this.points.length > this.maxPoints) this.points.shift()

    this.fullLog.push({
      ...safeData,
      isoTime: new Date(safeData.timestamp).toISOString(),
    })
    if (this.fullLog.length > this.maxFullLog) this.fullLog.shift()
  }

  public exportCsv(feedstock: string = 'wood_waste', trialId: string = 'Trial-1'): boolean {
    const headers = [
      'Timestamp_ISO', 'Epoch_MS', 'Feedstock', 'Trial_ID',
      'Hot_Face_Temp_C', 'Cold_Face_Temp_C', 'Delta_T_C', 'Ambient_Temp_C', 'Humidity_Pct',
      'Battery_Voltage_V', 'Battery_Current_Signed_A', 'Battery_SOC_Pct',
      'TEG_Voltage_V', 'TEG_Current_A', 'TEG_Power_W',
      'Load_Power_W', 'Relay_Critical_Light', 'Relay_Aux_Fans', 'Relay_Aux_USB'
    ]
    // ... maps rows with exact formatting and triggers download
  }
}
```

---

### Remediation Step 5: Wire Experimental Telemetry CSV in `App.tsx`
Replace the text log export in `App.tsx` with a dual-option export: one for raw telemetry data and one for system event logs, enabling researchers to specify the feedstock:

```tsx
// src/App.tsx (Line 513)
onExportCsv={() => {
  historyManagerRef.current.exportCsv('wood_waste', 'WawaDam-Burn-01')
}}
```

---

## 5. Summary Matrix of Required Actions

| File Path | Discrepancy / Vulnerability | Remediation Priority |
| :--- | :--- | :---: |
| [`src/components/OverviewTab.tsx`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/OverviewTab.tsx) | Line 150 multiplies `loadPower` by 12 and uses fallback `'239.4'`; secondary toggles omitted; emergency light unguarded | **P0 (Immediate)** |
| [`src/components/SensorsTab.tsx`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/SensorsTab.tsx) | Lines 24 & 50 multiply `loadPower` by 12 with fallback 229 | **P0 (Immediate)** |
| [`src/App.tsx`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx) | Line 513 exports system text logs instead of sensor history; line 279 bypasses battery cutoff on live hardware | **P0 (Immediate)** |
| [`src/types/telemetry.ts`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/types/telemetry.ts) | Missing `deltaT`, `coldFaceTemp`, signed `batteryCurrent`, and `feedstock` | **P1 (High)** |
| [`src/services/telemetryHistory.ts`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/telemetryHistory.ts) | 5,000-sample limit truncates long burn tests; missing $\Delta T$ and feedstock in CSV headers | **P1 (High)** |
| [`src/services/hardwareBridge.ts`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts) | Missing `NaN` sanitation; no WebSocket frame buffer or auto-reconnection loop | **P1 (High)** |
| [`src/components/ServiceLogsTab.tsx`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/ServiceLogsTab.tsx) | Orphaned dead code | **P2 (Cleanup)** |
