<template>
  <section class="odf-workspace" data-testid="e1c-odf-workspace">
    <header>
      <div class="identity">
        <component :is="isOds ? Table2 : Presentation" :size="18" aria-hidden="true" />
        <div>
          <strong>{{ fileName }}</strong>
          <span>{{ isOds ? 'OpenDocument Spreadsheet' : 'OpenDocument Presentation' }} · 只读</span>
        </div>
      </div>
      <div class="toolbar">
        <label class="search-box">
          <Search :size="14" aria-hidden="true" />
          <input v-model="query" data-testid="e1c-odf-search" type="search" :placeholder="isOds ? '搜索单元格' : '搜索幻灯片'" />
          <span>{{ matches.length ? `${matchIndex + 1}/${matches.length}` : '0' }}</span>
        </label>
        <button :disabled="!matches.length" title="上一个匹配" @click="moveMatch(-1)"><ChevronUp :size="15" /></button>
        <button :disabled="!matches.length" title="下一个匹配" @click="moveMatch(1)"><ChevronDown :size="15" /></button>
        <button :disabled="loading" title="重新读取" @click="load"><RefreshCw :size="15" :class="{ spinning: loading }" /></button>
      </div>
    </header>

    <div v-if="loading && !report" class="state">
      <RefreshCw :size="18" class="spinning" /><span>正在验证并解析 {{ extension.toUpperCase() }}</span>
    </div>
    <div v-else-if="loadError" class="state error">
      <ShieldAlert :size="20" /><div><strong>无法打开文档</strong><p>{{ loadError }}</p></div>
    </div>
    <template v-else-if="report">
      <div v-if="warnings.length" class="risk-banner">
        <ShieldAlert :size="16" />
        <div><strong>文档包含只读或隔离内容</strong><span>{{ warnings.join('；') }}</span></div>
      </div>

      <div v-if="isOds" class="ods-layout">
        <nav class="sheet-tabs" aria-label="工作表">
          <button
            v-for="sheet in report.model.sheets"
            :key="sheet.id"
            :class="{ active: selectedSheetId === sheet.id }"
            @click="selectedSheetId = sheet.id"
          >{{ sheet.name }}</button>
        </nav>
        <main ref="sheetStageRef" class="sheet-stage" data-testid="e1c-ods-stage" @scroll="rememberOdfViewState()">
          <table v-if="selectedSheet">
            <thead><tr><th class="corner"></th><th v-for="column in sheetColumnCount" :key="column">{{ columnName(column) }}</th></tr></thead>
            <tbody>
              <tr v-for="row in selectedSheet.rows" :key="row.row">
                <th>{{ row.row }}</th>
                <td
                  v-for="column in sheetColumnCount"
                  :id="`${selectedSheet.id}:${columnName(column)}${row.row}`"
                  :key="column"
                  :class="cellClasses(`${selectedSheet.id}:${columnName(column)}${row.row}`)"
                >
                  <template v-if="cellAt(row, column)">
                    <span>{{ cellAt(row, column)?.text }}</span>
                    <code v-if="cellAt(row, column)?.formula" :title="cellAt(row, column)?.formula">fx</code>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">工作簿没有可显示的非空单元格。</div>
        </main>
      </div>

      <div v-else class="odp-layout">
        <aside>
          <button
            v-for="slide in report.model.slides"
            :key="slide.id"
            :class="{ active: selectedSlideId === slide.id }"
            @click="selectSlide(slide.id)"
          >
            <span>{{ slide.index }}</span>
            <strong>{{ slide.name }}</strong>
            <small>{{ slide.text.split('\n')[0] || '空白幻灯片' }}</small>
          </button>
        </aside>
        <main class="slide-stage" data-testid="e1c-odp-stage">
          <article
            v-if="selectedSlide"
            :id="selectedSlide.id"
            class="slide"
            :class="cellClasses(selectedSlide.id)"
          >
            <div class="slide-number">{{ selectedSlide.index }}</div>
            <p v-for="(paragraph, index) in selectedSlide.text.split('\n').filter(Boolean)" :key="index" :class="{ title: index === 0 }">{{ paragraph }}</p>
            <div v-if="selectedSlide.imageCount" class="media-note"><Image :size="15" />{{ selectedSlide.imageCount }} 个内部图片引用</div>
            <section v-if="selectedSlide.notes"><strong>演讲者备注</strong><p>{{ selectedSlide.notes }}</p></section>
            <div v-if="!selectedSlide.text && !selectedSlide.notes" class="empty">此幻灯片没有可提取文本。</div>
          </article>
        </main>
      </div>

      <footer>
        <div>
          <span>{{ formatBytes(report.size) }}</span>
          <span>{{ isOds ? `${report.model.sheets.length} 个工作表` : `${report.model.slides.length} 张幻灯片` }}</span>
          <span v-if="isOds">{{ report.model.formulaCount }} 个公式（仅显示缓存值）</span>
        </div>
        <span>ODF {{ report.model.package.manifestVersion || '1.x' }} · 源文件未修改</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  ChevronDown, ChevronUp, Image, Presentation, RefreshCw, Search, ShieldAlert, Table2,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../store/app'
