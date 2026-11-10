# Operator Manual: Padayon Power Monitor PWA
**Smart Biomass-Powered Thermoelectric Energy System (B-TEG Core)**  
**Deployment Context:** Field Research Node #01, Upper Wawa Dam, Rodriguez, Rizal  
**Document Revision:** 2.1 (October 2026)  
**Author:** Embedded IoT Software Documentation Specialist & Systems Analyst  

---

## 1. System Introduction and Safety Precautions

The Padayon Power Monitor is a Progressive Web App (PWA) designed for real-time telemetry observation, sensor calibration, diagnostic logging, and load management of a biomass cookstove integrated with thermoelectric generator (TEG) modules and a 12V 50Ah Lithium Iron Phosphate (LiFePO4) battery bank.

### 1.1 Physical Architecture Overview
The system captures heat generated from biomass combustion (wood waste or coconut husk fuel) through hot-face heat collectors. Thermoelectric generator modules produce DC electricity via the Seebeck effect by maintaining a high temperature gradient between the combustion chamber hot junction and a liquid-cooled cold junction heatsink. 

```
+-------------------------------------------------------------+
|               Biomass Combustion Chamber                     |
|           (Wood Waste / Coconut Husk Fuel)                  |
+-------------------------------------------------------------+
                              |
                     Hot Junction (MAX31855)
                              v
+-------------------------------------------------------------+
|               Thermoelectric Generators (TEG)                |
|             Seebeck Voltage V = N * alpha * deltaT          |
+-------------------------------------------------------------+
                              v
                    Cold Junction (Water Block)
                              |
+-------------------------------------------------------------+
|                  Liquid Cooling Circuit                      |
|            (Radiator + PWM Cold-Side Water Fan)             |
+-------------------------------------------------------------+
```

### 1.2 Critical Operating Parameters and Operational Envelopes

The operator must continuously verify that all thermal and electrical parameters remain within the operational envelopes specified below:

| Parameter | Sensor / Device | Normal Range | Warning Threshold | Emergency Trip Level |
| :--- | :--- | :--- | :--- | :--- |
| **Stove Hot Junction ($T_{\text{hot}}$)** | Type-K Thermocouple / MAX31855 | 140.0°C to 220.0°C | < 100.0°C (Low Flame) | > 230.0°C (Overheat Alarm); 310.0°C (Thermal Fuse) |
| **Cold Sink Face ($T_{\text{cold}}$)** | Water-cooled heatsink | 25.0°C to 45.0°C | > 55.0°C | > 70.0°C (Cooling Stagnation) |
| **Temperature Gradient ($\Delta T$)** | Differential ($T_{\text{hot}} - T_{\text{cold}}$) | 100.0°C to 180.0°C | < 80.0°C (Low Output) | > 200.0°C (Module Stress) |
| **Carbon Monoxide (CO)** | MQ-7 Gas Sensor | 0 to 45 PPM | 50.0 to 100.0 PPM | > 100.0 PPM (Critical Evacuate) |
| **Ambient Air Temperature** | DHT22 Dry-Bulb | 24.0°C to 36.0°C | > 40.0°C | > 50.0°C |
| **Relative Humidity** | DHT22 Hygrometer | 45% to 85% RH | > 90% RH | Condensation Hazard |
| **Battery Terminal Voltage** | LiFePO4 12V 50Ah | 12.80V to 13.60V | < 12.20V (Low Reserve) | 10.00V (BMS Hard Cutoff); 14.60V (Absorption Max) |
| **Battery State of Charge (SoC)** | Voltage / Coulomb Model | 30% to 95% | <= 20% (Low Batt Alert) | <= 15% (Automated Load Shedding) |
| **TEG Open-Circuit Voltage** | Direct DC Bus | 4.0V to 14.8V | > 16.0V | 28.0V (Circuit Clamping) |
| **TEG Generation Current** | INA219 / ACS712 Shunt | 0.40A to 1.80A | < 0.20A | > 2.50A |

