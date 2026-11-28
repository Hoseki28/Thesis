import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Pure logic helpers mirroring Tianneng TNE12-15 & MAX31855 firmware/PWA specs
function computeTne1215TempLimits(ambientC, dhtOk = true) {
  const V_OPEN = 14.6
  const V_CLOSE = 12.9
  const V_HARD = 14.8
  if (!dhtOk) return { vOpen: 14.2, vClose: V_CLOSE, vHard: V_HARD }
  if (ambientC !== 25.0) {
    const dt = ambientC - 25.0
    return {
      vOpen: Number((V_OPEN - dt * 0.024).toFixed(3)),
      vClose: Number((V_CLOSE - dt * 0.018).toFixed(3)),
      vHard: Number((V_HARD - dt * 0.024).toFixed(3)),
    }
  }
  return { vOpen: V_OPEN, vClose: V_CLOSE, vHard: V_HARD }
}

function computePowerMetrics(vBat, vTeg, iCharge) {
  return {
    pBat: Math.round(vBat * iCharge * 100) / 100,
    pTeg: Math.round(vTeg * iCharge * 100) / 100,
  }
}

test('Tianneng TNE12-15 temperature-compensated charging limits', () => {
  assert.deepEqual(computeTne1215TempLimits(25.0, true), {
    vOpen: 14.6,
    vClose: 12.9,
    vHard: 14.8,
  })
  // At 35 C (+10 C above 25 C): -0.24V cycle, -0.18V float
  assert.deepEqual(computeTne1215TempLimits(35.0, true), {
    vOpen: 14.36,
    vClose: 12.72,
    vHard: 14.56,
  })
  // DHT22 fault falls back to conservative 14.2V
  assert.equal(computeTne1215TempLimits(35.0, false).vOpen, 14.2)
})

test('Power calculation separates In-Battery Power (Vbat*I) from TEG Harvest (Vteg*I)', () => {
  const { pBat, pTeg } = computePowerMetrics(12.6, 14.2, 1.2)
  assert.equal(pBat, 15.12)
  assert.equal(pTeg, 17.04)
  assert.ok(pTeg > pBat)
})

test('Tianneng TNE12-15 SoC curve matches ESP32 interpCurve (resting OCV vs IR-compensated charging + >13.8V <=0.20A taper)', () => {
  const vRest = [11.50, 11.80, 12.05, 12.25, 12.45, 12.65, 12.75, 12.85]
  const socRest = [0.0, 10.0, 25.0, 50.0, 75.0, 90.0, 95.0, 100.0]
  const vChg = [12.20, 12.70, 13.20, 13.60, 14.00]
  const socChg = [0.0, 25.0, 50.0, 75.0, 92.0]

  function interpCurve(x, xs, ys) {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
    for (let i = 0; i < xs.length - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        const span = xs[i + 1] - xs[i]
        return ys[i] + ((x - xs[i]) / span) * (ys[i + 1] - ys[i])
      }
    }
    return ys[ys.length - 1]
  }

  function computeSoc({ vBat, iTeg, relayOn, stateCode = 1, vOpenNow = 14.6 }) {
    if (stateCode === 0 || vBat < 6.0 || vBat > 16.5) return 0
    if (stateCode === 2 || stateCode === 7) return 100
    const chargingActive = Boolean(relayOn) && iTeg > 0.0
    let rawPct = 0
    if (chargingActive) {
      const effV = vBat - iTeg * 0.15
      rawPct = interpCurve(effV, vChg, socChg)
      const taperStartA = 0.35
      const taperMaxA = 0.20
      if (vBat >= vOpenNow - 0.15 && iTeg < taperStartA) {
        const taperFrac = Math.min(1.0, Math.max(0.0, (taperStartA - iTeg) / (taperStartA - taperMaxA)))
        rawPct += 8.0 * taperFrac
      }
      if (vBat >= vOpenNow) rawPct = 100
    } else {
      rawPct = interpCurve(vBat, vRest, socRest)
    }
    return Math.min(100, Math.max(0, Math.round(rawPct)))
  }

  // Resting OCV checkpoints
  assert.equal(computeSoc({ vBat: 11.50, iTeg: 0.0, relayOn: false, stateCode: 4 }), 0)
  assert.equal(computeSoc({ vBat: 11.80, iTeg: 0.0, relayOn: false, stateCode: 4 }), 10)
  assert.equal(computeSoc({ vBat: 12.25, iTeg: 0.0, relayOn: false, stateCode: 4 }), 50)
  assert.equal(computeSoc({ vBat: 12.65, iTeg: 0.0, relayOn: true, stateCode: 1 }), 90)
  assert.equal(computeSoc({ vBat: 12.85, iTeg: 0.0, relayOn: false, stateCode: 3 }), 100)
  // FULL-HOLD (state 2) & FULL (state 7) clamp immediately to 100%
  assert.equal(computeSoc({ vBat: 12.60, iTeg: 0.0, relayOn: false, stateCode: 2 }), 100)
  assert.equal(computeSoc({ vBat: 12.95, iTeg: 0.0, relayOn: false, stateCode: 7 }), 100)

  // Active Charging near vOpenNow (14.60 - 0.15 = 14.45V) with <=0.20A taper reaches 100%
  assert.equal(computeSoc({ vBat: 14.45, iTeg: 0.20, relayOn: true, stateCode: 1, vOpenNow: 14.6 }), 100)
  assert.equal(computeSoc({ vBat: 12.85, iTeg: 0.0, relayOn: false, stateCode: 0 }), 0)
})

