import sharp from 'sharp'

const src = 'public/logo.jpg.jpg'

for (const size of [192, 512]) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(`public/icon-${size}.png`)
  console.log(`icon-${size}.png done`)
}

// favicon 32x32
await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile('public/favicon.png')
console.log('favicon.png done')
