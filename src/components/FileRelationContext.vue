<template>
  <div v-if="libraryRoot && filePath" class="relation-context-host" :class="{ open }">
    <button
      class="relation-context-trigger"
      type="button"
      :aria-expanded="open"
      aria-controls="file-relation-context"
      title="在当前工作面查看文件关系"
      @click="toggle"
    >
      <NetworkIcon />
      <span>关系上下文</span>
      <b v-if="context?.relations.length">{{ context.relations.length }}</b>
    </button>
    <aside v-if="open" id="file-relation-context" class="relation-context-panel" aria-label="文件关系上下文">
      <header>
        <div>
          <small>{{ context?.node?.objectType === 'pptx_slide' ? '幻灯片上下文' : '文件上下文' }}</small>
          <strong>{{ context?.node?.title || displayName }}</strong>
          <span>{{ context?.node ? objectTypeLabel(context.node.objectType) : '当前格式尚未进入图谱索引' }}</span>
        </div>
        <button type="button" aria-label="关闭关系上下文" @click="open = false">×</button>
      </header>

      <div class="context-actions">
        <button type="button" :disabled="!context?.node" @click="openCenteredGraph">
          <NetworkIcon />{{ context?.node?.objectType === 'pptx_slide' ? '以当前幻灯片为中心' : '以当前文件为中心' }}
        </button>
        <button type="button" :disabled="loading" @click="loadContext(true)">
          <RefreshIcon />刷新
        </button>
      </div>

      <div v-if="loading" class="context-state" role="status">正在分析关系…</div>
      <div v-else-if="error" class="context-state error">
        <strong>关系上下文暂不可用</strong>
        <span>{{ error }}</span>
        <button type="button" @click="loadContext(true)">重试</button>
      </div>
      <div v-else-if="context && !context.indexed" class="context-state empty">
        <strong>尚未提取这种格式的关系</strong>
        <span>文件仍可正常管理和编辑；后续关系提取不会执行其中的代码或配置。</span>
      </div>
      <template v-else-if="context">
        <section v-if="collectionMemberships.length" class="collection-memberships">
          <small>所属智能集合</small>
          <button v-for="collection in collectionMemberships" :key="collection.id" type="button" @click="openCollection(collection)">
            {{ collection.name }}
          </button>
        </section>
        <nav class="context-filters" aria-label="关系类别">
          <button
            v-for="item in filters"
            :key="item.id"
            type="button"
            :class="{ active: filter === item.id }"
            @click="filter = item.id"
          >{{ item.label }} <b>{{ item.count }}</b></button>
        </nav>
        <div v-if="visibleRelations.length" class="relation-list">
          <article v-for="(relation, index) in visibleRelations" :key="relationKey(relation, index)" class="relation-card">
            <div class="relation-meta">
              <span :class="`class-${relation.relationClass}`">{{ relationClassLabel(relation.relationClass) }}</span>
              <b>{{ relationTypeLabel(relation.relationType) }}</b>
              <em v-if="relation.decisionStatus === 'confirmed'">已确认</em>
              <em v-else-if="relation.decisionStatus === 'inferred'">待判断</em>
              <small>{{ directionLabel(relation.direction) }}</small>
            </div>
            <button class="relation-route" type="button" @click="openNode(focusNode(relation))">
              <span>{{ relation.source.title }}</span>
              <ArrowRightIcon v-if="relation.directed" />
              <MinusIcon v-else />
              <span>{{ relation.target.title }}</span>
            </button>
            <p v-if="focusNode(relation).locationLabel">{{ focusNode(relation).locationLabel }}</p>
            <blockquote v-if="relation.evidence[0]">
              <span>{{ relation.evidence[0].context }}</span>
              <small><template v-if="relation.evidence[0].line">第 {{ relation.evidence[0].line }} 行 · </template>{{ relation.evidence[0].syntax }}</small>
            </blockquote>
            <div v-if="isDecisionRelation(relation)" class="decision-actions">
              <button
                v-if="relation.decisionStatus !== 'confirmed'"
                type="button"
                :disabled="decisionSaving === relationKey(relation)"
                title="确认这条共同标签关系"
                @click="setRelationDecision(relation, 'confirmed')"
              ><CheckIcon />确认</button>
              <button
                v-else
                type="button"
                :disabled="decisionSaving === relationKey(relation)"
                title="恢复为尚未判断的推断关系"
                @click="setRelationDecision(relation, 'inferred')"
              ><RotateIcon />改回推断</button>
              <button
                type="button"
                :disabled="decisionSaving === relationKey(relation)"
                title="隐藏这条共同标签关系"
                @click="setRelationDecision(relation, 'hidden')"
              ><EyeOffIcon />隐藏</button>
            </div>
          </article>
        </div>
        <div v-else class="context-state empty">
          <strong>{{ filter === 'all' ? '当前文件还没有关系' : '没有这一类关系' }}</strong>
          <span>{{ filter === 'all' ? '可以通过双向链接、批注、视图、画布节点或思维导图层级建立上下文。' : '切换“全部”查看其他关系。' }}</span>
        </div>
        <details v-if="context.hiddenRelations.length" class="hidden-relations">
          <summary>已隐藏的推断关系 <b>{{ context.hiddenRelations.length }}</b></summary>
          <article v-for="relation in context.hiddenRelations" :key="relationKey(relation)" class="relation-card hidden">
            <div class="relation-meta">
              <span class="class-semantic">语义</span>
              <b>{{ relationTypeLabel(relation.relationType) }}</b>
              <small>已隐藏</small>
            </div>
            <div class="hidden-route">
              <span>{{ relation.source.title }}</span><MinusIcon /><span>{{ relation.target.title }}</span>
            </div>
            <button
              class="restore-decision"
              type="button"
              :disabled="decisionSaving === relationKey(relation)"
              @click="setRelationDecision(relation, 'inferred')"
            ><RotateIcon />恢复</button>
          </article>
        </details>
        <footer v-if="context.truncated">仅展示前 80 条关系；完整网络请进入知识图谱。</footer>
      </template>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useRouter } from 'vue-router'
