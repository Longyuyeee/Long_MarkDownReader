<template>
  <div class="release-capabilities">
    <WorkspaceManagementHeader
      title="格式能力"
      :subtitle="`Long编辑 ${RELEASE_MATRIX_VERSION} · ${RELEASE_CAPABILITY_ROWS.length} 类格式`"
      @back="returnToSource"
    >
      <div class="release-state" title="社区无签名发布渠道；企业签名发布候选状态独立评估">
        <ShieldCheck :size="16" />
        <span>{{ RELEASE_PUBLIC_STATUS_LABEL }}</span>
      </div>
    </WorkspaceManagementHeader>

    <WorkspaceManagementContent class="release-content">
      <section class="external-opening-summary">
        <FileInput :size="20" />
        <div>
          <strong>外部打开与默认应用</strong>
          <p>{{ externalEditableCount }} 类格式可直接编辑，{{ externalPreviewCount }} 类文件可只读预览；编辑格式只有点击保存才写回，预览格式永不写回。Windows 默认应用始终由你确认，并按格式逐项选择。</p>
        </div>
        <button type="button" @click="openDefaultAppsSettings">
          <ExternalLink :size="15" />
          Windows 默认应用
        </button>
      </section>

      <div class="toolbar">
        <label class="search-box">
          <Search :size="16" />
          <input v-model="query" type="search" placeholder="搜索格式或扩展名" />
        </label>
        <div class="segments" aria-label="能力筛选" data-horizontal-wheel="always">
          <button
            v-for="option in filters"
            :key="option.value"
            type="button"
            :class="{ active: activeFilter === option.value }"
            @click="activeFilter = option.value"
          >
            {{ option.label }}
            <span>{{ option.count }}</span>
          </button>
        </div>
      </div>

      <div class="matrix-head" aria-hidden="true">
        <span>格式</span>
        <span>公开能力</span>
        <span>保存边界</span>
        <span>依赖</span>
      </div>

      <div v-if="filteredRows.length" class="matrix">
        <details
          v-for="row in filteredRows"
          :key="row.format.id"
          class="matrix-row"
          @toggle="loadCandidateStatus($event, row.format.id, row.format.externalPolicy)"
        >
          <summary>
            <span class="format-identity">
              <strong>{{ row.format.label }}</strong>
              <small>{{ row.format.extensions.join(' · ') }}</small>
            </span>
            <span class="capability" :class="`level-${row.format.userCapability.level}`">
              {{ row.format.userCapability.label }}
            </span>
            <span class="save-mode">{{ saveModeLabel(row.format.userCapability.saveMode) }}</span>
            <span class="dependency">{{ dependencyLabel(row.dependency) }}</span>
            <ChevronDown class="chevron" :size="16" />
          </summary>
          <div class="row-detail">
            <section>
              <h2>源文件策略</h2>
              <p>{{ row.sourcePolicy }}</p>
            </section>
            <section>
              <h2>隐私边界</h2>
              <p>{{ row.privacyBoundary }}</p>
            </section>
            <section>
              <h2>已知限制</h2>
              <p>{{ row.knownLimitations.join('；') }}</p>
            </section>
            <section>
              <h2>当前能力</h2>
              <p>{{ row.format.userCapability.description }}</p>
            </section>
            <section>
              <h2>外部打开</h2>
              <p>{{ externalPolicyDescription(row.format.externalPolicy) }}</p>
              <div
                v-if="row.format.externalPolicy === 'edit' || row.format.externalPolicy === 'preview'"
                class="default-app-control"
              >
                <div class="default-app-copy">
                  <strong>{{ row.format.extensions.join(' · ') }}</strong>
                  <span>{{ candidateHint(row.format.id) }}</span>
                </div>
                <button
                  type="button"
                  class="default-app-action"
                  :disabled="preparingFormatId === row.format.id"
                  @click="prepareDefaultApp(row.format.id, row.format.label)"
                >
                  <LoaderCircle v-if="preparingFormatId === row.format.id" class="spin" :size="14" />
                  <CheckCircle2 v-else-if="candidatePrepared(row.format.id)" :size="14" />
                  <ExternalLink v-else :size="14" />
                  {{ candidatePrepared(row.format.id) ? '已准备 · 去 Windows 确认' : '选择 LongEdit 打开' }}
                </button>
              </div>
            </section>
          </div>
        </details>
      </div>
      <div v-else class="empty-state">没有匹配的格式</div>

      <section class="external-gates">
        <div class="section-heading">
          <h2>外部证据门禁</h2>
          <span>{{ RELEASE_EXTERNAL_GATES.length }}</span>
        </div>
        <div v-for="gate in RELEASE_EXTERNAL_GATES" :key="gate.id" class="gate-row">
          <span class="gate-status">{{ gate.status === 'complete' ? '完成' : '待外部环境' }}</span>
          <strong>{{ gate.id }}</strong>
          <span>{{ gate.evidence }}</span>
          <p>{{ gate.releaseImpact }}</p>
        </div>
      </section>
    </WorkspaceManagementContent>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useMessage } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { CheckCircle2, ChevronDown, ExternalLink, FileInput, LoaderCircle, Search, ShieldCheck } from 'lucide-vue-next'
