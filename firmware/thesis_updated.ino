/*
  Biomass Gasifier + TEG Charger - DUAL-MODE FIRMWARE (ESP32, Arduino IDE)
  Matched to Fritzing Schematic: "ThesisScetch_2.fzz"  (ACS712-5A current sensor on GPIO35, 16x2 I2C LCD)
  Battery Profile: Tianneng TNE12-15 (12 V, 15 Ah VRLA AGM-Gel)
  Connected to React PWA "Thesis Energy Dashboard"

  BLE UART: connect from a Web Bluetooth capable browser to "TEG_Charger" using the Nordic UART Service UUIDs below.
  RX accepts commands; TX sends newline-delimited telemetry and status text as notifications.
  Arduino IDE: Tools > Partition Scheme > "Huge APP (3MB No OTA/1MB SPIFFS)", otherwise the sketch is too big.
  The USB Serial Monitor keeps working exactly as before.

  Baud rate: 115200 (Line ending: "Newline")
  Transports: USB Web Serial + BLE UART (Standard human-readable text + structured JSON stream)

  SCHEMATIC PIN MAP (Verified against ThesisScetch_2.fzz netlist):
    GPIO21            I2C SDA : 16x2 LCD (0x27 or 0x3F, found automatically)
    GPIO22            I2C SCL : 16x2 LCD
    ACS712 OUT        R17 10k series -> GPIO35, R18 15k from GPIO35 to GND
    GPIO32 (ADC4)     Battery divider 47k (R9) / 10k (R10) -> Ratio 5.7x + 0.1uF cap
    GPIO33 (ADC5)     TEG divider 150k (R11) / 10k (R12)  -> Ratio 16.0x + 0.1uF cap
    GPIO5             MAX31855 Hot-side Thermocouple CS
    GPIO17            MAX31855/56 Cold-side Thermocouple CS
    GPIO18            Shared SPI SCK (CLK)
    GPIO19            Shared SPI MISO (DO)
    GPIO23            DHT22 Data (with 10k R2 pull-up to 3.3V)
    GPIO14            1-Channel Relay IN (M2, active LOW, COM -> NO)
    GPIO12            Buzzer
    GPIO25            LED1 Green (with 220 ohm R14)
    GPIO26            LED2 Yellow (with 220 ohm R15)
    GPIO27            LED3 Red (with 220 ohm R16)
    GPIO35            ACS712 current sensor output (ADC1, input-only pin)
*/

#include <Wire.h>
#include <SPI.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MAX31855.h>
#include <DHT.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled for this board. Enable BLE in the ESP32 Arduino board configuration.
#endif

// ---------------- BLE UART (Nordic UART Service) ----------------
static const char *BLE_NAME = "TEG_Charger";
static const char *BLE_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *BLE_RX_UUID      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // browser writes commands here
static const char *BLE_TX_UUID      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // device notifies output here
static const size_t BLE_CHUNK_SIZE  = 20; // safe with the default ATT MTU
BLEServer *bleServer = nullptr;
BLECharacteristic *bleTx = nullptr;
QueueHandle_t bleRxQueue = nullptr;
volatile bool bleConnected = false;
volatile bool bleConnectionChanged = false;
bool bleReady = false;
uint8_t bleTxChunk[BLE_CHUNK_SIZE];
size_t bleTxLength = 0;

void flushBleOutput() {
  if (!bleTx || !bleConnected || bleTxLength == 0) {
    bleTxLength = 0;
    return;
  }
  bleTx->setValue(bleTxChunk, bleTxLength);
  bleTx->notify();
  bleTxLength = 0;
  delay(2);
}

void queueBleOutput(uint8_t c) {
  if (!bleTx || !bleConnected) {
    bleTxLength = 0;
    return;
  }
  bleTxChunk[bleTxLength++] = c;
  if (bleTxLength >= BLE_CHUNK_SIZE || c == '\n') flushBleOutput();
}

class BleServerEvents : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    bleConnected = true;
    bleConnectionChanged = true;
  }
  void onDisconnect(BLEServer *server) override {
    bleConnected = false;
    bleConnectionChanged = true;
  }
};

class BleCommandInput : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    if (!bleRxQueue) return;
    auto value = characteristic->getValue();
    for (size_t i = 0; i < value.length(); ++i) {
      char c = value[i];
      xQueueSend(bleRxQueue, &c, 0);
    }
  }
};

bool startBleUart() {
  bleRxQueue = xQueueCreate(128, sizeof(char));
  if (!bleRxQueue) return false;

  BLEDevice::init(BLE_NAME);
  bleServer = BLEDevice::createServer();
  if (!bleServer) return false;
  bleServer->setCallbacks(new BleServerEvents());

  BLEService *service = bleServer->createService(BLE_SERVICE_UUID);
  if (!service) return false;

  bleTx = service->createCharacteristic(BLE_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  bleTx->addDescriptor(new BLE2902());

  BLECharacteristic *rx = service->createCharacteristic(
    BLE_RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new BleCommandInput());

  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
  return true;
}

// ---------------- Mirror output to USB Serial and BLE TX notifications ----------------
class MirrorOut : public Print {
 public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    queueBleOutput(c);
    return 1;
  }
  size_t write(const uint8_t *b, size_t n) override {
    Serial.write(b, n);
    for (size_t i = 0; i < n; ++i) queueBleOutput(b[i]);
    return n;
  }
} Out;

// ---------------- pins ----------------
const uint8_t PIN_RELAY = 14;
const uint8_t PIN_VBAT  = 32;
const uint8_t PIN_VTEG  = 33;
const uint8_t PIN_ACS   = 35;  // ACS712 output (after R17/R18 divider). GPIO35 = ADC1, works with BLE.
const uint8_t PIN_DHT   = 23;
const uint8_t PIN_BUZZ  = 12;
const uint8_t PIN_LED_G = 25;
const uint8_t PIN_LED_Y = 26;
const uint8_t PIN_LED_R = 27;
const int PIN_CS_HOT    = 5;
const int PIN_CS_COLD   = 17;
const int PIN_SCK       = 18;
const int PIN_MISO      = 19;
const uint8_t LCD_ADDR_A = 0x27;
const uint8_t LCD_ADDR_B = 0x3F;
#define RELAY_ACTIVE_LOW 1

// ---------------- calibration factors ----------------
const float K_BAT = (47.0f + 10.0f) / 10.0f;   // 5.7  (R9=47k, R10=10k)
const float K_TEG = (150.0f + 10.0f) / 10.0f;  // 16.0 (R11=150k, R12=10k)

