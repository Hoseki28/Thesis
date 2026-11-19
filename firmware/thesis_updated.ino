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
#include <DHT.h>
#include <esp_task_wdt.h>
#include <Preferences.h>
#include "BluetoothSerial.h"
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled for this board. Select "ESP32 Dev Module" (not an S2/S3/C3 board).
#endif

// ---------------- Bluetooth mirror: everything printed to the Serial Monitor is also sent over Bluetooth ----------------
BluetoothSerial BT;
const char *BT_NAME = "TEG_Charger";
class MirrorOut : public Print {
 public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    if (BT.hasClient()) BT.write(c);
    return 1;
  }
  size_t write(const uint8_t *b, size_t n) override {
    Serial.write(b, n);
    if (BT.hasClient()) BT.write(b, n);
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
// CUR: multimeter_A / rawI (calibrate live with I<amps> while current flows, or set CUR_TRIM here)
const float BAT_TRIM = 1.1011f;
const float TEG_TRIM = 1.1679f;
const float CUR_TRIM = 1.0000f;
const float I_DEADBAND = 0.08f;                // readings below this show as 0 (ACS712 noise)

float batTrim = BAT_TRIM, tegTrim = TEG_TRIM, curTrim = CUR_TRIM;
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

// ---------------- limits (Tianneng TNE12-15 12V 15Ah AGM-GEL Datasheet Verified) ----------------
// Cycle Limited Voltage : 14.6V ~ 14.8V @ 25 C (Temp. Coefficient: -24 mV/C)
// Floating Voltage      : 13.6V ~ 13.8V @ 25 C (Temp. Coefficient: -18 mV/C)
// Limited Charge Current: <= 0.15C A = 2.25 A
// Charge Temp. Range    : 0 C ~ 40 C (Optimum: 25 C +/- 2 C)
// 100% DOD Final Voltage: 1.80 V/cell = 10.80 V (20hr rate), 1.75 V/cell = 10.50 V (2hr-10hr rate)
const float V_BAT_OPEN = 14.6f, V_BAT_CLOSE = 13.7f, V_BAT_HARD = 14.8f;
const float V_BAT_LOW_WARN = 11.8f, V_BAT_CUTOFF = 10.8f, V_BAT_VALID_MIN = 6.0f, V_BAT_VALID_MAX = 16.5f;
const uint32_t RECONNECT_DWELL_MS = 60000;
const float TEMP_COMP_CYCLE_V_PER_C = 0.024f;  // -24 mV/C for cycle limit (14.6V-14.8V)
const float TEMP_COMP_FLOAT_V_PER_C = 0.018f;  // -18 mV/C for float reconnect (13.7V)
const float V_BAT_OPEN_NO_TEMP = 14.4f;
const float BAT_TEMP_STOP_C = 40.0f, BAT_TEMP_RESUME_C = 37.0f;
const float I_OVER_A = 2.25f;                  // 0.15C of 15Ah = 2.25 A max charge current
const uint32_t I_OVER_MS = 2000;
const float TEG_V_ALARM = 45.0f;
const float TEG_PRESENT_V = 1.0f;              // TEG reading below this = no TEG detected (yellow + red LEDs)
const float HOT_ALARM_C = 230.0f, COLD_ALARM_C = 60.0f;
#define WDT_SECONDS 8
const uint32_t PRINT_MS = 1000;

// ---------------- state ----------------
LiquidCrystal_I2C *lcd = nullptr;
DHT dht(PIN_DHT, DHT22);

// ---------------- MAX31855 K-type thermocouples (hot side + cold side) ----------------
// Both chips share SCK (GPIO18) and SO/MISO (GPIO19); each has its own CS (GPIO5 hot, GPIO17 cold).
// One 32-bit frame per read (datasheet Table 2), instead of reading the chip twice:
//   D31..D18  thermocouple temp, 14-bit signed, 0.25 C/LSB
//   D17       reserved, always 0          D16  fault (any of D2..D0)
//   D15..D4   cold-junction (die) temp, 12-bit signed, 0.0625 C/LSB
//   D3        reserved, always 0          D2 SCV  D1 SCG  D0 OC
// The chip assumes a straight 41.276 uV/C line. Real K-type wire is not linear, so the raw value is
// corrected with the NIST ITS-90 K-type polynomials (see tcLinearize). Error drops from a few degrees
// to about the chip's own +/-2 C spec across 0..700 C.
// Hardware notes from the datasheet: use UNGROUNDED probes (a grounded tip reads as SCG fault),
// keep a 10 nF cap across T+/T- close to the chip, and do not read faster than one conversion (100 ms max).
struct Thermocouple {
  const char *name;
  int cs;
  float tc;          // linearized, filtered, calibrated temperature (C)
  float cj;          // chip die / cold-junction temperature (C)
  float raw;         // chip's own linear reading before correction (C)
  float offset;      // user calibration offset from H / C command (C)
  float hist[5];     // last readings for the median filter
  uint8_t n, idx;
  uint8_t badCount;  // consecutive bad frames, fault is raised after TC_FAULT_HOLD
  bool fault;
  const char *why;
  uint32_t frame;    // last raw frame, shown by the v command
  uint8_t spikes;    // readings skipped by the spike filter in a row
};
const uint8_t TC_FAULT_HOLD = 3;          // 3 bad frames in a row (0.75 s) before showing a fault
const float   TC_SPIKE_C = 25.0f;         // a single reading that jumps more than this vs the median is ignored
Thermocouple tcHotS  = {"hot",  PIN_CS_HOT,  0, 0, 0, 0, {0}, 0, 0, 0, true, "not read yet", 0};
Thermocouple tcColdS = {"cold", PIN_CS_COLD, 0, 0, 0, 0, {0}, 0, 0, 0, true, "not read yet", 0};

bool lcdOK = false, relayOn = false, muted = false, detailed = false, jsonMode = false;
float vBat = 0, vTeg = 0, iTeg = 0, pTeg = 0, whTotal = 0, tHot = -1, tCold = -1, tAmb = -1, hum = -1;
bool hotFault = true, coldFault = true;
const char *hotWhy = "not read yet", *coldWhy = "not read yet";
int state = 0, forceMode = 0;
bool overcurrentLatched = false, batHot = false, dhtOK = false, dwellActive = false;
uint32_t tOver = 0, tDhtGood = 0, tLast = 0, tPrint = 0, tLcd = 0, tSense = 0, tDht = 0, tOpened = 0, tTest = 0;
float vOpenNow = 14.6f, vCloseNow = 13.7f, vHardNow = 14.8f;
String lineBuf;
String btLineBuf;
uint32_t tBtRx = 0;
int lastState = -1;
uint16_t lastAlarms = 0;

// alarm bits
enum { A_LOWBAT = 1, A_HIGHBAT = 2, A_HOT = 8, A_TEGV = 16, A_HOTTC = 32, A_COLDTC = 64, A_BATHOT = 128, A_OVERI = 256, A_DHT = 512, A_COLD = 1024, A_ACS = 2048 };
const struct { uint16_t bit; const char *name; bool critical; } ALARMS[] = {
  {A_LOWBAT, "battery low (<11.8 V, cutoff 10.8 V)", false}, {A_HIGHBAT, "battery at charge limit (14.6 V)", false},
  {A_HOT, "hot side over 230 C", true},
  {A_TEGV, "TEG voltage over 45 V", true}, {A_HOTTC, "hot thermocouple fault", false},
  {A_COLDTC, "cold thermocouple fault", false}, {A_BATHOT, "battery too hot (>=40 C charge limit)", true},
  {A_OVERI, "overcurrent latched (>2.25 A, send r)", true}, {A_DHT, "DHT22 not reading", false},
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
    case 5: return "ambient temperature >= 40 C (TNE12-15 max charge temp)";
    case 6: return "current exceeded 2.25 A / 0.15C (send r)";
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

// ---------------- MAX31855 driver ----------------
uint32_t tcReadFrame(int cs) {
  // SCK idles low. D31 is on SO as soon as CS falls; each falling SCK edge shifts the next bit out.
  digitalWrite(PIN_SCK, LOW);
  digitalWrite(cs, LOW);
  delayMicroseconds(2);                       // tCSS is 100 ns, 2 us leaves margin for long wires
  uint32_t d = 0;
  for (int i = 0; i < 32; i++) {
    digitalWrite(PIN_SCK, HIGH);
    delayMicroseconds(1);
    d = (d << 1) | (digitalRead(PIN_MISO) ? 1u : 0u);
    digitalWrite(PIN_SCK, LOW);
    delayMicroseconds(1);
  }
  digitalWrite(cs, HIGH);                     // CS high starts the next conversion
  return d;
}

// NIST ITS-90 type K, temperature (C) -> thermoelectric voltage (mV)
double kTypeMv(double t) {
  static const double pos[10] = {-1.7600413686e-02, 3.8921204975e-02, 1.8558770032e-05, -9.9457592874e-08,
                                 3.1840945719e-10, -5.6072844889e-13, 5.6075059059e-16, -3.2020720003e-19,
                                 9.7151147152e-23, -1.2104721275e-26};
  static const double neg[11] = {0.0, 3.9450128025e-02, 2.3622373598e-05, -3.2858906784e-07, -4.9904828777e-09,
                                 -6.7509059173e-11, -5.7410327428e-13, -3.1088872894e-15, -1.0451609365e-17,
                                 -1.9889266878e-20, -1.6322697486e-23};
  const double *c = (t >= 0) ? pos : neg;
  int n = (t >= 0) ? 10 : 11;
  double e = 0, p = 1;
  for (int i = 0; i < n; i++) { e += c[i] * p; p *= t; }
  if (t >= 0) e += 0.118597600000 * exp(-1.183432e-04 * (t - 126.9686) * (t - 126.9686));
  return e;
}

// NIST ITS-90 type K inverse, voltage (mV) -> temperature (C). Valid -5.891 .. 54.886 mV (-200 .. 1372 C)
double kTypeC(double mv) {
  static const double dn[9]  = {0.0, 2.5173462e+01, -1.1662878e+00, -1.0833638e+00, -8.9773540e-01,
                                -3.7342377e-01, -8.6632643e-02, -1.0450598e-02, -5.1920577e-04};
  static const double dm[10] = {0.0, 2.508355e+01, 7.860106e-02, -2.503131e-01, 8.315270e-02,
                                -1.228034e-02, 9.804036e-04, -4.413030e-05, 1.057734e-06, -1.052755e-08};
  static const double dh[7]  = {-1.318058e+02, 4.830222e+01, -1.646031e+00, 5.464731e-02,
                                -9.650715e-04, 8.802193e-06, -3.110810e-08};
  const double *d; int n;
  if (mv < 0)            { d = dn; n = 9; }
  else if (mv < 20.644)  { d = dm; n = 10; }
  else                   { d = dh; n = 7; }
  double t = 0, p = 1;
  for (int i = 0; i < n; i++) { t += d[i] * p; p *= mv; }
  return t;
}

// Undo the chip's straight-line approximation: rebuild the real wire voltage, add the cold-junction
// voltage, and convert back through the NIST table.
float tcLinearize(float rawC, float cjC) {
  double mv = (rawC - cjC) * 0.041276 + kTypeMv(cjC);   // 41.276 uV/C is the chip's built-in slope
  if (mv < -5.891 || mv > 54.886) return rawC;          // outside the NIST range: keep the chip value
  return (float)kTypeC(mv);
}

float median5(const float *v, uint8_t n) {
  float s[5];
  for (uint8_t i = 0; i < n; i++) s[i] = v[i];
  for (uint8_t i = 1; i < n; i++) { float x = s[i]; int j = i - 1; while (j >= 0 && s[j] > x) { s[j + 1] = s[j]; j--; } s[j + 1] = x; }
  return s[n / 2];
}

void tcUpdate(Thermocouple &t) {
  uint32_t f = tcReadFrame(t.cs);
  t.frame = f;
  const char *bad = nullptr;
  if (f == 0x00000000UL)                 bad = "no response (check VCC 3.3V, GND, SO GPIO19, CS wire)";
  else if (f == 0xFFFFFFFFUL)            bad = "SO stuck high (check SO GPIO19 and chip power)";
  else if (f & 0x00020008UL)             bad = "corrupt frame (noise on SCK/SO, shorten or shield wires)";
  else if (f & 0x00010000UL) {
    if (f & 0x4)      bad = "shorted to VCC";
    else if (f & 0x2) bad = "shorted to GND (use an ungrounded probe)";
    else if (f & 0x1) bad = "open circuit / probe disconnected";
    else              bad = "fault bit set";
  }

  if (bad) {
    if (t.badCount < 255) t.badCount++;
    if (t.badCount >= TC_FAULT_HOLD) { t.fault = true; t.why = bad; t.n = 0; t.idx = 0; }
    return;                              // keep the last good value during a short glitch
  }
  t.badCount = 0;

  int16_t tc14 = (int16_t)((f >> 16) & 0xFFFC) >> 2;   // sign-extend the 14-bit field
  int16_t cj12 = (int16_t)(f & 0xFFF0) >> 4;           // sign-extend the 12-bit field
  t.raw = tc14 * 0.25f;
  t.cj  = cj12 * 0.0625f;
  float lin = tcLinearize(t.raw, t.cj);

  if (t.n >= 3) {                        // spike rejection, a real change survives 3 reads in a row
    float med = median5(t.hist, t.n);
    if (fabsf(lin - med) > TC_SPIKE_C && t.spikes < 2) { t.spikes++; return; }
  }
  t.spikes = 0;
  t.hist[t.idx] = lin;
  t.idx = (t.idx + 1) % 5;
  if (t.n < 5) t.n++;
  t.tc = median5(t.hist, t.n) + t.offset;
  t.fault = false;
  t.why = "ok";
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
  float calI = rawI * curTrim;
  if (!acsOK || calI < I_DEADBAND) iTeg = 0.0f;
  else iTeg = calI;

  pTeg = vTeg * iTeg;      // Harvested TEG power in Watts
  pHarv = pTeg;

  // Hot side and cold side MAX31855 (one frame each, linearized, median filtered)
  tcUpdate(tcHotS);
  tcUpdate(tcColdS);
  hotFault = tcHotS.fault;   tHot = tcHotS.tc;   hotWhy = tcHotS.why;
  coldFault = tcColdS.fault; tCold = tcColdS.tc; coldWhy = tcColdS.why;

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

  // TNE12-15 temperature compensated thresholds above 25°C (-24 mV/°C cycle, -18 mV/°C float)
  if (dhtOK && tAmb > 25.0f) {
    float dropCycle = (tAmb - 25.0f) * TEMP_COMP_CYCLE_V_PER_C;
    float dropFloat = (tAmb - 25.0f) * TEMP_COMP_FLOAT_V_PER_C;
    vOpenNow = V_BAT_OPEN - dropCycle;
    vCloseNow = V_BAT_CLOSE - dropFloat;
    vHardNow = V_BAT_HARD - dropCycle;
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
      event("OVERCURRENT LATCHED (>2.25 A / 0.15C for 2 s). Relay opened. Send 'r' to clear.");
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
  char t[12], al[160], sh[10], sc[10], sd[10], note[60] = "";
  stamp(t, sizeof(t));
  uint16_t a = alarmMask();
  alarmText(a, al, sizeof(al));
  if (hotFault) snprintf(sh, sizeof(sh), "---"); else snprintf(sh, sizeof(sh), "%.1f", tHot);
  if (coldFault) snprintf(sc, sizeof(sc), "---"); else snprintf(sc, sizeof(sc), "%.1f", tCold);
  if (hotFault || coldFault) snprintf(sd, sizeof(sd), "---"); else snprintf(sd, sizeof(sd), "%.1f", tHot - tCold);
  if (!acsOK) snprintf(note, sizeof(note), "  (current sensor not OK: check GPIO%u wiring and the divider)", PIN_ACS);
  else if (state == 1 && iTeg == 0) snprintf(note, sizeof(note), vTeg < vBat + 0.7f ? "  (TEG voltage is too low to charge)" : "  (relay closed, no current yet)");

  // Structured JSON mode
  if (jsonMode) {
    float pBat = vBat * iTeg;
    Out.printf("{\"type\":\"telemetry\",\"timestamp\":\"%s\",\"state\":%d,\"stateName\":\"%s\",\"vTeg\":%.2f,\"vBat\":%.2f,\"iBat\":%.2f,\"iTeg\":%.2f,\"pBat\":%.2f,\"pTeg\":%.2f,\"pHarv\":%.2f,\"whTotal\":%.3f,\"whHarv\":%.3f,\"vTegPeak\":%.2f,\"tHot\":%.1f,\"tCold\":%.1f,\"dT\":%.1f,\"tAmb\":%.1f,\"hum\":%.1f,\"relayOn\":%s,\"rawBat\":%.2f,\"rawTeg\":%.2f,\"rawI\":%.2f,\"batTrim\":%.4f,\"tegTrim\":%.4f,\"curTrim\":%.4f,\"inaOK\":%s,\"hotFault\":%s,\"coldFault\":%s,\"hotWhy\":\"%s\",\"coldWhy\":\"%s\",\"tHotCJ\":%.2f,\"tColdCJ\":%.2f,\"alarms\":%u,\"alarmText\":\"%s\"}\n",
      t, state, stateName(), vTeg, vBat, iTeg, iTeg, pBat, pTeg, pHarv, whTotal, whHarv, vTegPeak,
      hotFault ? -1.0f : tHot, coldFault ? -1.0f : tCold, (hotFault || coldFault) ? 0.0f : (tHot - tCold),
      dhtOK ? tAmb : -1.0f, dhtOK ? hum : -1.0f,
      relayOn ? "true" : "false",
      rawBat, rawTeg, rawI, batTrim, tegTrim, curTrim, acsOK ? "true" : "false",
      hotFault ? "true" : "false", coldFault ? "true" : "false", hotWhy, coldWhy, tcHotS.cj, tcColdS.cj, a, al);
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
  Out.printf("TEMPERATURE: hot %s C (%s, chip %.2f C)   cold %s C (%s, chip %.2f C)   dT %s C\n", sh, hotWhy, tcHotS.cj, sc, coldWhy, tcColdS.cj, sd);
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
  Out.println("  TH25.0 hot thermocouple = reference C    TC25.0 cold thermocouple = reference C");
  Out.println("  TX     clear thermocouple offsets");
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
  if (c == 'T' && s.length() >= 2) {          // TH<C>, TC<C>, TX : thermocouple offset vs a reference thermometer
    char side = toupper(s[1]);
    if (side == 'X') {
      tcHotS.offset = 0; tcColdS.offset = 0;
      prefs.putFloat("toh", 0); prefs.putFloat("toc", 0);
      event("Thermocouple offsets cleared");
      return;
    }
    if ((side != 'H' && side != 'C') || s.length() < 3) { event("Use TH<C> for hot side, TC<C> for cold side, TX to clear"); return; }
    Thermocouple &tc = (side == 'H') ? tcHotS : tcColdS;
    float ref = s.substring(2).toFloat();
    if (tc.fault || tc.n < 3) { snprintf(m, sizeof(m), "Calibration refused: %s thermocouple not reading (%s)", tc.name, tc.why); event(m); return; }
    if (ref < -20.0f || ref > 1000.0f) { event("Calibration refused: reference must be -20 .. 1000 C"); return; }
    float measured = tc.tc - tc.offset;
    float off = ref - measured;
    if (fabsf(off) > 15.0f) { event("Calibration refused: offset over 15 C, check probe contact and reference instead"); return; }
    tc.offset = off;
    tc.tc = measured + off;
    prefs.putFloat(side == 'H' ? "toh" : "toc", off);
    snprintf(m, sizeof(m), "%s thermocouple offset saved: %+.2f C (%.2f C -> %.2f C)", side == 'H' ? "Hot" : "Cold", off, measured, ref);
    event(m);
    return;
  }
  if (c == 'I') {
    float v = s.substring(1).toFloat();
    if (!acsOK) { event("Calibration refused: current sensor not OK (check GPIO35 wiring)"); return; }
    if (v < 0.03f || v > 10.0f || abs(rawI) < 0.03f) {
      event("Calibration refused: value out of range or no measurable current present (>= 0.03 A)");
      return;
    }
    if (rawI < 0.0f) {
      event("Calibration refused: raw current is negative (check CURRENT_SIGN or swap ACS712 IP+/IP-)");
      return;
    }
    float trim = v / rawI;
    if (trim < 0.20f || trim > 5.00f) { event("Calibration refused: more than 5x away from nominal"); return; }
    if (trim < 0.85f || trim > 1.25f) event("WARNING: current factor is more than 15% off nominal");
    curTrim = trim; prefs.putFloat("cur", trim);
    snprintf(m, sizeof(m), "Current calibration saved: factor %.4f (raw %.3f A -> %.3f A)", trim, rawI, v); event(m);
    return;
  }
  switch (c) {
    case 'X':
      batTrim = BAT_TRIM; tegTrim = TEG_TRIM; curTrim = CUR_TRIM;
      prefs.putFloat("bat", BAT_TRIM);
      prefs.putFloat("teg", TEG_TRIM);
      prefs.putFloat("cur", CUR_TRIM);
      tcHotS.offset = 0; tcColdS.offset = 0;
      prefs.putFloat("toh", 0); prefs.putFloat("toc", 0);
      event("Calibration reset to accurate defaults (BAT 10.24V / TEG 13.10V / CUR 1.0000)");
      break;
    case 'v': {
      float pb = readPinV(PIN_VBAT), pt = readPinV(PIN_VTEG), pa = readPinMv(PIN_ACS);
      Out.printf("\nPIN & HARDWARE CHECK (Multimeter vs GND):\n");
      Out.printf("  GPIO32 battery divider (R9=47k/R10=10k) : Sees %.3f V -> Bat %.2f V (multimeter target: 10.24V)\n", pb, pb * K_BAT * batTrim);
      Out.printf("  GPIO33 TEG divider (R11=150k/R12=10k)   : Sees %.3f V -> TEG %.2f V (multimeter target: 13.10V)\n", pt, pt * K_TEG * tegTrim);
      Out.printf("  GPIO%02u ACS712 (divider R17/R18)          : Sees %.3f V -> sensor %.3f V, zero %.3f V, raw %.3f A -> Cur %.3f A (x%.4f)\n", PIN_ACS, pa, pa * ACS_K, acsZero, rawI, iTeg, curTrim);
      if (pa < 0.05f) Out.println("  !! ACS pin reads 0 V: check the wire on GPIO35, R17/R18 and the sensor 5 V.");
      Out.printf("  MAX31855 hot  (CS GPIO%d) : frame 0x%08lX  chip %.2f C  raw %.2f C -> %.2f C (offset %+.2f)  %s\n",
                 PIN_CS_HOT, (unsigned long)tcHotS.frame, tcHotS.cj, tcHotS.raw, tcHotS.tc, tcHotS.offset, tcHotS.why);
      Out.printf("  MAX31855 cold (CS GPIO%d): frame 0x%08lX  chip %.2f C  raw %.2f C -> %.2f C (offset %+.2f)  %s\n",
                 PIN_CS_COLD, (unsigned long)tcColdS.frame, tcColdS.cj, tcColdS.raw, tcColdS.tc, tcColdS.offset, tcColdS.why);
      Out.println("  Both probes in the same room-temperature air should read within about 2 C of each other.");
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
  BT.begin(BT_NAME);                                      // phone / PC sees "TEG_Charger"
  delay(300);
  Out.println();
  Out.println("=====================================================");
  Out.println("  BIOMASS TEG CHARGER - Schematic Verified Firmware  ");
  Out.println("  Bluetooth: pair with \"TEG_Charger\"");
  Out.println("=====================================================");

  prefs.begin("cal", false);
  batTrim = prefs.getFloat("bat", BAT_TRIM);
  tegTrim = prefs.getFloat("teg", TEG_TRIM);
  curTrim = prefs.getFloat("cur", CUR_TRIM);

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

  // MAX31855 shared bus: both CS high (idle, converting), SCK low, SO input
  pinMode(PIN_CS_HOT, OUTPUT);  digitalWrite(PIN_CS_HOT, HIGH);
  pinMode(PIN_CS_COLD, OUTPUT); digitalWrite(PIN_CS_COLD, HIGH);
  pinMode(PIN_SCK, OUTPUT);     digitalWrite(PIN_SCK, LOW);
  pinMode(PIN_MISO, INPUT);
  tcHotS.offset  = prefs.getFloat("toh", 0.0f);
  tcColdS.offset = prefs.getFloat("toc", 0.0f);
  Out.printf("Thermocouple: hot offset %+.2f C, cold offset %+.2f C (set with TH<C> / TC<C>)\n", tcHotS.offset, tcColdS.offset);
  dht.begin();
  delay(500);                                // first MAX31855 conversion needs up to 100 ms

  readSensors();
  Out.printf("Thermocouple: hot %s (%s)   cold %s (%s)\n",
             tcHotS.fault ? "--" : "ok", tcHotS.why, tcColdS.fault ? "--" : "ok", tcColdS.why);
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

  while (Serial.available()) {                            // commands from USB Serial Monitor / Web Serial
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineBuf.length() > 0) { handleLine(lineBuf); lineBuf = ""; }
    } else if (lineBuf.length() < 24) {
      lineBuf += c;
    }
  }

  while (BT.available()) {                                // commands from Bluetooth ("TEG_Charger")
    char c = BT.read();
    tBtRx = millis();
    if (c == '\n' || c == '\r') {
      if (btLineBuf.length() > 0) { handleLine(btLineBuf); btLineBuf = ""; }
    } else if (btLineBuf.length() < 24) {
      btLineBuf += c;
    }
  }
  // Also handle Bluetooth commands sent without a newline (e.g. 'a', 'c', 'o', 'k', 'r', 'v', 'B10.24')
  if (btLineBuf.length() > 0 && (uint32_t)(millis() - tBtRx) >= 80) {
    handleLine(btLineBuf);
    btLineBuf = "";
  }

  uint16_t a = alarmMask();
  bool crit = false;
  for (int i = 0; i < N_ALARMS; i++) if ((a & ALARMS[i].bit) && ALARMS[i].critical) crit = true;
  bool blink = ((now / 300) % 2 == 0);
  digitalWrite(PIN_BUZZ, (crit && blink && !muted) ? HIGH : LOW);
  // LED code:  GREEN solid = battery full / charging cut off      YELLOW solid = charging, current flowing
  //            GREEN+YELLOW = charging with a warning              YELLOW+RED = no battery or no TEG detected
  //            RED blink + buzzer = critical (hot battery, overcurrent, other critical alarm)   ALL THREE = startup / test
  bool slow = ((now / 1000) % 2 == 0);
  bool warn = a & (A_LOWBAT | A_HOTTC | A_COLDTC | A_DHT | A_ACS);
  bool ledG = false, ledY = false, ledR = false;
  if (crit || state == 5 || state == 6)      { ledR = blink; }                       // critical: red blinks with the buzzer
  else if (state == 0 || vTeg < TEG_PRESENT_V) { ledY = true; ledR = true; }         // no battery, or no TEG detected
  else if (state == 1) {                                                             // charging
    if (iTeg > 0) { ledY = true; ledG = warn; }                                      // current flowing (+green if a warning is active)
    else          { ledY = blink; ledG = warn && blink; }                            // relay closed, waiting for current: yellow blinks
  }
  else if (state == 2 || state == 3)         { ledG = true; }                        // battery full, charging cut off
  else if (state == 4)                       { ledG = slow; }                        // charging forced off by command (green slow blink)
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