### 1.3 Safety Protocols and Interlocks
1. **Thermal Runaway Prevention:** If the stove temperature exceeds 230.0°C, the system issues an immediate audible and visual alert on the Overview dashboard. If temperature reaches 310.0°C, the physical thermal fuse trips to prevent destruction of the bismuth telluride (Bi2Te3) semiconductor elements.
2. **Two-Tier Load Shedding:**
   - **Tier 1 (Guarded Critical Lighting):** Primary 12V LED campsite lighting is strictly guarded and non-sheddable. It remains energized as long as the DC Main Bus is closed, ensuring campsite safety during deep nighttime operations.
   - **Tier 2 (Sheddable Auxiliary Loads):** Secondary auxiliary circuits (cooling radiator fans, fuel feed servo, and 5V USB charging ports) are automatically locked out whenever the battery SoC falls to 15% or below. Operators cannot manually override auxiliary activation while the battery remains in deep-discharge lockout.
3. **Carbon Monoxide Gas Hazard:** In enclosed or semi-enclosed testing shelters, CO concentrations above 50 PPM indicate incomplete combustion or flue blockage. Concentrations exceeding 100 PPM mandate immediate shelter evacuation and manual flue damper opening.

---

## 2. System Requirements and Browser Compatibility

The Padayon Power Monitor operates directly inside the browser using modern Web APIs to communicate with hardware microcontrollers without requiring native desktop application installations.

### 2.1 Browser Requirements
Direct hardware communication (USB Serial and Bluetooth BLE) relies on Chromium-based Web APIs:

| Browser | Web Serial (USB) | Web Bluetooth (BLE) | WebSocket (Wi-Fi) | Offline PWA Support |
| :--- | :---: | :---: | :---: | :---: |
| **Google Chrome (Desktop / Android)** | Supported (v89+) | Supported (v56+) | Supported | Supported |
| **Microsoft Edge (Desktop / Android)** | Supported (v89+) | Supported (v79+) | Supported | Supported |
| **Opera (Desktop)** | Supported (v75+) | Supported (v43+) | Supported | Supported |
| **Mozilla Firefox** | Unsupported | Unsupported | Supported | Supported |
| **Apple Safari (macOS / iOS)** | Unsupported | Unsupported | Supported | Supported |

> **Operator Advisory:** For wired USB serial or direct wireless Bluetooth operation, always use Google Chrome or Microsoft Edge. If accessing the dashboard from an Apple iPhone or iPad, connect via the ESP32 Wi-Fi SoftAP WebSocket (`ws://192.168.4.1/ws`), which is supported across all iOS web browsers.

### 2.2 Security Contexts (HTTPS and Localhost)
The browser strictly restricts `navigator.serial` and `navigator.bluetooth` to secure contexts:
- Production deployment: `https://design-energy-dashboard-pwa.vercel.app` (Fully verified)
- Local field development: `http://localhost:5173` or `http://127.0.0.1:5173`
- Unencrypted network IP addresses (such as `http://192.168.1.50:5173`) cannot access Web Serial or Web Bluetooth due to browser security policies. When using local network IPs, connect via WebSocket transport.

### 2.3 Installing the PWA for Offline Field Operations
The application is equipped with a Service Worker (`/sw.js`) and Web App Manifest (`/manifest.json`):
1. Navigate to the dashboard URL in Google Chrome.
2. In the browser address bar, click the **Install App** icon or click the green **INSTALL BIOMASS PWA** banner displayed on the dashboard header.
3. When prompted, select **Install**.
4. The dashboard will launch in a dedicated standalone application window without browser URL bars, maintaining full offline functionality at remote field locations where cellular data is unavailable.

---

## 3. Connection Guide

The dashboard provides four operational modes: Wired USB Serial, Wireless Bluetooth BLE, Local Wi-Fi WebSocket, and Internal Field Simulation.

```
+--------------------------------------------------------------+
|                     ESP32 Connection Hub                     |
|                                                              |
|   [ 1. Wired USB ]      [ 2. Bluetooth BLE ]    [ 3. Wi-Fi ] |
|                                                              |
|   Baud: 115200          Device: ESP32_BTEG      ws://192...  |
|   [ Connect Serial ]    [ Connect BLE ]         [ Connect ]  |
+--------------------------------------------------------------+
```