import { recallWorkspaceViewState, rememberWorkspaceViewState } from '../services/workspaceViewState'

interface OdsCell { address: string; column: number; text: string; valueType?: string; formula?: string }
interface OdsRow { row: number; cells: OdsCell[] }
interface OdsSheet { id: string; name: string; rows: OdsRow[]; formulaCount: number }
interface OdpSlide { id: string; index: number; name: string; text: string; notes: string; imageCount: number }
interface OdfContentReport {
  path: string
  size: number
  signature: string
  readOnly: boolean
  sourcePreserved: boolean
  model: {
    format: 'ods' | 'odp'
    sheets: OdsSheet[]
    slides: OdpSlide[]
    formulaCount: number
    warnings: string[]
    package: {
      manifestVersion?: string
      entryCount: number
      risks: {
        riskCodes: string[]
        externalLinkCount: number
        embeddedObjectCount: number
        scriptMarkerCount: number
        signaturePartCount: number
      }
    }
  }
}

const route = useRoute()
const store = useAppStore()
const report = ref<OdfContentReport>()
const loading = ref(false)
const loadError = ref('')
const query = ref('')
const matchIndex = ref(-1)
const selectedSheetId = ref('')
const selectedSlideId = ref('')
const sheetStageRef = ref<HTMLElement | null>(null)
const documentPath = computed(() => String(route.query.path || store.activeTabId || ''))
const extension = computed(() => /\.odp$/i.test(documentPath.value) ? 'odp' : 'ods')
const isOds = computed(() => report.value?.model.format !== 'odp')
const fileName = computed(() => documentPath.value.split(/[\\/]/).pop() || `未命名.${extension.value}`)
const selectedSheet = computed(() => report.value?.model.sheets.find(sheet => sheet.id === selectedSheetId.value))
const selectedSlide = computed(() => report.value?.model.slides.find(slide => slide.id === selectedSlideId.value))
const sheetColumnCount = computed(() => Math.min(256, Math.max(1, ...(selectedSheet.value?.rows.flatMap(row => row.cells.map(cell => cell.column)) || [1]))))
const routeLocator = computed(() => typeof route.query.locator === 'string' ? route.query.locator : '')
const warnings = computed(() => {
  if (!report.value) return []
  const risks = report.value.model.package.risks
  return [
    ...report.value.model.warnings,
    ...(risks.externalLinkCount ? [`${risks.externalLinkCount} 个外部链接未跟随`] : []),
    ...(risks.embeddedObjectCount ? [`${risks.embeddedObjectCount} 个嵌入对象未执行`] : []),
    ...(risks.scriptMarkerCount ? [`${risks.scriptMarkerCount} 个脚本标记未执行`] : []),
    ...(risks.signaturePartCount ? ['文档签名仅识别、未验证'] : []),
  ]
})
const matches = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle || !report.value) return []
  if (isOds.value) {
    return report.value.model.sheets.flatMap(sheet => sheet.rows.flatMap(row => row.cells
      .filter(cell => cell.text.toLocaleLowerCase().includes(needle))
      .map(cell => ({ id: `${sheet.id}:${cell.address}`, parent: sheet.id }))))
  }
  return report.value.model.slides
    .filter(slide => `${slide.text}\n${slide.notes}`.toLocaleLowerCase().includes(needle))
    .map(slide => ({ id: slide.id, parent: slide.id }))
})
const matchIds = computed(() => new Set(matches.value.map(match => match.id)))
const currentMatchId = computed(() => matches.value[matchIndex.value]?.id || '')
const cellClasses = (id: string) => ({
  'search-hit': matchIds.value.has(id),
  'current-hit': currentMatchId.value === id,
  'route-target': routeLocator.value === id,
})
const cellAt = (row: OdsRow, column: number) => row.cells.find(cell => cell.column === column)
const columnName = (column: number) => {
  let value = column
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}
const formatBytes = (value: number) => value < 1024 * 1024
  ? `${(value / 1024).toFixed(1)} KiB`
  : `${(value / 1024 / 1024).toFixed(1)} MiB`