const float BAT_TRIM   = 1.1011f;
const float TEG_TRIM   = 1.1679f;
const float I_DEADBAND = 0.08f;                // readings below this show as 0 (ACS712 noise)

float batTrim = BAT_TRIM, tegTrim = TEG_TRIM, curTrim = 1.0f;
float rawI = 0, whHarv = 0, pHarv = 0, vTegPeak = 0;
float rawBat = 0, rawTeg = 0;
Preferences prefs;

// ---------------- ACS712-5A current sensor (analog, post-buck charging path) ----------------
const float R_ACS_SERIES_K = 10.0f;            // R17: sensor OUT -> GPIO35 (kilo-ohms)
const float R_ACS_GND_K    = 15.0f;            // R18: GPIO35 -> GND (kilo-ohms)
const float ACS_K          = (R_ACS_SERIES_K + R_ACS_GND_K) / R_ACS_GND_K;
const float ACS_ZERO_MIN   = 2.30f, ACS_ZERO_MAX = 2.70f;
const float ACS_V_PER_A    = 0.185f;           // ACS712-5A = 185 mV/A
const int   CURRENT_SIGN   = +1;               // set to -1 if charge current reads negative
float acsVolts = 2.5f, acsZero = 2.5f;
bool acsOK = false;

// ---------------- limits (Tianneng TNE12-15 12V 15Ah AGM-Gel + LM2596) ----------------
const float V_BAT_OPEN  = 14.60f;              // Cycle lower bound @ 25 C (-24 mV/C)
const float V_BAT_CLOSE = 12.90f;              // Open-circuit reconnect @ 25 C (-18 mV/C -> ~12.75 V @ 33.6 C)
const float V_BAT_HARD  = 14.80f;              // Cycle upper bound @ 25 C (-24 mV/C)
const float V_BAT_LOW_WARN  = 11.8f;
const float V_BAT_VALID_MIN = 6.0f, V_BAT_VALID_MAX = 16.5f;

const float TEMP_COMP_CYCLE_V_PER_C = 0.024f;  // -24 mV/C per TNE12-15 datasheet
const float TEMP_COMP_FLOAT_V_PER_C = 0.018f;  // -18 mV/C per TNE12-15 datasheet
const float V_BAT_OPEN_NO_TEMP      = 14.2f;   // conservative fallback display if DHT22 missing
const float BAT_TEMP_MIN_C          = 0.0f;    // TNE12-15 charge window: 0 to 40 C
const float BAT_TEMP_STOP_C         = 40.0f;
const float BAT_TEMP_RESUME_C       = 37.0f;

const float I_OVER_A       = 2.25f;            // <= 0.15 CA per TNE12-15 datasheet
const uint32_t I_OVER_MS   = 2000UL;
const float TEG_V_ALARM    = 38.0f;            // safely below LM2596 40 V rated max input
const float TEG_PRESENT_V  = 1.0f;
const float HOT_ALARM_C    = 150.0f;           // target operating limit (set 230.0f for max-TEG-only alarm)
const float COLD_ALARM_C   = 60.0f;

const uint32_t RECONNECT_DWELL_MS  = 60000UL;  // 1 min cooldown for non-full pauses
const uint32_t FULL_HOLD_MS        = 300000UL; // 5 min FULL-HOLD (use 960000UL for 16 min if exporting 15M CSV)
const float    I_TAPER_MAX_A       = 0.20f;    // taper-end current near full voltage (TNE12-15 float trickle)
const uint32_t TAPER_DISCONNECT_MS = 180000UL; // 3 min taper confirmation near full voltage
uint32_t tLowCurrent = 0;

#define WDT_SECONDS 8
const uint32_t PRINT_MS = 1000;
float filtBat = 0.0f;
float filtTeg = 0.0f;
bool firstFilter = true;

// ---------------- state ----------------
LiquidCrystal_I2C *lcd = nullptr;
Adafruit_MAX31855 tcHot(PIN_SCK, PIN_CS_HOT, PIN_MISO);
Adafruit_MAX31855 tcCold(PIN_SCK, PIN_CS_COLD, PIN_MISO);
DHT dht(PIN_DHT, DHT22);

bool lcdOK = false, relayOn = false, muted = false, detailed = false, jsonMode = false;
float vBat = 0, vTeg = 0, iTeg = 0, pBat = 0, pTeg = 0, whTotal = 0, tHot = -1, tCold = -1, tAmb = -1, hum = -1;
bool hotFault = true, coldFault = true;
const char *hotWhy = "not read yet", *coldWhy = "not read yet";
int state = 0, forceMode = 0, batPctNow = 0;
bool overcurrentLatched = false, batHot = false, batCold = false, dhtOK = false;
bool dwellActive = false, fullHoldActive = false, fullLatched = false;
uint32_t tOver = 0, tDhtGood = 0, tLast = 0, tPrint = 0, tLcd = 0, tSense = 0, tDht = 0, tOpened = 0, tTest = 0;
float vOpenNow = V_BAT_OPEN, vCloseNow = V_BAT_CLOSE, vHardNow = V_BAT_HARD;
String lineBuf;
String bleLineBuf;
uint32_t tBleRx = 0;
int lastState = -1;
uint16_t lastAlarms = 0;

// alarm bits
enum { A_LOWBAT = 1, A_HIGHBAT = 2, A_HOT = 8, A_TEGV = 16, A_HOTTC = 32, A_COLDTC = 64, A_BATTEMP = 128, A_OVERI = 256, A_DHT = 512, A_COLD = 1024, A_ACS = 2048 };
const struct { uint16_t bit; const char *name; bool critical; } ALARMS[] = {
  {A_LOWBAT,  "battery low (<11.8 V)", false},
  {A_HIGHBAT, "battery at charge limit", false},
  {A_HOT,     "hot side over 150 C", true},
  {A_TEGV,    "TEG voltage over 38 V (near LM2596 limit)", true},
  {A_HOTTC,   "hot thermocouple fault", false},
  {A_COLDTC,  "cold thermocouple fault", false},
  {A_BATTEMP, "battery-area temperature outside 0-40 C range", true},
  {A_OVERI,   "overcurrent latched (send r)", true},
  {A_DHT,     "DHT22 not reading", false},
  {A_COLD,    "cold side over 60 C", true},
  {A_ACS,     "current sensor not OK (check GPIO35 wiring)", false}
};
const int N_ALARMS = sizeof(ALARMS) / sizeof(ALARMS[0]);

