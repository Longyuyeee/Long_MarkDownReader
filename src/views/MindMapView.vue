<template>
  <div class="mindmap-page">
    <header class="mindmap-header">
      <div class="header-main">
        <button class="icon-button" title="返回知识库" @click="router.push('/library')"><n-icon :component="ArrowLeftIcon" /></button>
        <div>
          <input v-if="document" v-model="document.title" class="title-input" maxlength="500" @focus="beginFieldEdit" @change="endFieldEdit" />
          <strong v-else>OPML 思维导图</strong>
          <span>{{ fileName }} · {{ nodeCount }} 个主题 · {{ maxDepth }} 层</span>
        </div>
      </div>
      <div class="header-actions">
        <button title="撤销" :disabled="!undoStack.length" @click="undo"><n-icon :component="UndoIcon" /></button>
        <button title="重做" :disabled="!redoStack.length" @click="redo"><n-icon :component="RedoIcon" /></button>
        <button :disabled="saving || loading" @click="projectToCanvas"><n-icon :component="NetworkIcon" />投影到 Canvas</button>
        <button class="primary" :disabled="!dirty || saving" @click="save"><n-icon :component="SaveIcon" />{{ saving ? '保存中…' : '保存' }}</button>
      </div>
    </header>

    <div v-if="document" class="mindmap-toolbar">
      <div class="view-switch">
        <button :class="{ active: viewMode === 'map' }" @click="viewMode = 'map'"><n-icon :component="NetworkIcon" />思维导图</button>
        <button :class="{ active: viewMode === 'outline' }" @click="viewMode = 'outline'"><n-icon :component="ListTreeIcon" />树形大纲</button>
      </div>
      <span class="divider"></span>
      <button @click="addRoot"><n-icon :component="PlusIcon" />根主题</button>
      <button :disabled="!selectedNode" @click="addChild"><n-icon :component="CornerDownRightIcon" />子主题</button>
      <button :disabled="!selectedNode" @click="addSibling"><n-icon :component="ListPlusIcon" />同级主题</button>
      <button :disabled="!canIndent" @click="indentNode">缩进</button>
      <button :disabled="!canOutdent" @click="outdentNode">减少缩进</button>
      <button :disabled="!selectedNode" class="danger" @click="removeSelected"><n-icon :component="TrashIcon" />删除</button>
      <span class="divider"></span>
      <button @click="setAllCollapsed(true)">全部折叠</button>
      <button @click="setAllCollapsed(false)">全部展开</button>
      <label class="search-box"><n-icon :component="SearchIcon" /><input v-model="query" placeholder="搜索主题或备注" /></label>
    </div>

    <main class="mindmap-main">
      <div v-if="loading" class="state"><div class="loader"></div><strong>正在解析 OPML</strong></div>
      <div v-else-if="error" class="state error"><strong>无法打开思维导图</strong><p>{{ error }}</p><button @click="load">重试</button></div>
      <template v-else-if="document">
        <section v-if="viewMode === 'outline'" class="outline-panel">
          <div class="outline-head"><span>主题</span><span>层级</span></div>
          <div
            v-for="item in visibleItems"
            :key="item.node.id"
            class="outline-row"
            :class="{ selected: item.node.id === selectedId, dragging: item.node.id === draggedId, match: item.matches, collapsed: item.node.collapsed }"
            :style="{ '--depth': item.depth }"
            draggable="true"
            @dragstart="startDrag(item.node.id)"
            @dragover.prevent
            @drop.prevent="dropOn(item.node.id)"
            @click="selectedId = item.node.id"
          >
            <span class="tree-lines"></span>
            <button class="collapse" :class="{ hidden: !item.node.children.length }" @click.stop="toggleCollapsed(item.node)"><n-icon :component="ChevronRightIcon" /></button>
            <input v-model="item.node.text" maxlength="2000" @focus="beginFieldEdit" @change="endFieldEdit" @click.stop="selectedId = item.node.id" />
            <small>{{ item.depth + 1 }}</small>
            <button class="quick-add" title="添加子主题" @click.stop="selectedId = item.node.id; addChild()">+</button>
          </div>
          <div v-if="!visibleItems.length" class="empty-search">没有匹配的主题</div>
        </section>

        <section v-else class="map-panel">
          <div class="map-canvas" :style="{ width: `${mapSize.width}px`, height: `${mapSize.height}px` }">
            <svg class="map-edges" :width="mapSize.width" :height="mapSize.height">
              <path v-for="edge in mapEdges" :key="edge.id" :d="edge.path" />
            </svg>
            <article
              v-for="item in mapItems"
              :key="item.node.id"
              class="map-node"
              :class="{ selected: item.node.id === selectedId, dragging: item.node.id === draggedId, match: item.matches, root: item.depth === 0 }"
              :style="{ left: `${item.x}px`, top: `${item.y}px` }"
              draggable="true"
              @dragstart="startDrag(item.node.id)"
              @dragover.prevent
              @drop.prevent="dropOn(item.node.id)"
              @click="selectedId = item.node.id"
            >
              <button v-if="item.node.children.length" class="map-collapse" @click.stop="toggleCollapsed(item.node)">{{ item.node.collapsed ? `+${descendantCount(item.node)}` : '−' }}</button>
              <strong>{{ item.node.text }}</strong>
              <p v-if="item.node.note">{{ item.node.note }}</p>
              <small>{{ item.node.children.length }} 个子主题</small>
            </article>
          </div>
          <div v-if="!mapItems.length" class="empty-search">没有匹配的主题</div>
        </section>

        <aside class="inspector">
          <template v-if="selectedNode">
            <div class="inspector-head"><strong>主题属性</strong><code>{{ selectedNode.id }}</code></div>
            <label>标题<input v-model="selectedNode.text" maxlength="2000" @focus="beginFieldEdit" @change="endFieldEdit" /></label>
            <label>备注<textarea v-model="selectedNode.note" maxlength="20000" rows="8" placeholder="补充描述、上下文或行动说明" @focus="beginFieldEdit" @change="endFieldEdit"></textarea></label>
            <label class="check"><input v-model="selectedNode.collapsed" type="checkbox" @focus="beginFieldEdit" @change="endFieldEdit" />默认折叠子主题</label>
            <div class="inspector-actions">
              <button @click="addChild">添加子主题</button><button @click="addSibling">添加同级</button>
            </div>
            <p class="drag-hint">拖动任意主题到另一个主题上，即可改变父子层级。OPML 自定义属性会在保存时继续保留。</p>
          </template>
          <div v-else class="inspector-empty"><n-icon :component="MousePointerIcon" /><span>选择一个主题进行编辑</span></div>
        </aside>
      </template>
    </main>

    <footer v-if="document" class="statusbar">
      <span>{{ dirty ? '有未保存更改' : '已与磁盘同步' }}<template v-if="saveError"> · {{ saveError }}</template></span>
      <span>OPML 2.0 · 开放文件格式 · 拖拽改变层级</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { ArrowLeft as ArrowLeftIcon, ChevronRight as ChevronRightIcon, CornerDownRight as CornerDownRightIcon, ListPlus as ListPlusIcon, ListTree as ListTreeIcon, MousePointer2 as MousePointerIcon, Network as NetworkIcon, Plus as PlusIcon, Redo2 as RedoIcon, Save as SaveIcon, Search as SearchIcon, Trash2 as TrashIcon, Undo2 as UndoIcon } from 'lucide-vue-next'
