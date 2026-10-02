import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'

// Simple pure Node.js PNG encoder without external dependencies
function createPng(width, height, drawPixel) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type RGBA
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData)

  // Raw Scanlines: each row has 1 filter byte (0) + width * 4 bytes (RGBA)
  const rawData = Buffer.alloc(height * (1 + width * 4))
  let offset = 0

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0 // Filter type None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height)
      rawData[offset++] = r
      rawData[offset++] = g
      rawData[offset++] = b
      rawData[offset++] = a
    }
  }

  // Compress with zlib
  const compressed = zlib.deflateSync(rawData)
  const idatChunk = createChunk('IDAT', compressed)

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)

  const typeBuf = Buffer.from(type, 'ascii')
  const payload = Buffer.concat([typeBuf, data])

  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(payload), 0)

  return Buffer.concat([len, payload, crcBuf])
}

// Drawing function for Padayon Biomass-TEG Icon
function drawPadayonIcon(x, y, w, h) {
  const cx = w / 2
  const cy = h / 2
  const r = w * 0.45

  // Distance from center
  const dx = (x - cx) / r
  const dy = (y - cy) / r
  const distSq = dx * dx + dy * dy

  // Rounded squircle background
  // (|dx|^3.5 + |dy|^3.5) <= 1
  const squircle = Math.pow(Math.abs(dx), 3.5) + Math.pow(Math.abs(dy), 3.5)

  if (squircle > 1.0) {
    // Transparent outside
    return [0, 0, 0, 0]
  }

  // Border glow
  if (squircle > 0.90) {
    return [37, 99, 235, 255] // Blue border #2563EB
  }

  // Dark slate gradient background
  const grad = y / h
  const bgR = Math.round(15 * (1 - grad) + 6 * grad)
  const bgG = Math.round(23 * (1 - grad) + 13 * grad)
  const bgB = Math.round(42 * (1 - grad) + 26 * grad)

  // Inner icon: Flame / Lightning bolt shape
  // Let's create a centered diamond / flame & lightning silhouette
  const nx = (x - cx) / (w * 0.28)
  const ny = (y - cy) / (h * 0.35)

  // Lightning bolt shape
  const inLightning =
    (nx > -0.6 && nx < 0.2 && ny > -0.8 && ny < 0.1 && (ny - 2 * nx < 0.2)) ||
    (nx > -0.2 && nx < 0.6 && ny > -0.1 && ny < 0.8 && (ny - 2 * nx > -0.4)) ||
    (nx > -0.5 && nx < 0.5 && Math.abs(ny) < 0.15)

  if (inLightning) {
    // Bright yellow/amber lightning bolt
    return [251, 191, 36, 255]
  }

  // Outer flame halo
  const flameDist = nx * nx + (ny + 0.1) * (ny + 0.1)
  if (flameDist < 0.85) {
    return [234, 88, 12, 230] // Orange flame
  }

  return [bgR, bgG, bgB, 255]
}

// Generate icon-192.png and icon-512.png
const outDir = path.resolve('public')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const png192 = createPng(192, 192, drawPadayonIcon)
fs.writeFileSync(path.join(outDir, 'icon-192.png'), png192)
console.log('Created public/icon-192.png (' + png192.length + ' bytes)')

const png512 = createPng(512, 512, drawPadayonIcon)
fs.writeFileSync(path.join(outDir, 'icon-512.png'), png512)
console.log('Created public/icon-512.png (' + png512.length + ' bytes)')
