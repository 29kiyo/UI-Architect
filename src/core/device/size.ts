import type { Command } from '../history'
import type { Device, Id } from '../model'

// 実効サイズ: landscape は長辺が幅、portrait は短辺が幅(元の width/height は保持)
export function deviceSize(d: Pick<Device, 'width' | 'height' | 'orientation'>): {
  width: number
  height: number
} {
  const long = Math.max(d.width, d.height)
  const short = Math.min(d.width, d.height)
  return d.orientation === 'landscape'
    ? { width: long, height: short }
    : { width: short, height: long }
}

export type DevicePatch = {
  orientation?: Device['orientation']
  safeArea?: Device['safeArea']
}

export const createUpdateDeviceCommand = (
  deviceId: Id,
  patch: DevicePatch,
  name = 'edit-device',
): Command => ({
  name,
  apply: (d) => {
    const dev = d.devices.find((x) => x.id === deviceId)
    if (!dev) throw new Error(`device not found: ${deviceId}`)
    if (patch.orientation) dev.orientation = patch.orientation
    if (patch.safeArea) dev.safeArea = { ...patch.safeArea }
  },
})
