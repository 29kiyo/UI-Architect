import createDOMPurify from 'dompurify'

export type SanitizeResult = {
  html: string
  warnings: string[]
  externalRefs: string[] // 退避した外部参照(3-F で解決)
}
export type DomWindow = Window & typeof globalThis

type Purify = ReturnType<typeof createDOMPurify>
const purifyCache = new WeakMap<object, Purify>()
function getPurify(win: DomWindow): Purify {
  let p = purifyCache.get(win)
  if (!p) {
    p = createDOMPurify(win)
    purifyCache.set(win, p)
  }
  return p
}

const FORBID_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'base',
  'meta',
]
const LOAD_ATTRS = ['src', 'srcset', 'poster']
const SVG_REF_TAGS = new Set(['image', 'use', 'feimage'])

const isInline = (v: string) => {
  const t = v.trim()
  return t === '' || /^(data:|#|ua-ext:)/i.test(t)
}

function rewriteCss(css: string, refs: Set<string>): string {
  const noImport = css.replace(/@import\s+[^;]*;?/gi, (m) => {
    refs.add(m.trim())
    return ''
  })
  return noImport.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi,
    (m, a?: string, b?: string, c?: string) => {
      const v = (a ?? b ?? c ?? '').trim()
      if (isInline(v)) return m
      refs.add(v)
      return `url("ua-ext:${encodeURIComponent(v)}")`
    },
  )
}

export function sanitizeHtml(html: string, win: DomWindow = globalThis.window): SanitizeResult {
  const purify = getPurify(win)
  const clean = String(
    purify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, svgFilters: true },
      FORBID_TAGS,
      FORBID_ATTR: ['srcdoc'],
      FORCE_BODY: true, // 先頭の <style> を残す
    }),
  )

  // 除去内容を件数つきで warnings へ
  const counts = new Map<string, number>()
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const r of purify.removed) {
    if ('element' in r) {
      const n = r.element.nodeName.toLowerCase()
      if (!n.startsWith('#') && n !== 'remove') bump(n) // remove は FORCE_BODY の内部要素
    } else if (r.attribute) {
      const n = r.attribute.name.toLowerCase()
      bump(n.startsWith('on') ? 'on*' : `@${n}`)
    }
  }
  const warnings: string[] = []
  for (const [k, n] of counts) {
    if (k === 'on*') warnings.push(`イベント属性(on*)を ${n} 件除去`)
    else if (k.startsWith('@')) warnings.push(`属性 ${k.slice(1)} を ${n} 件除去`)
    else warnings.push(`<${k}> を ${n} 件除去`)
  }

  // 外部参照の退避(DOMParser は不活性: スクリプト非実行・リソース非取得)
  const doc = new win.DOMParser().parseFromString(`<!doctype html><body>${clean}`, 'text/html')
  const refs = new Set<string>()
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase()
    const names = SVG_REF_TAGS.has(tag) ? [...LOAD_ATTRS, 'href', 'xlink:href'] : LOAD_ATTRS
    for (const name of names) {
      const v = el.getAttribute(name)
      if (v === null || isInline(v)) continue
      refs.add(v.trim())
      el.removeAttribute(name)
      el.setAttribute(`data-ua-${name.replace(':', '-')}`, v)
    }
    const style = el.getAttribute('style')
    if (style) el.setAttribute('style', rewriteCss(style, refs))
    if (tag === 'style') el.textContent = rewriteCss(el.textContent ?? '', refs)
  }
  if (refs.size > 0) warnings.push(`外部参照 ${refs.size} 件を保留(取得しない)`)

  return { html: doc.body.innerHTML, warnings, externalRefs: [...refs] }
}
