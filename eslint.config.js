import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const LAYERS = ['shared', 'settings', 'core', 'io', 'editor', 'runtime', 'ai', 'codegen', 'assets']
const UPPER = ['io', 'editor', 'runtime', 'ai', 'codegen', 'assets']

// 指定フォルダから、allowed 以外の src 直下フォルダを使うことを禁止する
const restrict = (dir, allowed) => ({
  files: [`src/${dir}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...LAYERS.filter((l) => l !== dir && !allowed.includes(l)).map((l) => ({
            group: [`@/${l}`, `@/${l}/*`],
            message: `${dir} から ${l} は使えません(依存方向のルール)`,
          })),
          // 公開API(index.ts)以外への直接参照を禁止
          ...LAYERS.filter((l) => l !== dir).map((l) => ({
            group: [`@/${l}/*`],
            message: `@/${l} の index.ts 経由で使ってください`,
          })),
        ],
      },
    ],
  },
})

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'docs', 'tests/fixtures']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      prettier,
    ],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
  },
  restrict('shared', []),
  restrict('settings', ['shared']),
  restrict('core', ['shared']),
  ...UPPER.map((d) => restrict(d, ['core', 'shared', 'settings'])),
])