// ---------------- helpers ----------------
void relayWrite(bool on) {
  relayOn = on;
#if RELAY_ACTIVE_LOW
  digitalWrite(PIN_RELAY, on ? LOW : HIGH);
#else
  digitalWrite(PIN_RELAY, on ? HIGH : LOW);
#endif
  if (!on) {
    iTeg = 0.0f;
    pBat = 0.0f;
    pTeg = 0.0f;
    pHarv = 0.0f;
  }
}

float readPinV(uint8_t pin) {
  uint32_t sum = 0;
  for (int i = 0; i < 64; i++) {
    sum += analogReadMilliVolts(pin);
  }
  return (sum / 64.0f) / 1000.0f;
}

float readPinVStable(uint8_t pin) {            // median of 9 short bursts: ignores radio/ADC spikes
  float burst[9];
  for (int b = 0; b < 9; b++) {
    uint32_t sum = 0;
    for (int i = 0; i < 16; i++) { sum += analogReadMilliVolts(pin); delayMicroseconds(40); }
    burst[b] = sum / 16.0f;
    delayMicroseconds(1500);
  }
  for (int i = 1; i < 9; i++) {
    float v = burst[i];
    int j = i - 1;
    while (j >= 0 && burst[j] > v) { burst[j + 1] = burst[j]; j--; }
    burst[j + 1] = v;
  }
  return ((burst[2] + burst[3] + burst[4] + burst[5] + burst[6]) / 5.0f) / 1000.0f;
}

void stamp(char *buf, size_t n) {
  uint32_t s = millis() / 1000;
  uint32_t h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
  snprintf(buf, n, "%02u:%02u:%02u", h, m, sec);
}

void writeJsonString(const char *value) {
  Out.write('"');
  while (*value) {
    uint8_t c = (uint8_t)*value++;
    if (c == '"' || c == '\\') {
      Out.write('\\');
      Out.write(c);
    } else if (c == '\n') {
      Out.print("\\n");
    } else if (c == '\r') {
      Out.print("\\r");
    } else if (c == '\t') {
      Out.print("\\t");
    } else if (c < 0x20) {
      char escaped[7];
      snprintf(escaped, sizeof(escaped), "\\u%04X", c);
      Out.print(escaped);
    } else {
      Out.write(c);
    }
  }
  Out.write('"');
}

void event(const char *msg) {
  char t[12]; stamp(t, sizeof(t));
  if (jsonMode) {
    Out.print("{\"type\":\"event\",\"timestamp\":");
    writeJsonString(t);
    Out.print(",\"message\":");
    writeJsonString(msg);
    Out.println("}");
  } else {
    Out.printf("[%s] >>> %s\n", t, msg);
  }
}

const char* stateName() {
  switch (state) {
    case 0: return "NO BATTERY ";
    case 1: return "CHARGING   ";
    case 2: return "FULL-HOLD  ";
    case 3: return "WAITING    ";
    case 4: return "FORCED OFF ";
    case 5: return "TEMP LOCKOUT";
    case 6: return "OVERCURRENT";
    case 7: return "FULL       ";
    default: return "UNKNOWN    ";
  }
}

const char* stateReason() {
  switch (state) {
    case 0: return "voltage out of range (6-16.5 V)";
    case 1: return "normal charging";
    case 2: return "post-cutoff stabilization hold";
    case 3: return "waiting for TEG voltage or dwell timer";
    case 4: return "manually disabled (send a)";
    case 5: return "temperature sensor missing or battery area outside 0-40 C charge range";
    case 6: return "current at or above 2.25 A (send r)";
    case 7: return "battery full; waiting for discharge <= reconnect limit";
    default: return "";
  }
}

uint16_t alarmMask() {
  uint16_t m = 0;
  if (vBat > 0.5f && vBat < V_BAT_LOW_WARN) m |= A_LOWBAT;
  if (vBat >= vOpenNow) m |= A_HIGHBAT;
  if (!hotFault && tHot > HOT_ALARM_C) m |= A_HOT;
  if (!coldFault && tCold > COLD_ALARM_C) m |= A_COLD;
  if (vTeg > TEG_V_ALARM) m |= A_TEGV;
  if (hotFault) m |= A_HOTTC;
  if (coldFault) m |= A_COLDTC;
  if (batHot || batCold) m |= A_BATTEMP;
  if (overcurrentLatched) m |= A_OVERI;
  if (!dhtOK) m |= A_DHT;
  if (!acsOK) m |= A_ACS;
  return m;
}

void alarmText(uint16_t mask, char *buf, size_t n) {
  buf[0] = 0;
  if (mask == 0) { snprintf(buf, n, "NONE"); return; }
  for (int i = 0; i < N_ALARMS; i++) {
    if (mask & ALARMS[i].bit) {
      if (strlen(buf) > 0) strncat(buf, ", ", n - strlen(buf) - 1);
      strncat(buf, ALARMS[i].name, n - strlen(buf) - 1);
    }
  }
}

// ---------------- ACS712 reading ----------------
float readPinMv(uint8_t pin) {                 // calibrated millivolt reading, 64-sample average
  uint32_t sum = 0;
  for (int i = 0; i < 64; i++) { sum += analogReadMilliVolts(pin); delayMicroseconds(100); }
  return sum / 64.0f / 1000.0f;                // volts
}

