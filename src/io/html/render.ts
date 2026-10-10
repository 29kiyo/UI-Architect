import type { HtmlRenderer } from './importer'

export type SandboxRenderOptions = {
  width?: number
  height?: number
  timeoutMs?: number
  host?: Document
}

// scripts 不可(allow-scripts なし)+ CSP で外部通信を禁止。スタイル解決のみ許可する
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"

const wrap = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
  `<style>html,body{margin:0}</style></head><body>${html}</body></html>`

export function createSandboxRenderer(options: SandboxRenderOptions = {}): HtmlRenderer {
  const width = options.width ?? 1280
  const height = options.height ?? 800
  const timeoutMs = options.timeoutMs ?? 5000

  return (html, ctx) =>
    new Promise((resolve, reject) => {
      const host = options.host ?? document
      if (ctx.signal?.aborted) {
        reject(ctx.signal.reason)
        return
      }
      const iframe = host.createElement('iframe')
      iframe.setAttribute('sandbox', 'allow-same-origin')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.tabIndex = -1
      iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;`
      const dispose = () => iframe.remove()

      const onAbort = () => {
        cleanup()
        dispose()
        reject(ctx.signal?.reason)
      }
      const timer = setTimeout(() => {
        cleanup()
        dispose()
        reject(new Error('描画がタイムアウトしました'))
      }, timeoutMs)
      function cleanup() {
        clearTimeout(timer)
        ctx.signal?.removeEventListener('abort', onAbort)
      }
      ctx.signal?.addEventListener('abort', onAbort, { once: true })

      iframe.addEventListener(
        'load',
        () => {
          cleanup()
          const doc = iframe.contentDocument
          const win = iframe.contentWindow
          if (!doc || !win) {
            dispose()
            reject(new Error('描画用の文書にアクセスできません'))
            return
          }
          // srcdoc 非対応の環境(jsdom 等)では空文書で load するため、書き込んで補う
          if (!doc.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
            doc.open()
            doc.write(wrap(html))
            doc.close()
          }
          const body = doc.body
          resolve({
            root: body,
            getStyle: (el) => {
              const cs = win.getComputedStyle(el)
              return (name) => cs.getPropertyValue(name)
            },
            getRect: (el) => {
              const r = el.getBoundingClientRect()
              const b = body.getBoundingClientRect()
              return { x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height }
            },
            dispose,
          })
        },
        { once: true },
      )

      iframe.srcdoc = wrap(html)
      host.body.appendChild(iframe)
    })
}