import WorkspaceManagementContent from '../components/workspace/WorkspaceManagementContent.vue'
import WorkspaceManagementHeader from '../components/workspace/WorkspaceManagementHeader.vue'
import {
  RELEASE_CAPABILITY_ROWS,
  RELEASE_EXTERNAL_GATES,
  RELEASE_MATRIX_VERSION,
  RELEASE_PUBLIC_STATUS_LABEL,
  type ReleaseDependency,
  type ReleaseReadiness,
} from '../config/releaseCapabilities'
import type { ExternalFilePolicy, SaveMode } from '../config/fileFormats'

type FilterValue = 'all' | 'external-ready' | ReleaseReadiness
interface DefaultAppCandidateStatus {
  formatId: string
  extensions: string[]
  registeredExtensions: string[]
  available: boolean
  userChoiceRequired: boolean
  diagnostic: string
}

const router = useRouter()
const route = useRoute()
const message = useMessage()
const query = ref('')
const activeFilter = ref<FilterValue>('all')
const candidateStatuses = ref<Record<string, DefaultAppCandidateStatus>>({})
const candidateLoading = new Set<string>()
const preparingFormatId = ref('')
const externalEditableCount = RELEASE_CAPABILITY_ROWS.filter(row => row.format.externalPolicy === 'edit').length
const externalPreviewCount = RELEASE_CAPABILITY_ROWS.filter(row => row.format.externalPolicy === 'preview').length
const externalReadyCount = externalEditableCount + externalPreviewCount
const returnToSource = () => {
  if (route.query.from === 'settings') {
    router.push({ name: 'Settings', query: { focus: route.query.settingsFocus || 'format-capabilities' } })
    return
  }
  router.push({ name: 'LibraryMode' })
}

const filters = computed(() => [
  { value: 'all' as const, label: '全部', count: RELEASE_CAPABILITY_ROWS.length },
  { value: 'verified' as const, label: '已验证', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'verified').length },
  { value: 'verified-with-limitations' as const, label: '有限能力', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'verified-with-limitations').length },
  { value: 'external-dependency' as const, label: '外部依赖', count: RELEASE_CAPABILITY_ROWS.filter(row => row.readiness === 'external-dependency').length },
  { value: 'external-ready' as const, label: '可外部打开', count: externalReadyCount },
])

const filteredRows = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return RELEASE_CAPABILITY_ROWS.filter(row => {
    if (activeFilter.value === 'external-ready' && !['edit', 'preview'].includes(row.format.externalPolicy)) return false
    if (activeFilter.value !== 'all' && activeFilter.value !== 'external-ready' && row.readiness !== activeFilter.value) return false
    if (!needle) return true
    return row.format.label.toLocaleLowerCase().includes(needle)
      || row.format.id.includes(needle)
      || row.format.extensions.some(extension => extension.includes(needle))
  })
})

const externalPolicyDescription = (policy: ExternalFilePolicy) => ({
  edit: '可由文件选择器或 Windows 启动参数授权，在独立工作区直接打开；不会自动保存。',
  preview: '可由文件选择器或 Windows 启动参数授权，在独立只读工作区打开；不会修改或写回源文件。',
  import: '当前仅支持从资料库或明确导入入口打开，尚未注册为系统外部启动格式。',
  none: '当前不接受外部启动或导入。',
})[policy]