// ---------------- sensor reading ----------------
void readSensors() {
  rawBat = readPinV(PIN_VBAT) * K_BAT;
  vBat   = rawBat * batTrim;

  rawTeg = readPinVStable(PIN_VTEG) * K_TEG;
  vTeg   = rawTeg * tegTrim;

  if (firstFilter) {
    filtBat = vBat;
    filtTeg = vTeg;
    firstFilter = false;
  } else {
    filtBat = (0.8f * filtBat) + (0.2f * vBat);
    filtTeg = (0.7f * filtTeg) + (0.3f * vTeg);
  }

  vBat = filtBat;
  vTeg = filtTeg;
  if (vTeg < 2.50f) vTeg = 0.0f;
  if (vTeg > vTegPeak) vTegPeak = vTeg;

  // Current sensing via ACS712-5A (post-buck battery charging path)
  acsVolts = readPinMv(PIN_ACS) * ACS_K;
  bool inWindow = (acsVolts >= ACS_ZERO_MIN && acsVolts <= ACS_ZERO_MAX);
  if (!relayOn && inWindow) {
    if (!acsOK) acsZero = acsVolts;
    else acsZero += (acsVolts - acsZero) * 0.05f;
  }
  acsOK = (acsZero >= ACS_ZERO_MIN && acsZero <= ACS_ZERO_MAX);
  rawI  = acsOK ? CURRENT_SIGN * (acsVolts - acsZero) / ACS_V_PER_A : 0.0f;

  if (!acsOK || !relayOn || rawI < I_DEADBAND) iTeg = 0.0f;
  else iTeg = rawI * curTrim;

  // Note: pBat / whTotal reflect true post-buck measured battery charging power/energy.
  pBat  = vBat * iTeg;
  pTeg  = vTeg * iTeg;
  pHarv = pBat;  // track battery-delivered power for consistent Wh accounting

  double h = tcHot.readCelsius();
  uint8_t efHot = tcHot.readError();
  if (isnan(h) || efHot) {
    hotFault = true;
    if (efHot & MAX31855_FAULT_OPEN) hotWhy = "open circuit / disconnected";
    else if (efHot & MAX31855_FAULT_SHORT_GND) hotWhy = "shorted to GND";
    else if (efHot & MAX31855_FAULT_SHORT_VCC) hotWhy = "shorted to VCC";
    else hotWhy = "unknown fault";
  } else {
    hotFault = false; tHot = (float)h; hotWhy = "ok";
  }

  double c = tcCold.readCelsius();
  uint8_t efCold = tcCold.readError();
  if (isnan(c) || efCold) {
    coldFault = true;
    if (efCold & MAX31855_FAULT_OPEN) coldWhy = "open circuit / disconnected";
    else if (efCold & MAX31855_FAULT_SHORT_GND) coldWhy = "shorted to GND";
    else if (efCold & MAX31855_FAULT_SHORT_VCC) coldWhy = "shorted to VCC";
    else coldWhy = "unknown fault";
  } else {
    coldFault = false; tCold = (float)c; coldWhy = "ok";
  }

  uint32_t now = millis();
  if (now - tDht >= 2000) {
    tDht = now;
    float t  = dht.readTemperature();
    float hm = dht.readHumidity();
    if (!isnan(t) && !isnan(hm)) {
      tAmb = t; hum = hm; dhtOK = true; tDhtGood = now;
    } else if (now - tDhtGood > 10000) {
      dhtOK = false;
    }
  }

  // Tianneng TNE12-15 temperature compensation referenced to 25 C: cycle -24 mV/C, float/reconnect -18 mV/C.
  if (dhtOK) {
    float tempDelta = tAmb - 25.0f;
    vOpenNow  = V_BAT_OPEN  - tempDelta * TEMP_COMP_CYCLE_V_PER_C;
    vCloseNow = V_BAT_CLOSE - tempDelta * TEMP_COMP_FLOAT_V_PER_C;
    vHardNow  = V_BAT_HARD  - tempDelta * TEMP_COMP_CYCLE_V_PER_C;
  } else {
    vOpenNow  = V_BAT_OPEN_NO_TEMP;
    vCloseNow = V_BAT_CLOSE;
    vHardNow  = V_BAT_HARD;
  }

  if (dhtOK) {
    if (tAmb >= BAT_TEMP_STOP_C) batHot = true;
    else if (tAmb <= BAT_TEMP_RESUME_C) batHot = false;
    batCold = (tAmb < BAT_TEMP_MIN_C);
  } else {
    batHot = false;
    batCold = false;
  }
}

float filtBatPct = 0.0f;
bool firstBatPct = true;

float interpCurve(float x, const float *xs, const float *ys, int n) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (int i = 0; i < n - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      float span = xs[i + 1] - xs[i];
      if (span <= 0.0001f) return ys[i + 1];
      float frac = (x - xs[i]) / span;
      return ys[i] + frac * (ys[i + 1] - ys[i]);
    }
  }
  return ys[n - 1];
}

int getBatteryPercent() {
  if (state == 0 || vBat < V_BAT_VALID_MIN || vBat > V_BAT_VALID_MAX) {
    firstBatPct = true;
    filtBatPct = 0.0f;
    return 0;
  }

  if (state == 2 || state == 7) {
    filtBatPct = 100.0f;
    firstBatPct = false;
    return 100;
  }

  // Resting / Not-Charging OCV curve (12 V Tianneng TNE12-15 AGM-Gel)
  static const float vRest[]   = { 11.50f, 11.80f, 12.05f, 12.25f, 12.45f, 12.65f, 12.75f, 12.85f };
  static const float socRest[] = {  0.0f,  10.0f,  25.0f,  50.0f,  75.0f,  90.0f,  95.0f, 100.0f };

  // Active Charging base curve up to 14.00 V (+8% top-off as current tapers 0.35 A -> 0.20 A)
  static const float vChg[]    = { 12.20f, 12.70f, 13.20f, 13.60f, 14.00f };
  static const float socChg[]  = {  0.0f,  25.0f,  50.0f,  75.0f,  92.0f };

  bool chargingActive = (relayOn && acsOK && iTeg > 0.0f);
  float rawPct = 0.0f;

  if (chargingActive) {
    float effV = vBat - (iTeg * 0.15f);
    rawPct = interpCurve(effV, vChg, socChg, 5);

    const float taperStartA = 0.35f;
    if (vBat >= (vOpenNow - 0.15f) && iTeg < taperStartA) {
      float taperFrac = (taperStartA - iTeg) / (taperStartA - I_TAPER_MAX_A);
      if (taperFrac < 0.0f) taperFrac = 0.0f;
      if (taperFrac > 1.0f) taperFrac = 1.0f;
      rawPct += 8.0f * taperFrac;
    }
    if (vBat >= vOpenNow) rawPct = 100.0f;
  } else {
    rawPct = interpCurve(vBat, vRest, socRest, 8);
  }

  if (rawPct < 0.0f) rawPct = 0.0f;
  if (rawPct > 100.0f) rawPct = 100.0f;

  if (firstBatPct) {
    filtBatPct = rawPct;
    firstBatPct = false;
  } else {
    float target = (0.90f * filtBatPct) + (0.10f * rawPct);
    const float maxStepPerTick = 0.5f; // 250 ms loop -> max 2.0 %/sec
    float delta = target - filtBatPct;
    if (delta > maxStepPerTick) delta = maxStepPerTick;
    if (delta < -maxStepPerTick) delta = -maxStepPerTick;
    filtBatPct += delta;
  }

  int outPct = (int)(filtBatPct + 0.5f);
  if (outPct < 0) outPct = 0;
  if (outPct > 100) outPct = 100;
  return outPct;
}

