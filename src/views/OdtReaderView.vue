<template>
  <section class="odt-workspace">
    <header class="odt-toolbar">
      <div class="document-identity">
        <FileText :size="18" aria-hidden="true" />
        <div>
          <strong>{{ fileName }}</strong>
          <span>OpenDocument Text · 只读</span>
        </div>
      </div>
      <div class="toolbar-actions">
        <label class="odt-search">
          <Search :size="14" aria-hidden="true" />
          <input v-model="query" type="search" placeholder="搜索文档" />
          <span>{{ matches.length ? `${matchIndex + 1}/${matches.length}` : '0' }}</span>
        </label>
        <button :disabled="!matches.length" title="上一个匹配" @click="moveMatch(-1)">
          <ChevronUp :size="15" />
        </button>
        <button :disabled="!matches.length" title="下一个匹配" @click="moveMatch(1)">
          <ChevronDown :size="15" />
        </button>
        <button :disabled="loading" title="重新读取" @click="load">
          <RefreshCw :size="15" :class="{ spinning: loading }" />
        </button>
      </div>
    </header>

    <div v-if="loading && !report" class="odt-state">
      <RefreshCw :size="18" class="spinning" />
      <span>正在验证并解析 ODT</span>
    </div>
    <div v-else-if="loadError" class="odt-state error">
      <ShieldAlert :size="20" />
      <div><strong>无法打开文档</strong><p>{{ loadError }}</p></div>
    </div>
    <template v-else-if="report">
      <div v-if="allWarnings.length" class="risk-banner">
        <ShieldAlert :size="16" />
        <div><strong>文档包含已隔离内容</strong><span>{{ allWarnings.join('；') }}</span></div>
      </div>
      <div class="odt-layout">
        <aside class="odt-outline">
          <div class="outline-heading"><strong>文档结构</strong><span>{{ report.model.headings.length }}</span></div>
          <nav v-if="report.model.headings.length">
            <button
              v-for="heading in report.model.headings"
              :key="heading.id"
              :style="{ paddingLeft: `${8 + (heading.level - 1) * 10}px` }"
              @click="scrollToBlock(heading.id)"
            >
              <span>H{{ heading.level }}</span>{{ heading.text }}
            </button>
          </nav>
          <p v-else class="outline-empty">没有标题结构</p>
          <div class="package-summary">
            <div><ShieldCheck :size="14" /><strong>可信包验证通过</strong></div>
            <span>ODF {{ report.model.package.manifestVersion || '1.x' }}</span>
            <span>{{ report.model.package.entryCount }} 个包条目</span>
            <span>{{ formatBytes(report.model.package.uncompressedBytes) }} 解压预算</span>
          </div>
        </aside>

        <main class="odt-stage">
          <article class="odt-page">
            <template v-for="block in report.model.blocks" :key="block.id">
              <component
                :is="`h${Math.min(block.level || 1, 6)}`"
                v-if="block.kind === 'heading'"
                :id="block.id"
                class="odt-block odt-heading"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >{{ block.text }}</component>
              <div
                v-else-if="block.kind === 'list-item'"
                :id="block.id"
                class="odt-block odt-list-item"
                :class="{ 'search-hit': matchIds.has(block.id) }"
                :style="{ paddingLeft: `${Math.min(block.listLevel || 1, 8) * 14}px` }"
              ><span>•</span><p>{{ block.text }}</p></div>
              <div
                v-else-if="block.kind === 'table'"
                :id="block.id"
                class="odt-block odt-table-wrap"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                <table>
                  <tbody>
                    <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                      <td
                        v-for="(cell, cellIndex) in row"
                        :key="cellIndex"
                        :colspan="cell.columnSpan"
                        :rowspan="cell.rowSpan"
                      >{{ cell.text }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div
                v-else
                :id="block.id"
                class="odt-block odt-paragraph"
                :class="{ 'search-hit': matchIds.has(block.id) }"
              >
                <p>{{ block.text }}</p>
                <div v-if="block.imageParts.length" class="odt-images">
                  <template v-for="part in block.imageParts" :key="part">
                    <img v-if="mediaByPart.get(part)" :src="mediaByPart.get(part)?.dataUrl" :alt="part" />
                    <span v-else><ImageOff :size="15" />{{ part }}</span>
                  </template>
                </div>
              </div>
            </template>
            <div v-if="!report.model.blocks.length" class="empty-document">文档没有可显示的正文块。</div>
          </article>
        </main>
      </div>
      <footer class="odt-status">
        <div>
          <span>{{ formatBytes(report.size) }}</span>
          <span>{{ report.model.blocks.length }} 个结构块</span>
          <span>{{ report.model.plainText.length.toLocaleString() }} 字符</span>
        </div>
        <span>{{ report.model.generator || report.model.creator || '未知生产者' }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  ChevronDown, ChevronUp, FileText, ImageOff, RefreshCw, Search, ShieldAlert, ShieldCheck,
} from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../store/app'

interface OdtTableCell { text: string; columnSpan: number; rowSpan: number }
interface OdtBlock {
  id: string
  kind: string
  text: string
  level?: number
  listLevel?: number
  rows: OdtTableCell[][]
  imageParts: string[]
}
interface OdtHeading { id: string; text: string; level: number }
interface OdtPackage {
  manifestVersion?: string
  entryCount: number
  uncompressedBytes: number
  risks: { riskCodes: string[] }
}
interface OdtModel {
  blocks: OdtBlock[]
  headings: OdtHeading[]
  plainText: string
  title?: string
  creator?: string
  generator?: string
  package: OdtPackage
  warnings: string[]
}
interface OdtReadReport {
  path: string
  size: number
  modified?: number
  signature: string
  readOnly: boolean
  model: OdtModel
  media: { partName: string; mediaType: string; dataUrl: string }[]
  mediaWarnings: string[]
}

const route = useRoute()
const store = useAppStore()
const report = ref<OdtReadReport>()
const loading = ref(false)
const loadError = ref('')
const query = ref('')
const matchIndex = ref(-1)
const odtPath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => odtPath.value.split(/[\\/]/).pop() || '未命名.odt')
const mediaByPart = computed(() => new Map((report.value?.media || []).map(item => [item.partName, item])))
const allWarnings = computed(() => [...(report.value?.model.warnings || []), ...(report.value?.mediaWarnings || [])])
const matches = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle || !report.value) return []
  return report.value.model.blocks.filter(block => block.text.toLocaleLowerCase().includes(needle))
})
const matchIds = computed(() => new Set(matches.value.map(block => block.id)))

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}
const scrollToBlock = (id: string) => {
  if (!id) return
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const scrollToRouteLocator = async () => {
  const locator = typeof route.query.locator === 'string' ? route.query.locator : ''
  if (!locator || !report.value) return
  await nextTick()
  scrollToBlock(locator)
}
const moveMatch = (direction: number) => {
  if (!matches.value.length) return
  matchIndex.value = (matchIndex.value + direction + matches.value.length) % matches.value.length
  scrollToBlock(matches.value[matchIndex.value].id)
}
const load = async () => {
  if (!odtPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    report.value = await invoke<OdtReadReport>('read_odt_document', {
      libraryRoot: store.libraryPath,
      path: odtPath.value,
    })
    await scrollToRouteLocator()
  } catch (error) {
    report.value = undefined
    loadError.value = String(error)
  } finally {
    loading.value = false
  }
}

watch(odtPath, () => {
  query.value = ''
  matchIndex.value = -1
  void load()
}, { immediate: true })
watch(matches, value => { matchIndex.value = value.length ? 0 : -1 })
watch(() => [route.query.locator, route.query.locatorToken], scrollToRouteLocator)
</script>

<style scoped>
.odt-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; }
.odt-toolbar { min-height: 52px; padding: 7px 14px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.document-identity, .toolbar-actions, .odt-search, .odt-status > div { display: flex; align-items: center; }
.document-identity { min-width: 0; gap: 9px; }
.document-identity > div { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.document-identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.document-identity span { color: var(--text-muted); font-size: 11px; }
.toolbar-actions { gap: 5px; }
.toolbar-actions button { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar-actions button:disabled { opacity: .4; cursor: default; }
.odt-search { height: 29px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.odt-search input { width: 150px; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.odt-search span { color: var(--text-muted); font-size: 11px; }
.odt-state { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
.odt-state.error { color: var(--error-color); }
.odt-state p { max-width: 620px; margin: 3px 0 0; color: var(--text-secondary); }
.risk-banner { padding: 8px 14px; display: flex; align-items: center; gap: 9px; border-bottom: 1px solid color-mix(in srgb, #d49a28 34%, var(--border-color)); background: color-mix(in srgb, #d49a28 9%, var(--bg-primary)); }
.risk-banner div { display: flex; flex-direction: column; gap: 2px; }
.risk-banner strong { font-size: 12px; }
.risk-banner span { color: var(--text-secondary); font-size: 11px; }
.odt-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
.odt-outline { overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.outline-heading { padding: 0 5px 8px; display: flex; justify-content: space-between; }
.outline-heading span, .outline-empty { color: var(--text-muted); font-size: 11px; }
.odt-outline nav { display: flex; flex-direction: column; gap: 2px; }
.odt-outline nav button { padding: 6px 8px; border: 0; border-radius: 5px; overflow: hidden; text-align: left; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); background: transparent; cursor: pointer; font: inherit; }
.odt-outline nav button:hover { background: var(--hover-bg); color: var(--text-primary); }
.odt-outline nav button span { margin-right: 5px; color: var(--primary-color); font-size: 10px; }
.package-summary { margin-top: 18px; padding-top: 12px; display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: 10px; }
.package-summary div { display: flex; align-items: center; gap: 6px; color: var(--text-primary); font-size: 11px; }
.odt-stage { overflow: auto; padding: 24px; background: color-mix(in srgb, var(--bg-secondary) 88%, #7f8da3); }
.odt-page { width: min(760px, calc(100% - 24px)); min-height: 960px; margin: 0 auto; padding: 64px 70px; box-sizing: border-box; border: 1px solid var(--border-color); box-shadow: 0 8px 26px rgba(0,0,0,.12); background: var(--bg-primary); }
.odt-block { scroll-margin: 90px; border-radius: 4px; transition: background .15s ease; }
.odt-block.search-hit { background: color-mix(in srgb, #f0bd3e 23%, transparent); }
.odt-heading { margin: 1.3em 0 .55em; line-height: 1.3; }
h1.odt-heading { font-size: 25px; } h2.odt-heading { font-size: 21px; } h3.odt-heading { font-size: 18px; }
h4.odt-heading, h5.odt-heading, h6.odt-heading { font-size: 15px; }
.odt-paragraph { margin: .55em 0; line-height: 1.75; white-space: pre-wrap; }
.odt-paragraph p, .odt-list-item p { margin: 0; }
.odt-list-item { margin: .38em 0; display: flex; gap: 8px; line-height: 1.65; }
.odt-list-item > span { color: var(--primary-color); }
.odt-table-wrap { margin: 14px 0; overflow: auto; }
.odt-table-wrap table { width: 100%; border-collapse: collapse; }
.odt-table-wrap td { min-width: 80px; padding: 7px 9px; border: 1px solid var(--border-color); vertical-align: top; white-space: pre-wrap; }
.odt-images { margin: 10px 0; display: grid; gap: 8px; justify-items: start; }
.odt-images img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.odt-images span { min-height: 72px; padding: 12px; display: flex; align-items: center; gap: 6px; border: 1px dashed var(--border-color); color: var(--text-muted); background: var(--bg-secondary); }
.empty-document { padding: 80px 20px; text-align: center; color: var(--text-muted); }
.odt-status { min-height: 28px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-muted); font-size: 10px; }
.odt-status > div { gap: 10px; }
.spinning { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 820px) {
  .odt-layout { grid-template-columns: minmax(0, 1fr); }
  .odt-outline { display: none; }
  .odt-page { padding: 42px 36px; }
  .odt-search input { width: 105px; }
}
</style>
