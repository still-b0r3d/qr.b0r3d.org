// Scan with the camera, as b0r3d QR for PC has it: "Starting the camera…", then what it sees with a
// frame to aim with (any part of the picture is read), read a few times a second until a code turns
// up. That code goes to the Scan tab, the camera stops and the window closes. A list of the cameras
// when there's more than one; a message saying why when a camera can't be used; Cancel (Esc) stops
// it all. Nothing the camera sees is kept.

import { scannedCode, type ScannedCode } from '../qr/scanned'
import { h } from './dom'
import { ReaderUnavailable, ReadStopped, thumbnailOf, type PictureReader } from './picture-reader'

/** the pause between reads, and the longer side the camera's pictures are read at */
export const READ_EVERY_MS = 120
export const MAX_SIDE = 1280

export interface Camera {
  readonly el: HTMLDialogElement
  open(): void
}

/** Why the camera can't be used, in the PC app's words where they fit, and the browser's own. */
function problemOf(e: unknown): { words: string; detail: string } {
  if (e instanceof ReaderUnavailable) return { words: e.message, detail: '' }
  const name = e instanceof DOMException ? e.name : ''
  const said = e instanceof Error ? e.message.trim().replace(/\.$/, '') : ''
  const detail = said.length > 0 ? said[0].toUpperCase() + said.slice(1) + '.' : ''
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { words: "b0r3d QR can't find a camera on this device.", detail }
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return { words: "This browser isn't letting b0r3d QR use the camera. Allow the camera for this site in the browser's settings, then try again.", detail }
  if (name === 'NotReadableError') return { words: 'Another app is using the camera. Close it, then try again.', detail }
  return { words: "The camera didn't start.", detail }
}

/** names to choose by: "Camera 2" for one without, "USB Camera (2)" for a second one called the same (in any case) */
function cameraNames(devices: MediaDeviceInfo[]): string[] {
  const seen = new Map<string, number>()
  return devices.map((d, i) => {
    const name = d.label.trim().length > 0 ? d.label.trim() : `Camera ${i + 1}`
    const count = (seen.get(name.toLowerCase()) ?? 0) + 1
    seen.set(name.toLowerCase(), count)
    return count > 1 ? `${name} (${count})` : name
  })
}

