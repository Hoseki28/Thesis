/*
  Biomass Gasifier + TEG Charger - DUAL-MODE FIRMWARE (ESP32, Arduino IDE)
  Matched to Fritzing Schematic: "ThesisScetch_2.fzz"  (ACS712-5A current sensor on GPIO35, 16x2 I2C LCD)
  Connected to React PWA "Thesis Energy Dashboard"

  BLUETOOTH: the phone pairs with "TEG_Charger" (classic Bluetooth serial). Open a terminal app such as
  "Serial Bluetooth Terminal", connect, and you get the same text as the Serial Monitor and can send the same commands.
  Arduino IDE: Tools > Partition Scheme > "Huge APP (3MB No OTA/1MB SPIFFS)", otherwise the sketch is too big.
  The USB Serial Monitor keeps working exactly as before.

  Baud rate: 115200 (Line ending: "Newline")
  Transports: USB Web Serial (Standard human-readable text + structured JSON stream)

  SCHEMATIC PIN MAP (Verified against ThesisScetch.fzz netlist):
    GPIO21            I2C SDA : 16x2 LCD (0x27 or 0x3F, found automatically)
    GPIO22            I2C SCL : 16x2 LCD
    ACS712 OUT        R17 10k series -> GPIO35, R18 from GPIO35 to GND (see R_ACS_GND_K below)
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
    GPIO35            ACS712 current sensor output (ADC1, input-only pin: it has NO pull-up/pull-down, so the divider must be wired)

  CALIBRATION (voltage values unchanged from your last working version):
    TEG Voltage : factor 1.1679      BAT Voltage : factor 1.1011
    Current: ACS712-5A, 185 mV per amp, zero level learned automatically whenever the relay is open.
             Fine-tune with  I<amps>  while charging (type what your multimeter in series shows).
    Power  : TEG volts x charge current (harvested).

  16x2 LCD DISPLAY (single page, live):
    Row 0: T:13.1V B:10.24V     Row 1: P:15.5W  I:1.18A
*/

#include <Wire.h>
#include <SPI.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MAX31855.h>
#include <DHT.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include "BluetoothSerial.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled for this board. Select "ESP32 Dev Module" (not an S2/S3/C3 board).
#endif

// ---------------- Dual Bluetooth (Classic SPP + BLE Nordic UART Service) ----------------
// Works with BOTH:
//   1. React PWA Web Bluetooth ("SCAN & PAIR BLUETOOTH" -> BLE Nordic UART Service)
//   2. Phone / PC Classic Bluetooth ("Serial Bluetooth Terminal" or paired Bluetooth COM port)
BluetoothSerial BT;
const char *BT_NAME = "TEG_Charger";

#define NUS_SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX_CHAR_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX_CHAR_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer *pBleServer = nullptr;
BLECharacteristic *pBleTxChar = nullptr;
volatile bool bleClientConnected = false;
volatile bool bleCmdPending = false;
String bleRxLineBuf = "";
String pendingBleCmd = "";

class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    bleClientConnected = true;
  }
  void onDisconnect(BLEServer *pServer) override {
    bleClientConnected = false;
    BLEDevice::startAdvertising();
  }
};

