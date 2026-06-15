import sharp from 'sharp'

const src = 'public/1MIOSLOGO.jpg'

for (const size of [192, 512]) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(`public/icon-${size}.png`)
  console.log(`icon-${size}.png done`)
}

// iOS 180x180
await sharp(src)
  .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile('public/icon-180.png')
console.log('icon-180.png done')

// favicon 32x32
await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .png()
  .toFile('public/favicon.png')
console.log('favicon.png done')