### 3.1 Mode 1: Connecting via Wired USB/UART (Web Serial)
1. Connect the ESP32 microcontroller to the host computer or Android device using a USB Type-C data cable.
2. Open the dashboard and click the **Connect** icon in the header to open the **ESP32 Connection Hub**.
3. Select the **Wired USB** tab.
4. Select the matching baud rate from the dropdown menu (Default: **115200** baud; supported alternatives: 9600, 19200, 38400, 57600).
5. Click **Connect USB Serial**.
6. A browser native device selector will appear. Select the serial port corresponding to the ESP32 (typically labeled `Silicon Labs CP210x`, `CH340`, or `USB JTAG/serial debug unit`) and click **Connect**.
7. Upon successful handshake, a green confirmation toast will appear stating: `Confirmed: ESP32 connected via USB Serial!`. The system status switches from Standby to Live Hardware.

### 3.2 Mode 2: Connecting via Wireless Bluetooth (Web Bluetooth BLE)
1. Ensure Bluetooth is enabled on the host computer or Android tablet.
2. Power on the ESP32 controller. The onboard BLE peripheral begins advertising the Nordic Semiconductor UART Service (`6e400001-b5a3-f393-e0a9-e50e24dcca9e`).
3. In the Connection Hub, select the **Bluetooth BLE** tab.
4. Click **Scan & Connect BLE**.
5. The browser pairing window will list nearby Bluetooth devices matching prefixes `ESP32`, `B-TEG`, `Padayon`, or `Node`.
6. Select your target device (e.g., `B-TEG-NODE-01`) and click **Pair**.
7. The dashboard negotiates the GATT server connection, enables notifications on characteristic TX (`6e400003-...`), and initiates telemetry streaming.

### 3.3 Mode 3: Connecting via Local Wi-Fi WebSocket
1. Power on the ESP32. If operating in field SoftAP mode, connect the operator phone or tablet to the Wi-Fi network `Padayon_BTEG_AP` (Password: `padayon2026`).
2. In the Connection Hub, select the **Wi-Fi** tab.
3. Enter the target WebSocket address (Default: `ws://192.168.4.1/ws`).
4. Click **Connect Wi-Fi Link**.
5. The dashboard establishes a persistent bi-directional WebSocket connection. If connection drops occur due to RF fading, the built-in exponential backoff system automatically attempts reconnection up to 8 times with delays from 1.5s to 15.0s.

### 3.4 Mode 4: Offline / Field Simulation Mode
If no physical microcontroller is connected, the dashboard automatically initializes and runs its internal physics simulation engine:
- Generates realistic thermal ramp-up and combustion jitter.
- Simulates Seebeck voltage generation above 40.0°C differential ($\Delta T$).
- Models LiFePO4 battery charging and discharging dynamics via Coulomb integration.
- Provides test scenario presets (`normal`, `tegPeak`, `lowHeat`, `overheat`, `lowBatt`) and manual parameter sliders for operator training and bench demonstrations.

---

## 4. Operator Monitoring Procedures

The dashboard is structured into four primary tabs accessible via the bottom navigation bar: **Overview**, **Sensors**, **Service**, and **Logs**.

```
+--------------------------------------------------------------+
| B-TEG CORE v2.0              Node #01 • Wawa Dam  [LIVE HW]  |
| 10:24:32 AM PHT · Thu, Oct 15                     [FIL / EN] |
+--------------------------------------------------------------+
| [✓] SYSTEM GOOD: RUNNING                                     |
+--------------------------------------------------------------+
| DC MAIN POWER: [ON]   CURRENT LOAD: 16.8 W                   |
| - Tier 1 Emergency Light: GUARDED ON (4.8W)                  |
| - Tier 2 Cooling Fans:    ACTIVE (12.0W)                     |
+--------------------------------------------------------------+
| BATTERY: 85% (13.20V) | TEG GEN: 5.8 W                       |
| HEAT DIFF: 142 °C     | COOLING SINK: 38 °C                  |
+--------------------------------------------------------------+
| ENVIRONMENT: CO 14.2 PPM (NOMINAL) | DHT22: 28.5°C, 68% RH   |
| FUEL HOPPER: IDLE (18 Cycles)      | [PULSE FEED]            |
+--------------------------------------------------------------+
| [ Overview ]    [ Sensors ]    [ Service ]    [ Logs (50) ]  |
+--------------------------------------------------------------+
```

