import { describe, expect, it } from 'vitest'
import { MAX_LOGO_SIDE, readImageFile } from './imageUpload'

async function makeImage(
  width: number,
  height: number,
  type: 'image/png' | 'image/jpeg',
  noisy = false
): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (noisy) {
    // Random pixels compress badly, like a photo.
    const data = ctx.createImageData(width, height)
    for (let i = 0; i < data.data.length; i++) data.data[i] = (i * 7919) % 251
    ctx.putImageData(data, 0, 0)
  } else {
    ctx.fillStyle = '#c000c0'
    ctx.fillRect(0, 0, width, height)
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type))
  return new File([blob], `test.${type.split('/')[1]}`, { type })
}

function size(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = dataUrl
  })
}

describe('readImageFile', () => {
  it('keeps a small image exactly as uploaded', async () => {
    const file = await makeImage(200, 100, 'image/png')
    const url = await readImageFile(file, MAX_LOGO_SIDE)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(await size(url)).toEqual({ width: 200, height: 100 })
  })

  it('shrinks a large photo to the limit, keeping its shape and JPEG format', async () => {
    const file = await makeImage(3000, 1500, 'image/jpeg', true)
    const url = await readImageFile(file, MAX_LOGO_SIDE)
    expect(url.startsWith('data:image/jpeg')).toBe(true)
    expect(await size(url)).toEqual({ width: 1024, height: 512 })
    expect(url.length).toBeLessThan(file.size * 1.37)
  })

  it('keeps SVGs as they are', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="5000"/>'
    const file = new File([svg], 'logo.svg', { type: 'image/svg+xml' })
    const url = await readImageFile(file, MAX_LOGO_SIDE)
    expect(url.startsWith('data:image/svg+xml')).toBe(true)
  })
})
