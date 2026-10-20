import sharp from 'sharp';

await sharp('design/gmi-logo.png')
  .avif({ lossless: true, effort: 9, chromaSubsampling: '4:4:4' })
  .toFile('public/gmi-logo.avif');
