<template>
  <div class="governance-queue">
    <div class="queue-heading">
      <div><span>GOVERNANCE</span><h2>治理队列</h2></div>
      <p>{{ report.scannedFiles }} 个文件 · {{ report.scannedAnnotations }} 条批注</p>
    </div>

    <div v-if="error" class="queue-alert"><AlertIcon /><span>{{ error }}</span></div>
    <div v-else class="queue-columns">
      <div class="queue-column">
        <div class="column-title"><CopyIcon /><strong>重复文件</strong><span>{{ report.duplicateGroups.length }} 组</span></div>
        <div v-if="report.duplicateGroups.length" class="duplicate-list">
          <div v-for="(group, groupIndex) in report.duplicateGroups" :key="`${group.size}:${groupIndex}`" class="duplicate-group">
            <div class="group-meta"><strong>{{ group.files.length }} 个完全相同文件</strong><span>{{ formatBytes(group.size) }}</span></div>
            <button v-for="file in group.files" :key="file.path" @click="emit('openFile', file.path)">
              <span><strong>{{ file.title }}</strong><small>{{ file.relativePath }}</small></span><ArrowIcon />
            </button>
          </div>
        </div>
        <p v-else class="queue-empty">未发现内容完全相同的文件</p>
      </div>

      <div class="queue-column">
        <div class="column-title"><AnnotationIcon /><strong>未处理批注</strong><span>{{ report.unreferencedAnnotations.length }} 条</span></div>
        <div v-if="report.unreferencedAnnotations.length" class="annotation-list">
          <button v-for="item in report.unreferencedAnnotations" :key="`${item.pdfPath}:${item.annotationId}`" @click="emit('openAnnotation', item)">
            <span><strong>{{ item.title }}</strong><small>{{ item.relativePath }} · 第 {{ item.page }} 页</small></span><ArrowIcon />
          </button>
        </div>
        <p v-else class="queue-empty">所有 PDF 批注均已进入知识引用</p>
      </div>
    </div>

    <p v-if="report.truncated" class="queue-limit"><AlertIcon />扫描达到安全上限，当前结果为部分清单</p>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle as AlertIcon, ArrowRight as ArrowIcon, Copy as CopyIcon, MessageSquareWarning as AnnotationIcon } from 'lucide-vue-next'

export interface WorkspaceHealthFile { title: string; path: string; relativePath: string; objectType: string; modifiedAt: number; size: number }
export interface WorkspaceDuplicateGroup { size: number; files: WorkspaceHealthFile[] }
export interface WorkspaceAnnotationIssue { title: string; pdfPath: string; relativePath: string; annotationId: string; page: number; text: string }
export interface WorkspaceHealthReport {
  duplicateGroups: WorkspaceDuplicateGroup[]
  unreferencedAnnotations: WorkspaceAnnotationIssue[]
  scannedFiles: number
  hashedFiles: number
  scannedAnnotations: number
  truncated: boolean
}

defineProps<{ report: WorkspaceHealthReport; error?: string }>()
const emit = defineEmits<{
  openFile: [path: string]
  openAnnotation: [issue: WorkspaceAnnotationIssue]
}>()

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.governance-queue { min-width: 0; }
.queue-heading { min-height: 35px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.queue-heading>div { display: grid; gap: 3px; }.queue-heading span { color: var(--theme-primary); font-size: 8px; font-weight: 800; }.queue-heading h2 { margin: 0; font-size: 14px; letter-spacing: 0; }.queue-heading p { margin: 3px 0 0; color: var(--theme-text-secondary); font-size: 9px; }
.queue-columns { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 32px; }.queue-column { min-width: 0; }
.column-title { min-height: 36px; display: grid; grid-template-columns: 20px minmax(0,1fr) auto; align-items: center; gap: 7px; border-bottom: var(--theme-border); }.column-title svg { width: 14px; color: var(--theme-primary); }.column-title strong { font-size: 9px; }.column-title span { color: var(--theme-text-secondary); font-size: 8px; }
.duplicate-group { padding: 10px 0 4px; border-bottom: var(--theme-border); }.group-meta { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; }.group-meta strong { font-size: 9px; }.group-meta span { color: var(--theme-text-secondary); font-size: 8px; }
.duplicate-group button,.annotation-list button { width: 100%; min-height: 42px; display: grid; grid-template-columns: minmax(0,1fr) 16px; align-items: center; gap: 8px; padding: 5px 6px; border: 0; color: var(--theme-text); background: transparent; cursor: pointer; text-align: left; }.duplicate-group button:hover,.annotation-list button:hover { color: var(--theme-primary); background: rgba(var(--theme-primary-rgb),.045); }.duplicate-group button>span,.annotation-list button>span { min-width: 0; display: grid; gap: 3px; }.duplicate-group button strong,.annotation-list button strong,.duplicate-group button small,.annotation-list button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.duplicate-group button strong,.annotation-list button strong { font-size: 9px; }.duplicate-group button small,.annotation-list button small { color: var(--theme-text-secondary); font-size: 8px; }.duplicate-group button svg,.annotation-list button svg { width: 12px; color: var(--theme-text-secondary); }
.annotation-list { display: grid; }.annotation-list button { border-bottom: var(--theme-border); }
.queue-empty { min-height: 82px; display: grid; place-items: center; margin: 0; color: var(--theme-text-secondary); font-size: 9px; }
.queue-alert,.queue-limit { min-height: 38px; display: flex; align-items: center; gap: 7px; margin: 0; color: #a64d23; font-size: 9px; }.queue-alert { border-bottom: 1px solid rgba(166,77,35,.25); }.queue-alert svg,.queue-limit svg { width: 13px; }.queue-limit { min-height: 32px; }
@media (max-width: 700px) { .queue-columns { grid-template-columns: 1fr; gap: 22px; }.queue-heading { flex-direction: column; gap: 2px; } }
</style>
