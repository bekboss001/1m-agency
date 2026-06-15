import sharp from 'sharp'
import { writeFileSync } from 'fs'

// SVG icon: black bg, lime rounded square, "1M" text
function svg(size) {
  const r = size * 0.18
  const pad = size * 0.12
  const sq = size * 0.76
  const fs = size * 0.36
  const cy = size * 0.52
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0A0A0A"/>
  <rect x="${pad}" y="${pad}" width="${sq}" height="${sq}" rx="${r}" fill="#D6F84A"/>
  <text x="50%" y="${cy}" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial Black, Arial" font-weight="900" font-size="${fs}" fill="#0A0A0A">1M</text>
</svg>`
}

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icon-${size}.png`)
  console.log(`icon-${size}.png done`)
}
