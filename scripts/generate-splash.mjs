// Генерирует сплэш-скрины для apple-touch-startup-image (холодный запуск
// PWA на iOS — без них экран несколько секунд стоит белым до монтирования
// Vue). Марка — тот же apple-touch-icon.png, что уже в манифесте.
// В отличие от daylens — две серии, светлая и тёмная: тема в Fuel по
// системной, и белый сплэш перед тёмным приложением ночью слепит.
// Запуск: node scripts/generate-splash.mjs — печатает готовые <link>-теги.
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const markPng = path.join(__dirname, '..', 'public', 'apple-touch-icon.png')
const outDir = path.join(__dirname, '..', 'public', 'splash')

// = --color-bg в src/style.css и theme-color в index.html
const THEMES = [
  { suffix: 'light', bg: '#f5f5f4', scheme: 'light' },
  { suffix: 'dark', bg: '#0c0a09', scheme: 'dark' },
]

// device-width x device-height (CSS px, portrait) + DPR — актуальный модельный
// ряд iPhone плюс более старые размеры, которые ещё встречаются.
const devices = [
  { name: 'iphone-440x956-3x', width: 440, height: 956, dpr: 3 }, // 16 Pro Max
  { name: 'iphone-430x932-3x', width: 430, height: 932, dpr: 3 }, // 15/16 Plus, Pro Max
  { name: 'iphone-402x874-3x', width: 402, height: 874, dpr: 3 }, // 16 Pro
  { name: 'iphone-393x852-3x', width: 393, height: 852, dpr: 3 }, // 15/16, 15 Pro
  { name: 'iphone-428x926-3x', width: 428, height: 926, dpr: 3 }, // 12/13/14 Pro Max, 14 Plus
  { name: 'iphone-390x844-3x', width: 390, height: 844, dpr: 3 }, // 12/13/14, 12/13 Pro
  { name: 'iphone-375x812-3x', width: 375, height: 812, dpr: 3 }, // X/XS/11 Pro/12/13 mini
  { name: 'iphone-414x896-3x', width: 414, height: 896, dpr: 3 }, // XS Max/11 Pro Max
  { name: 'iphone-414x896-2x', width: 414, height: 896, dpr: 2 }, // XR/11
  { name: 'iphone-414x736-3x', width: 414, height: 736, dpr: 3 }, // 6s/7/8 Plus
  { name: 'iphone-375x667-2x', width: 375, height: 667, dpr: 2 }, // SE2/SE3/6s/7/8
]

const markPx = 120 // размер марки на сплэше в CSS px
const radiusRatio = 0.22 // скругление угла марки — как у иконки на домашнем экране

async function roundedMark(sizePx) {
  const mask = Buffer.from(
    `<svg width="${sizePx}" height="${sizePx}"><rect width="${sizePx}" height="${sizePx}" rx="${Math.round(sizePx * radiusRatio)}" fill="#fff"/></svg>`,
  )
  return sharp(markPng)
    .resize(sizePx, sizePx)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

const linkTags = []

for (const theme of THEMES) {
  for (const d of devices) {
    const w = d.width * d.dpr
    const h = d.height * d.dpr
    const mark = await roundedMark(Math.round(markPx * d.dpr))
    const file = `${d.name}-${theme.suffix}.png`

    await sharp({ create: { width: w, height: h, channels: 4, background: theme.bg } })
      .composite([{ input: mark, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, file))

    console.log('generated', file, `${w}x${h}`)

    linkTags.push(
      `<link rel="apple-touch-startup-image" href="/splash/${file}" media="screen and (device-width: ${d.width}px) and (device-height: ${d.height}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${theme.scheme})">`,
    )
  }
}

console.log('\n--- вставить в index.html ---\n')
console.log(linkTags.join('\n'))