test('PWA icon binaries are real PNG files (not Git LFS pointers)', () => {
  for (const icon of ['public/icon-192.png', 'public/icon-512.png']) {
    const buf = fs.readFileSync(path.resolve(icon))
    assert.ok(buf.length > 500, `${icon} should be >500 bytes, got ${buf.length}`)
    assert.deepEqual(
      [...buf.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `${icon} must start with PNG magic header`
    )
  }
})

test('PWA manifest and service worker exist and are valid', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve('public/manifest.json'), 'utf8'))
  assert.equal(manifest.display, 'standalone')
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2)
  const sw = fs.readFileSync(path.resolve('public/sw.js'), 'utf8')
  assert.match(sw, /caches\.open/)
  assert.match(sw, /cache\.addAll/)
})

test('Charging indicator appears only while charging and hides when idle/open/disconnected', () => {
  function computeIsActivelyCharging({
    isConnected,
    relayOn,
    stateCode,
    stateName,
    vBat,
    vTeg,
    iTeg,
  }) {
    const cleanName = (stateName || '').trim()
    const hasValidBattery =
      isConnected && stateCode !== 0 && cleanName !== 'NO BATTERY' && vBat >= 6.0 && vBat <= 16.5
    return (
      hasValidBattery &&
      Boolean(relayOn) &&
      (stateCode === 1 || cleanName === 'CHARGING') &&
      (iTeg > 0 || vTeg >= vBat - 0.15 || vBat >= 13.0)
    )
  }

  // Active bulk charging (current flowing) -> show bolt
  assert.equal(
    computeIsActivelyCharging({
      isConnected: true,
      relayOn: true,
      stateCode: 1,
      stateName: 'CHARGING   ',
      vBat: 12.6,
      vTeg: 13.8,
      iTeg: 0.45,
    }),
    true
  )
  // High-voltage absorption/taper stage (14.04V, relay closed, current below 0.08A deadband) -> show bolt
  assert.equal(
    computeIsActivelyCharging({
      isConnected: true,
      relayOn: true,
      stateCode: 1,
      stateName: 'CHARGING',
      vBat: 14.04,
      vTeg: 14.1,
      iTeg: 0.0,
    }),
    true
  )
  // Forced ON with dead TEG & resting battery -> hide bolt
  assert.equal(
    computeIsActivelyCharging({
      isConnected: true,
      relayOn: true,
      stateCode: 1,
      stateName: 'CHARGING',
      vBat: 12.5,
      vTeg: 0.0,
      iTeg: 0.0,
    }),
    false
  )
  // Relay open / non-charging / disconnected states -> hide bolt
  for (const [stateCode, stateName] of [
    [2, 'FULL-HOLD'],
    [7, 'FULL'],
    [3, 'WAITING'],
    [4, 'FORCED OFF'],
    [5, 'TEMP LOCKOUT'],
    [6, 'OVERCURRENT'],
    [0, 'NO BATTERY'],
  ]) {
    assert.equal(
      computeIsActivelyCharging({
        isConnected: true,
        relayOn: false,
        stateCode,
        stateName,
        vBat: stateCode === 0 ? 0.0 : 12.85,
        vTeg: 13.5,
        iTeg: 0.0,
      }),
      false
    )
  }
  assert.equal(
    computeIsActivelyCharging({
      isConnected: false,
      relayOn: true,
      stateCode: 1,
      stateName: 'CHARGING',
      vBat: 14.04,
      vTeg: 14.2,
      iTeg: 0.5,
    }),
    false
  )
})