const openDefaultAppsSettings = async () => {
  try {
    await invoke('open_default_apps_settings')
  } catch (cause) {
    message.error(`无法打开 Windows 默认应用设置：${String(cause)}`)
  }
}

const candidatePrepared = (formatId: string) => {
  const status = candidateStatuses.value[formatId]
  return Boolean(status?.extensions.length && status.registeredExtensions.length === status.extensions.length)
}

const candidateHint = (formatId: string) => {
  const status = candidateStatuses.value[formatId]
  if (!status) return '只为当前格式加入系统候选，不会自动改成默认应用。'
  if (!status.available) return status.diagnostic
  return candidatePrepared(formatId)
    ? 'LongEdit 已加入这些扩展名的候选；默认应用仍需在 Windows 页面逐项确认。'
    : '尚未加入系统候选；其他格式不会受此操作影响。'
}

const refreshCandidateStatus = async (formatId: string) => {
  if (candidateLoading.has(formatId)) return
  candidateLoading.add(formatId)
  try {
    const status = await invoke<DefaultAppCandidateStatus>('get_default_app_candidate_status', { formatId })
    candidateStatuses.value = { ...candidateStatuses.value, [formatId]: status }
  } catch (cause) {
    console.warn(`Default-app status unavailable for ${formatId}`, cause)
  } finally {
    candidateLoading.delete(formatId)
  }
}

const loadCandidateStatus = (event: Event, formatId: string, policy: ExternalFilePolicy) => {
  if (!['edit', 'preview'].includes(policy)) return
  if (!(event.currentTarget as HTMLDetailsElement).open || candidateStatuses.value[formatId]) return
  void refreshCandidateStatus(formatId)
}

const prepareDefaultApp = async (formatId: string, label: string) => {
  if (preparingFormatId.value) return
  preparingFormatId.value = formatId
  try {
    const status = await invoke<DefaultAppCandidateStatus>('prepare_default_app_candidate', { formatId })
    candidateStatuses.value = { ...candidateStatuses.value, [formatId]: status }
    message.success(`${label} 已加入 LongEdit 候选，请在 Windows 中确认需要的扩展名`)
  } catch (cause) {
    message.error(`无法准备 ${label} 的默认应用选项：${String(cause)}`)
  } finally {
    preparingFormatId.value = ''
  }
}

const saveModeLabel = (mode: SaveMode) => ({
  overwrite: '原文件保存',
  'bounded-overwrite': '有限写回',
  sidecar: 'Sidecar',
  copy: '仅新副本',
  none: '不保存',
})[mode]

const dependencyLabel = (dependency: ReleaseDependency) => ({
  none: '无',
  'compatible-office-suite': '兼容 Office',
  'compatible-desktop-application': '兼容应用',
})[dependency]
</script>

<style scoped>
.release-capabilities {
  height: 100%;
  overflow-y: auto;
  color: var(--theme-text);
  background: var(--theme-bg);
}

.release-state {
  min-height: 32px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: var(--theme-border);
  border-radius: 6px;
}

.external-opening-summary {
  min-height: 64px;
  margin-bottom: 18px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: var(--theme-border);
  border-radius: 6px;
  background: var(--theme-surface);
}
.external-opening-summary > svg { color: var(--theme-primary); }
.external-opening-summary strong { font-size: 13px; }
.external-opening-summary p { margin: 3px 0 0; color: var(--theme-text-secondary); font-size: 12px; line-height: 1.5; }
.external-opening-summary button,
.default-app-action {
  min-height: 32px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: var(--theme-border);
  border-radius: 5px;
  color: var(--theme-primary);
  background: var(--theme-bg);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.external-opening-summary button:hover,
.default-app-action:hover { background: rgba(var(--theme-primary-rgb), 0.08); }
.default-app-control {
  margin-top: 9px;
  padding: 9px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: var(--theme-border);
  border-radius: 5px;
  background: var(--theme-surface);
}
.default-app-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.default-app-copy strong { color: var(--theme-text); font-size: 11px; overflow-wrap: anywhere; }
.default-app-copy span { color: var(--theme-text-secondary); font-size: 11px; line-height: 1.4; }
.default-app-action { flex: 0 0 auto; }
.default-app-action:disabled { cursor: wait; opacity: 0.62; }
.spin { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.search-box {
  width: min(320px, 100%);
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: var(--theme-border);
  border-radius: 6px;
  background: var(--theme-surface);
}

.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: inherit;
  background: transparent;
}

.segments {
  min-width: 0;
  display: flex;
  overflow-x: auto;
  border: var(--theme-border);
  border-radius: 6px;
}

.segments button {
  height: 34px;
  padding: 0 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-right: var(--theme-border);
  color: var(--theme-text-secondary);
  background: var(--theme-surface);
  white-space: nowrap;
  cursor: pointer;
}

.segments button:last-child { border-right: 0; }
.segments button.active { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.09); }
.segments span { font-size: var(--text-compact); }