// ---------------- charge control ----------------
void chargeControl() {
  uint32_t now = millis();

  if (!overcurrentLatched && iTeg >= I_OVER_A) {
    if (tOver == 0) tOver = now;
    else if (now - tOver >= I_OVER_MS) {
      overcurrentLatched = true;
      fullHoldActive = false;
      fullLatched = false;
      dwellActive = false;
      tLowCurrent = 0;
      relayWrite(false);
      state = 6;
      event("OVERCURRENT LATCHED (>= 2.25 A for 2 s). Relay OPEN. Send 'r' to clear.");
      return;
    }
  } else {
    tOver = 0;
  }

  if (overcurrentLatched) {
    state = 6;
    relayWrite(false);
    return;
  }

  if (vBat < V_BAT_VALID_MIN || vBat > V_BAT_VALID_MAX) {
    state = 0;
    relayWrite(false);
    dwellActive = false;
    fullHoldActive = false;
    fullLatched = false;
    tLowCurrent = 0;
    return;
  }

  if (!dhtOK || batHot || batCold) {
    state = 5;
    relayWrite(false);
    dwellActive = false;
    fullHoldActive = false;
    tLowCurrent = 0;
    return;
  }

  if (forceMode == 2) {
    state = 4;
    relayWrite(false);
    dwellActive = false;
    fullHoldActive = false;
    fullLatched = false;
    tLowCurrent = 0;
    return;
  }

  if (forceMode == 1) {
    if (vBat >= vHardNow) {
      state = 2;
      relayWrite(false);
    } else {
      state = 1;
      relayWrite(true);
    }
    dwellActive = false;
    fullHoldActive = false;
    fullLatched = false;
    tLowCurrent = 0;
    return;
  }

  // Automatic mode
  const float tegDropMargin  = 0.10f;
  const float tegStartMargin = 0.30f;

  if (relayOn) {
    if (vTeg < (vBat - tegDropMargin)) {
      tLowCurrent = 0;
      relayWrite(false);
      fullHoldActive = false;
      dwellActive = false;
      state = 3; // WAITING (TEG voltage dropped below battery)
      event("TEG voltage below battery voltage. Relay OPEN.");
    } else if (vBat >= vOpenNow || vBat >= vHardNow) {
      tLowCurrent = 0;
      relayWrite(false);
      state = 2; // FULL-HOLD
      dwellActive = true;
      fullHoldActive = true;
      fullLatched = true;
      tOpened = now;
      event("Battery reached TNE12-15 full voltage limit. Relay OPEN (5-min FULL-HOLD).");
    } else if (acsOK && vBat >= (vOpenNow - 0.15f) && iTeg <= I_TAPER_MAX_A) {
      if (tLowCurrent == 0) {
        tLowCurrent = now;
        state = 1;
      } else if (now - tLowCurrent >= TAPER_DISCONNECT_MS) {
        tLowCurrent = 0;
        relayWrite(false);
        state = 2; // FULL-HOLD
        dwellActive = true;
        fullHoldActive = true;
        fullLatched = true;
        tOpened = now;
        char msg[120];
        snprintf(msg, sizeof(msg), "Battery >= %.2fV and taper <= %.2fA for 3 min. Relay OPEN (5-min FULL-HOLD).",
                 vOpenNow - 0.15f, I_TAPER_MAX_A);
        event(msg);
      } else {
        state = 1;
      }
    } else {
      tLowCurrent = 0;
      state = 1;
    }
  } else {
    tLowCurrent = 0;
    relayWrite(false);

    // Step 1: Post-cutoff FULL-HOLD window (stays in state 2 for FULL_HOLD_MS)
    if (dwellActive) {
      uint32_t holdDuration = fullHoldActive ? FULL_HOLD_MS : RECONNECT_DWELL_MS;
      if ((uint32_t)(now - tOpened) < holdDuration) {
        state = fullHoldActive ? 2 : 3;
        return;
      }
      dwellActive = false;
      if (fullHoldActive) {
        fullHoldActive = false;
        state = 7; // Transition cleanly from FULL-HOLD -> FULL
        event("FULL-HOLD complete. Battery FULL (latched OPEN until <= reconnect limit).");
        return;
      }
    }

    // Step 2: Stay latched in FULL (state 7) until a load discharges battery to <= vCloseNow (12.90 V @ 25 C)
    if (fullLatched) {
      if (vBat <= vCloseNow) {
        fullLatched = false;
        event("Battery discharged to reconnect limit. Recharge unlocked.");
      } else {
        state = 7; // FULL
        return;
      }
    }

    // Step 3: Not latched full -> start/resume charging whenever below vOpenNow and TEG is ready
    if (vBat < vOpenNow && vTeg >= (vBat + tegStartMargin)) {
      relayWrite(true);
      state = 1;
      event("TEG ready and battery below full limit. Relay CLOSED (CHARGING).");
    } else {
      state = (vTeg < (vBat + tegStartMargin)) ? 3 : 7;
    }
  }
}

// ---------------- LCD Display (16x2 I2C) ----------------
void lcdLine(uint8_t row, const char *s) {
  char b[17]; snprintf(b, sizeof(b), "%-16.16s", s);
  lcd->setCursor(0, row); lcd->print(b);
}

void updateLcd() {
  if (!lcdOK) return;
  char l0[24], l1[24];
  if (vBat >= 10.0f) snprintf(l0, sizeof(l0), "T:%4.1fV B:%5.2fV", vTeg, vBat);
  else               snprintf(l0, sizeof(l0), "T:%4.1fV  B:%4.2fV", vTeg, vBat);
  snprintf(l1, sizeof(l1), "P:%4.1fW  I:%4.2fA", pBat, iTeg);
  lcdLine(0, l0); lcdLine(1, l1);
}