### 4.1 Overview Tab Procedures
1. **System Status Banner:** Located at the top of the tab.
   - Green (`SYSTEM GOOD: RUNNING`): All thermal and electrical channels are within safe limits.
   - Amber (`SYSTEM DEFICIT: LOW FLAME`): Stove temperature is below 100.0°C; refuel the combustion chamber.
   - Red (`SYSTEM ALERT: CORE OVERHEAT`): Stove temperature has exceeded 230.0°C; engage radiator fans and reduce draft damper.
   - Red (`SYSTEM ALERT: LOW BATTERY CUTOFF`): Battery SoC is at or below 15%; automated load shedding has disconnected secondary auxiliary loads.
2. **DC Main Power & Load Card:**
   - **Master Toggle:** Controls the main DC bus relay. De-energizing the master switch cuts auxiliary loads, while critical lighting remains guarded.
   - **Current Load Readout:** Displays aggregate real-time power consumption in Watts ($P_{\text{load}} = P_{\text{lights}} + P_{\text{fans}} + P_{\text{servo}} + P_{\text{aux}}$).
   - **Tier 1 Light Status:** Indicates guarded emergency LED status (4.8W).
   - **Tier 2 Fan Control:** Allows manual toggling of the 12W cold-side cooling fan, provided battery SoC is above 15%.
3. **Run Hours Card:**
   - Displays cumulative operational hours (e.g., 1,248 hrs).
   - Progress bar tracks progress toward the next routine inspection cycle (2,000 hrs overhaul target).
4. **2x2 Primary Telemetry Grid:**
   - **BATTERY:** Displays real-time state of charge percentage and terminal voltage ($V_{\text{batt}}$) based on the 10.0V to 14.6V LiFePO4 profile.
   - **TEG GEN:** Real-time electrical generation in Watts ($P_{\text{teg}} = V_{\text{teg}} \cdot I_{\text{teg}}$).
   - **HEAT DIFF:** Live temperature differential ($\Delta T = T_{\text{hot}} - T_{\text{cold}}$) driving Seebeck energy harvest.
   - **COOLING:** Cold junction heatsink water face temperature.
5. **Environment and Site Safety Card:**
   - **MQ-7 Carbon Monoxide Gauge:** Displays real-time PPM. Safe: <50 PPM (Green); Warning: 50 to 100 PPM (Amber); Alarm: >100 PPM (Red).
   - **DHT22 Ambient Air Conditions:** Displays dry-bulb temperature and relative humidity percentage.
6. **Fuel Hopper Servo Control:**
   - Displays total automated feeding cycles.
   - **PULSE FEED Button:** Sends a momentary 1.2-second actuation command (`{"cmd": "FEED_SERVO"}`) to the mechanical fuel feeder auger/gate.

### 4.2 Sensors Tab Procedures
1. **Battery Terminal Gauge:** Provides a high-precision digital display of DC bus voltage.
2. **5-Minute Power Trend Chart:**
   - Renders a continuous SVG trend curve comparing electrical load against generation over a 5-minute rolling window.
   - Y-axis scales from 0 to 40 Watts.
   - Time markers are labeled in 5-minute increments.
3. **Power Output Comparison Tiles:** Side-by-side comparison of load demand (Watts) versus TEG generation (Watts).
4. **4-Channel Load Controller Breakdown:**
   - **Channel 1:** 12V LED Critical Light (Non-sheddable, ~400 mA).
   - **Channel 2:** Cold-Side Water Fan (Sheddable, ~1000 mA).
   - **Channel 3:** Hopper Fuel Feed Servo (Sheddable, ~650 mA during pulse).
   - **Channel 4:** 5V USB Charging Ports (Sheddable, ~415 mA).