import { openManagedFile } from '../services/fileNavigation'
import {
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  EyeOff as EyeOffIcon,
  Minus as MinusIcon,
  Network as NetworkIcon,
  RefreshCw as RefreshIcon,
  RotateCcw as RotateIcon,
} from 'lucide-vue-next'
import { useAppStore, type SavedSearchConfig } from '../store/app'
import { clearRelationContextCache, getRelationContextCache, setRelationContextCache } from '../services/relationContextCache'
import { resolveCollectionPath } from '../utils/savedCollections'
import type { GraphData } from '../types/graph'

interface GraphObjectLocator { kind: string; objectId: string; page?: number }
interface GraphContextNode {
  id: string
  title: string
  path: string
  objectType: string
  locationLabel?: string
  locator?: GraphObjectLocator
}
interface GraphRelationEvidence { context: string; line: number; syntax: string }
interface GraphContextRelation {
  source: GraphContextNode
  target: GraphContextNode
  relationType: string
  relationClass: 'fact' | 'structure' | 'planning' | 'semantic'
  direction: 'incoming' | 'outgoing' | 'internal' | 'related'
  directed: boolean
  evidence: GraphRelationEvidence[]
  decisionStatus: 'explicit' | 'inferred' | 'confirmed' | 'hidden'
}
interface GraphRelationContext {
  path: string
  node?: GraphContextNode
  relations: GraphContextRelation[]
  hiddenRelations: GraphContextRelation[]
  indexed: boolean
  truncated: boolean
}
interface KnowledgeSearchResult { path: string; objectType: string }