// ---------------- Serial / BLE Telemetry Output ----------------
void printStatus() {
  char t[12], al[160], sh[8], sc[8], sd[8], note[60] = "";
  stamp(t, sizeof(t));
  uint16_t a = alarmMask();
  alarmText(a, al, sizeof(al));
  if (hotFault) snprintf(sh, sizeof(sh), "---"); else snprintf(sh, sizeof(sh), "%.0f", tHot);
  if (coldFault) snprintf(sc, sizeof(sc), "---"); else snprintf(sc, sizeof(sc), "%.0f", tCold);
  if (hotFault || coldFault) snprintf(sd, sizeof(sd), "---"); else snprintf(sd, sizeof(sd), "%.0f", tHot - tCold);
  if (!acsOK) snprintf(note, sizeof(note), "  (current sensor not OK: check GPIO%u wiring)", PIN_ACS);
  else if (state == 1 && iTeg == 0) snprintf(note, sizeof(note), vTeg < vBat + 0.7f ? "  (TEG voltage too low to charge)" : "  (relay closed, no current yet)");

  if (jsonMode) {
    Out.printf("{\"type\":\"telemetry\",\"timestamp\":\"%s\",\"state\":%d,\"stateName\":\"%s\",\"vTeg\":%.2f,\"vBat\":%.2f,\"batPct\":%d,\"iBat\":%.2f,\"iTeg\":%.2f,\"pBat\":%.2f,\"pTeg\":%.2f,\"pHarv\":%.2f,\"whTotal\":%.3f,\"whHarv\":%.3f,\"vTegPeak\":%.2f,\"tHot\":%.1f,\"tCold\":%.1f,\"dT\":%.1f,\"tAmb\":%.1f,\"hum\":%.1f,\"relayOn\":%s,\"rawBat\":%.2f,\"rawTeg\":%.2f,\"rawI\":%.2f,\"batTrim\":%.4f,\"tegTrim\":%.4f,\"curTrim\":%.4f,\"inaOK\":%s,\"alarms\":%u,\"alarmText\":\"%s\"}\n",
      t, state, stateName(), vTeg, vBat, batPctNow, iTeg, iTeg, pBat, pTeg, pHarv, whTotal, whHarv, vTegPeak,
      hotFault ? -1.0f : tHot, coldFault ? -1.0f : tCold, (hotFault || coldFault) ? 0.0f : (tHot - tCold),
      dhtOK ? tAmb : -1.0f, dhtOK ? hum : -1.0f,
      relayOn ? "true" : "false",
      rawBat, rawTeg, rawI, batTrim, tegTrim, curTrim, acsOK ? "true" : "false", a, al);
    return;
  }

  if (!detailed) {
    Out.printf("[%s] %s| TEG %5.2f V | BAT %5.2f V (%3d%%) | I %4.2f A (ACS %.3f V, zero %.3f V) | PWR %5.2f W | BATT_WH %.3f Wh | HOT %3s C | COLD %3s C | dT %3s C | AMB %4.1f C | ALARMS: %s%s\n",
               t, stateName(), vTeg, vBat, batPctNow, iTeg, acsVolts, acsZero, pBat, whTotal, sh, sc, sd, dhtOK ? tAmb : 0.0f, al, note);
    return;
  }

  Out.printf("\n---------------- %s ----------------\n", t);
  Out.printf("STATE     : %s(relay %s)  %s%s\n", stateName(), relayOn ? "CLOSED" : "OPEN", stateReason(), note);
  Out.printf("VOLTAGE   : TEG %.2f V (raw %.2f)   BATTERY %.2f V (raw %.2f, SoC ~%d%%)\n", vTeg, rawTeg, vBat, rawBat, batPctNow);
  Out.printf("SENSOR    : ACS712 output %.3f V, zero level %.3f V\n", acsVolts, acsZero);
  Out.printf("CURRENT   : Batt %.2f A (sensor: %s, raw %.2f, factor %.3f)\n", iTeg, acsOK ? "ACS712 analog" : "NOT OK (zero level off)", rawI, curTrim);
  Out.printf("POWER     : Batt power %.2f W   delivered energy %.3f Wh   peak TEG %.1f V\n", pBat, whTotal, vTegPeak);
  Out.printf("TEMPERATURE: hot %s C (%s)   cold %s C (%s)   dT %s C\n", sh, hotWhy, sc, coldWhy, sd);
  Out.printf("BATTERY AREA: %.1f C  humidity %.0f %%  (%s)\n", dhtOK ? tAmb : 0.0f, hum, dhtOK ? "DHT22 ok" : "DHT22 NOT READING");
  Out.printf("LIMITS    : open %.2f V, close %.2f V, hard %.2f V\n", vOpenNow, vCloseNow, vHardNow);
  Out.printf("ALARMS    : %s\n", al);
}

void printHelp() {
  Out.println();
  Out.println("COMMANDS (type the letter, then Enter):");
  Out.println("  h  this help                 d  switch compact / detailed output");
  Out.println("  j  toggle JSON stream        m  mute / unmute buzzer");
  Out.println("  t  test LEDs + buzzer (2s)   z  reset energy counters");
  Out.println("  k  re-zero current sensor    r  clear overcurrent latch");
  Out.println("  a  automatic charging        c  force charging ON");
  Out.println("  o  force charging OFF        v  show raw pin voltages & I2C status");
  Out.println("  B10.24 calibrate battery     G13.10 calibrate TEG");
  Out.println("  I0.50  set current to meter reading (relay closed, meter in series)");
  Out.println("  X      reset all calibration factors");
  Out.println();
}

bool calibrateCurrentFromMeter(float targetA) {
  if (targetA < 0.05f || targetA > 5.0f) {
    event("Current calibration target must be between 0.05 A and 5.00 A");
    return false;
  }
  if (!acsOK || !relayOn) {
    event("Current calibration needs a healthy ACS712 and active charging; place the multimeter in series");
    return false;
  }

  const uint8_t sampleCount = 8;
  float sumA = 0.0f;
  for (uint8_t i = 0; i < sampleCount; ++i) {
    float sensorV = readPinMv(PIN_ACS) * ACS_K;
    float sampleA = CURRENT_SIGN * (sensorV - acsZero) / ACS_V_PER_A;
    if (isnan(sampleA) || sampleA < 0.10f || sampleA > 5.0f) {
      event("Current calibration failed: check current direction and hold a steady charging load");
      return false;
    }
    sumA += sampleA;
    esp_task_wdt_reset();
    delay(20);
  }

  float averageRawA = sumA / sampleCount;
  float trim = targetA / averageRawA;
  if (trim < 0.50f || trim > 2.00f) {
    event("Current calibration refused: factor would be outside 0.50 to 2.00; check ACS712 type and wiring");
    return false;
  }

  curTrim = trim;
  prefs.putFloat("cur", curTrim);

  rawI  = averageRawA;
  iTeg  = rawI * curTrim;
  pBat  = vBat * iTeg;
  pTeg  = vTeg * iTeg;
  pHarv = pBat;
  tLast = millis();

  char message[120];
  snprintf(message, sizeof(message), "Current calibration saved: meter %.3f A, raw average %.3f A, factor x%.4f", targetA, averageRawA, curTrim);
  event(message);
  return true;
}

