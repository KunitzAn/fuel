// Временная иконка приложения: белое пламя (Lucide `flame`) на оранжевом.
// Финальная — на этапе 8 (визуал). Генерирует всё, что ссылается манифест и
// index.html: favicon.svg, apple-touch-icon.png, icons/*.png.
// Запуск: node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')

const BG = '#f97316'
const FLAME = 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'

/**
 * @param {number} size — сторона в px
 * @param {number} scale — доля стороны, которую занимает пламя
 * @param {number} radius — скругление фона в долях стороны (0 — квадрат)
 */
function iconSvg(size, scale, radius) {
  const glyph = size * scale
  const offset = (size - glyph) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${glyph / 24})">
    <path d="${FLAME}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`
}

async function png(file, size, scale) {
  // Фон без скругления: iOS и Android скругляют иконку сами.
  await sharp(Buffer.from(iconSvg(size, scale, 0)))
    .png()
    .toFile(path.join(publicDir, file))
  console.log('generated', file)
}

await mkdir(path.join(publicDir, 'icons'), { recursive: true })
await writeFile(path.join(publicDir, 'favicon.svg'), iconSvg(64, 0.62, 0.22))
console.log('generated favicon.svg')
await png('apple-touch-icon.png', 180, 0.6)
await png('icons/icon-192.png', 192, 0.6)
await png('icons/icon-512.png', 512, 0.6)
// maskable: Android может обрезать до круга — держим знак внутри безопасной зоны (~80%)
await png('icons/icon-512-maskable.png', 512, 0.48)
