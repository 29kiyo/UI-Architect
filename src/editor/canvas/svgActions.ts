import { createSvgNode, sanitizeSvg, toCurrentColor, type Id, type Node } from '@/core'
import { logger } from '@/shared'
import type { EditEnv } from './actions'
import { addFontFiles, isFontFile } from './fontActions'
import { addImageFiles, type FileDropAt, type ImageSinks } from './imageActions'
import { createAddNodeCommand } from './nodeCommands'
import { planPaletteDrop } from './palette'
import { selectionStore } from './selection'

export const isSvgFile = (f: File): boolean => f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)

// SVG ファイルを無害化して icon ノードとして配置(単色なら currentColor 化)。1 履歴
export function addSvgFiles(env: EditEnv, files: File[], at?: FileDropAt): Promise<Id[]> {
  return logger.runTask('add svg', async () => {
    const { doc, page, history } = env
    const items: { node: Node; parentId: Id }[] = []
    for (const f of files) {
      let info
      try {
        info = sanitizeSvg(await f.text())
      } catch (e) {
        console.warn(`SVG を読み込めません: ${f.name}`, e)
        continue
      }
      const conv = toCurrentColor(info.svg)
      const node = createSvgNode(
        { ...info, svg: conv.svg },
        f.name.replace(/\.[^.]+$/, '') || 'icon',
      )
      const i = items.length
      const plan = planPaletteDrop(
        page,
        at?.hitId,
        'icon',
        { x: (at?.world.x ?? 0) + i * 16, y: (at?.world.y ?? 0) + i * 16 },
        at?.rectOf ?? (() => undefined),
      )
      if (!plan) continue
      node.props.position = plan.node.props.position
      items.push({ node, parentId: plan.parentId })
    }
    if (items.length === 0) return []
    const run = () => {
      for (const it of items) history.execute(createAddNodeCommand(page.id, it.node, it.parentId))
    }
    if (items.length === 1) run()
    else history.transaction('add svg', run)
    const ids = items.map((it) => it.node.id)
    const deviceId = at?.deviceId ?? selectionStore.getState().activeDeviceId ?? doc.devices[0]?.id
    if (deviceId) selectionStore.getState().pickMany(ids, deviceId, false)
    return ids
  })
}

// ラスター画像は Asset、SVG は icon ノードとして追加する(選択/ドロップ/貼り付け共通)
export async function addFiles(
  env: EditEnv,
  files: File[],
  sinks: ImageSinks,
  at?: FileDropAt,
): Promise<Id[]> {
  const svgs = files.filter(isSvgFile)
  const fonts = files.filter(isFontFile)
  const rest = files.filter((f) => !isSvgFile(f) && !isFontFile(f))
  const ids: Id[] = []
  if (rest.length > 0) ids.push(...(await addImageFiles(env, rest, sinks, at)))
  if (svgs.length > 0) ids.push(...(await addSvgFiles(env, svgs, at)))
  if (fonts.length > 0) ids.push(...(await addFontFiles(env, fonts, sinks)))
  return ids
}
