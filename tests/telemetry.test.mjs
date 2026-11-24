import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Pure logic helpers mirroring Tianneng TNE12-15 & MAX31855 firmware/PWA specs
function computeTne1215TempLimits(ambientC, dhtOk = true) {
  const V_OPEN = 14.6
  const V_CLOSE = 13.7
  const V_HARD = 14.8
  if (!dhtOk) return { vOpen: 14.4, vClose: V_CLOSE, vHard: V_HARD }
  if (ambientC > 25.0) {
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
    vClose: 13.7,
    vHard: 14.8,
  })
  // At 35 C (+10 C above 25 C): -0.24V cycle, -0.18V float
  assert.deepEqual(computeTne1215TempLimits(35.0, true), {
    vOpen: 14.36,
    vClose: 13.52,
    vHard: 14.56,
  })
  // DHT22 fault falls back to conservative 14.4V
  assert.equal(computeTne1215TempLimits(35.0, false).vOpen, 14.4)
})

test('Power calculation separates In-Battery Power (Vbat*I) from TEG Harvest (Vteg*I)', () => {
  const { pBat, pTeg } = computePowerMetrics(12.6, 14.2, 1.2)
  assert.equal(pBat, 15.12)
  assert.equal(pTeg, 17.04)
  assert.ok(pTeg > pBat)
})

test('Tianneng TNE12-15 SoC curve distinguishes resting/idle (0.00A or FULL-HOLD/WAITING) vs active charging (relay CLOSED + current)', () => {
  function computeSoc({ vBat, iTeg, relayOn, stateCode = 1 }) {
    if (stateCode === 0 || vBat < 6.0 || vBat > 16.5) return 0
    const isActivelyCharging = Boolean(relayOn) && stateCode === 1 && iTeg >= 0.08
    let rawPct = 0
    if (isActivelyCharging) {
      if (vBat <= 12.20) rawPct = 0
      else if (vBat <= 13.20) rawPct = ((vBat - 12.20) / 1.00) * 50
      else if (vBat <= 13.72) rawPct = 50 + ((vBat - 13.20) / 0.52) * 45
      else if (vBat < 13.85) rawPct = 95 + ((vBat - 13.72) / 0.13) * 5
      else rawPct = 100
    } else {
      if (vBat <= 11.50) rawPct = 0
      else if (vBat <= 11.80) rawPct = ((vBat - 11.50) / 0.30) * 10
      else if (vBat <= 12.25) rawPct = 10 + ((vBat - 11.80) / 0.45) * 40
      else if (vBat <= 12.75) rawPct = 50 + ((vBat - 12.25) / 0.50) * 45
      else if (vBat < 12.85) rawPct = 95 + ((vBat - 12.75) / 0.10) * 5
      else rawPct = 100
    }
    return Math.round(rawPct)
  }

  // Resting / Idle checkpoints: 11.50V=0%, 11.80V=10%, 12.25V=50%, 12.75V=95%, 12.85V-12.90V=100%
  assert.equal(computeSoc({ vBat: 11.50, iTeg: 0.0, relayOn: false, stateCode: 4 }), 0)
  assert.equal(computeSoc({ vBat: 11.80, iTeg: 0.0, relayOn: false, stateCode: 4 }), 10)
  assert.equal(computeSoc({ vBat: 12.25, iTeg: 0.0, relayOn: false, stateCode: 4 }), 50)
  assert.equal(computeSoc({ vBat: 12.75, iTeg: 0.0, relayOn: true, stateCode: 1 }), 95)
  assert.equal(computeSoc({ vBat: 12.85, iTeg: 0.0, relayOn: true, stateCode: 1 }), 100)
  assert.equal(computeSoc({ vBat: 12.90, iTeg: 0.0, relayOn: false, stateCode: 2 }), 100)

  // Active Charging checkpoints: 12.20V=0%, 13.20V=50%, 13.72V=95%, 13.85V-14.60V=100%
  assert.equal(computeSoc({ vBat: 12.20, iTeg: 0.50, relayOn: true, stateCode: 1 }), 0)
  assert.equal(computeSoc({ vBat: 13.20, iTeg: 0.50, relayOn: true, stateCode: 1 }), 50)
  assert.equal(computeSoc({ vBat: 13.72, iTeg: 0.50, relayOn: true, stateCode: 1 }), 95)
  assert.equal(computeSoc({ vBat: 13.85, iTeg: 0.50, relayOn: true, stateCode: 1 }), 100)
  assert.equal(computeSoc({ vBat: 14.60, iTeg: 0.50, relayOn: true, stateCode: 1 }), 100)

  // Disconnected / out of 6.0-16.5V window -> 0%
  assert.equal(computeSoc({ vBat: 12.85, iTeg: 0.0, relayOn: false, stateCode: 0 }), 0)
  assert.equal(computeSoc({ vBat: 5.50, iTeg: 0.0, relayOn: false, stateCode: 1 }), 0)
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