class BleRxCallbacks : public BLECharacteristicCallbacks {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  void onWrite(BLECharacteristic *pCharacteristic, esp_ble_gatts_cb_param_t *param) override {
    String rxVal = pCharacteristic->getValue();
#else
  void onWrite(BLECharacteristic *pCharacteristic) override {
    std::string rxStd = pCharacteristic->getValue();
    String rxVal = String(rxStd.c_str());
#endif
    for (size_t i = 0; i < rxVal.length(); i++) {
      char c = rxVal[i];
      if (c == '\n' || c == '\r') {
        if (bleRxLineBuf.length() > 0) {
          pendingBleCmd = bleRxLineBuf;
          bleCmdPending = true;
          bleRxLineBuf = "";
        }
      } else if (bleRxLineBuf.length() < 24) {
        bleRxLineBuf += c;
      }
    }
    if (bleRxLineBuf.length() > 0 && rxVal.indexOf('\n') == -1 && rxVal.indexOf('\r') == -1) {
      pendingBleCmd = bleRxLineBuf;
      bleCmdPending = true;
      bleRxLineBuf = "";
    }
  }
};

void initBleUart() {
  BLEDevice::init(BT_NAME);
  BLEDevice::setMTU(517);
  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  BLEService *pService = pBleServer->createService(NUS_SERVICE_UUID);
  pBleTxChar = pService->createCharacteristic(
    NUS_TX_CHAR_UUID,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );
  pBleTxChar->addDescriptor(new BLE2902());

  BLECharacteristic *pRxChar = pService->createCharacteristic(
    NUS_RX_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxChar->setCallbacks(new BleRxCallbacks());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(NUS_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  BLEDevice::startAdvertising();
}

// ---------------- Bluetooth mirror: everything printed to the Serial Monitor is also sent over Classic BT & BLE ----------------
class MirrorOut : public Print {
  char bleBuf[180];
  size_t bleLen = 0;

  void flushBle() {
    if (bleLen == 0) return;
    if (bleClientConnected && pBleTxChar != nullptr) {
      pBleTxChar->setValue((uint8_t *)bleBuf, bleLen);
      pBleTxChar->notify();
    }
    bleLen = 0;
  }

 public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    if (BT.hasClient()) BT.write(c);
    if (bleClientConnected && pBleTxChar != nullptr) {
      bleBuf[bleLen++] = (char)c;
      if (c == '\n' || bleLen >= sizeof(bleBuf)) {
        flushBle();
      }
    } else {
      bleLen = 0;
    }
    return 1;
  }
  size_t write(const uint8_t *b, size_t n) override {
    Serial.write(b, n);
    if (BT.hasClient()) BT.write(b, n);
    if (bleClientConnected && pBleTxChar != nullptr) {
      for (size_t i = 0; i < n; i++) {
        bleBuf[bleLen++] = (char)b[i];
        if (b[i] == '\n' || bleLen >= sizeof(bleBuf)) {
          flushBle();
        }
      }
    } else {
      bleLen = 0;
    }
    return n;
  }
} Out;

// ---------------- pins ----------------
const uint8_t PIN_RELAY = 14;
const uint8_t PIN_VBAT = 32;
const uint8_t PIN_VTEG = 33;
const uint8_t PIN_ACS = 35;    // ACS712 output (after the divider). GPIO35 = ADC1, works with Wi-Fi and Bluetooth.
const uint8_t PIN_DHT = 23;
const uint8_t PIN_BUZZ = 12;
const uint8_t PIN_LED_G = 25;
const uint8_t PIN_LED_Y = 26;
const uint8_t PIN_LED_R = 27;
const int PIN_CS_HOT = 5;
const int PIN_CS_COLD = 17;
const int PIN_SCK = 18;
const int PIN_MISO = 19;
const uint8_t LCD_ADDR_A = 0x27;
const uint8_t LCD_ADDR_B = 0x3F;
#define RELAY_ACTIVE_LOW 1

// ---------------- calibration factors ----------------
const float K_BAT = (47.0f + 10.0f) / 10.0f;   // 5.7  (R9=47k, R10=10k)
const float K_TEG = (150.0f + 10.0f) / 10.0f;  // 16.0 (R11=150k, R12=10k)

// Exact multimeter calibration:
// TEG: 13.10V multimeter / 11.80V measured -> factor = 1.052 * (13.10 / 11.80) = 1.1679
// BAT: 10.24V multimeter / 9.56V measured  -> factor = 1.028 * (10.24 / 9.56)  = 1.1011
const float BAT_TRIM = 1.1011f;
const float TEG_TRIM = 1.1679f;
const float I_DEADBAND = 0.08f;                // readings below this show as 0 (ACS712 noise)

float batTrim = BAT_TRIM, tegTrim = TEG_TRIM, curTrim = 1.0f;
float rawI = 0, whHarv = 0, pHarv = 0, vTegPeak = 0;
float rawBat = 0, rawTeg = 0;
Preferences prefs;

// ---------------- ACS712-5A current sensor (analog) ----------------
const float R_ACS_SERIES_K = 10.0f;            // R17: sensor OUT -> GPIO35 (kilo-ohms)
const float R_ACS_GND_K    = 15.0f;            // R18: GPIO35 -> GND (kilo-ohms). Put the REAL value of your resistor here (e.g. 15 or 55)
const float ACS_K = (R_ACS_SERIES_K + R_ACS_GND_K) / R_ACS_GND_K;   // multiplies the pin voltage back to the sensor voltage
const float ACS_ZERO_MIN = 2.30f, ACS_ZERO_MAX = 2.70f;             // a healthy sensor idles at about 2.5 V
const float ACS_V_PER_A = 0.185f;              // ACS712-5A = 185 mV per amp (20A type 0.100, 30A type 0.066)
const int   CURRENT_SIGN = +1;                 // set to -1 if the charge current shows as 0 while charging
float acsVolts = 2.5f, acsZero = 2.5f;         // sensor output now / at 0 A
bool acsOK = false;                            // true when the zero level is about 2.5 V

// ---------------- limits ----------------
const float V_BAT_OPEN = 14.4f, V_BAT_CLOSE = 13.6f, V_BAT_HARD = 14.6f;
const float V_BAT_LOW_WARN = 11.8f, V_BAT_VALID_MIN = 6.0f, V_BAT_VALID_MAX = 16.5f;
const uint32_t RECONNECT_DWELL_MS = 60000;
const float TEMP_COMP_V_PER_C = 0.018f;
const float V_BAT_OPEN_NO_TEMP = 14.2f;
const float BAT_TEMP_STOP_C = 45.0f, BAT_TEMP_RESUME_C = 40.0f;
const float I_OVER_A = 2.2f;
const uint32_t I_OVER_MS = 2000;
const float TEG_V_ALARM = 45.0f;
const float HOT_ALARM_C = 230.0f, COLD_ALARM_C = 60.0f;
#define WDT_SECONDS 8
const uint32_t PRINT_MS = 1000;

// ---------------- state ----------------
LiquidCrystal_I2C *lcd = nullptr;
Adafruit_MAX31855 tcHot(PIN_SCK, PIN_CS_HOT, PIN_MISO);
Adafruit_MAX31855 tcCold(PIN_SCK, PIN_CS_COLD, PIN_MISO);
DHT dht(PIN_DHT, DHT22);

bool lcdOK = false, relayOn = false, muted = false, detailed = false, jsonMode = false;
float vBat = 0, vTeg = 0, iTeg = 0, pTeg = 0, whTotal = 0, tHot = -1, tCold = -1, tAmb = -1, hum = -1;
bool hotFault = true, coldFault = true;
const char *hotWhy = "not read yet", *coldWhy = "not read yet";
int state = 0, forceMode = 0;
bool overcurrentLatched = false, batHot = false, dhtOK = false, dwellActive = false;
uint32_t tOver = 0, tDhtGood = 0, tLast = 0, tPrint = 0, tLcd = 0, tSense = 0, tDht = 0, tOpened = 0, tTest = 0;
float vOpenNow = 14.4f, vCloseNow = 13.6f, vHardNow = 14.6f;
String lineBuf;
int lastState = -1;
uint16_t lastAlarms = 0;

// alarm bits
enum { A_LOWBAT = 1, A_HIGHBAT = 2, A_HOT = 8, A_TEGV = 16, A_HOTTC = 32, A_COLDTC = 64, A_BATHOT = 128, A_OVERI = 256, A_DHT = 512, A_COLD = 1024, A_ACS = 2048 };
const struct { uint16_t bit; const char *name; bool critical; } ALARMS[] = {
  {A_LOWBAT, "battery low (<11.8 V)", false}, {A_HIGHBAT, "battery at charge limit", false},
  {A_HOT, "hot side over 230 C", true},
  {A_TEGV, "TEG voltage over 45 V", true}, {A_HOTTC, "hot thermocouple fault", false},
  {A_COLDTC, "cold thermocouple fault", false}, {A_BATHOT, "battery too hot (45 C)", true},
  {A_OVERI, "overcurrent latched (send r)", true}, {A_DHT, "DHT22 not reading", false},
  {A_COLD, "cold side over 60 C", true}, {A_ACS, "current sensor not OK (check GPIO35 wiring)", false}
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
}

float readPinV(uint8_t pin) {
  uint32_t sum = 0;
  for (int i = 0; i < 32; i++) { sum += analogRead(pin); delayMicroseconds(50); }
  float raw = sum / 32.0f;
  return (raw / 4095.0f) * 3.30f;
}

void stamp(char *buf, size_t n) {
  uint32_t s = millis() / 1000;
  uint32_t h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
  snprintf(buf, n, "%02u:%02u:%02u", h, m, sec);
}

void event(const char *msg) {
  char t[12]; stamp(t, sizeof(t));
  Out.printf("[%s] >>> %s\n", t, msg);
}

const char* stateName() {
  switch (state) {
    case 0: return "NO BATTERY ";
    case 1: return "CHARGING   ";
    case 2: return "FULL-HOLD  ";
    case 3: return "WAITING    ";
    case 4: return "FORCED OFF ";
    case 5: return "BATTERY HOT";
    case 6: return "OVERCURRENT";
    default: return "UNKNOWN    ";
  }
}

const char* stateReason() {
  switch (state) {
    case 0: return "voltage out of range (6-16.5 V)";
    case 1: return "normal charging";
    case 2: return "reached full voltage limit";
    case 3: return "waiting for reconnect dwell timer";
    case 4: return "manually disabled (send a)";
    case 5: return "ambient temperature >= 45 C";
    case 6: return "current exceeded 2.2 A (send r)";
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
  if (batHot) m |= A_BATHOT;
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
  // Battery voltage via 47k/10k divider on GPIO32
  rawBat = readPinV(PIN_VBAT) * K_BAT;
  vBat = rawBat * batTrim;

  // TEG voltage via 150k/10k divider on GPIO33
  rawTeg = readPinV(PIN_VTEG) * K_TEG;
  vTeg = rawTeg * tegTrim;
  if (vTeg > vTegPeak) vTegPeak = vTeg;

  // Current sensing from the TEG charge path via ACS712-5A
  acsVolts = readPinMv(PIN_ACS) * ACS_K;                       // sensor output, about 2.5 V at 0 A
  bool inWindow = (acsVolts >= ACS_ZERO_MIN && acsVolts <= ACS_ZERO_MAX);
  if (!relayOn && inWindow) {                                  // relay open = no current: learn the zero, but only from a sane reading
    if (!acsOK) acsZero = acsVolts;                            // sensor just (re)appeared: take the reading at once
    else acsZero += (acsVolts - acsZero) * 0.05f;
  }
  acsOK = (acsZero >= ACS_ZERO_MIN && acsZero <= ACS_ZERO_MAX);   // false = sensor missing / pin floating / wrong divider
  rawI = acsOK ? CURRENT_SIGN * (acsVolts - acsZero) / ACS_V_PER_A : 0.0f;   // before calibration

  // Current and Power reading sourced directly from TEG current (0 while the sensor is not OK)
  if (!acsOK || rawI < I_DEADBAND) iTeg = 0.0f;
  else iTeg = rawI * curTrim;

  pTeg = vTeg * iTeg;      // Harvested TEG power in Watts
  pHarv = pTeg;

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
    float t = dht.readTemperature();
    float hm = dht.readHumidity();
    if (!isnan(t) && !isnan(hm)) {
      tAmb = t; hum = hm; dhtOK = true; tDhtGood = now;
    } else if (now - tDhtGood > 10000) {
      dhtOK = false;
    }
  }

  // temperature compensated thresholds (-18 mV/°C above 25°C)
  if (dhtOK && tAmb > 25.0f) {
    float drop = (tAmb - 25.0f) * TEMP_COMP_V_PER_C;
    vOpenNow = V_BAT_OPEN - drop;
    vCloseNow = V_BAT_CLOSE - drop;
    vHardNow = V_BAT_HARD - drop;
  } else if (!dhtOK) {
    vOpenNow = V_BAT_OPEN_NO_TEMP;
    vCloseNow = V_BAT_CLOSE;
    vHardNow = V_BAT_HARD;
  } else {
    vOpenNow = V_BAT_OPEN;
    vCloseNow = V_BAT_CLOSE;
    vHardNow = V_BAT_HARD;
  }

  if (dhtOK) {
    if (tAmb >= BAT_TEMP_STOP_C) batHot = true;
    else if (tAmb <= BAT_TEMP_RESUME_C) batHot = false;
  } else {
    batHot = false;
  }
}

// ---------------- charge control ----------------
void chargeControl() {
  uint32_t now = millis();

  if (!overcurrentLatched && iTeg >= I_OVER_A) {
    if (tOver == 0) tOver = now;
    else if (now - tOver >= I_OVER_MS) {
      overcurrentLatched = true;
      relayWrite(false);
      state = 6;
      event("OVERCURRENT LATCHED (>2.2 A for 2 s). Relay opened. Send 'r' to clear.");
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
    return;
  }

  if (batHot) {
    state = 5;
    relayWrite(false);
    dwellActive = false;
    return;
  }

  if (forceMode == 2) {
    state = 4;
    relayWrite(false);
    dwellActive = false;
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
    return;
  }

  // Automatic mode
  if (relayOn) {
    if (vBat >= vOpenNow || vBat >= vHardNow) {
      relayWrite(false);
      state = 2;
      dwellActive = true;
      tOpened = now;
      event("Battery reached full threshold. Relay OPEN (holding).");
    } else {
      state = 1;
    }
  } else {
    if (dwellActive) {
      if (now - tOpened < RECONNECT_DWELL_MS) {
        state = 3;
      } else {
        dwellActive = false;
      }
    }

    if (!dwellActive) {
      if (vBat <= vCloseNow) {
        relayWrite(true);
        state = 1;
        event("Battery voltage dropped below reconnect limit. Relay CLOSED (charging).");
      } else {
        state = 2;
      }
    }
  }
}

// ---------------- LCD Display (16x2 I2C) ----------------
void lcdLine(uint8_t row, const char *s) {
  char b[17]; snprintf(b, sizeof(b), "%-16.16s", s);
  lcd->setCursor(0, row); lcd->print(b);
}

void updateLcd() {                       // one fixed page, refreshed live
  if (!lcdOK) return;
  char l0[24], l1[24];
  if (vBat >= 10.0f) snprintf(l0, sizeof(l0), "T:%4.1fV B:%5.2fV", vTeg, vBat);
  else               snprintf(l0, sizeof(l0), "T:%4.1fV  B:%4.2fV", vTeg, vBat);
  snprintf(l1, sizeof(l1), "P:%4.1fW  I:%4.2fA", pTeg, iTeg);
  lcdLine(0, l0); lcdLine(1, l1);
}

// ---------------- Serial Telemetry Output ----------------
void printStatus() {
  char t[12], al[160], sh[8], sc[8], sd[8], note[60] = "";
  stamp(t, sizeof(t));
  uint16_t a = alarmMask();
  alarmText(a, al, sizeof(al));
  if (hotFault) snprintf(sh, sizeof(sh), "---"); else snprintf(sh, sizeof(sh), "%.0f", tHot);
  if (coldFault) snprintf(sc, sizeof(sc), "---"); else snprintf(sc, sizeof(sc), "%.0f", tCold);
  if (hotFault || coldFault) snprintf(sd, sizeof(sd), "---"); else snprintf(sd, sizeof(sd), "%.0f", tHot - tCold);
  if (!acsOK) snprintf(note, sizeof(note), "  (current sensor not OK: check GPIO%u wiring and the divider)", PIN_ACS);
  else if (state == 1 && iTeg == 0) snprintf(note, sizeof(note), vTeg < vBat + 0.7f ? "  (TEG voltage is too low to charge)" : "  (relay closed, no current yet)");

  // Structured JSON mode
  if (jsonMode) {
    Out.printf("{\"type\":\"telemetry\",\"timestamp\":\"%s\",\"state\":%d,\"stateName\":\"%s\",\"vTeg\":%.2f,\"vBat\":%.2f,\"iBat\":%.2f,\"iTeg\":%.2f,\"pBat\":%.2f,\"pTeg\":%.2f,\"pHarv\":%.2f,\"whTotal\":%.3f,\"whHarv\":%.3f,\"vTegPeak\":%.2f,\"tHot\":%.1f,\"tCold\":%.1f,\"dT\":%.1f,\"tAmb\":%.1f,\"hum\":%.1f,\"relayOn\":%s,\"rawBat\":%.2f,\"rawTeg\":%.2f,\"rawI\":%.2f,\"batTrim\":%.4f,\"tegTrim\":%.4f,\"curTrim\":%.4f,\"inaOK\":%s,\"alarms\":%u,\"alarmText\":\"%s\"}\n",
      t, state, stateName(), vTeg, vBat, iTeg, iTeg, pTeg, pTeg, pHarv, whTotal, whHarv, vTegPeak,
      hotFault ? -1.0f : tHot, coldFault ? -1.0f : tCold, (hotFault || coldFault) ? 0.0f : (tHot - tCold),
      dhtOK ? tAmb : -1.0f, dhtOK ? hum : -1.0f,
      relayOn ? "true" : "false",
      rawBat, rawTeg, rawI, batTrim, tegTrim, curTrim, acsOK ? "true" : "false", a, al);
  }

  // Human-readable compact mode
  if (!detailed) {
    Out.printf("[%s] %s| TEG %5.2f V | BAT %5.2f V | I %4.2f A (ACS %.3f V, zero %.3f V) | PWR %5.1f W | HARVEST %.3f Wh | HOT %3s C | COLD %3s C | dT %3s C | AMB %4.1f C | ALARMS: %s%s\n",
                  t, stateName(), vTeg, vBat, iTeg, acsVolts, acsZero, pTeg, whHarv, sh, sc, sd, dhtOK ? tAmb : 0.0f, al, note);
    return;
  }

  // Human-readable detailed mode
  Out.printf("\n---------------- %s ----------------\n", t);
  Out.printf("STATE     : %s(relay %s)  %s%s\n", stateName(), relayOn ? "CLOSED" : "OPEN", stateReason(), note);
  Out.printf("VOLTAGE   : TEG %.2f V (raw %.2f)   BATTERY %.2f V (raw %.2f)\n", vTeg, rawTeg, vBat, rawBat);
  Out.printf("SENSOR    : ACS712 output %.3f V, zero level %.3f V\n", acsVolts, acsZero);
  Out.printf("CURRENT   : TEG %.2f A (sensor: %s, raw %.2f, factor %.3f)\n", iTeg, acsOK ? "ACS712 analog" : "NOT OK (zero level off)", rawI, curTrim);
  Out.printf("POWER     : TEG power %.1f W   harvested energy %.3f Wh   peak TEG %.1f V\n", pTeg, whHarv, vTegPeak);
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
  Out.println("  I0.50  calibrate current     X  reset calibrations");
  Out.println();
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
    float v = s.substring(1).toFloat();
    if (!acsOK || !relayOn || rawI < 0.10f || v < 0.05f) { event("Current calibration requires charging current of at least 0.10 A"); return; }
    float trim = v / rawI;
    if (trim < 0.5f || trim > 2.0f) { event("Calibration refused: more than 2x off"); return; }
    curTrim = trim; prefs.putFloat("cur", trim);
    snprintf(m, sizeof(m), "Current calibration saved: factor %.4f (raw %.3f A -> %.3f A)", trim, rawI, v); event(m);
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
      float pb = readPinV(PIN_VBAT), pt = readPinV(PIN_VTEG), pa = readPinMv(PIN_ACS);
      Out.printf("\nPIN & HARDWARE CHECK (Multimeter vs GND):\n");
      Out.printf("  GPIO32 battery divider (R9=47k/R10=10k) : Sees %.3f V -> Bat %.2f V (multimeter target: 10.24V)\n", pb, pb * K_BAT * batTrim);
      Out.printf("  GPIO33 TEG divider (R11=150k/R12=10k)   : Sees %.3f V -> TEG %.2f V (multimeter target: 13.10V)\n", pt, pt * K_TEG * tegTrim);
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
        float z = readPinMv(PIN_ACS) * ACS_K; char m[100];
        if (z < ACS_ZERO_MIN || z > ACS_ZERO_MAX) { snprintf(m, sizeof(m), "Not zeroed: sensor reads %.3f V (should be about 2.5 V). Check wiring", z); event(m); }
        else { acsZero = z; acsOK = true; snprintf(m, sizeof(m), "Current sensor zeroed at %.3f V", z); event(m); }
      }
      break;
    case 'r': overcurrentLatched = false; tOver = 0; event("Overcurrent latch cleared"); break;
    case 'a': forceMode = 0; event("Charging: AUTOMATIC"); break;
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
  BT.begin(BT_NAME);                                      // Classic Bluetooth SPP: "TEG_Charger"
  initBleUart();                                          // Web Bluetooth BLE UART: "TEG_Charger"
  delay(300);
  Out.println();
  Out.println("=====================================================");
  Out.println("  BIOMASS TEG CHARGER - Schematic Verified Firmware  ");
  Out.println("  Bluetooth: pair with \"TEG_Charger\" (Classic + BLE)");
  Out.println("=====================================================");

  prefs.begin("cal", false);
  batTrim = prefs.getFloat("bat", BAT_TRIM);
  tegTrim = prefs.getFloat("teg", TEG_TRIM);
  curTrim = prefs.getFloat("cur", 1.0f);

  // Automatically update old trims if still at default uncalibrated factors
  if (abs(batTrim - 1.028f) < 0.005f) {
    batTrim = BAT_TRIM;
    prefs.putFloat("bat", BAT_TRIM);
  }
  if (abs(tegTrim - 1.052f) < 0.005f) {
    tegTrim = TEG_TRIM;
    prefs.putFloat("teg", TEG_TRIM);
  }

  Out.printf("Calibration : battery x%.4f (target 10.24V), TEG x%.4f (target 13.10V), current x%.4f\n", batTrim, tegTrim, curTrim);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Initialize I2C bus on GPIO21 (SDA) and GPIO22 (SCL)
  Wire.begin(21, 22);
  Wire.setClock(100000);

  // ACS712 zero level: the relay is open right now, so this is the 0 A reading
  acsZero = readPinMv(PIN_ACS) * ACS_K;
  acsOK = (acsZero >= ACS_ZERO_MIN && acsZero <= ACS_ZERO_MAX);
  Out.printf("Current sens.: ACS712 zero level %.3f V on GPIO%u %s\n", acsZero, PIN_ACS,
                acsOK ? "(OK, about 2.5 V)" : "(NOT about 2.5 V: check sensor 5 V, GND, R17/R18 and the wire on GPIO35. Current will read 0 until this is fixed)");

  // Initialize LCD (16x2 I2C on address 0x27 or 0x3F)
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
    static bool negWarned = false;
    if (relayOn && rawI < -0.15f) {
      if (!negWarned) { negWarned = true; event("Current reads NEGATIVE while charging: set CURRENT_SIGN to -1 (or swap the ACS712 pins 1 and 2)"); }
    } else negWarned = false;
    whTotal += pTeg * (now - tLast) / 3600000.0f;
    whHarv  += pTeg * (now - tLast) / 3600000.0f;
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

  while (Serial.available() || BT.available()) {          // commands from the Serial Monitor or Classic Bluetooth
    char c = Serial.available() ? Serial.read() : BT.read();
    if (c == '\n' || c == '\r') { handleLine(lineBuf); lineBuf = ""; }
    else if (lineBuf.length() < 16) lineBuf += c;
  }

  if (bleCmdPending) {                                    // commands from React PWA Web Bluetooth (BLE)
    String cmd = pendingBleCmd;
    bleCmdPending = false;
    handleLine(cmd);
  }

  uint16_t a = alarmMask();
  bool crit = false;
  for (int i = 0; i < N_ALARMS; i++) if ((a & ALARMS[i].bit) && ALARMS[i].critical) crit = true;
  bool blink = ((now / 300) % 2 == 0);
  digitalWrite(PIN_BUZZ, (crit && blink && !muted) ? HIGH : LOW);
  digitalWrite(PIN_LED_R, crit ? (blink ? HIGH : LOW) : LOW);
  digitalWrite(PIN_LED_Y, (!crit && (state == 2 || state == 3 || state == 4 || (a & (A_LOWBAT | A_HOTTC | A_COLDTC | A_DHT | A_ACS)))) ? HIGH : LOW);
  digitalWrite(PIN_LED_G, (state == 1 && !crit) ? HIGH : LOW);
  if ((int32_t)(tTest - now) > 0) {
    digitalWrite(PIN_LED_G, HIGH); digitalWrite(PIN_LED_Y, HIGH); digitalWrite(PIN_LED_R, HIGH);
    digitalWrite(PIN_BUZZ, blink ? HIGH : LOW);
  }

  if (now - tLcd >= 500) { tLcd = now; updateLcd(); }
  if (now - tPrint >= PRINT_MS) { tPrint = now; printStatus(); }
  delay(10);
}
