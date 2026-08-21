<template>
  <transition name="health-slide">
    <aside v-if="open" class="health-panel" aria-label="知识图谱治理">
      <header>
        <div>
          <span class="health-kicker">关系健康</span>
          <h2>知识图谱治理</h2>
        </div>
        <button class="close-button" aria-label="关闭知识图谱治理" @click="emit('close')">×</button>
      </header>

      <div v-if="loading" class="health-state"><span class="health-spinner"></span>正在扫描知识库关系…</div>
      <div v-else-if="error" class="health-state error-state">
        <p>{{ error }}</p>
        <button @click="loadReport">重新扫描</button>
      </div>
      <template v-else-if="report">
        <div class="health-summary">
          <button :class="{ active: activeSection === 'broken' }" @click="activeSection = 'broken'">
            <strong>{{ report.brokenLinks.length }}</strong><span>断链</span>
          </button>
          <button :class="{ active: activeSection === 'ambiguous' }" @click="activeSection = 'ambiguous'">
            <strong>{{ report.ambiguousLinks.length }}</strong><span>歧义</span>
          </button>
          <button :class="{ active: activeSection === 'orphan' }" @click="activeSection = 'orphan'">
            <strong>{{ report.orphanNotes.length }}</strong><span>孤立笔记</span>
          </button>
        </div>

        <div class="health-toolbar">
          <span>已扫描 {{ report.scannedNotes }} 篇笔记</span>
          <button :disabled="loading || repairing" @click="loadReport">重新扫描</button>
        </div>
        <p v-if="statusMessage" class="repair-status">{{ statusMessage }}</p>

        <section v-if="activeSection === 'broken'" class="issue-section">
          <div class="section-heading">
            <div><strong>断开的链接</strong><span>目标文件不存在或已经移动</span></div>
            <button v-if="recommendedRepairs.length" :disabled="repairing" class="batch-button" @click="applyRecommendedRepairs">
              修复 {{ recommendedRepairs.length }} 条明确建议
            </button>
          </div>
          <div v-if="!report.brokenLinks.length" class="healthy-empty">没有发现断链。</div>
          <article v-for="issue in report.brokenLinks" :key="issue.id" class="issue-card">
            <button class="source-link" @click="emit('openFile', issue.sourcePath)">
              <strong>{{ issue.sourceTitle }}</strong><span>第 {{ issue.line }} 行</span>
            </button>
            <div class="issue-target"><span class="issue-badge broken">断链</span><code>{{ issue.syntax }}</code></div>
            <p>{{ issue.context }}</p>
            <div v-if="issue.candidates.length" class="candidate-list">
              <span>可能目标</span>
              <button v-for="candidate in issue.candidates" :key="candidate.path" :disabled="repairing" @click="applyRepair(issue, candidate)">
                <span><strong>{{ candidate.title }}</strong><small>{{ candidate.relativePath }}</small></span>
                <em>{{ Math.round(candidate.confidence * 100) }}%</em>
              </button>
            </div>
            <span v-else class="manual-hint">未找到相似笔记，请打开来源文档手动修改或创建目标。</span>
          </article>
        </section>

        <section v-else-if="activeSection === 'ambiguous'" class="issue-section">
          <div class="section-heading"><div><strong>歧义链接</strong><span>存在多个同名目标，需要明确路径</span></div></div>
          <div v-if="!report.ambiguousLinks.length" class="healthy-empty">没有发现歧义链接。</div>
          <article v-for="issue in report.ambiguousLinks" :key="issue.id" class="issue-card">
            <button class="source-link" @click="emit('openFile', issue.sourcePath)">
              <strong>{{ issue.sourceTitle }}</strong><span>第 {{ issue.line }} 行</span>
            </button>
            <div class="issue-target"><span class="issue-badge ambiguous">歧义</span><code>{{ issue.syntax }}</code></div>
            <p>{{ issue.context }}</p>
            <div class="candidate-list">
              <span>选择正确目标</span>
              <button v-for="candidate in issue.candidates" :key="candidate.path" :disabled="repairing" @click="applyRepair(issue, candidate)">
                <span><strong>{{ candidate.title }}</strong><small>{{ candidate.relativePath }}</small></span>
                <em>使用此路径</em>
              </button>
            </div>
          </article>
        </section>

        <section v-else class="issue-section">
          <div class="section-heading"><div><strong>孤立笔记</strong><span>没有任何可解析的链入或链出关系</span></div></div>
          <div v-if="!report.orphanNotes.length" class="healthy-empty">所有笔记都已进入关系网络。</div>
          <button v-for="note in report.orphanNotes" :key="note.path" class="orphan-card" @click="emit('openFile', note.path)">
            <span><strong>{{ note.title }}</strong><small>{{ note.relativePath }}</small></span>
            <em>{{ note.directory || '根目录' }}</em>
          </button>
        </section>
      </template>
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

