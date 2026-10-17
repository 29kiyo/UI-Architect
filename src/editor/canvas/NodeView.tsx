import {
  createContext,
  memo,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  applySvgColor,
  mergeInstanceProps,
  orderChildren,
  resolveAssetSrc,
  resolveInstanceIn,
  resolveProps,
} from '@/core'
import type { Node, Page } from '@/core'
import { AssetUrlsContext } from './assetUrlsContext'
import { ComponentsContext } from './componentsContext'
import { previewStateFor, statePreview } from './statePreview'
import { nodeStyle } from './style'

const MAX_DEPTH = 200
const NO_URLS = { get: () => undefined }
const PLACEHOLDER = '#e5e5e5'
// SVG は <img> 経由で描画する(キャンバス内でスクリプトを実行させない)
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// ページを保持する小さなストア。各ノードが自分の node / override だけを購読する
type PageStore = {
  get: () => Page
  set: (p: Page) => void
  subscribe: (l: () => void) => () => void
}
function createPageStore(initial: Page): PageStore {
  let page = initial
  const ls = new Set<() => void>()
  return {
    get: () => page,
    set: (p) => {
      if (p === page) return
      page = p
      ls.forEach((l) => l())
    },
    subscribe: (l) => {
      ls.add(l)
      return () => {
        ls.delete(l)
      }
    },
  }
}
const StoreCtx = createContext<PageStore | undefined>(undefined)

type Props = {
  nodeId: string
  deviceId: string
  depth: number
  // インスタンス展開中: 定義内ノード(ページのストアではなくこちらから読む)
  defNodes?: Record<string, Node> | undefined
  // 展開したインスタンスのルート要素にだけ付ける(内側のノードは DOM の ID を持たない)
  instanceId?: string | undefined
}

// props は ID のみ。自分の node / override が変わったときだけ再描画される
const NodeViewInner = memo(function NodeViewInner({
  nodeId,
  deviceId,
  depth,
  defNodes,
  instanceId,
}: Props) {
  const store = useContext(StoreCtx)
  const node = useSyncExternalStore(store?.subscribe ?? noopSubscribe, () =>
    defNodes ? defNodes[nodeId] : store?.get().nodes[nodeId],
  )
  const override = useSyncExternalStore(store?.subscribe ?? noopSubscribe, () =>
    defNodes ? undefined : store?.get().overrides[deviceId]?.[nodeId],
  )
  // 状態プレビュー(選択ノードにだけ値が入る。他のノードは undefined のまま再描画されない)
  const previewState = useSyncExternalStore(statePreview.subscribe, () => previewStateFor(nodeId))
  // asset:<id> は Blob URL に解決(読み込み完了で再描画)
  const assetUrls = useContext(AssetUrlsContext)
  const rawSrc = node?.props.content.src
  const resolvedSrc = useSyncExternalStore(assetUrls?.subscribe ?? noopSubscribe, () =>
    resolveAssetSrc(rawSrc, assetUrls ?? NO_URLS),
  )
  if (!node || depth > MAX_DEPTH) return null
  // override が無ければ共有ノードをそのまま使う
  const n: Node = override
    ? {
        ...node,
        props: resolveProps(node.props, override),
        hidden: override.hidden ?? node.hidden,
        children: orderChildren(node.children, override.order),
      }
    : node
  const style = nodeStyle(n, previewState)
  const domId = defNodes ? instanceId : n.id
  if (n.componentRef && !defNodes) return <InstanceView n={n} deviceId={deviceId} depth={depth} />
  const c = n.props.content

  if (n.type === 'text') {
    return (
      <span data-node-id={domId} style={style}>
        {String(c.text ?? '')}
      </span>
    )
  }
  if (n.type === 'image') {
    const src = resolvedSrc
    return src ? (
      <img
        data-node-id={domId}
        src={src}
        alt={String(c.alt ?? '')}
        draggable={false}
        style={style}
      />
    ) : (
      <div data-node-id={domId} style={{ background: PLACEHOLDER, ...style }} />
    )
  }
  if (n.type === 'svg') {
    const tc = n.props.typography.color
    const svgColor = typeof tc === 'string' ? tc : '#000000'
    return typeof c.svg === 'string' ? (
      <img
        data-node-id={domId}
        src={svgDataUrl(applySvgColor(c.svg, svgColor))}
        alt=""
        draggable={false}
        style={style}
      />
    ) : (
      <div data-node-id={domId} style={{ background: PLACEHOLDER, ...style }} />
    )
  }
  return (
    <div data-node-id={domId} style={style}>
      {typeof c.text === 'string' ? c.text : null}
      {n.children.map((id) =>
        defNodes?.[id] ? (
          <NodeViewInner
            key={id}
            nodeId={id}
            deviceId={deviceId}
            depth={depth + 1}
            defNodes={defNodes}
          />
        ) : (
          <NodeViewInner key={id} nodeId={id} deviceId={deviceId} depth={depth + 1} />
        ),
      )}
    </div>
  )
})

const noopSubscribe = () => () => {}

type RootProps = { page: Page; deviceId: string; nodeId: string }

// 入口。page をストアへ流し込み、ルートから描画する
export function NodeView({ page, deviceId, nodeId }: RootProps) {
  const [store] = useState(() => createPageStore(page))
  useLayoutEffect(() => {
    store.set(page)
  }, [store, page])
  return (
    <StoreCtx.Provider value={store}>
      <NodeViewInner nodeId={nodeId} deviceId={deviceId} depth={0} />
    </StoreCtx.Provider>
  )
}

// インスタンス: 定義を展開して描画(配置・サイズ・変形はインスタンス側が優先)
function InstanceView({ n, deviceId, depth }: { n: Node; deviceId: string; depth: number }) {
  const components = useContext(ComponentsContext)
  const { componentRef, children, props, hidden } = n
  const resolved = useMemo(() => {
    const res = resolveInstanceIn(components, { componentRef, children })
    const root = res?.nodes[res.rootNodeId]
    if (!res || !root) return undefined
    const merged: Node = {
      ...root,
      props: mergeInstanceProps(root.props, props),
      hidden: hidden || root.hidden,
    }
    return { rootId: res.rootNodeId, nodes: { ...res.nodes, [res.rootNodeId]: merged } }
  }, [components, componentRef, children, props, hidden])
  if (!resolved) {
    // 定義が見つからない: 破線の枠で示す
    return (
      <div
        data-node-id={n.id}
        style={{
          ...nodeStyle(n, undefined),
          outline: '1px dashed #c00',
          minWidth: 16,
          minHeight: 16,
        }}
      />
    )
  }
  return (
    <NodeViewInner
      nodeId={resolved.rootId}
      deviceId={deviceId}
      depth={depth + 1}
      defNodes={resolved.nodes}
      instanceId={n.id}
    />
  )
}