.matrix-head,
.matrix-row summary {
  display: grid;
  grid-template-columns: minmax(190px, 1.5fr) minmax(130px, 1fr) minmax(110px, 0.8fr) minmax(110px, 0.8fr) 20px;
  align-items: center;
  gap: 12px;
}

.matrix-head {
  padding: 0 14px 8px;
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.matrix {
  border-top: var(--theme-border);
  background: var(--theme-surface);
}

.matrix-row { border-bottom: var(--theme-border); }
.matrix-row summary {
  min-height: 58px;
  padding: 8px 14px;
  list-style: none;
  cursor: pointer;
}
.matrix-row summary::-webkit-details-marker { display: none; }
.matrix-row summary:hover { background: rgba(var(--theme-primary-rgb), 0.045); }
.format-identity { min-width: 0; display: flex; flex-direction: column; }
.format-identity strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.format-identity small { color: var(--theme-text-secondary); font-size: 11px; }

.capability {
  width: fit-content;
  max-width: 100%;
  padding: 3px 7px;
  border-radius: 4px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), 0.1);
  font-size: 11px;
}
.level-preview-only,
.level-external-open { color: var(--theme-text-secondary); background: var(--theme-bg); }
.save-mode, .dependency { color: var(--theme-text-secondary); font-size: 12px; }
.chevron { color: var(--theme-text-secondary); transition: transform 160ms ease; }
.matrix-row[open] .chevron { transform: rotate(180deg); }

.row-detail {
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  border-top: var(--theme-border);
  background: var(--theme-bg);
}
.row-detail h2 { margin: 0 0 4px; color: var(--theme-text-secondary); font-size: 11px; letter-spacing: 0; }
.row-detail p { margin: 0; font-size: 12px; line-height: 1.55; }

.empty-state { padding: 48px; color: var(--theme-text-secondary); text-align: center; }
.external-gates { margin-top: 30px; border-top: var(--theme-border); }
.section-heading { min-height: 50px; display: flex; align-items: center; gap: 8px; }
.section-heading h2 { margin: 0; font-size: 14px; letter-spacing: 0; }
.section-heading span { color: var(--theme-text-secondary); font-size: 11px; }
.gate-row {
  min-height: 52px;
  padding: 8px 12px;
  display: grid;
  grid-template-columns: 90px minmax(180px, 0.8fr) 60px minmax(260px, 2fr);
  align-items: center;
  gap: 12px;
  border-bottom: var(--theme-border);
  font-size: 12px;
}
.gate-row p { margin: 0; color: var(--theme-text-secondary); }
.gate-status { color: var(--theme-warning, #b77813); }

@media (max-width: 760px) {
  .external-opening-summary { grid-template-columns: 24px minmax(0, 1fr); }
  .external-opening-summary button { grid-column: 1 / -1; width: 100%; }
  .toolbar { align-items: stretch; flex-direction: column; }
  .search-box { width: 100%; box-sizing: border-box; }
  .matrix-head { display: none; }
  .matrix-row summary {
    grid-template-columns: minmax(130px, 1fr) minmax(100px, auto) 18px;
    gap: 8px;
  }
  .save-mode, .dependency { display: none; }
  .row-detail { grid-template-columns: 1fr; }
  .default-app-control { align-items: stretch; flex-direction: column; }
  .default-app-action { width: 100%; }
  .gate-row { grid-template-columns: 90px 1fr 50px; }
  .gate-row p { grid-column: 1 / -1; }
  .release-state span { display: none; }
}
</style>
