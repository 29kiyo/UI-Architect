import type { Importer } from '@/core'
import { createHtmlImporter } from './html/importer'
import { createSandboxRenderer } from './html/render'
import { createSvgImporter } from './svg/importer'
import { createTsxImporter } from './tsx/importer'

// 組み込みの Importer(HTML/CSS・SVG・TSX)。HTML の描画幅は対象デバイスに合わせる
export function createDefaultImporters(options: { width?: number } = {}): Importer[] {
  const render = createSandboxRenderer(options.width !== undefined ? { width: options.width } : {})
  return [createHtmlImporter({ render }), createSvgImporter(), createTsxImporter()]
}