import { useAppStore } from '../store/app'

interface OpmlNode { id: string; text: string; note: string; collapsed: boolean; attributes: Record<string, string>; children: OpmlNode[] }
interface OpmlDocument { title: string; metadata: Record<string, string>; roots: OpmlNode[] }
interface OpmlFile { path: string; signature: string; document: OpmlDocument }
interface LocatedNode { node: OpmlNode; parent: OpmlNode | null; siblings: OpmlNode[]; index: number; grandSiblings: OpmlNode[] | null; parentIndex: number }
interface FlatItem { node: OpmlNode; parentId: string | null; depth: number; matches: boolean }

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const message = useMessage()
const path = computed(() => String(route.query.path || ''))
const fileName = computed(() => path.value.split(/[\\/]/).pop()?.replace(/\.opml$/i, '') || '未命名思维导图')
const document = ref<OpmlDocument | null>(null)
const signature = ref('')
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const error = ref('')
const saveError = ref('')
const selectedId = ref('')
const draggedId = ref('')
const query = ref('')
const viewMode = ref<'map' | 'outline'>((localStorage.getItem('opml-view-mode') as 'map' | 'outline') || 'map')
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let fieldSnapshot = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

const snapshot = () => JSON.stringify(document.value)
const restore = (value: string) => { document.value = JSON.parse(value) as OpmlDocument; dirty.value = true; ensureSelection(); scheduleSave() }
const pushUndo = (before: string) => { if (before === snapshot()) return; undoStack.value.push(before); if (undoStack.value.length > 100) undoStack.value.shift(); redoStack.value = []; dirty.value = true; scheduleSave() }
const mutate = (callback: () => void) => { const before = snapshot(); callback(); pushUndo(before) }
const beginFieldEdit = () => { fieldSnapshot = snapshot() }
const endFieldEdit = () => { if (fieldSnapshot) pushUndo(fieldSnapshot); fieldSnapshot = '' }

