/**
 * Render the plugin's storefront icon to a 180x180 PNG.
 *
 * The market accepts only GitHub-hosted raster images for an entry icon, so the
 * same mark that ships as `icon.svg` is rasterized here without any image
 * dependency: shapes are evaluated per subpixel, box-filtered down, and written
 * as a plain RGBA PNG.
 *
 * Usage: node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 180
const SAMPLES = 4
const BRAND = [0x24, 0x7b, 0xbf]
const INK = [0xff, 0xff, 0xff]

/** Circle centre, radius and stroke width of the refresh ring, in icon pixels. */
const CENTER = [90, 94]
const RADIUS = 42
const STROKE = 13

/** The ring's gap sits in the upper right; the arc runs clockwise from here. */
const ARC_START = 20
const ARC_END = 290

/** Arrowhead at the arc's open end, pointing along the sweep. */
const HEAD_LENGTH = 20
const HEAD_HALF_WIDTH = 10
/** Pull the head's base back along the arc so it joins the stroke cleanly. */
const HEAD_INSET = 4

const toRadians = (degrees) => (degrees * Math.PI) / 180

/** Rounded-rectangle coverage for one subpixel. */
function insideRoundedSquare(x, y, edge, radius) {
  const dx = Math.max(edge - x, 0, x - (SIZE - edge))
  const dy = Math.max(edge - y, 0, y - (SIZE - edge))
  if (dx === 0 && dy === 0) return true
  return Math.hypot(dx, dy) <= radius
}

/** The refresh ring: an annulus clipped to the arc's angular range. */
function insideRing(x, y) {
  const dx = x - CENTER[0]
  const dy = y - CENTER[1]
  const distance = Math.hypot(dx, dy)
  if (distance < RADIUS - STROKE / 2 || distance > RADIUS + STROKE / 2) return false
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angle < 0) angle += 360
  return angle >= ARC_START && angle <= ARC_END
}

/** The arrowhead triangle at the arc's end. */
function insideHead(x, y) {
  const angle = toRadians(ARC_END)
  const radial = [Math.cos(angle), Math.sin(angle)]
  const tangent = [-Math.sin(angle), Math.cos(angle)]
  const base = [
    CENTER[0] + RADIUS * radial[0] - HEAD_INSET * tangent[0],
    CENTER[1] + RADIUS * radial[1] - HEAD_INSET * tangent[1],
  ]
  const tip = [base[0] + HEAD_LENGTH * tangent[0], base[1] + HEAD_LENGTH * tangent[1]]
  const left = [base[0] + HEAD_HALF_WIDTH * radial[0], base[1] + HEAD_HALF_WIDTH * radial[1]]
  const right = [base[0] - HEAD_HALF_WIDTH * radial[0], base[1] - HEAD_HALF_WIDTH * radial[1]]

  const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const d1 = side(left, tip, [x, y])
  const d2 = side(tip, right, [x, y])
  const d3 = side(right, left, [x, y])
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

/** Composite one subpixel sample into premultiplied-free RGBA. */
function sample(x, y) {
  const insideMark = insideRing(x, y) || insideHead(x, y)
  if (insideMark) return [...INK, 255]
  if (insideRoundedSquare(x, y, 0, 40)) return [...BRAND, 255]
  return [0, 0, 0, 0]
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
const step = 1 / SAMPLES
const weight = 1 / (SAMPLES * SAMPLES)

for (let py = 0; py < SIZE; py += 1) {
  const rowStart = py * (SIZE * 4 + 1)
  raw[rowStart] = 0
  for (let px = 0; px < SIZE; px += 1) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const [sr, sg, sb, sa] = sample(px + (sx + 0.5) * step, py + (sy + 0.5) * step)
        const alpha = sa / 255
        r += sr * alpha * weight
        g += sg * alpha * weight
        b += sb * alpha * weight
        a += sa * weight
      }
    }
    const offset = rowStart + 1 + px * 4
    const alpha = a / 255
    raw[offset] = alpha === 0 ? 0 : Math.round(r / alpha)
    raw[offset + 1] = alpha === 0 ? 0 : Math.round(g / alpha)
    raw[offset + 2] = alpha === 0 ? 0 : Math.round(b / alpha)
    raw[offset + 3] = Math.round(a)
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '..', 'assets', 'icon-180.png')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, png)
console.log(`wrote ${target} (${png.length} bytes)`)