---

## 5. Sensor Calibration Procedures

The application contains an integrated **Sensor Calibration Studio** located in the **Service** tab under **Sensor Calibration -> Open Studio**. This module allows operators to calibrate analog front-end sensors, tune zero-drift offsets, set safety trip points, save profiles to local browser storage, and dispatch updated coefficients directly to the ESP32 microcontroller EEPROM.

```
+--------------------------------------------------------------+
|                 Sensor Calibration Studio                    |
|                                                              |
| 1. Stove Thermocouple (MAX6675 / MAX31855)                   |
|    Raw: 185.0°C -> Cal: 185.0°C                              |
|    [ Set 0.0°C Ice Bath ]        [ Set 100.0°C Boiling ]     |
|    Zero Offset: [ 0.0 ] °C       Gain: [ 1.000 ] x           |
|    Overheat Trip: [ 230 ] °C     Low Heat Floor: [ 100 ] °C  |
|                                                              |
| 2. Cold Sink Ambient (DHT11 / DHT22)                         |
|    Temp Offset: [ 0.0 ] °C       Humidity Offset: [ 0.0 ] %  |
|                                                              |
| 3. Battery Divider ADC (LiFePO4 Profile)                     |
|    Cutoff Vmin: [ 10.0 ] V       Full Vmax: [ 14.6 ] V       |
|    Divider Gain: [ 1.000 ] x                                 |
|                                                              |
| 4. Current Sensor (ACS712 / INA219)                          |
|    [ Tare Current to Zero ] (10 samples averaging)           |
|    Zero Offset: [ 0.00 ] A       Gain: [ 1.000 ] x           |
|                                                              |
| [ Save to Storage ]              [ Send to ESP32 ]           |
| [ Export C++ Header ]            [ Reset Defaults ]          |
+--------------------------------------------------------------+
```

### 5.1 Two-Point Thermocouple Calibration (MAX31855 / MAX6675)
The transfer function follows the linear relationship:
$$T_{\text{calibrated}} = (T_{\text{raw}} \cdot m_{\text{stove}}) + b_{\text{stove}}$$

#### Step 1: Zero-Point Calibration (Ice Bath Reference)
1. Prepare a thermal equilibrium ice bath using crushed distilled ice and pure water in an insulated container.
2. Submerge the hot-junction probe tip into the ice bath without contacting container walls.
3. Allow the raw temperature reading to stabilize (approximately 60 to 90 seconds).
4. Click **Set 0.0°C Ice Bath**.
5. The studio computes the required zero offset:
   $$b_{\text{stove}} = 0.0 - T_{\text{raw}}$$
   and updates the offset field.

#### Step 2: Boiling Water Span Calibration (100.0°C Reference)
1. Bring distilled water to a vigorous boil at standard atmospheric pressure (100.0°C at sea level; adjust for elevation if testing at Upper Wawa Dam, approx. 99.7°C at 90m ASL).
2. Submerge the probe tip into the boiling water.
3. Allow the reading to stabilize.
4. Click **Set 100.0°C Boiling**.
5. The studio computes the gain multiplier:
   $$m_{\text{stove}} = \frac{100.0}{T_{\text{raw}} + b_{\text{stove}}}$$
   and updates the gain field.

### 5.2 Cold Sink and Ambient Sensor Calibration (DHT11 / DHT22)
1. Place a certified reference digital hygrometer/thermometer adjacent to the cold junction dry-bulb intake.
2. Compare ambient temperature and relative humidity values.
3. Enter the difference in the **Temperature Offset (°C)** and **Humidity Offset (%)** input boxes.

### 5.3 Battery ADC Voltage Divider Calibration
1. Measure terminal voltage across the LiFePO4 battery terminals using a calibrated digital multimeter (DMM).
2. Compare the DMM reading to the dashboard bus voltage reading.
3. Adjust **Divider Gain** until the calibrated voltage matches the DMM value within $\pm 0.02\text{ V}$.
4. Verify that **Cutoff Vmin** is set to 10.0V (0% SoC cutoff) and **Full Vmax** is set to 14.6V (100% absorption).