const visitNodes = (callback: (node: OpmlNode, depth: number) => void) => {
  const visit = (nodes: OpmlNode[], depth: number) => { for (const node of nodes) { callback(node, depth); visit(node.children, depth + 1) } }
  visit(document.value?.roots || [], 0)
}
const nodeCount = computed(() => { let count = 0; visitNodes(() => { count += 1 }); return count })
const maxDepth = computed(() => { let depth = 0; visitNodes((_, value) => { depth = Math.max(depth, value + 1) }); return depth })

const locate = (id: string): LocatedNode | null => {
  const search = (siblings: OpmlNode[], parent: OpmlNode | null, grandSiblings: OpmlNode[] | null, parentIndex: number): LocatedNode | null => {
    for (let index = 0; index < siblings.length; index += 1) {
      const node = siblings[index]
      if (node.id === id) return { node, parent, siblings, index, grandSiblings, parentIndex }
      const found = search(node.children, node, siblings, index)
      if (found) return found
    }
    return null
  }
  return document.value ? search(document.value.roots, null, null, -1) : null
}
const selectedNode = computed(() => locate(selectedId.value)?.node || null)
const makeId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const newNode = (text = '新主题'): OpmlNode => ({ id: makeId(), text, note: '', collapsed: false, attributes: {}, children: [] })
const ensureSelection = () => { if (!locate(selectedId.value)) selectedId.value = document.value?.roots[0]?.id || '' }

const addRoot = () => mutate(() => { const node = newNode('新根主题'); document.value!.roots.push(node); selectedId.value = node.id })
const addChild = () => { const target = selectedNode.value; if (!target) return; mutate(() => { const node = newNode(); target.collapsed = false; target.children.push(node); selectedId.value = node.id }) }
const addSibling = () => { const location = locate(selectedId.value); if (!location) return; mutate(() => { const node = newNode(); location.siblings.splice(location.index + 1, 0, node); selectedId.value = node.id }) }
const removeSelected = () => {
  const location = locate(selectedId.value)
  if (!location || (!location.parent && document.value!.roots.length === 1)) return void message.warning('思维导图至少需要一个根主题')
  mutate(() => { location.siblings.splice(location.index, 1); selectedId.value = location.siblings[Math.min(location.index, location.siblings.length - 1)]?.id || location.parent?.id || document.value!.roots[0].id })
}
const canIndent = computed(() => { const value = locate(selectedId.value); return Boolean(value && value.index > 0) })
const canOutdent = computed(() => Boolean(locate(selectedId.value)?.parent))
const indentNode = () => { const location = locate(selectedId.value); if (!location || location.index === 0) return; mutate(() => { const [node] = location.siblings.splice(location.index, 1); const parent = location.siblings[location.index - 1]; parent.children.push(node); parent.collapsed = false }) }
const outdentNode = () => { const location = locate(selectedId.value); if (!location?.parent || !location.grandSiblings) return; mutate(() => { const [node] = location.siblings.splice(location.index, 1); location.grandSiblings!.splice(location.parentIndex + 1, 0, node) }) }
const toggleCollapsed = (node: OpmlNode) => mutate(() => { node.collapsed = !node.collapsed })
const setAllCollapsed = (value: boolean) => mutate(() => visitNodes(node => { if (node.children.length) node.collapsed = value }))
const descendantCount = (node: OpmlNode): number => node.children.reduce((total, child) => total + 1 + descendantCount(child), 0)

