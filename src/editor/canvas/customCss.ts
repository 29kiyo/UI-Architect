// Custom CSS(エスケープハッチ)の宣言だけを解析する。ルールブロックや変数は扱わない
const NAME_RE = /^[a-z]+(-[a-z]+)*$/
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

export function parseCustomCss(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of css.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const name = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).trim()
    if (!NAME_RE.test(name) || value === '') continue
    // カッコの対応が取れない値(; で切れた url(data:...) など)は捨てる
    if (value.split('(').length !== value.split(')').length) continue
    if (/[{}<>\\]|!important|expression\(|@import/i.test(value)) continue
    // url() は Custom CSS では使わない(data: は ; を含み分割できないため。背景画像は専用項目から)
    if (/url\(/i.test(value)) continue
    out[camel(name)] = value
  }
  return out
}
