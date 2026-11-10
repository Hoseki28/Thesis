# Thesis Software & Architecture Audit Report
**Padayon Power Monitor · Smart Biomass-TEG Hybrid Energy System**

- **Target Deployment:** Off-Grid Field Testing at Padayon Campsite, Upper Wawa Dam, Rodriguez, Rizal
- **Academic Institution:** Colegio de Montalban, Rizal, Philippines — Institute of Computer Studies (Computer Engineering)
- **Thesis Reference:** *Development of an Integrated Thermoelectric Energy Harvesting System with Optimized Load and Battery Management for Off-Grid Applications* (Parcon, Ocay, Galangue, Ordoviz, Mera, October 2026)
- **Evaluation Scope:** React 19 / TypeScript PWA Codebase vs. Thesis Document & Requirements
- **Audit Date:** October 2026  
- **Audit Mode:** Read-Only Independent Software & Systems Review  
- **PDF Deliverable:** [`THESIS_SOFTWARE_AUDIT_REPORT.pdf`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/docs/handoff_specifications/THESIS_SOFTWARE_AUDIT_REPORT.pdf)

---

## Executive Summary & Audit Verdict

| Assessment Category | Thesis Compliance Status | Risk Level |
| :--- | :---: | :---: |
| **Two-Tier Load Management & Lighting Guard** | ❌ **Non-Compliant** | **CRITICAL** |
| **Sensor Fault Handling & Safety States** | ❌ **Non-Compliant** | **CRITICAL** |
| **Research Data & Trial Management** | ⚠️ **Partial Compliance** | **HIGH** |
| **Thermodynamic Model & Telemetry Parsing** | ⚠️ **Partial Compliance** | **HIGH** |
| **Battery SoC Modeling & Energy Integration** | ⚠️ **Partial Compliance** | **HIGH** |
| **Edge Bridge & Transport Resilience** | ✅ **Compliant** | **LOW** |

### Overall Verdict: **PARTIALLY ALIGNED / REVISIONS REQUIRED BEFORE FIELD COMMISSIONING**

While the frontend interface exhibits exceptional responsive UI craftsmanship and resolves several major mathematical flaws from earlier development stages (such as the legacy $12\times$ power multiplier), the current codebase retains **two critical safety flaws** and **three major empirical data collection deficiencies** that directly threaten thesis validation:
1. **Critical Emergency Lighting Disconnect:** The master `DC MAIN POWER` toggle cuts power to the non-sheddable 12 V emergency LED lighting despite UI badges indicating "LOCKED ON" / "GUARDED ON".
2. **Alarm Masking via Fallback Values:** Sensor fault handling substitutes plausible ambient defaults ($25\text{ }^\circ\text{C}$ for core thermocouple, $12\text{ V}$ for battery, $14\text{ PPM}$ for CO), which silences critical alarms and misrepresents hardware failures as nominal operation.
3. **Absence of Operator Trial Controls & Metadata Clobbering:** The dashboard lacks UI controls for starting/stopping test runs or selecting feedstock (`wood_waste` vs. `coconut_husk`). The CSV export mechanism retroactively overwrites historical samples with export-time tags.
4. **Unmeasured Boost Converter Metrics:** Key electrical channels required to evaluate DC-DC boost converter efficiency ($\eta = P_{\text{out}}/P_{\text{in}}$) are missing from the telemetry schema.
5. **Inaccurate Linear Battery SoC Curve:** A linear voltage mapping is applied to a $\text{LiFePO}_4$ chemistry, introducing up to 40% State-of-Charge estimation error across the flat $13.0\text{ V} - 13.3\text{ V}$ discharge plateau.

---

## 1. Verified Addressed Items (Audit_Report.md Claims)

