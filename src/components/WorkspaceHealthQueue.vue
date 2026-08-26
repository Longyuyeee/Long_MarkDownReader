<template>
  <div class="attention-queue" data-testid="m2a2-attention-queue" :data-analysis-state="loading ? 'loading' : 'ready'">
    <div class="queue-heading">
      <div><span>工作区检查</span><h2>需要处理</h2></div>
      <div class="heading-actions"><small>{{ issueCount }} 项</small><button @click="emit('openGraph')"><NetworkIcon />图谱治理</button></div>
    </div>
    <div v-if="loading" class="queue-state"><LoaderIcon />正在后台检查关系与资料质量，最近文件和待办仍可使用</div>
    <div v-else-if="error" class="queue-state error"><AlertIcon />{{ error }}<button @click="emit('retry')">重试</button></div>
    <div v-else-if="!issueCount" class="queue-empty"><CheckIcon /><span><strong>暂时没有需要处理的项目</strong><small>关系、重复文件和 PDF 批注检查均未发现问题</small></span></div>
    <div v-else class="issue-list">
      <article v-if="indexNeedsAttention" class="issue-row warning" data-issue-kind="index"><DatabaseIcon /><span><strong>{{ indexTitle }}</strong><small>搜索与关联结果可能不完整；重新准备本地索引即可恢复，不会修改文档。</small></span><button @click="emit('prepareIndex')">重新准备</button></article>
      <article v-for="issue in graphHealth.brokenLinks.slice(0, 4)" :key="issue.id" class="issue-row danger" data-issue-kind="broken-link"><UnlinkIcon /><span><strong>{{ issue.sourceTitle }} 的链接找不到目标</strong><small>第 {{ issue.line }} 行 · {{ issue.syntax }}；打开来源修正，或在图谱治理中采用候选目标。</small></span><button @click="emit('openFile', issue.sourcePath)">打开来源</button></article>
      <article v-for="issue in graphHealth.ambiguousLinks.slice(0, 4)" :key="issue.id" class="issue-row warning" data-issue-kind="ambiguous-link"><SplitIcon /><span><strong>{{ issue.sourceTitle }} 的链接存在多个目标</strong><small>第 {{ issue.line }} 行 · {{ issue.syntax }}；需要选择明确路径，避免打开错误文档。</small></span><button @click="emit('openGraph')">选择目标</button></article>
      <article v-for="note in graphHealth.orphanNotes.slice(0, 4)" :key="note.path" class="issue-row" data-issue-kind="orphan-note"><OrbitIcon /><span><strong>{{ note.title }} 尚未进入关系网络</strong><small>{{ note.relativePath }}；可补充链接、标签或画布连接，也可以暂时保持独立。</small></span><button @click="emit('openFile', note.path)">打开笔记</button></article>
      <article v-for="(group, groupIndex) in report.duplicateGroups.slice(0, 3)" :key="`${group.size}:${groupIndex}`" class="issue-row" data-issue-kind="duplicate"><CopyIcon /><span><strong>{{ group.files.length }} 个内容完全相同的文件</strong><small>{{ group.files.map(file => file.title).join('、') }} · {{ formatBytes(group.size) }}；确认保留版本后再自行删除，Long编辑不会自动处理。</small></span><button @click="emit('openFile', group.files[0].path)">查看文件</button></article>
      <article v-for="item in report.unreferencedAnnotations.slice(0, 4)" :key="`${item.pdfPath}:${item.annotationId}`" class="issue-row" data-issue-kind="annotation"><AnnotationIcon /><span><strong>{{ item.title }} 有未进入知识引用的批注</strong><small>{{ item.relativePath }} · 第 {{ item.page }} 页；打开批注后可决定是否整理进笔记或关系网络。</small></span><button @click="emit('openAnnotation', item)">查看批注</button></article>
    </div>
    <p v-if="hiddenIssueCount" class="queue-limit">另有 {{ hiddenIssueCount }} 项，可在图谱治理或原文件中继续处理。</p>
    <p v-if="report.truncated" class="queue-limit"><AlertIcon />资料扫描达到安全上限，当前显示部分结果。</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle as AlertIcon, CheckCircle2 as CheckIcon, Copy as CopyIcon, Database as DatabaseIcon, GitFork as SplitIcon, LoaderCircle as LoaderIcon, MessageSquareWarning as AnnotationIcon, Network as NetworkIcon, Orbit as OrbitIcon, Unlink as UnlinkIcon } from 'lucide-vue-next'