interface Candidate {
  title: string
  path: string
  relativePath: string
  replacementTarget: string
  confidence: number
}
interface LinkIssue {
  id: string
  kind: 'broken' | 'ambiguous'
  sourcePath: string
  sourceTitle: string
  targetText: string
  syntax: string
  context: string
  line: number
  relationType: string
  candidates: Candidate[]
  recommendedCandidate?: Candidate | null
}
interface OrphanNote { path: string; title: string; relativePath: string; directory: string }
interface HealthReport {
  brokenLinks: LinkIssue[]
  ambiguousLinks: LinkIssue[]
  orphanNotes: OrphanNote[]
  scannedNotes: number
}
interface RepairRequest { sourcePath: string; targetPath: string; line: number; expectedSyntax: string }
interface RepairResult { repairedLinks: number; changedFiles: number }

const props = defineProps<{ open: boolean; libraryRoot: string }>()
const emit = defineEmits<{ close: []; openFile: [path: string]; repaired: [] }>()
const loading = ref(false)
const repairing = ref(false)
const error = ref('')
const statusMessage = ref('')
const report = ref<HealthReport | null>(null)
const activeSection = ref<'broken' | 'ambiguous' | 'orphan'>('broken')

const recommendedRepairs = computed(() => report.value?.brokenLinks.filter(issue => issue.recommendedCandidate) || [])

const loadReport = async () => {
  if (!props.libraryRoot) return
  loading.value = true
  error.value = ''
  try {
    report.value = await invoke<HealthReport>('analyze_graph_health', { libraryRoot: props.libraryRoot })
  } catch (cause) {
    error.value = `治理扫描失败：${String(cause)}`
  } finally {
    loading.value = false
  }
}

const requestFor = (issue: LinkIssue, candidate: Candidate): RepairRequest => ({
  sourcePath: issue.sourcePath,
  targetPath: candidate.path,
  line: issue.line,
  expectedSyntax: issue.syntax,
})

const runRepairs = async (repairs: RepairRequest[]) => {
  if (!repairs.length || repairing.value) return
  repairing.value = true
  statusMessage.value = ''
  try {
    const result = await invoke<RepairResult>('repair_graph_links', { libraryRoot: props.libraryRoot, repairs })
    statusMessage.value = `已修复 ${result.repairedLinks} 条链接，更新 ${result.changedFiles} 个文件。`
    await loadReport()
    emit('repaired')
  } catch (cause) {
    statusMessage.value = `修复失败：${String(cause)}`
  } finally {
    repairing.value = false
  }
}

const applyRepair = (issue: LinkIssue, candidate: Candidate) => runRepairs([requestFor(issue, candidate)])
const applyRecommendedRepairs = () => runRepairs(recommendedRepairs.value.map(issue => requestFor(issue, issue.recommendedCandidate!)))

watch(() => props.open, value => { if (value) loadReport() })
watch(() => props.libraryRoot, () => { report.value = null; if (props.open) loadReport() })
</script>

