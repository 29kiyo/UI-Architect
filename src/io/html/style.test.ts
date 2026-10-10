import { describe, expect, it } from 'vitest'
import { mapComputedStyle, styleGetterFrom } from './style'

const map = (s: Record<string, string>) => mapComputedStyle(styleGetterFrom(s))

describe('mapComputedStyle', () => {
  it('既定値は出力しない(display だけは常に出力)', () => {
    const r = map({
      display: 'block',
      position: 'static',
      width: 'auto',
      opacity: '1',
      'background-color': 'rgba(0, 0, 0, 0)',
      'margin-top': '0px',
    })
    expect(r).toEqual({ layout: { display: 'block' } })
  })

  it('グループへ振り分け、キーは camelCase', () => {
    const r = map({
      display: 'flex',
      'flex-direction': 'column',
      'row-gap': '8px',
      width: '320px',
      'min-height': '48px',
      position: 'absolute',
      top: '10px',
      'z-index': '3',
      'background-color': 'rgb(255, 0, 0)',
      'font-size': '16px',
      'font-weight': '700',
      color: 'rgb(0, 0, 0)',
    })
    expect(r.layout).toEqual({ display: 'flex', flexDirection: 'column', rowGap: '8px' })
    expect(r.size).toEqual({ width: '320px', minHeight: '48px' })
    expect(r.position).toEqual({ position: 'absolute', top: '10px', zIndex: '3' })
    expect(r.appearance).toEqual({ backgroundColor: 'rgb(255, 0, 0)' })
    expect(r.typography).toEqual({ fontSize: '16px', fontWeight: '700', color: 'rgb(0, 0, 0)' })
  })

  it('枠線は描画される辺だけ', () => {
    const r = map({
      'border-top-style': 'solid',
      'border-top-width': '2px',
      'border-top-color': 'rgb(0, 0, 0)',
      'border-right-style': 'none',
      'border-right-width': '2px',
      'border-bottom-style': 'solid',
      'border-bottom-width': '0px',
    })
    expect(r.border).toEqual({
      borderTopWidth: '2px',
      borderTopStyle: 'solid',
      borderTopColor: 'rgb(0, 0, 0)',
    })
  })

  it('角丸は 0 を除外する', () => {
    const r = map({ 'border-top-left-radius': '8px', 'border-top-right-radius': '0px' })
    expect(r.radius).toEqual({ borderTopLeftRadius: '8px' })
  })

  it('ロングハンドが無くショートハンドだけある場合は先頭値を4角に使う', () => {
    const r = map({ 'border-radius': '12px', 'border-top-left-radius': '0' })
    expect(r.radius).toEqual({
      borderTopLeftRadius: '12px',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '12px',
      borderBottomLeftRadius: '12px',
    })
  })

  it('text-shadow の透明は出力しない', () => {
    expect(map({ 'text-shadow': 'rgba(0, 0, 0, 0)' }).shadow).toBeUndefined()
  })

  it('transform-origin は transform があるときだけ', () => {
    expect(map({ 'transform-origin': '50px 50px' }).transform).toBeUndefined()
    expect(map({ transform: 'rotate(10deg)', 'transform-origin': '50px 50px' }).transform).toEqual({
      transform: 'rotate(10deg)',
      transformOrigin: '50px 50px',
    })
  })

  it('shadow / effects / transition を拾う', () => {
    const r = map({
      'box-shadow': 'rgba(0, 0, 0, 0.2) 0px 2px 4px 0px',
      filter: 'blur(2px)',
      'transition-property': 'opacity',
      'transition-duration': '0.2s',
    })
    expect(r.shadow).toEqual({ boxShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 4px 0px' })
    expect(r.effects).toEqual({ filter: 'blur(2px)' })
    expect(r.transition).toEqual({ transitionProperty: 'opacity', transitionDuration: '0.2s' })
  })

  it('空のスタイルは空オブジェクト', () => {
    expect(map({})).toEqual({})
  })
})
