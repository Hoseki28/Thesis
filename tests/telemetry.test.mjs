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
