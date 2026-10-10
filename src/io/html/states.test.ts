// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createHtmlImporter, type HtmlRenderer } from './importer'
import { buildStateResolver } from './states'

afterEach(() => {
  document.body.innerHTML = ''
})

const mount = (html: string) => {
  const c = document.createElement('div')
  c.innerHTML = html
  document.body.appendChild(c)
  return c
}

describe('buildStateResolver', () => {
  it('末尾の擬似クラスを states に反映する(後勝ち)', () => {
    const c = mount(
      '<style>.btn{color:red}.btn:hover{background-color:blue;color:white}.btn:hover{color:black}.btn:disabled{opacity:0.5}</style><button class="btn">x</button><p>y</p>',
    )
    const r = buildStateResolver(c)
    const btn = c.querySelector('button') as Element
    expect(r.getStates(btn)).toEqual({
      hover: { backgroundColor: 'blue', color: 'black' },
      disabled: { opacity: '0.5' },
    })
    expect(r.getStates(c.querySelector('p') as Element)).toEqual({})
    expect(r.warnings).toEqual([])
  })

  it('セレクタリストと focus-visible に対応する', () => {
    const c = mount(
      '<style>a:focus-visible,button:active{outline:1px solid red}</style><a>a</a><button>b</button>',
    )
    const r = buildStateResolver(c)
    expect(r.getStates(c.querySelector('a') as Element)).toHaveProperty('focusVisible')
    expect(r.getStates(c.querySelector('button') as Element)).toHaveProperty('active')
  })

  it('複合セレクタは反映せず warnings に出す', () => {
    const c = mount(
      '<style>.a:hover .b{color:red}</style><div class="a"><span class="b">x</span></div>',
    )
    const r = buildStateResolver(c)
    expect(r.getStates(c.querySelector('.b') as Element)).toEqual({})
    expect(r.warnings).toHaveLength(1)
  })
})

describe('htmlImporter + states', () => {
  it('props.states に hover が入る', async () => {
    const render: HtmlRenderer = async (html) => {
      const c = mount(html)
      return {
        root: c,
        getStyle: (el) => {
          const cs = window.getComputedStyle(el)
          return (n) => cs.getPropertyValue(n)
        },
        getRect: () => null,
        dispose: () => c.remove(),
      }
    }
    const r = await createHtmlImporter({ render }).parse(
      { kind: 'text', text: '<style>.b:hover{color:red}</style><button class="b">ok</button>' },
      {},
    )
    const button = r.nodes.find((n) => n.props.custom.tag === 'button')
    expect(button?.props.states).toEqual({ hover: { color: 'red' } })
  })
})