const selectSlide = (id: string) => {
  selectedSlideId.value = id
  void nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }))
}
const reveal = async (id: string, parent: string) => {
  if (isOds.value) selectedSheetId.value = parent
  else selectedSlideId.value = parent
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
}
const moveMatch = (direction: number) => {
  if (!matches.value.length) return
  matchIndex.value = (matchIndex.value + direction + matches.value.length) % matches.value.length
  const match = matches.value[matchIndex.value]
  void reveal(match.id, match.parent)
}
const revealRouteLocator = async () => {
  const locator = routeLocator.value
  if (!locator || !report.value) return
  const parent = locator.startsWith('ods-sheet-') ? locator.split(':')[0] : locator
  await reveal(locator, parent)
}
const rememberOdfViewState = (path = documentPath.value) => {
  if (!path) return
  rememberWorkspaceViewState(path, {
    scrollTop: isOds.value ? sheetStageRef.value?.scrollTop || 0 : 0,
    scrollLeft: isOds.value ? sheetStageRef.value?.scrollLeft || 0 : 0,
    section: isOds.value ? selectedSheetId.value : selectedSlideId.value,
  })
}
const load = async () => {
  if (!documentPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    report.value = await invoke<OdfContentReport>('read_odf_content_document', {
      libraryRoot: store.libraryPath,
      path: documentPath.value,
    })
    const viewState = recallWorkspaceViewState(documentPath.value)
    selectedSheetId.value = viewState?.section && report.value.model.sheets.some(sheet => sheet.id === viewState.section)
      ? viewState.section
      : report.value.model.sheets[0]?.id || ''
    selectedSlideId.value = viewState?.section && report.value.model.slides.some(slide => slide.id === viewState.section)
      ? viewState.section
      : report.value.model.slides[0]?.id || ''
    await revealRouteLocator()
    if (isOds.value && viewState && !routeLocator.value) {
      await nextTick()
      sheetStageRef.value?.scrollTo({ top: viewState.scrollTop, left: viewState.scrollLeft })
    }
  } catch (error) {
    report.value = undefined
    loadError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    loading.value = false
  }
}

watch(documentPath, (_path, previousPath) => {
  rememberOdfViewState(previousPath)
  query.value = ''
  matchIndex.value = -1
  void load()
}, { immediate: true })
watch(matches, value => { matchIndex.value = value.length ? 0 : -1 })
watch(() => [route.query.locator, route.query.locatorToken], revealRouteLocator)
watch(selectedSheetId, () => void nextTick(rememberOdfViewState))
watch(selectedSlideId, () => void nextTick(rememberOdfViewState))
onBeforeUnmount(rememberOdfViewState)
</script>