const startDrag = (id: string) => { draggedId.value = id }
const isDescendant = (node: OpmlNode, id: string): boolean => node.children.some(child => child.id === id || isDescendant(child, id))
const dropOn = (targetId: string) => {
  const source = locate(draggedId.value); const target = locate(targetId)
  draggedId.value = ''
  if (!source || !target || source.node.id === target.node.id || isDescendant(source.node, target.node.id)) return
  mutate(() => { source.siblings.splice(source.index, 1); target.node.children.push(source.node); target.node.collapsed = false; selectedId.value = source.node.id })
}

const matchesQuery = (node: OpmlNode, needle: string) => `${node.text}\n${node.note}`.toLocaleLowerCase().includes(needle)
const matchingIds = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase(); const ids = new Set<string>()
  if (!needle || !document.value) return ids
  const visit = (nodes: OpmlNode[], ancestors: string[]) => { for (const node of nodes) { if (matchesQuery(node, needle)) { ids.add(node.id); ancestors.forEach(id => ids.add(id)) } visit(node.children, [...ancestors, node.id]) } }
  visit(document.value.roots, []); return ids
})
const allItems = computed<FlatItem[]>(() => {
  const result: FlatItem[] = []; const needle = query.value.trim().toLocaleLowerCase()
  const visit = (nodes: OpmlNode[], parentId: string | null, depth: number) => { for (const node of nodes) { const included = !needle || matchingIds.value.has(node.id); if (included) result.push({ node, parentId, depth, matches: Boolean(needle && matchesQuery(node, needle)) }); if ((!node.collapsed || needle) && included) visit(node.children, node.id, depth + 1) } }
  if (document.value) visit(document.value.roots, null, 0); return result
})
const visibleItems = computed(() => allItems.value)
const mapItems = computed(() => allItems.value.map((item, index) => ({ ...item, x: 60 + item.depth * 280, y: 40 + index * 92 })))
const mapSize = computed(() => ({ width: Math.max(900, 380 + maxDepth.value * 280), height: Math.max(600, 100 + mapItems.value.length * 92) }))
const mapEdges = computed(() => {
  const positions = new Map(mapItems.value.map(item => [item.node.id, item]))
  return mapItems.value.flatMap(item => { const parent = item.parentId ? positions.get(item.parentId) : null; if (!parent) return []; const x1 = parent.x + 210; const y1 = parent.y + 34; const x2 = item.x; const y2 = item.y + 34; const middle = (x1 + x2) / 2; return [{ id: `${parent.node.id}-${item.node.id}`, path: `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}` }] })
})