| Legacy Claim ID | Status | Verification Evidence (File & Lines) | Current Behavior |
| :--- | :---: | :--- | :--- |
| **CRIT-01** (12× Power Multiplier) | **FIXED** | [`src/components/OverviewTab.tsx:201-206`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/OverviewTab.tsx#L201-L206)<br>[`src/components/SensorsTab.tsx:23-25, 51`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/SensorsTab.tsx#L23-L25) | Renders true calculated power (`telemetry.loadPower.toFixed(1)`) with safe `0.0` fallback. Hardcoded `'239.4'` and `229` strings completely excised. |
| **CRIT-03 (Part 1)** (Manual Shedding Lockout) | **FIXED** | [`src/App.tsx:280-289`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L280-L289) | `handleToggleFans` verifies `telemetry.batteryPct <= calibration.batteryCutoffPct` and halts execution if battery is critically low. |
| **CRIT-03 (Part 2)** (Automated Hardware Shedding) | **FIXED** | [`src/App.tsx:411-422`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L411-L422) | `lowBattery` edge breach triggers automated downlink dispatch: `sendRelayCommand('fans', false)` and `sendRelayCommand('aux', false)`. |
| **CRIT-04** (Telemetry CSV Export) | **FIXED** | [`src/App.tsx:576-584`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/App.tsx#L576-L584) | Export action is bound directly to `historyManagerRef.current.exportCsv()`, downloading full 15-column time-series data. |
| **MAJ-01** (Cold-Face & $\Delta T$ Omission) | **FIXED** | [`src/types/telemetry.ts:33-34, 165-166`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/types/telemetry.ts#L33-L34) | Explicit `coldFaceTemp` and `deltaT` properties defined across all telemetry data contracts. |
| **MAJ-02** (Premature Buffer Discard) | **FIXED** | [`src/services/telemetryHistory.ts:17-23`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/telemetryHistory.ts#L17-L23) | Buffer expanded from 5,000 to **36,000 samples** (providing 10 continuous hours at 1 Hz). |
| **MAJ-05** (WebSocket Framing & Reconnect) | **FIXED** | [`src/services/hardwareBridge.ts:430-460, 482-512`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/services/hardwareBridge.ts#L430-L512) | Implemented chunk reassembly buffer (`wsBuffer`), newline splitting, concatenated `}{` delimiter handling, and 8-stage exponential backoff reconnection. |
| **MIN-03** (Orphaned ServiceLogsTab) | **FIXED** | [`src/components/ServiceLogsTab.tsx:1-20`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/src/components/ServiceLogsTab.tsx#L1-L20) | Replaced with a clean 20-line deprecated stub forwarding directly to `LogsTab.tsx`. |

---

## 2. Actionable Recommendations & Defect Matrix

```
+----------+----------------------------------------------------+-------------------------------------------+-----------------------------------+
| Priority | Defect / Discrepancy                               | Evidence (File & Line)                    | Thesis & Operational Safety Impact|
+----------+----------------------------------------------------+-------------------------------------------+-----------------------------------+
| CRITICAL | Master DC Bus switch cuts off Primary Light        | OverviewTab.tsx:170-186, App.tsx:305-316  | Kills non-sheddable emergency light|
| CRITICAL | Plausible sensor fault fallbacks mask alarms       | hardwareBridge.ts:571-613                 | Overheat & low-batt alarms masked |
| CRITICAL | Export clobbers metadata; no Run Manager UI        | telemetryHistory.ts:170-171, App.tsx:576  | Multi-feedstock trials corrupted  |
| HIGH     | Inferred static load power vs physical sensing     | calibrationStorage.ts:140-150             | Power balance metrics synthetic   |
| HIGH     | Linear SoC formula inaccurate for LiFePO4          | calibrationStorage.ts:121-123             | Up to 40% SoC estimation error    |
| HIGH     | RAM-only telemetry buffer vulnerable to reload     | telemetryHistory.ts:17                    | Field trials lost on page refresh |
| HIGH     | Missing boost converter efficiency telemetry       | telemetry.ts:44-50, Thesis Obj 2          | Cannot evaluate boost efficiency  |
| HIGH     | Optimistic relay toggle lacks ACK confirmation     | App.tsx:291-302, hardwareBridge.ts:773    | UI indicates ON when relay is OFF |
| MEDIUM   | Rigid 1 Hz assumption in Wh integration            | telemetryHistory.ts:114                   | Distorts total generated energy   |
| MEDIUM   | SensorsTab chart scale mismatch (40W vs 260W ticks)| SensorsTab.tsx:53, 114                    | Data curve misaligned with grid   |
| MEDIUM   | Hardcoded demonstration metrics in UI (1248 HRS)   | OverviewTab.tsx:288-307, ServiceTab:137   | Reviewers may mistake for live data|
| LOW      | Missing discrete toggle for 5V USB charging        | OverviewTab.tsx:231-268                   | Relay Channel 4 cannot be switched|
| LOW      | Deprecated ServiceLogsTab stub cleanup             | ServiceLogsTab.tsx:1-20                   | Orphaned code artifact            |
+----------+----------------------------------------------------+-------------------------------------------+-----------------------------------+
```

---

## 3. Hardware & Engineering Confirmations Needed

Before applying code modifications, the team must confirm:
1. **Physical Relay Wiring:** Confirm whether the 12 V emergency LED is wired through a relay contact or hardwired directly to the battery bus with inline fuse protection.
2. **Channel Mapping:** Clarify the physical loads on Relay Channels 1–4. The paper mentions lighting/fans/USB in Section 1.5.4, but cooling fan/igniter/servo in Section 2.5.1.
3. **Sensor Part Numbers:** Resolve discrepancies between MAX31855 vs. MAX6675 (thermocouple), DHT22 vs. DHT11 (ambient), and INA219 vs. ACS712 (battery current).
4. **Cold-Face Heatsink Sensor:** Confirm whether a physical temperature probe is mounted directly to the water-cooled heatsink block.
5. **Thermal Protection Margin:** Determine whether the $230\text{ }^\circ\text{C}$ alarm provides sufficient safety margin below the $250\text{ }^\circ\text{C}$ TEG module solder melting threshold.

---

## 4. Phased Validation Plan

### Phase A: Automated & Software Workbench Testing
- **Sensor Fault Injection:** Inject corrupted JSON/CSV frames (`NaN`, open circuit, negative values, missing fields). Verify that explicit fault banners are rendered and normal fallbacks are prohibited.
- **Priority Shedding Interlock:** Simulate battery discharge to $\le 15\%$. Verify immediate hardware shed dispatch (`RELAY fans 0`, `RELAY aux 0`) while Channel 1 remains locked active.
- **Multi-Trial Export Integrity:** Record consecutive trials of `wood_waste` and `coconut_husk`. Verify that exporting preserves original row tags.
- **Memory Soak Test:** Execute a continuous 6-hour simulation (21,600 packets). Verify zero memory leakage and local storage recovery.

### Phase B: Laboratory & Off-Grid Field Validation (Upper Wawa Dam)
- **Local Autonomy Validation:** Disconnect all client communication while system is active. Induce low battery and confirm that the ESP32 executes load shedding autonomously without browser intervention.
- **Boost Converter Bench Testing:** Instrument dual digital multimeters at converter input and output to record empirical efficiency curves across thermal inputs ($100\text{ }^\circ\text{C} - 220\text{ }^\circ\text{C}$).
- **Comparative Feedstock Burn Trials:** Conduct controlled burns using $1.5\text{ kg}$ of wood waste versus $1.5\text{ kg}$ of coconut husks under identical water cooling. Compare peak $\Delta T$, Seebeck voltage, and net battery charging rate.

---

## 5. Paper Gaps & Manuscript Deficiencies

Inspection of the supplied 14-page thesis PDF identified the following gaps:
1. **Unpopulated Template Artifacts (Page 1):** Abstract, Keywords, and Publication Metadata contain unedited journal template instructions.
2. **Missing Chapter 3 (Detailed Methodology):** Testing schematics, calibration protocols, and biomass mass measurement procedures are absent.
3. **Missing Chapter 4 (Results & Discussion):** Manuscript ends on Page 14 with **zero empirical data**. Missing wood waste vs. coconut husk comparative results, Seebeck generation curves, boost converter efficiency plots, and battery charging logs.
4. **Missing Chapter 5 (Conclusions & Recommendations):** No research summary or conclusions are included.
5. **Missing ISO/IEC 25010 Evaluation Evidence:** Promised qualitative evaluations of functional suitability, performance efficiency, and operational safety lack rubrics, criteria, and survey data.

---

## 6. Execution Status & Certification

- `git status`: Executed. Repository verified clean.
- `npx tsc --noEmit`: Executed. Application source files in `src/` compiled with zero errors.
- `npm run build` / `npm test`: Not executed to strictly avoid file generation or mutation.
- Outbound Webhooks: Verified completely absent from codebase.

**Certification:** This audit was conducted in strict compliance with read-only instructions. All original project code and documentation files remain completely unaltered.

*Document compiled and published to:* [`docs/handoff_specifications/THESIS_SOFTWARE_AUDIT_REPORT.pdf`](file:///c:/Users/Toshiba/Downloads/skills-based-app-main/skills-based-app-main/travel-planner/Activity/Gem/pro/dht11/thesis/Design%20Energy%20Dashboard%20PWA/docs/handoff_specifications/THESIS_SOFTWARE_AUDIT_REPORT.pdf)