// ---------------- commands ----------------
void handleLine(String s) {
  s.trim();
  if (!s.length()) return;
  char c = s[0];
  char m[100];
  if (c == 'B' || c == 'G') {
    float v = s.substring(1).toFloat();
    float raw = (c == 'B') ? rawBat : rawTeg;
    if (v < 3.0f || v > 60.0f || raw < 1.0f) { event("Calibration refused: value out of range or no voltage present"); return; }
    float trim = v / raw;
    if (trim < 0.50f || trim > 2.00f) { event("Calibration refused: more than 2x away from divider ratio"); return; }
    if (trim < 0.85f || trim > 1.25f) event("WARNING: factor is more than 15% off nominal");
    if (c == 'B') { batTrim = trim; prefs.putFloat("bat", trim); } else { tegTrim = trim; prefs.putFloat("teg", trim); }
    snprintf(m, sizeof(m), "%s calibration saved: factor %.4f (raw %.3f V -> %.3f V)", c == 'B' ? "Battery" : "TEG", trim, raw, v);
    event(m);
    return;
  }
  if (c == 'I') {
    String valueText = s.substring(1);
    valueText.trim();
    if (valueText.startsWith("=")) valueText.remove(0, 1);
    calibrateCurrentFromMeter(valueText.toFloat());
    return;
  }
  switch (c) {
    case 'X':
      batTrim = BAT_TRIM; tegTrim = TEG_TRIM; curTrim = 1.0f;
      prefs.putFloat("bat", BAT_TRIM);
      prefs.putFloat("teg", TEG_TRIM);
      prefs.putFloat("cur", 1.0f);
      event("Calibration reset to accurate defaults (BAT 10.24V / TEG 13.10V)");
      break;
    case 'v': {
      float pb = readPinV(PIN_VBAT), pt = readPinVStable(PIN_VTEG), pa = readPinMv(PIN_ACS);
      Out.printf("\nPIN & HARDWARE CHECK (Multimeter vs GND):\n");
      Out.printf("  GPIO32 battery divider (R9=47k/R10=10k) : Sees %.3f V -> Bat %.2f V\n", pb, pb * K_BAT * batTrim);
      Out.printf("  GPIO33 TEG divider (R11=150k/R12=10k)   : Sees %.3f V -> TEG %.2f V\n", pt, pt * K_TEG * tegTrim);
      Out.printf("  GPIO%02u ACS712 (divider R17/R18)          : Sees %.3f V -> sensor output %.3f V, zero level %.3f V, current %.3f A\n", PIN_ACS, pa, pa * ACS_K, acsZero, iTeg);
      if (pa < 0.05f) Out.println("  !! ACS pin reads 0 V: check the wire on GPIO35, R17/R18 and the sensor 5 V.");
      Out.println();
      break;
    }
    case 'h': printHelp(); break;
    case 'd': detailed = !detailed; event(detailed ? "Detailed output ON" : "Compact output ON"); break;
    case 'j': jsonMode = !jsonMode; event(jsonMode ? "JSON telemetry stream ENABLED" : "JSON telemetry stream DISABLED"); break;
    case 'm': muted = !muted; event(muted ? "Buzzer muted" : "Buzzer on"); break;
    case 't': tTest = millis() + 2000; event("Testing LEDs and buzzer"); break;
    case 'z': whTotal = 0; whHarv = 0; vTegPeak = 0; event("Energy counters and peak voltage reset"); break;
    case 'k':
      if (relayOn) event("Not zeroed: relay is closed (charging). Send o first, wait 2 s, then k");
      else {
        float z = readPinMv(PIN_ACS) * ACS_K; char msg[100];
        if (z < ACS_ZERO_MIN || z > ACS_ZERO_MAX) { snprintf(msg, sizeof(msg), "Not zeroed: sensor reads %.3f V (should be about 2.5 V). Check wiring", z); event(msg); }
        else { acsZero = z; acsOK = true; snprintf(msg, sizeof(msg), "Current sensor zeroed at %.3f V", z); event(msg); }
      }
      break;
    case 'r': overcurrentLatched = false; tOver = 0; event("Overcurrent latch cleared"); break;
    case 'a': forceMode = 0; fullLatched = false; event("Charging: AUTOMATIC (full latch cleared)"); break;
    case 'c': forceMode = 1; event("Charging: FORCED ON"); break;
    case 'o': forceMode = 2; event("Charging: FORCED OFF"); break;
    default: break;
  }
}

// ---------------- setup / loop ----------------
void setup() {
  pinMode(PIN_RELAY, OUTPUT);
  relayWrite(false);
  pinMode(PIN_BUZZ, OUTPUT); digitalWrite(PIN_BUZZ, LOW);
  pinMode(PIN_LED_G, OUTPUT); pinMode(PIN_LED_Y, OUTPUT); pinMode(PIN_LED_R, OUTPUT);
  digitalWrite(PIN_LED_G, HIGH); digitalWrite(PIN_LED_Y, HIGH); digitalWrite(PIN_LED_R, HIGH);

  Serial.begin(115200);
  bleReady = startBleUart();
  delay(300);
  Out.println();
  Out.println("=====================================================");
  Out.println("  BIOMASS TEG CHARGER - TNE12-15 Verified Firmware   ");
  Out.printf("  BLE UART: %s\n", bleReady ? "advertising as TEG_Charger" : "START FAILED");
  Out.println("=====================================================");
  if (bleReady) {
    Out.printf("BLE service : %s\n", BLE_SERVICE_UUID);
    Out.printf("BLE RX UUID : %s (write commands)\n", BLE_RX_UUID);
    Out.printf("BLE TX UUID : %s (subscribe for output)\n", BLE_TX_UUID);
  } else {
    Out.println("BLE error   : could not create BLE UART service; check board BLE support and available memory");
  }

  prefs.begin("cal", false);
  batTrim = prefs.getFloat("bat", BAT_TRIM);
  tegTrim = prefs.getFloat("teg", TEG_TRIM);
  curTrim = prefs.getFloat("cur", 1.0f);

  if (abs(batTrim - 1.028f) < 0.005f) {
    batTrim = BAT_TRIM;
    prefs.putFloat("bat", BAT_TRIM);
  }
  if (abs(tegTrim - 1.052f) < 0.005f) {
    tegTrim = TEG_TRIM;
    prefs.putFloat("teg", TEG_TRIM);
  }

  Out.printf("Calibration : battery x%.4f, TEG x%.4f, current x%.4f\n", batTrim, tegTrim, curTrim);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Wire.begin(21, 22);
  Wire.setClock(100000);

  acsZero = readPinMv(PIN_ACS) * ACS_K;
  acsOK = (acsZero >= ACS_ZERO_MIN && acsZero <= ACS_ZERO_MAX);
  Out.printf("Current sens.: ACS712 zero level %.3f V on GPIO%u %s\n", acsZero, PIN_ACS,
             acsOK ? "(OK, about 2.5 V)" : "(NOT about 2.5 V: check 5 V, GND, R17/R18 and GPIO35)");

  uint8_t addr = 0;
  Wire.beginTransmission(LCD_ADDR_A); if (Wire.endTransmission() == 0) addr = LCD_ADDR_A;
  else { Wire.beginTransmission(LCD_ADDR_B); if (Wire.endTransmission() == 0) addr = LCD_ADDR_B; }
  lcdOK = (addr != 0);
  if (lcdOK) {
    lcd = new LiquidCrystal_I2C(addr, 16, 2);
    lcd->init(); lcd->backlight();
    lcdLine(0, "TEG CHARGER");
    lcdLine(1, "STARTING...");
    Out.printf("LCD         : Found at I2C address 0x%02X (16x2 Mode Active)\n", addr);
  } else {
    Out.println("LCD         : NOT FOUND (check SDA GPIO21, SCL GPIO22, VCC, GND)");
  }

  tcHot.begin(); tcCold.begin(); dht.begin();
  delay(500);

  readSensors();
  printHelp();

  delay(1200);
  digitalWrite(PIN_LED_G, LOW); digitalWrite(PIN_LED_Y, LOW); digitalWrite(PIN_LED_R, LOW);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wdt = { .timeout_ms = WDT_SECONDS * 1000, .idle_core_mask = 0, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wdt);
#else
  esp_task_wdt_init(WDT_SECONDS, true);
#endif
  esp_task_wdt_add(NULL);
  tLast = millis();
}