const undo = () => { const previous = undoStack.value.pop(); if (!previous) return; redoStack.value.push(snapshot()); restore(previous) }
const redo = () => { const next = redoStack.value.pop(); if (!next) return; undoStack.value.push(snapshot()); restore(next) }
const scheduleSave = () => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => { void save() }, 1500) }
const save = async () => {
  if (!document.value || !dirty.value || saving.value || !store.libraryPath) return !dirty.value
  saving.value = true; saveError.value = ''
  try {
    const result = await invoke<OpmlFile>('write_opml_file', { libraryRoot: store.libraryPath, path: path.value, expectedSignature: signature.value, document: document.value })
    signature.value = result.signature; document.value = result.document; dirty.value = false; return true
  } catch (cause) { saveError.value = String(cause).replace(/^Error:\s*/, ''); message.error(`保存失败：${saveError.value}`); return false }
  finally { saving.value = false }
}
const projectToCanvas = async () => {
  if (dirty.value && !(await save())) return
  try { const canvas = await invoke<string>('create_canvas_from_opml', { libraryRoot: store.libraryPath, path: path.value }); await router.push({ name: 'Canvas', query: { path: canvas } }) }
  catch (cause) { message.error(`Canvas 投影失败：${String(cause)}`) }
}
const load = async () => {
  loading.value = true; error.value = ''; saveError.value = ''
  try { const result = await invoke<OpmlFile>('read_opml_file', { libraryRoot: store.libraryPath, path: path.value }); signature.value = result.signature; document.value = result.document; dirty.value = false; undoStack.value = []; redoStack.value = []; ensureSelection() }
  catch (cause) { document.value = null; error.value = String(cause).replace(/^Error:\s*/, '') }
  finally { loading.value = false }
}
const handleKeydown = (event: KeyboardEvent) => {
  const command = event.ctrlKey || event.metaKey
  if (command && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
}
watch(viewMode, value => localStorage.setItem('opml-view-mode', value))
watch(path, () => { void load() })
onMounted(() => { window.addEventListener('keydown', handleKeydown); void load() })
onBeforeUnmount(() => { window.removeEventListener('keydown', handleKeydown); if (saveTimer) clearTimeout(saveTimer) })
onBeforeRouteLeave(async () => !dirty.value || await save())
</script>

<style scoped>
.mindmap-page{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;overflow:hidden;color:var(--theme-text);background:var(--theme-bg)}
.mindmap-header{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:9px 16px;border-bottom:var(--theme-border);background:var(--theme-surface)}.header-main,.header-actions,.mindmap-toolbar,.view-switch,.inspector-actions{display:flex;align-items:center;gap:8px}.header-main>div{display:flex;min-width:0;flex-direction:column}.header-main span{color:var(--theme-text-secondary);font-size:11px}.title-input{width:min(420px,40vw);border:0;outline:0;color:var(--theme-text);background:transparent;font-size:17px;font-weight:750}.icon-button{width:36px}.header-actions button,.mindmap-toolbar button,.icon-button,.state button,.inspector button{height:34px;padding:0 11px;border:var(--theme-border);border-radius:8px;color:var(--theme-text);background:var(--theme-card);cursor:pointer}.header-actions button{display:flex;align-items:center;gap:5px}.header-actions .primary{color:#fff;border-color:var(--theme-primary);background:var(--theme-primary)}button:disabled{opacity:.4;cursor:default}
.mindmap-toolbar{min-height:48px;padding:7px 14px;overflow-x:auto;border-bottom:var(--theme-border);background:var(--theme-surface)}.mindmap-toolbar button{white-space:nowrap}.mindmap-toolbar button.active{color:#fff;border-color:var(--theme-primary);background:var(--theme-primary)}.mindmap-toolbar button.danger{color:#d64545}.divider{height:24px;border-left:var(--theme-border)}.search-box{min-width:220px;margin-left:auto;display:flex;align-items:center;gap:6px;padding:0 10px;border:var(--theme-border);border-radius:8px;background:var(--theme-card)}.search-box input{width:180px;height:30px;border:0;outline:0;color:var(--theme-text);background:transparent}
.mindmap-main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 290px;overflow:hidden}.outline-panel,.map-panel{position:relative;overflow:auto;background:color-mix(in srgb,var(--theme-bg) 96%,var(--theme-primary))}.outline-panel{padding:12px}.outline-head,.outline-row{display:grid;grid-template-columns:minmax(0,1fr) 50px;align-items:center}.outline-head{height:30px;padding:0 14px;color:var(--theme-text-secondary);font-size:11px}.outline-row{position:relative;min-width:560px;height:42px;margin:2px 0;padding:0 10px 0 calc(12px + var(--depth)*26px);border:1px solid transparent;border-radius:8px;background:var(--theme-surface)}.outline-row.selected{border-color:var(--theme-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--theme-primary) 14%,transparent)}.outline-row.match{background:color-mix(in srgb,var(--theme-surface) 82%,#ffe16b)}.outline-row.dragging,.map-node.dragging{opacity:.4}.outline-row input{min-width:0;height:32px;padding-left:28px;border:0;outline:0;color:var(--theme-text);background:transparent}.outline-row small{text-align:center;color:var(--theme-text-secondary)}.collapse{position:absolute;left:calc(10px + var(--depth)*26px);width:24px;height:24px;border:0;background:transparent;color:var(--theme-text-secondary);transform:rotate(90deg);transition:transform .15s}.outline-row.collapsed .collapse{transform:rotate(0)}.outline-row .collapse.hidden{visibility:hidden}.outline-row .quick-add{position:absolute;right:52px;width:25px;height:25px;border:0;border-radius:6px;opacity:0}.outline-row:hover .quick-add{opacity:1}.tree-lines{position:absolute;left:calc(20px + var(--depth)*26px);top:-4px;bottom:-4px;border-left:1px solid color-mix(in srgb,var(--theme-primary) 30%,transparent);pointer-events:none}
.map-panel{padding:20px}.map-canvas{position:relative}.map-edges{position:absolute;inset:0;overflow:visible;pointer-events:none}.map-edges path{fill:none;stroke:color-mix(in srgb,var(--theme-primary) 55%,var(--theme-text-secondary));stroke-width:2}.map-node{position:absolute;width:210px;min-height:68px;box-sizing:border-box;padding:12px 14px;border:2px solid color-mix(in srgb,var(--theme-primary) 40%,var(--theme-border-color,#aaa));border-radius:12px;background:var(--theme-surface);box-shadow:0 7px 20px rgba(0,0,0,.08);cursor:grab}.map-node.root{border-color:var(--theme-primary);background:color-mix(in srgb,var(--theme-surface) 88%,var(--theme-primary))}.map-node.selected{border-color:var(--theme-primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--theme-primary) 18%,transparent),0 10px 24px rgba(0,0,0,.12)}.map-node.match{outline:3px solid #f0bd29}.map-node strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.map-node p{display:-webkit-box;margin:5px 0;color:var(--theme-text-secondary);font-size:11px;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.map-node small{color:var(--theme-text-secondary);font-size:9px}.map-collapse{position:absolute;right:-11px;top:23px;width:22px;height:22px;border:0;border-radius:50%;color:#fff;background:var(--theme-primary);cursor:pointer;font-size:10px}
.inspector{min-width:0;padding:16px;border-left:var(--theme-border);overflow:auto;background:var(--theme-surface)}.inspector-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.inspector code{max-width:130px;overflow:hidden;color:var(--theme-text-secondary);font-size:9px;text-overflow:ellipsis}.inspector label{display:flex;flex-direction:column;gap:6px;margin:12px 0;color:var(--theme-text-secondary);font-size:11px}.inspector input,.inspector textarea{box-sizing:border-box;width:100%;padding:9px;border:var(--theme-border);border-radius:8px;outline:0;color:var(--theme-text);background:var(--theme-card);font:inherit;resize:vertical}.inspector label.check{flex-direction:row;align-items:center}.inspector .check input{width:auto}.inspector-actions button{flex:1}.drag-hint{margin-top:18px;padding:10px;border-radius:8px;color:var(--theme-text-secondary);background:color-mix(in srgb,var(--theme-card) 85%,var(--theme-primary));font-size:10px;line-height:1.6}.inspector-empty,.state,.empty-search{height:100%;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--theme-text-secondary)}.inspector-empty{flex-direction:column}.state{grid-column:1/-1;flex-direction:column}.state.error strong{color:#d64545}.loader{width:28px;height:28px;border:3px solid color-mix(in srgb,var(--theme-primary) 20%,transparent);border-top-color:var(--theme-primary);border-radius:50%;animation:spin .8s linear infinite}.empty-search{min-height:300px}
.statusbar{min-height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-top:var(--theme-border);color:var(--theme-text-secondary);background:var(--theme-surface);font-size:10px}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:850px){.mindmap-main{grid-template-columns:minmax(0,1fr)}.inspector{display:none}.header-main span,.statusbar span:last-child{display:none}.search-box{margin-left:0}.mindmap-toolbar{padding-inline:8px}}
</style>
