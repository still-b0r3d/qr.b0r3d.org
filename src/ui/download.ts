// Handing a file to the browser to save.

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  // some browsers read the file a moment after the click
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
