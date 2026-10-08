import type { Settings } from './types'

type ElementLike = { dataset: DOMStringMap; lang: string }

// theme=system のときは data-theme を外し、OS設定(prefers-color-scheme)に任せる
export function applySettingsToElement(
  el: ElementLike,
  s: Pick<Settings, 'theme' | 'language'>,
): void {
  if (s.theme === 'system') delete el.dataset.theme
  else el.dataset.theme = s.theme
  el.lang = s.language
}
