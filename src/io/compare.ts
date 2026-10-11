const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"

// 本文 HTML を、外部通信なしの文書に包む(Before 表示用。render.ts と同じ前提)
export function wrapHtml(body: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<style>html,body{margin:0}</style></head><body>${body}</body></html>`
  )
}