<style scoped>
.health-panel { position: absolute; top: calc(var(--workspace-management-header-height) + 12px); right: var(--workspace-floating-gutter); bottom: var(--workspace-floating-gutter); z-index: 35; width: min(var(--workspace-inspector-width), calc(100vw - var(--workspace-floating-gutter) - var(--workspace-floating-gutter))); padding: 18px; overflow: auto; box-sizing: border-box; border: 1px solid var(--workspace-border-color); border-radius: 6px; color: var(--theme-text); background: var(--workspace-surface-raised); box-shadow: var(--workspace-shadow); backdrop-filter: blur(22px); }
header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.health-kicker { color: var(--theme-primary); font-size: var(--text-compact); font-weight: 800; letter-spacing: 0.13em; }
h2 { margin: 4px 0 0; font-size: 19px; }
.close-button { border: 0; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 24px; }
.health-state { min-height: 240px; display: grid; place-items: center; align-content: center; gap: 10px; color: var(--theme-text-secondary); font-size: 11px; text-align: center; }
.health-spinner { width: 22px; height: 22px; border: 2px solid rgba(var(--theme-primary-rgb), 0.16); border-top-color: var(--theme-primary); border-radius: 50%; animation: health-spin 0.8s linear infinite; }
.error-state { color: #c94843; }
.error-state button, .health-toolbar button { border: 0; color: var(--theme-primary); background: transparent; cursor: pointer; font-size: var(--text-compact); }
.health-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.health-summary button { display: flex; flex-direction: column; gap: 3px; padding: 11px 6px; border: 1px solid transparent; border-radius: 10px; color: var(--theme-text-secondary); background: rgba(var(--theme-primary-rgb), 0.05); cursor: pointer; }
.health-summary button.active { border-color: rgba(var(--theme-primary-rgb), 0.32); color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.09); }
.health-summary strong { font-size: 20px; }
.health-summary span { font-size: var(--text-compact); }
.health-toolbar { display: flex; justify-content: space-between; margin: 10px 2px 14px; color: var(--theme-text-secondary); font-size: var(--text-compact); }
.repair-status { padding: 8px 10px; border-radius: 8px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.07); font-size: var(--text-compact); }
.issue-section { display: flex; flex-direction: column; gap: 9px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
.section-heading > div { display: flex; flex-direction: column; gap: 2px; }
.section-heading strong { font-size: 12px; }
.section-heading span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.batch-button { flex: none; padding: 6px 8px; border: 1px solid rgba(var(--theme-primary-rgb), 0.2); border-radius: 7px; color: #fff; background: var(--theme-primary); cursor: pointer; font-size: var(--text-compact); }
.issue-card { padding: 11px; border: 1px solid rgba(var(--theme-primary-rgb), 0.1); border-radius: 11px; background: rgba(var(--theme-primary-rgb), 0.025); }
.source-link { display: flex; justify-content: space-between; width: 100%; padding: 0; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }
.source-link strong { font-size: 11px; }
.source-link span { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.issue-target { display: flex; align-items: center; gap: 7px; margin-top: 8px; }
.issue-target code { overflow: hidden; color: var(--theme-primary); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }
.issue-badge { padding: 2px 5px; border-radius: 999px; font-size: var(--text-compact); font-weight: 750; }
.issue-badge.broken { color: #c94843; background: rgba(201, 72, 67, 0.1); }
.issue-badge.ambiguous { color: #9b6b16; background: rgba(201, 145, 45, 0.12); }
.issue-card > p { margin: 7px 0; color: var(--theme-text-secondary); font-size: var(--text-compact); line-height: 1.5; }
.candidate-list { display: flex; flex-direction: column; gap: 4px; margin-top: 9px; }
.candidate-list > span, .manual-hint { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.candidate-list button, .orphan-card { display: flex; align-items: center; justify-content: space-between; gap: 9px; width: 100%; padding: 7px 8px; border: 1px solid rgba(var(--theme-primary-rgb), 0.1); border-radius: 7px; color: var(--theme-text); background: var(--theme-card); cursor: pointer; text-align: left; }
.candidate-list button:hover, .orphan-card:hover { border-color: rgba(var(--theme-primary-rgb), 0.36); }
.candidate-list button > span, .orphan-card > span { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.candidate-list strong, .orphan-card strong { font-size: var(--text-compact); }
.candidate-list small, .orphan-card small { overflow: hidden; color: var(--theme-text-secondary); font-size: var(--text-compact); text-overflow: ellipsis; white-space: nowrap; }
.candidate-list em, .orphan-card em { flex: none; color: var(--theme-primary); font-size: var(--text-compact); font-style: normal; }
.healthy-empty { padding: 34px 10px; color: var(--theme-text-secondary); font-size: var(--text-compact); text-align: center; }
.health-slide-enter-active, .health-slide-leave-active { transition: opacity 0.2s ease, transform 0.28s var(--ease-premium); }
.health-slide-enter-from, .health-slide-leave-to { opacity: 0; transform: translateX(24px); }
@keyframes health-spin { to { transform: rotate(360deg); } }
</style>
