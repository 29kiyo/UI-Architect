import { useEffect } from 'react'
import { applySettingsToElement, SettingsPanel, useSettings } from '@/settings'

export default function App() {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)

  useEffect(() => {
    applySettingsToElement(document.documentElement, { theme, language })
  }, [theme, language])

  return (
    <>
      <h1>UI-Architect</h1>
      <SettingsPanel />
    </>
  )
}
