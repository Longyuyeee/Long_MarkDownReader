<template>
  <div class="search-page-status" :aria-busy="page.busy.value">
    <template v-if="part !== 'footer'">
    <div class="search-page-line">
      <span role="status">{{ summary }}</span>
      <label>排序 <select :value="sort" :disabled="disabled || page.busy.value" aria-label="搜索结果排序" @change="$emit('sort', ($event.target as HTMLSelectElement).value as SearchSort)"><option value="relevance">相关性</option><option value="modified">修改时间</option></select></label>
    </div>
    <small v-if="tag">笔记标签筛选<WorkspaceHelp label="标签筛选范围" text="按 Markdown 笔记中的标签筛选；只搜索当前可提取的内容。" /></small>
    <details v-if="frame?.libraries?.length" class="search-library-progress"><summary>各资料库进度</summary><div v-for="library in frame.libraries" :key="library.libraryRoot" class="search-library-row"><span :title="library.libraryRoot">{{ library.libraryName }}</span><span>{{ libraryLabels[library.state] }}<template v-if="library.totalFiles !== null"> · {{ library.totalFiles }} 个文件</template></span></div></details>
    <p v-if="frame?.warnings?.length" class="search-page-warning" role="status">{{ frame.warnings.join('；') }}</p>
    <p v-if="frame?.scanState === 'limited' || frame?.scanState === 'failed'" class="search-page-warning" role="status">{{ frame.scanState === 'failed' ? '所有资料库都未能完成搜索，请核对访问情况后重新搜索。' : '结果尚未查全，部分资料不可读或达到处理上限；已找到的文件仍可查看。' }}</p>
    <div v-if="page.error.value" class="search-page-error" role="alert"><span>{{ page.error.value }}</span><button type="button" :disabled="disabled || page.busy.value" @click="$emit('retry')">{{ retryLabel }}</button></div>
    <div v-if="page.pendingView.value" class="search-page-update" role="status"><span>新结果已就绪，当前列表保持原位。刷新后重新排序，不影响已打开资料和草稿。</span><button type="button" :disabled="disabled || page.busy.value" @click="$emit('apply')">刷新结果</button></div>
    <p v-if="!loading && !page.error.value && !page.busy.value && !page.files.value.length" class="search-page-empty" role="status">{{ frame?.scanComplete ? '没有找到匹配内容' : '尚未获得可用文件，不代表没有匹配。可继续搜索或核对资料库状态。' }}</p>
    <p v-if="visibleCount === 0 && page.files.value.length" class="search-page-empty" role="status">当前已加载文件中没有所选格式。{{ page.hasMore.value ? '可继续加载或调整格式筛选。' : '可以调整格式筛选。' }}</p>
    </template>
    <div v-if="part !== 'header' && (page.nextPage.value || page.canContinue.value || page.files.value.length)" class="search-page-actions">
      <small v-if="page.error.value && page.files.value.length" class="search-page-error-summary" role="status">续载未完成，已保留 {{ page.files.value.length }} 个文件</small>
      <small v-else>已加载 {{ page.files.value.length }}<template v-if="frame?.totalFiles !== null && frame?.totalFiles !== undefined && !page.pendingView.value && !page.retainingView.value"> / {{ frame.totalFiles }}</template> 个文件<template v-if="page.pendingView.value || page.retainingView.value"> · 保留旧视图</template></small>
      <span>
        <button v-if="page.pendingView.value" type="button" :disabled="disabled || page.busy.value" @click="$emit('apply')">刷新后继续查看</button>
        <button v-if="page.error.value && page.files.value.length" class="search-page-retry" type="button" :title="page.error.value" :disabled="disabled || page.busy.value" @click="$emit('retry')">{{ retryLabel }}</button>
        <button v-if="page.canContinue.value && !page.error.value" type="button" :disabled="disabled || page.busy.value" @click="$emit('continue')">{{ page.busy.value ? '正在搜索…' : '继续搜索' }}</button>
        <button v-if="page.nextPage.value && !page.error.value" type="button" :disabled="disabled || page.busy.value || !!page.pendingView.value" @click="$emit('more')">加载更多文件</button>
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
import WorkspaceHelp from './workspace/WorkspaceHelp.vue'
import { computed } from 'vue'
import type { SearchPages, SearchSort } from '../services/searchPages'
const props = defineProps<{ page: SearchPages; sort: SearchSort; tag?: boolean; disabled?: boolean; visibleCount?: number; loading?: boolean; part?: 'header' | 'footer' }>()
defineEmits<{ sort: [value: SearchSort]; more: []; continue: []; apply: []; retry: [] }>()
const frame = computed(() => props.page.status.value)
const retryLabel = computed(() => ['expired', 'invalidCursor', 'requestMismatch'].includes(props.page.errorCode.value)
  ? '重新搜索' : props.page.errorCode.value === 'snapshotChanged' ? '刷新可用结果' : '重试')
