import { computed, shallowRef } from 'vue'
import { useMessage, type DropdownOption } from 'naive-ui'
import type { useStructuredSession } from './useStructuredSession'

interface Node { path: string; start: number; end: number }
export function useSourceNodeMenu<T extends Node>(session: ReturnType<typeof useStructuredSession>, options: {
  fresh: () => boolean; reveal: (node: T) => void | Promise<void>
  extra?: (node: T) => DropdownOption[]; action?: (key: string, node: T) => void
}) {
  const message = useMessage()
  const menu = shallowRef<{ x: number; y: number; node: T; owner: NonNullable<ReturnType<typeof session.capture>> }>()
  const items = computed<DropdownOption[]>(() => [
    { key: 'locate', label: '定位到源码' }, { key: 'path', label: '复制路径' }, { key: 'source', label: '复制此处源码' },
    ...(menu.value ? options.extra?.(menu.value.node) || [] : []),
  ])
  const open = (event: MouseEvent, node: T) => {
    const owner = session.capture()
    if (!owner || !options.fresh()) { message.info('正在更新结构，请稍候再操作'); return }
    menu.value = { x: event.clientX, y: event.clientY, node, owner }
  }
  const select = async (key: string) => {
    const item = menu.value; menu.value = undefined
    if (!item || !session.unchanged(item.owner) || !options.fresh()) { message.info('内容已变化，请重新选择'); return }
    if (key === 'locate') { await options.reveal(item.node); return }
    if (key === 'path' || key === 'source') {
      const source = new TextDecoder().decode(new TextEncoder().encode(item.owner.source).slice(item.node.start, item.node.end))
      try { await navigator.clipboard.writeText(key === 'path' ? item.node.path : source); message.success('已复制') }
      catch { message.error('暂时无法复制，请重试') }
    } else options.action?.(key, item.node)
  }
  const close = () => { menu.value = undefined }
  return { menu, items, open, select, close }
}