export interface WorkspaceHealthFile { title: string; path: string; relativePath: string; objectType: string; modifiedAt: number; size: number }
export interface WorkspaceDuplicateGroup { size: number; files: WorkspaceHealthFile[] }
export interface WorkspaceAnnotationIssue { title: string; pdfPath: string; relativePath: string; annotationId: string; page: number; text: string }
export interface WorkspaceHealthReport { duplicateGroups: WorkspaceDuplicateGroup[]; unreferencedAnnotations: WorkspaceAnnotationIssue[]; scannedFiles: number; hashedFiles: number; scannedAnnotations: number; truncated: boolean }
export interface GraphLinkIssue { id: string; sourcePath: string; sourceTitle: string; syntax: string; line: number }
export interface GraphOrphanNote { path: string; title: string; relativePath: string; directory: string }
export interface WorkspaceGraphHealth { brokenLinks: GraphLinkIssue[]; ambiguousLinks: GraphLinkIssue[]; orphanNotes: GraphOrphanNote[]; scannedNotes: number }
export interface WorkspaceIndexStatus { state: 'missing' | 'building' | 'ready' | 'stale' | 'corrupt' | 'error'; objectCount: number; relationCount: number }
const props = defineProps<{ report: WorkspaceHealthReport; graphHealth: WorkspaceGraphHealth; indexStatus: WorkspaceIndexStatus; loading?: boolean; error?: string }>()
const emit = defineEmits<{ openFile: [path: string]; openAnnotation: [issue: WorkspaceAnnotationIssue]; openGraph: []; prepareIndex: []; retry: [] }>()
const indexNeedsAttention = computed(() => ['stale', 'corrupt', 'error'].includes(props.indexStatus.state))
const indexTitle = computed(() => props.indexStatus.state === 'stale' ? '本地搜索索引需要更新' : '本地搜索索引需要重新准备')
const rawIssueCount = computed(() => Number(indexNeedsAttention.value) + props.graphHealth.brokenLinks.length + props.graphHealth.ambiguousLinks.length + props.graphHealth.orphanNotes.length + props.report.duplicateGroups.length + props.report.unreferencedAnnotations.length)
const issueCount = computed(() => props.loading ? 0 : rawIssueCount.value)
const visibleIssueCount = computed(() => Number(indexNeedsAttention.value) + Math.min(4, props.graphHealth.brokenLinks.length) + Math.min(4, props.graphHealth.ambiguousLinks.length) + Math.min(4, props.graphHealth.orphanNotes.length) + Math.min(3, props.report.duplicateGroups.length) + Math.min(4, props.report.unreferencedAnnotations.length))
const hiddenIssueCount = computed(() => Math.max(0, issueCount.value - visibleIssueCount.value))
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
</script>

<style scoped>
.attention-queue{min-width:0}.queue-heading{min-height:35px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.queue-heading>div:first-child{display:grid;gap:3px}.queue-heading span{color:var(--theme-primary);font-size:var(--text-compact);font-weight:800}.queue-heading h2{margin:0;font-size:14px;letter-spacing:0}.heading-actions{display:flex;align-items:center;gap:10px}.heading-actions small{color:var(--theme-text-secondary);font-size:var(--text-compact)}.heading-actions button,.issue-row button,.queue-state button{min-height:29px;display:inline-flex;align-items:center;gap:5px;padding:0 8px;border:1px solid rgba(var(--theme-primary-rgb),.2);border-radius:5px;color:var(--theme-primary);background:rgba(var(--theme-primary-rgb),.05);cursor:pointer;font-size:var(--text-compact);white-space:nowrap}.heading-actions svg{width:13px}
.queue-state,.queue-empty{min-height:86px;display:flex;align-items:center;justify-content:center;gap:9px;border-top:var(--theme-border);border-bottom:var(--theme-border);color:var(--theme-text-secondary);font-size:var(--text-compact)}.queue-state>svg{width:16px;animation:spin .9s linear infinite}.queue-state.error{color:var(--status-danger)}.queue-state.error>svg{animation:none}.queue-empty>svg{width:22px;color:var(--status-success)}.queue-empty>span{display:grid;gap:3px}.queue-empty strong{color:var(--theme-text)}.queue-empty small{color:var(--theme-text-secondary)}
.issue-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}.issue-row{min-width:0;min-height:72px;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:10px;padding:9px 4px;border-top:var(--theme-border)}.issue-row>svg{width:16px;color:var(--theme-primary)}.issue-row.warning>svg{color:var(--status-warning)}.issue-row.danger>svg{color:var(--status-danger)}.issue-row>span{min-width:0;display:grid;gap:4px}.issue-row strong,.issue-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.issue-row strong{font-size:var(--text-compact)}.issue-row small{color:var(--theme-text-secondary);font-size:var(--text-compact)}.queue-limit{min-height:31px;display:flex;align-items:center;gap:6px;margin:0;color:var(--theme-text-secondary);font-size:var(--text-compact)}.queue-limit svg{width:13px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:760px){.issue-list{grid-template-columns:1fr}.queue-heading{flex-direction:column;gap:7px}.issue-row{grid-template-columns:24px minmax(0,1fr)}.issue-row button{grid-column:2;justify-self:start}.issue-row strong,.issue-row small{white-space:normal;overflow-wrap:anywhere}}
</style>