export function makeCamera(reader: PictureReader, onFound: (code: ScannedCode, thumbnail: string | undefined) => void): Camera {
  const video = h('video', { class: 'camera-video', muted: true, playsinline: true, autoplay: true, 'aria-label': 'Camera view' })
  video.muted = true
  const veil = h('div', { class: 'camera-veil', hidden: true })
  const starting = h('p', { class: 'camera-starting', 'aria-live': 'polite' }, 'Starting the camera…')
  const problemText = h('p', { class: 'camera-problem', 'aria-live': 'assertive', 'data-testid': 'camera-problem' })
  const detailText = h('p', { class: 'hint camera-detail' })
  const problemPanel = h('div', { class: 'camera-problem-panel', hidden: true }, problemText, detailText)
  const stage = h('div', { class: 'camera-stage' }, h('div', { class: 'camera-view' }, video, veil), starting, problemPanel)
  const choice = h('select', { id: 'camera-choice', 'aria-label': 'Camera' })
  const choiceRow = h('div', { class: 'camera-choice', hidden: true }, h('label', { for: 'camera-choice' }, 'Camera'), choice)
  const cancel = h('button', { type: 'button', title: 'Close the camera (Esc)' }, 'Cancel')
  const dialog = h(
    'dialog',
    { class: 'camera-dialog', 'aria-labelledby': 'camera-title', 'data-testid': 'camera-dialog' },
    h('div', { class: 'dialog-head camera-head' }, h('h2', { id: 'camera-title' }, 'Scan with the camera'), choiceRow),
    stage,
    h('p', { class: 'hint' }, 'Hold a code up to the camera: the first one it sees goes to the Scan tab. Nothing the camera sees is saved.'),
    h('div', { class: 'buttons dialog-foot' }, cancel)
  )

  let stream: MediaStream | null = null
  let session = 0 // each start of a camera; a newer one (or closing) ends the older one's reads
  let timer = 0
  let looks = 0
  let devices: MediaDeviceInfo[] = []
  const frame = document.createElement('canvas')

  function stopCamera(): void {
    session++
    clearTimeout(timer)
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    video.srcObject = null
  }

  function show(state: 'starting' | 'running' | 'problem'): void {
    starting.hidden = state !== 'starting'
    problemPanel.hidden = state !== 'problem'
    veil.hidden = state !== 'running'
    video.hidden = state === 'problem'
    stage.classList.toggle('trouble', state === 'problem')
    if (state === 'starting') {
      // said again for each camera started
      starting.textContent = ''
      requestAnimationFrame(() => (starting.textContent = 'Starting the camera…'))
    }
  }

  function fail(e: unknown): void {
    stopCamera()
    const p = problemOf(e)
    problemText.textContent = ''
    detailText.textContent = p.detail
    detailText.hidden = p.detail.length === 0
    show('problem')
    // written once the panel is on show, so screen readers say it
    requestAnimationFrame(() => (problemText.textContent = p.words))
  }

  async function start(deviceId: string | null): Promise<void> {
    stopCamera()
    const mine = session
    show('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      fail(new DOMException("This browser doesn't let pages use a camera here", 'NotSupportedError'))
      return
    }
    try {
      const got = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      if (mine !== session || !dialog.open) {
        for (const track of got.getTracks()) track.stop()
        return
      }
      stream = got
      const track = got.getVideoTracks()[0]
      // a camera that stops (unplugged, or taken by another app) says so
      track?.addEventListener('ended', () => {
        if (mine === session) fail(new DOMException('the camera stopped sending pictures', 'AbortError'))
      })
      video.srcObject = got
      await video.play().catch(() => undefined)
      if (mine !== session) return
      await listCameras(track?.getSettings().deviceId ?? null)
      if (mine !== session) return
      // shown mirrored when it faces you, as the site always has (a camera named "front" or "user" too)
      video.classList.toggle('mirrored', track?.getSettings().facingMode === 'user' || /front|user/i.test(track?.label ?? ''))
      show('running')
      looks = 0
      timer = window.setTimeout(() => void look(mine), READ_EVERY_MS)
    } catch (e) {
      if (mine !== session) return
      // the cameras there are, so another one can still be chosen
      await listCameras(deviceId)
      if (mine === session) fail(e)
    }
  }

  async function listCameras(current: string | null): Promise<void> {
    try {
      // (before the camera is allowed, a browser may list cameras it won't name or let be chosen)
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId.length > 0)
    } catch {
      devices = []
    }
    const names = cameraNames(devices)
    choice.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId }, names[i])))
    if (current) choice.value = current
    choiceRow.hidden = devices.length < 2
  }

  /** One of the camera's pictures read for a code (light on dark too, every other one). */
  async function look(mine: number): Promise<void> {
    if (mine !== session) return
    const w = video.videoWidth
    const hgt = video.videoHeight
    if (w > 0 && hgt > 0) {
      const k = Math.min(1, MAX_SIDE / Math.max(w, hgt))
      frame.width = Math.max(1, Math.round(w * k))
      frame.height = Math.max(1, Math.round(hgt * k))
      const ctx = frame.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(video, 0, 0, frame.width, frame.height)
        try {
          const found = await reader.read(ctx.getImageData(0, 0, frame.width, frame.height), 'frame', looks++ % 2 === 1)
          if (mine !== session) return
          if (found.length > 0) {
            // the camera's name when there's a choice of them, as the PC app says it
            const name = choice.selectedOptions[0]?.textContent ?? ''
            const code = scannedCode(found[0], devices.length > 1 && name.length > 0 ? name : 'the camera', frame.width, frame.height)
            const thumbnail = thumbnailOf(frame, code.box)
            stopCamera()
            dialog.close()
            onFound(code, thumbnail)
            return
          }
        } catch (e) {
          if (e instanceof ReadStopped || mine !== session) return
          // nothing can be read without the reader; any other look that failed finds nothing, and
          // the next one goes on, as in the PC app
          if (e instanceof ReaderUnavailable) {
            fail(e)
            return
          }
        }
      }
    }
    timer = window.setTimeout(() => void look(mine), READ_EVERY_MS)
  }

  choice.addEventListener('change', () => void start(choice.value))
  cancel.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    stopCamera()
    frame.width = frame.height = 0
    reader.release()
  })

  return {
    el: dialog,
    open() {
      if (dialog.open) return
      problemText.textContent = ''
      dialog.showModal()
      void start(null)
    }
  }
}