### 5.4 ACS712 / INA219 Current Sensor Zero-Tare
Hall-effect current sensors (e.g., ACS712) suffer from thermal zero-point drift:
1. Ensure the TEG generator is isolated and no current is flowing through the sensing rail ($I = 0.00\text{ A}$).
2. Click **Tare Current to Zero**.
3. The dashboard samples 10 consecutive ADC readings, averages the quiescent baseline, and sets `tegCurrentZeroOffset` equal to the measured drift.

### 5.5 Committing and Flashing Calibration Profiles
The operator can execute four actions using the 2x2 action grid:
- **Save to Storage:** Persists parameters to browser `localStorage` under key `padayon_calibration_v3`.
- **Send to ESP32:** Transmits a downlink JSON packet (`{"cmd": "CALIB", "config": {...}}`) over the active Serial, BLE, or WebSocket link to save parameters to the microcontroller EEPROM/NVS.
- **Export C++ Header:** Copies a complete Arduino/ESP32 C++ configuration header (`PADAYON_CALIBRATION_H`) to the system clipboard for flashing directly into firmware source code.
- **Reset Defaults:** Reverts all parameters to factory defaults (Stove Offset: 0.0, Gain: 1.0; Battery: 10.0V to 14.6V; Cutoff: 15%).

---

## 6. Service and Safety Operations

### 6.1 Weekly Maintenance Checklist
Under the **Service** tab, operators must verify four recurring weekly inspection items:
1. **Clean TEG Heat Sink:** Remove accumulated soot, fly ash, and biological debris from the cold-face liquid block and air radiator fins.
2. **Check Battery Terminals:** Inspect 12V LiFePO4 M8 terminal lugs for corrosion, thermal discoloration, and mechanical torque.
3. **Inspect Cooling Pipes:** Check flexible silicone cooling hoses for micro-leaking, kinks, air pockets, and coolant level in the reservoir.
4. **Verify Load Connections:** Inspect screw terminal blocks on the 4-channel load distributor for loose conductors.

### 6.2 Service Interval Milestones
- **Last Service:** Recorded at 1,200 operating hours.
- **Next Service:** Scheduled at 1,500 operating hours.
- **Major Overhaul:** Mandatory teardown and thermal paste replacement at 2,000 operating hours.

### 6.3 Diagnostic and Event Logging
The **Logs** tab maintains a continuous, real-time circular log buffer capped at 50 events:
- **Timestamp Formatting:** Strictly formatted as `YYYY-MM-DD HH:mm` in Asia/Manila Standard Time (PHT, UTC+8).
- **Log Levels:**
  - `INFO` (Green): Normal operational events (e.g., system start, hardware link established, thermal stabilization).
  - `WARNING` (Amber): Non-critical anomalies (e.g., low flame < 100°C, high ambient temperature, hardware disconnection).
  - `ERROR` (Red): Safety threshold breaches (e.g., core overheat > 230°C, battery deep-discharge < 20%, hardware interface fault).
- **Filter Pills:** Operators can isolate events by selecting **ALL**, **INFO**, **WARN**, or **ERROR**.
- **CSV Export:** Click **EXPORT CSV** to trigger an immediate browser download of all historical sensor telemetry points formatted for thesis research analysis (Timestamp, Run_ID, Feedstock, Hot_Side_C, Cold_Side_C, Delta_T_C, Ambient_C, TEG_Voltage_V, TEG_Current_mA, TEG_Power_W, Batt_Voltage_V, Batt_Current_mA, Load_Power_W, SoC_Pct, Aux_Load_State).

---

## 7. Field Troubleshooting Guide