const props = defineProps<{
  libraryRoot: string
  filePath: string
  focusLocatorKind?: string
  focusLocatorObjectId?: string
  focusLocatorPage?: number
}>()
const router = useRouter()
const store = useAppStore()
const open = ref(sessionStorage.getItem('longedit.relation-context.open') === 'true')
const loading = ref(false)
const error = ref('')
const context = ref<GraphRelationContext>()
const filter = ref<'all' | 'fact' | 'structure' | 'planning' | 'semantic'>('all')
const collectionMemberships = ref<SavedSearchConfig[]>([])
const decisionSaving = ref('')
let requestId = 0
let membershipRequestId = 0

const displayPath = (path: string) => path.replace(/^\\\\\?\\/, '')
const displayName = computed(() => displayPath(props.filePath).split(/[\\/]/).pop() || '当前文件')
const contextCacheScope = computed(() => [
  'context',
  props.focusLocatorKind || 'file',
  props.focusLocatorObjectId || '',
  props.focusLocatorPage || 0,
].join(':'))
const visibleRelations = computed(() => context.value?.relations.filter(item => filter.value === 'all' || item.relationClass === filter.value) || [])
const filters = computed(() => {
  const relations = context.value?.relations || []
  return [
    { id: 'all' as const, label: '全部', count: relations.length },
    { id: 'fact' as const, label: '事实', count: relations.filter(item => item.relationClass === 'fact').length },
    { id: 'structure' as const, label: '结构', count: relations.filter(item => item.relationClass === 'structure').length },
    { id: 'planning' as const, label: '规划', count: relations.filter(item => item.relationClass === 'planning').length },
    { id: 'semantic' as const, label: '语义', count: relations.filter(item => item.relationClass === 'semantic').length },
  ].filter(item => item.id === 'all' || item.count)
})