const libraryLabels = { queued: '等待搜索', searching: '搜索中', preparing: '准备中', ready: '已完成', limited: '未查全', unavailable: '无法访问', changed: '资料已变化' }
const summary = computed(() => {
  const current = frame.value
  if (props.page.retainingView.value) return props.page.busy.value
    ? '正在重新搜索 · 暂时保留上次结果'
    : '暂时保留上次结果 · 本次搜索尚未完成'
  if (!current) return props.loading || props.page.busy.value ? '正在准备搜索…' : '搜索尚未完成'
  if (current.libraries) {
    const finished = current.libraries.filter(library => library.state === 'ready').length
    return `${current.totalFiles === null ? `已找到 ${current.availableFiles || 0}` : `共 ${current.totalFiles}`} 个文件 · ${finished}/${current.libraries.length} 库完成${current.scanState === 'preparing' ? ' · 仍在搜索' : ''}`
  }
  if (current.scanState === 'preparing') return props.page.busy.value ? '正在扫描与匹配，文件总数尚未确定…' : '搜索尚未查全，可继续处理'
  return current.totalFiles === null ? '结果尚未查全 · 文件总数未知' : `共 ${current.totalFiles} 个文件`
})
</script>
<style scoped>
.search-page-status .search-page-line>span{min-width:80px}
.search-page-error-summary{color:var(--status-danger)}
.search-page-status{flex-shrink:0;min-width:0;padding:8px;color:var(--theme-text-secondary);font-size:var(--text-compact);overflow-wrap:anywhere}.search-page-line,.search-page-actions,.search-page-actions>span,.search-page-error,.search-page-update{display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap}.search-page-line>span{flex:1;min-width:120px}.search-page-line label{display:flex;align-items:center;gap:5px}select,button{color:var(--theme-text);background:var(--theme-surface);border:var(--theme-border);border-radius:var(--theme-radius-sm);font:inherit;padding:4px 7px;cursor:pointer;max-width:100%}select:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--theme-primary);outline-offset:2px}button:disabled{opacity:.5;cursor:default}.search-library-progress{margin-top:4px;max-height:160px;overflow-y:auto}summary{cursor:pointer;padding:3px 0}.search-library-row{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;padding:3px 6px;background:rgba(var(--theme-primary-rgb),.035)}.search-library-row>span:first-child{flex:1;min-width:70px;overflow-wrap:anywhere}.search-page-error,.search-page-update{margin-top:7px;padding:7px;background:rgba(var(--theme-primary-rgb),.055);border-radius:var(--theme-radius-sm)}.search-page-error{color:var(--status-danger)}.search-page-error>span,.search-page-update>span{flex:1;min-width:130px}.search-page-empty,.search-page-warning{margin:6px 0;line-height:1.6}.search-page-actions{margin-top:6px}small{font-size:inherit}small,span,p{min-width:0}
</style>