<style scoped>
.odf-workspace { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; color: var(--text-primary); background: var(--bg-secondary); font-size: 13px; container-type: inline-size; }
header { display: flex; min-height: 52px; align-items: center; justify-content: space-between; gap: 14px; padding: 7px 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.identity, .toolbar, .search-box, footer > div { display: flex; align-items: center; }
.identity { min-width: 0; gap: 9px; }
.identity > div { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.identity span, footer { color: var(--text-muted); font-size: 11px; }
.toolbar { gap: 5px; }
.toolbar button { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-secondary); background: var(--bg-secondary); cursor: pointer; }
.toolbar button:disabled { opacity: .4; cursor: default; }
.search-box { height: 29px; gap: 6px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-secondary); }
.search-box input { width: 150px; border: 0; outline: 0; color: inherit; background: transparent; font: inherit; }
.search-box span { color: var(--text-muted); font-size: 11px; }
.state { display: flex; flex: 1; align-items: center; justify-content: center; gap: 10px; }
.state.error { color: var(--error-color); }
.state p { max-width: 620px; margin: 3px 0 0; color: var(--text-secondary); }
.risk-banner { display: flex; align-items: center; gap: 9px; padding: 8px 14px; border-bottom: 1px solid color-mix(in srgb, #d49a28 34%, var(--border-color)); background: color-mix(in srgb, #d49a28 9%, var(--bg-primary)); }
.risk-banner div { display: flex; flex-direction: column; gap: 2px; }
.risk-banner strong { font-size: 12px; }
.risk-banner span { color: var(--text-secondary); font-size: 11px; }
.ods-layout { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.sheet-tabs { display: flex; min-height: 34px; overflow-x: auto; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
.sheet-tabs button { min-width: 110px; padding: 0 12px; border: 0; border-right: 1px solid var(--border-color); color: var(--text-secondary); background: transparent; cursor: pointer; }
.sheet-tabs button.active { color: var(--theme-primary); box-shadow: inset 0 -2px var(--theme-primary); background: var(--bg-secondary); }
.sheet-stage { flex: 1; overflow: auto; }
.sheet-stage table { min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
.sheet-stage th, .sheet-stage td { width: 120px; min-width: 120px; height: 30px; padding: 4px 7px; box-sizing: border-box; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--bg-primary); }
.sheet-stage thead th { position: sticky; z-index: 3; top: 0; color: var(--text-muted); background: var(--theme-surface-2); font-size: 11px; font-weight: 500; }
.sheet-stage tbody th, .corner { position: sticky; z-index: 2; left: 0; width: 48px; min-width: 48px; color: var(--text-muted); background: var(--theme-surface-2); box-shadow: 2px 0 0 color-mix(in srgb, var(--theme-primary) 24%, var(--theme-surface)); font-size: 11px; font-weight: 500; }
.sheet-stage .corner { z-index: 4; }
.sheet-stage td { position: relative; }
.sheet-stage td code { position: absolute; top: 2px; right: 3px; color: var(--theme-primary); font-size: var(--text-compact); }
.odp-layout { display: grid; flex: 1; min-height: 0; grid-template-columns: 220px minmax(0, 1fr); }
.odp-layout aside { overflow: auto; padding: 8px; border-right: 1px solid var(--border-color); background: var(--bg-primary); }
.odp-layout aside button { display: grid; width: 100%; grid-template-columns: 24px minmax(0, 1fr); gap: 2px 7px; margin-bottom: 4px; padding: 8px; border: 1px solid transparent; border-radius: 6px; text-align: left; color: var(--text-secondary); background: transparent; cursor: pointer; }
.odp-layout aside button.active { border-color: var(--theme-primary); background: var(--bg-secondary); }
.odp-layout aside span { grid-row: 1 / 3; color: var(--theme-primary); font-size: 11px; }
.odp-layout aside strong, .odp-layout aside small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.odp-layout aside small { color: var(--text-muted); }
.slide-stage { overflow: auto; padding: 24px; background: color-mix(in srgb, var(--bg-secondary) 88%, #7f8da3); }
.slide { position: relative; width: min(960px, calc(100% - 24px)); aspect-ratio: 16 / 9; margin: 0 auto; padding: 8% 9%; box-sizing: border-box; border: 1px solid var(--border-color); box-shadow: 0 8px 26px rgba(0,0,0,.12); overflow: auto; background: var(--bg-primary); }
.slide > p { margin: .6em 0; line-height: 1.5; font-size: 18px; }
.slide > p.title { margin: 0 0 .8em; font-size: 28px; font-weight: 650; }
.slide-number { position: absolute; right: 12px; bottom: 8px; color: var(--text-muted); font-size: var(--text-compact); }
.slide section { margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border-color); color: var(--text-secondary); }
.slide section p { white-space: pre-wrap; }
.media-note { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11px; }
.search-hit { background: color-mix(in srgb, #f0bd3e 20%, var(--bg-primary)) !important; }
.current-hit, .route-target { outline: 2px solid var(--theme-primary); outline-offset: -2px; }
.empty { display: grid; min-height: 180px; place-items: center; color: var(--text-muted); }
footer { display: flex; min-height: 28px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px; border-top: 1px solid var(--border-color); background: var(--bg-primary); }
footer > div { gap: 10px; }
.spinning { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .odp-layout { grid-template-columns: minmax(0, 1fr); }
  .odp-layout aside { display: flex; max-height: 86px; border-right: 0; border-bottom: 1px solid var(--border-color); }
  .odp-layout aside button { min-width: 180px; }
  .slide-stage { padding: 12px; }
  .slide { width: 100%; }
  .search-box input { width: 100px; }
}
@container (max-width: 700px) {
  header { min-height: auto; align-items: stretch; flex-direction: column; gap: 6px; padding-block: 7px; }
  .toolbar { width: 100%; }
  .search-box { min-width: 0; flex: 1; }
  .search-box input { width: 100%; min-width: 0; }
  footer > span { display: none; }
}
</style>