| Symptom / Alert | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **Dashboard displays `NaN` or 0.0°C for Stove Temp** | Thermocouple disconnected, probe wire severed, or MAX31855 SPI clock line loose. | 1. Check screw terminals on MAX31855 breakout board.<br>2. Verify probe continuity using a multimeter.<br>3. Inspect hardware raw logs for `sensorFault: true`. |
| **`SYSTEM ALERT: CORE OVERHEAT` (> 230°C)** | Insufficient liquid cooling, excessive fuel feed, or stuck primary damper. | 1. Verify cold-side water fan is running.<br>2. Manually toggle fans in Overview tab.<br>3. Close the combustion air intake damper.<br>4. Do NOT dump cold water directly onto hot ceramic stove body (thermal shock hazard). |
| **`SYSTEM ALERT: LOW BATTERY CUTOFF` (<= 15%)** | Prolonged operation without adequate TEG generation, or excessive auxiliary USB load. | 1. Secondary loads (fans/USB) will automatically shed.<br>2. Verify stove flame is sustained above 160°C to allow TEG recharging.<br>3. Verify critical light remains functional. |
| **Serial Connection Fails / Port Not Detected** | Missing CP210x/CH340 USB drivers, faulty USB cable (charging-only), or permission denied. | 1. Ensure USB cable supports data transfer.<br>2. Check Device Manager (Windows) for recognized COM port.<br>3. Use Chromium browser (Chrome or Edge). |
| **Bluetooth Scan Shows No Devices** | ESP32 BLE peripheral crashed, device out of range, or Bluetooth disabled on host. | 1. Restart ESP32 power.<br>2. Confirm host computer Bluetooth is enabled.<br>3. Ensure distance to node is under 10 meters. |
| **Wi-Fi WebSocket Keeps Reconnecting** | Weak Wi-Fi signal, IP address conflict, or ESP32 SoftAP overloaded. | 1. Move closer to the ESP32 node.<br>2. Confirm Wi-Fi network connection to `Padayon_BTEG_AP`.<br>3. Verify IP address `ws://192.168.4.1/ws` in connection settings. |
| **CO Gas Concentration Exceeds 50 PPM** | Fuel smoldering, insufficient chimney draft, or wet biomass feedstock. | 1. Open shelter ventilation dampers immediately.<br>2. If CO > 100 PPM, evacuate shelter.<br>3. Inspect flue pipe for soot accumulation. |

---

## 8. Technical Glossary

- **Seebeck Effect:** Direct conversion of temperature differences directly into electrical energy at the junction of two dissimilar semiconductors.
- **TEG (Thermoelectric Generator):** Solid-state semiconductor module (typically Bismuth Telluride, Bi2Te3) that produces electric power when exposed to a thermal gradient.
- **Hot Junction ($T_{\text{hot}}$):** The ceramic heat-absorbing face of the TEG in direct thermal contact with the biomass combustion chamber.
- **Cold Junction ($T_{\text{cold}}$):** The ceramic heat-rejecting face of the TEG mounted to the liquid-cooled heatsink.
- **Temperature Gradient ($\Delta T$):** The differential temperature ($T_{\text{hot}} - T_{\text{cold}}$) directly proportional to the generated Seebeck voltage.
- **LiFePO4:** Lithium Iron Phosphate battery chemistry characterized by high thermal stability, long cycle life (2,000+ cycles), and a flat discharge voltage curve (nominal 12.8V).
- **State of Charge (SoC):** The available battery capacity expressed as a percentage of total rated capacity (50 Amp-hours).
- **Two-Tier Load Management:** Architectural safety strategy separating non-sheddable life-safety loads (Tier 1 emergency lighting) from non-critical sheddable loads (Tier 2 fans and auxiliary USB).
- **Web Serial API:** W3C browser specification enabling web applications to read and write directly to serial devices over USB/UART.
- **Web Bluetooth API:** W3C specification allowing web applications to discover, pair, and exchange data with Bluetooth Low Energy (BLE) GATT peripherals.
- **GATT (Generic Attribute Profile):** BLE protocol defining service and characteristic hierarchies for wireless data exchange.
- **Baud Rate:** The data transmission rate in symbols per second (bits per second) across a serial link (default 115,200 baud).
- **INA219:** High-side I2C current and voltage sensing integrated circuit capable of bidirectional current measurement across a precision shunt resistor.
- **MQ-7:** Electrochemical tin-dioxide ($SnO_2$) sensor specifically sensitive to Carbon Monoxide gas concentrations in air.