void loop() {
  esp_task_wdt_reset();
  uint32_t now = millis();

  if (now - tSense >= 250) {
    tSense = now;
    readSensors();
    chargeControl();
    batPctNow = getBatteryPercent();

    static bool negWarned = false;
    if (relayOn && rawI < -0.15f) {
      if (!negWarned) { negWarned = true; event("Current reads NEGATIVE while charging: set CURRENT_SIGN to -1 (or swap ACS712 pins 1 and 2)"); }
    } else negWarned = false;

    float dtHours = (now - tLast) / 3600000.0f;
    whTotal += pBat * dtHours;
    whHarv  += pBat * dtHours; // battery-delivered Wh (post-buck ACS712)
    tLast = now;

    if (state != lastState) {
      char m[140]; snprintf(m, sizeof(m), "STATE: %s - %s", stateName(), stateReason());
      event(m); lastState = state;
    }
    uint16_t a = alarmMask();
    if (a != lastAlarms) {
      for (int i = 0; i < N_ALARMS; i++) {
        bool on = a & ALARMS[i].bit, was = lastAlarms & ALARMS[i].bit;
        if (on != was) { char m[120]; snprintf(m, sizeof(m), "%s: %s", on ? "ALARM" : "cleared", ALARMS[i].name); event(m); }
      }
      if ((a & A_HOTTC) && !(lastAlarms & A_HOTTC)) { char m[100]; snprintf(m, sizeof(m), "  hot thermocouple: %s", hotWhy); event(m); }
      if ((a & A_COLDTC) && !(lastAlarms & A_COLDTC)) { char m[100]; snprintf(m, sizeof(m), "  cold thermocouple: %s", coldWhy); event(m); }
      lastAlarms = a;
    }
  }

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineBuf.length() > 0) { handleLine(lineBuf); lineBuf = ""; }
    } else if (lineBuf.length() < 24) {
      lineBuf += c;
    }
  }

  char c;
  while (bleRxQueue && xQueueReceive(bleRxQueue, &c, 0) == pdTRUE) {
    tBleRx = millis();
    if (c == '\n' || c == '\r') {
      if (bleLineBuf.length() > 0) { handleLine(bleLineBuf); bleLineBuf = ""; }
    } else if (bleLineBuf.length() < 24) {
      bleLineBuf += c;
    }
  }
  if (bleLineBuf.length() > 0 && (uint32_t)(millis() - tBleRx) >= 120) {
    handleLine(bleLineBuf);
    bleLineBuf = "";
  }

  if (bleConnectionChanged) {
    bool connected = bleConnected;
    bleConnectionChanged = false;
    if (!connected && bleReady) {
      delay(150);
      BLEDevice::startAdvertising();
    }
    event(connected ? "BLE client connected" : "BLE client disconnected; advertising again");
  }

  uint16_t a = alarmMask();
  bool crit = false;
  for (int i = 0; i < N_ALARMS; i++) if ((a & ALARMS[i].bit) && ALARMS[i].critical) crit = true;
  bool blink = ((now / 300) % 2 == 0);
  digitalWrite(PIN_BUZZ, (crit && blink && !muted) ? HIGH : LOW);

  bool slow = ((now / 1000) % 2 == 0);
  bool warn = a & (A_LOWBAT | A_HOTTC | A_COLDTC | A_DHT | A_ACS);
  bool ledG = false, ledY = false, ledR = false;
  if (crit || state == 5 || state == 6)          { ledR = blink; }
  else if (state == 0 || vTeg < TEG_PRESENT_V)   { ledY = true; ledR = true; }
  else if (state == 1) {
    if (iTeg > 0) { ledY = true; ledG = warn; }
    else          { ledY = blink; ledG = warn && blink; }
  }
  else if (state == 2 || state == 3 || state == 7) { ledG = true; }
  else if (state == 4)                             { ledG = slow; }
  digitalWrite(PIN_LED_R, ledR);
  digitalWrite(PIN_LED_Y, ledY);
  digitalWrite(PIN_LED_G, ledG);

  if ((int32_t)(tTest - now) > 0) {
    digitalWrite(PIN_LED_G, HIGH); digitalWrite(PIN_LED_Y, HIGH); digitalWrite(PIN_LED_R, HIGH);
    digitalWrite(PIN_BUZZ, blink ? HIGH : LOW);
  }

  if (now - tLcd >= 500) { tLcd = now; updateLcd(); }
  if (now - tPrint >= PRINT_MS) { tPrint = now; printStatus(); }
  delay(10);
}