const samePath = (left: string, right: string) => displayPath(left).replace(/\\/g, '/').toLowerCase() === displayPath(right).replace(/\\/g, '/').toLowerCase()
const loadCollectionMemberships = async (force = false) => {
  const currentRequest = ++membershipRequestId
  const libraryRoot = props.libraryRoot
  const filePath = props.filePath
  const saved = store.savedSearches
    .filter(item => samePath(item.libraryPath, libraryRoot))
    .slice(0, 8)
  if (!saved.length) {
    if (currentRequest === membershipRequestId) collectionMemberships.value = []
    return
  }
  if (!force) {
    const cached = getRelationContextCache<SavedSearchConfig[]>(libraryRoot, filePath, 'collections')
    if (cached) {
      if (currentRequest === membershipRequestId) collectionMemberships.value = cached
      return
    }
  }
  const memberships = (await Promise.all(saved.map(async collection => {
    try {
      if (collection.graphRoot) {
        const graph = await invoke<GraphData>('build_local_graph', {
          libraryRoot,
          centerPath: resolveCollectionPath(libraryRoot, collection.graphRoot),
          depth: collection.graphDepth || 1,
        })
        return graph.nodes.some(node => !node.parentId && samePath(node.path, filePath))
          ? collection
          : undefined
      }
      const results = await invoke<KnowledgeSearchResult[]>('search_knowledge', {
        libraryRoot,
        query: collection.query,
      })
      const matches = results.some(result => samePath(result.path, filePath)
        && (!collection.objectTypes.length || collection.objectTypes.includes(result.objectType)))
      return matches ? collection : undefined
    } catch {
      return undefined
    }
  }))).filter((item): item is SavedSearchConfig => Boolean(item))
  setRelationContextCache(libraryRoot, filePath, memberships, 'collections')
  if (currentRequest === membershipRequestId
    && samePath(props.libraryRoot, libraryRoot)
    && samePath(props.filePath, filePath)) collectionMemberships.value = memberships
}
const loadContext = async (force = false) => {
  if (!props.libraryRoot || !props.filePath) return
  if (force) clearRelationContextCache(props.libraryRoot, props.filePath)
  else {
    const cached = getRelationContextCache<GraphRelationContext>(
      props.libraryRoot,
      props.filePath,
      contextCacheScope.value,
    )
    if (cached) {
      context.value = cached
      error.value = ''
      void loadCollectionMemberships()
      return
    }
  }
  const currentRequest = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await invoke<GraphRelationContext>('get_graph_relation_context', {
      libraryRoot: props.libraryRoot,
      path: props.filePath,
      focusLocatorKind: props.focusLocatorKind,
      focusLocatorObjectId: props.focusLocatorObjectId,
      focusLocatorPage: props.focusLocatorPage,
    })
    if (currentRequest === requestId) {
      context.value = result
      setRelationContextCache(
        props.libraryRoot,
        props.filePath,
        result,
        contextCacheScope.value,
      )
      void loadCollectionMemberships(force)
    }
  } catch (reason) {
    if (currentRequest === requestId) {
      context.value = undefined
      error.value = String(reason)
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const toggle = () => {
  open.value = !open.value
  sessionStorage.setItem('longedit.relation-context.open', String(open.value))
  if (open.value) void loadContext()
}
const relationKey = (relation: GraphContextRelation, index?: number) => `${relation.source.id}:${relation.target.id}:${relation.relationType}${index === undefined ? '' : `:${index}`}`
const isDecisionRelation = (relation: GraphContextRelation) => relation.relationType === 'shares-tag'
const setRelationDecision = async (
  relation: GraphContextRelation,
  status: 'inferred' | 'confirmed' | 'hidden',
) => {
  const key = relationKey(relation)
  if (decisionSaving.value) return
  decisionSaving.value = key
  error.value = ''
  try {
    await invoke('update_graph_relation_decision', {
      libraryRoot: props.libraryRoot,
      sourcePath: relation.source.path,
      targetPath: relation.target.path,
      relationType: relation.relationType,
      status,
    })
    await loadContext(true)
  } catch (reason) {
    error.value = String(reason)
  } finally {
    decisionSaving.value = ''
  }
}
const focusNode = (relation: GraphContextRelation) => {
  const currentId = context.value?.node?.id
  if (relation.source.id === currentId) return relation.target
  if (relation.target.id === currentId) return relation.source
  if (displayPath(relation.source.path) === displayPath(props.filePath)
    && displayPath(relation.target.path) !== displayPath(relation.source.path)) return relation.target
  return relation.target
}
const openCenteredGraph = () => {
  if (context.value?.node) router.push({ name: 'Graph', query: { root: context.value.node.id } })
}
const openCollection = (collection: SavedSearchConfig) => router.push({
  name: 'LibraryMode',
  query: collection.graphRoot
    ? { collection: collection.id }
    : {
        search: collection.query,
        types: collection.objectTypes.length ? collection.objectTypes.join(',') : undefined,
      },
})
let relationNavigationSequence = 0
const openNode = (node: GraphContextNode) => {
  const path = displayPath(node.path)
  if (node.objectType === 'pdf' || node.objectType === 'pdf_annotation') {
    return openManagedFile(router, path, { page: node.locator?.page, annotation: node.locator?.objectId })
  }
  if (node.objectType === 'table' || node.objectType === 'table_view') {
    return openManagedFile(router, path, { view: node.locator?.objectId })
  }
  if (node.objectType === 'canvas' || node.objectType === 'canvas_node') {
    return openManagedFile(router, path, { node: node.locator?.objectId })
  }
  if (node.objectType === 'opml' || node.objectType === 'opml_node') {
    return openManagedFile(router, path, { node: node.locator?.objectId })
  }
  if (node.objectType === 'pptx_slide') {
    store.setRelationObjectFocus({
      path,
      locatorKind: 'pptx-slide',
      locatorObjectId: node.locator?.objectId || '',
      locatorPage: node.locator?.page,
    })
    return openManagedFile(router, path, {
        slide: node.locator?.page,
        locatorKind: 'pptx-slide',
        locator: node.locator?.objectId,
        locationLabel: node.locationLabel,
        locatorToken: `${Date.now()}-${++relationNavigationSequence}`,
    })
  }
  if (node.objectType === 'pptx') store.clearRelationObjectFocus()
  return openManagedFile(router, path)
}
const objectTypeLabel = (type: string) => ({
  markdown: 'Markdown 笔记', pdf: 'PDF 文档', table: '数据表', canvas: 'Canvas 画布', opml: 'OPML 思维导图',
  pptx: 'PowerPoint 演示', pptx_slide: 'PowerPoint 幻灯片',
}[type] || type)
const relationClassLabel = (value: string) => ({ fact: '事实', structure: '结构', planning: '规划', semantic: '语义' }[value] || value)
const relationTypeLabel = (value: string) => ({
  'links-to': '链接到', related: '相关', contains: '包含', embeds: '嵌入', annotates: '批注引用',
  'shares-tag': '共同标签', supports: '支持', contradicts: '反驳', depends_on: '依赖', derived_from: '源自',
}[value] || value)
const directionLabel = (value: string) => ({ incoming: '入链', outgoing: '出链', internal: '文件内部', related: '双向' }[value] || value)

watch(() => [
  props.libraryRoot,
  props.filePath,
  props.focusLocatorKind,
  props.focusLocatorObjectId,
  props.focusLocatorPage,
] as const, () => {
  membershipRequestId += 1
  context.value = undefined
  error.value = ''
  collectionMemberships.value = []
  filter.value = 'all'
  if (open.value) void loadContext()
}, { immediate: true })
</script>

<style scoped>
.relation-context-host { position: fixed; z-index: 780; top: 76px; right: 0; bottom: 14px; width: 0; pointer-events: none; }
.relation-context-host.open { width: 326px; }
.relation-context-trigger { pointer-events: auto; position: absolute; top: 50%; right: 0; width: 38px; min-height: 34px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; transform: translateY(-50%); border: 1px solid rgba(var(--theme-primary-rgb), .24); border-right: 0; border-radius: 10px 0 0 10px; color: var(--theme-primary); background: var(--theme-surface); box-shadow: var(--theme-shadow-sm); font-size: 11px; cursor: pointer; white-space: nowrap; }
.relation-context-host.open .relation-context-trigger { right: 326px; }
.relation-context-trigger svg { width: 15px; }
.relation-context-trigger span { display: none; }
.relation-context-trigger b { min-width: 17px; padding: 1px 5px; border-radius: 999px; background: rgba(var(--theme-primary-rgb), .12); font-size: var(--text-compact); }
.relation-context-panel { pointer-events: auto; width: 326px; height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-right: 0; border-radius: 14px 0 0 14px; background: var(--theme-surface); box-shadow: -14px 16px 42px rgba(15, 23, 42, .16); color: var(--theme-text); }
.relation-context-panel > header { display: flex; justify-content: space-between; gap: 12px; padding: 17px 16px 13px; border-bottom: 1px solid var(--theme-border); }
.relation-context-panel > header div { display: grid; min-width: 0; gap: 3px; }
.relation-context-panel > header small { color: var(--theme-primary); font-size: var(--text-compact); letter-spacing: .12em; }
.relation-context-panel > header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.relation-context-panel > header span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.relation-context-panel > header button { align-self: start; border: 0; background: transparent; color: var(--theme-text-secondary); font-size: 20px; cursor: pointer; }
.context-actions { display: flex; gap: 7px; padding: 10px 12px; border-bottom: 1px solid var(--theme-border); }
.context-actions button, .context-state button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-surface-muted); color: var(--theme-text); font-size: var(--text-compact); cursor: pointer; }
.context-actions button:first-child { color: var(--theme-primary); }
.context-actions svg { width: 13px; }
.context-actions button:disabled { opacity: .45; cursor: not-allowed; }
.context-filters { display: flex; gap: 5px; padding: 9px 12px; overflow-x: auto; border-bottom: 1px solid var(--theme-border); }
.collection-memberships { display: flex; align-items: center; gap: 5px; padding: 8px 12px; overflow-x: auto; border-bottom: 1px solid var(--theme-border); }
.collection-memberships small { flex: none; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.collection-memberships button { flex: none; padding: 3px 7px; border: 1px solid rgba(var(--theme-primary-rgb), .18); border-radius: 999px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .055); font-size: var(--text-compact); cursor: pointer; }
.context-filters button { display: flex; gap: 4px; padding: 4px 7px; border: 1px solid transparent; border-radius: 999px; color: var(--theme-text-secondary); background: transparent; font-size: var(--text-compact); cursor: pointer; white-space: nowrap; }
.context-filters button.active { border-color: rgba(var(--theme-primary-rgb), .24); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .07); }
.relation-list { flex: 1; overflow: auto; padding: 10px 12px 18px; }
.relation-card { padding: 10px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-surface-muted); }
.relation-card + .relation-card { margin-top: 8px; }
.relation-meta { display: flex; align-items: center; gap: 5px; font-size: var(--text-compact); }
.relation-meta span { padding: 2px 5px; border-radius: 4px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), .08); }
.relation-meta .class-planning { color: #8b5cf6; background: rgba(139, 92, 246, .1); }
.relation-meta .class-structure { color: #0284c7; background: rgba(2, 132, 199, .1); }
.relation-meta em { padding: 2px 5px; border-radius: 4px; color: #047857; background: rgba(5, 150, 105, .1); font-style: normal; }
.relation-meta small { margin-left: auto; color: var(--theme-text-secondary); }
.relation-route { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr); align-items: center; gap: 5px; margin-top: 8px; padding: 0; border: 0; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.relation-route span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-compact); }
.relation-route svg { width: 12px; color: var(--theme-primary); }
.relation-card p { margin: 5px 0 0; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.relation-card blockquote { display: grid; gap: 4px; margin: 8px 0 0; padding: 7px 8px; border-left: 2px solid rgba(var(--theme-primary-rgb), .35); color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb), .035); font-size: var(--text-compact); }
.relation-card blockquote small { opacity: .78; }
.decision-actions { display: flex; justify-content: flex-end; gap: 5px; margin-top: 8px; }
.decision-actions button, .restore-decision { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid var(--theme-border); border-radius: 6px; color: var(--theme-text-secondary); background: var(--theme-surface); font-size: var(--text-compact); cursor: pointer; }
.decision-actions button:first-child, .restore-decision { color: var(--theme-primary); }
.decision-actions button:disabled, .restore-decision:disabled { opacity: .45; cursor: wait; }
.decision-actions svg, .restore-decision svg { width: 11px; }
.hidden-relations { flex: none; max-height: 38%; overflow: auto; border-top: 1px solid var(--theme-border); }
.hidden-relations summary { padding: 8px 12px; color: var(--theme-text-secondary); font-size: var(--text-compact); cursor: pointer; }
.hidden-relations summary b { color: var(--theme-primary); }
.hidden-relations .relation-card { margin: 0 12px 8px; }
.relation-card.hidden { opacity: .78; }
.hidden-route { display: grid; grid-template-columns: minmax(0, 1fr) 12px minmax(0, 1fr); align-items: center; gap: 5px; margin: 8px 0; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.hidden-route span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden-route svg { width: 11px; }
.context-state { display: grid; place-content: center; gap: 7px; min-height: 150px; padding: 24px; color: var(--theme-text-secondary); text-align: center; font-size: var(--text-compact); }
.context-state strong { color: var(--theme-text); font-size: 12px; }
.context-state.error strong { color: var(--theme-danger, #dc2626); }
.relation-context-panel > footer { padding: 8px 12px; border-top: 1px solid var(--theme-border); color: var(--theme-text-secondary); font-size: var(--text-compact); }

</style>
