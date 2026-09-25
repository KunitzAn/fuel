// Иконка приложения — тост с надписью FUEL кремом-глазурью на розовом
// фоне (scripts/assets/icon-source.jpg, квадрат).
// Генерирует всё, что ссылается манифест и index.html: favicon.svg (raster
// внутри svg-обёртки — простой способ не городить растровый .ico),
// apple-touch-icon.png, icons/*.png.
// Запуск: node scripts/generate-icons.mjs
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const sourceJpg = path.join(__dirname, 'assets', 'icon-source.jpg')

// Фон фото — используется как поле вокруг картинки в maskable-варианте
// (Android может обрезать иконку в круг, поэтому там нужен запас по краям).
const BG = '#feb1d0'

async function squarePng(file, size) {
  await sharp(sourceJpg).resize(size, size).png().toFile(path.join(publicDir, file))
  console.log('generated', file)
}

/** Контент занимает ~72% канвы — безопасная зона под маску-круг Android. */
async function maskablePng(file, size) {
  const inner = Math.round(size * 0.72)
  const mark = await sharp(sourceJpg).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, file))
  console.log('generated', file)
}

await mkdir(path.join(publicDir, 'icons'), { recursive: true })

// favicon.svg: <image> с встроенным base64 — вкладки браузера принимают
// svg-иконки и с растровым содержимым внутри, отдельный .ico не нужен.
const faviconSize = 64
const faviconPng = await sharp(sourceJpg).resize(faviconSize, faviconSize).png().toBuffer()
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${faviconSize}" height="${faviconSize}"><image width="${faviconSize}" height="${faviconSize}" href="data:image/png;base64,${faviconPng.toString('base64')}"/></svg>`
await writeFile(path.join(publicDir, 'favicon.svg'), faviconSvg)
console.log('generated favicon.svg')

await squarePng('apple-touch-icon.png', 180)
await squarePng('icons/icon-192.png', 192)
await squarePng('icons/icon-512.png', 512)
await maskablePng('icons/icon-512-maskable.png', 512)
