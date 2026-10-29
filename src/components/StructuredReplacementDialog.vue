<template>
  <n-modal :show="!!search.preview.value" preset="card" title="替换预览" class="structured-replacement-dialog"
    :style="{ width: 'min(900px,94vw)', maxHeight: 'calc(100dvh - 24px)' }"
    @update:show="value => { if (!value) search.closePreview() }" @close="search.closePreview" @after-leave="finish">
    <template v-if="shown">
      <div class="replacement-summary"><strong>将修改 {{ shown.plan.edits.length.toLocaleString() }} 处 <span>· {{ shown.scope }}{{ flags }}</span><span v-if="shown.plan.matches > shown.plan.edits.length"> · 另 {{ shown.plan.matches - shown.plan.edits.length }} 处保持原样</span></strong>
        <n-button size="small" @click="search.refreshPreview">刷新预览</n-button></div>
      <div class="replacement-query"><code>{{ short(shown.plan.query.search) }}</code><span aria-label="替换为">→</span><code>{{ short(shown.plan.query.replace) || '（删除）' }}</code></div>
      <p v-if="shown.error" role="alert" class="replacement-error">{{ shown.error }}</p>
      <div ref="list" class="replacement-list" aria-label="替换前后内容">
        <article v-for="row in rows" :key="row.id" class="replacement-item">
          <div class="replacement-location">{{ row.id }} · 第 {{ row.line }} 行，第 {{ row.column }} 列</div>
          <div class="replacement-pair">
            <div class="replacement-before"><span class="replacement-label">替换前</span><code><span class="context">{{ row.prefix }}</span><mark>{{ row.insertion ? '（插入位置）' : row.before }}</mark><span class="context">{{ row.suffix }}</span></code></div>
            <div class="replacement-after"><span class="replacement-label">替换后</span><code><span class="context">{{ row.prefix }}</span><mark>{{ row.deletion ? '（删除）' : row.after }}</mark><span class="context">{{ row.suffix }}</span></code></div>
          </div>
        </article>
      </div>
      <div v-if="pages > 1" class="replacement-pagination"><n-button size="small" :disabled="page === 1" @click="move(-1)">上一页</n-button><span>{{ page }} / {{ pages }}</span><n-button size="small" :disabled="page === pages" @click="move(1)">下一页</n-button></div>
    </template>
    <template #footer><div class="replacement-actions"><span>仅修改草稿，可撤销；保存后写回。</span><n-button @click="search.closePreview">取消</n-button><n-button type="primary" :disabled="!search.preview.value || !!shown?.error" @click="search.applyPreview">应用到草稿</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import type { useStructuredSearch } from '../composables/useStructuredSearch'
import { replacementRows } from '../services/structuredReplacementPlan'
const props = defineProps<{ search: ReturnType<typeof useStructuredSearch> }>()
const shown = shallowRef<typeof props.search.preview.value>(), page = ref(1), list = ref<HTMLElement>()
watch(() => props.search.preview.value, value => {
  if (value) { if (value.plan !== shown.value?.plan) { page.value = 1; if (list.value) list.value.scrollTop = 0 }; shown.value = value }
}, { immediate: true })
const rows = computed(() => shown.value ? replacementRows(shown.value.plan, page.value) : [])
const pages = computed(() => Math.ceil((shown.value?.plan.edits.length || 0) / 20))
const flags = computed(() => { const q = shown.value?.plan.query; return (q?.regexp ? ' · 正则' : '') + (q?.caseSensitive ? ' · 区分大小写' : '') + (q?.wholeWord ? ' · 完整词' : '') })
const short = (text: string) => text.length > 120 ? text.slice(0, 120).replace(/[\uD800-\uDBFF]$/, '') + '…' : text
const move = (step: number) => { page.value = Math.max(1, Math.min(pages.value, page.value + step)); if (list.value) list.value.scrollTop = 0 }
const finish = () => { if (!props.search.preview.value) shown.value = undefined; props.search.finishPreview() }
</script>
<style scoped>
:global(.structured-replacement-dialog .n-card__content){min-height:0;overflow:auto}
.replacement-summary,.replacement-query,.replacement-actions,.replacement-pagination{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.replacement-summary{justify-content:space-between}.replacement-summary strong{min-width:0}.replacement-summary span,.replacement-location,.replacement-label,.replacement-actions>span,.replacement-pagination>span{font-size:var(--text-sm);color:var(--theme-text-secondary)}
.replacement-query{margin:12px 0}.replacement-query code{min-width:0;max-width:100%;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:var(--text-sm)}
.replacement-list{max-height:48dvh;overflow:auto;border:var(--theme-border);border-radius:var(--theme-radius-sm)}
.replacement-item+.replacement-item{border-top:var(--theme-border)}.replacement-location{padding:7px 10px;background:var(--theme-surface)}
.replacement-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.replacement-pair>div{padding:8px 10px;min-width:0}.replacement-before{border-right:var(--theme-border)}
.replacement-label{display:block;margin-bottom:4px}.replacement-pair code{white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:var(--text-sm)}.context{color:var(--theme-text-secondary)}
mark{color:inherit;border-radius:3px}.replacement-before mark{background:color-mix(in srgb,var(--status-danger) 16%,transparent)}.replacement-after mark{background:color-mix(in srgb,var(--status-success) 16%,transparent)}
.replacement-error{color:var(--status-danger);overflow-wrap:anywhere}.replacement-pagination{justify-content:center;margin-top:12px}
.replacement-actions{justify-content:flex-end}.replacement-actions>span{margin-right:auto}
@media(max-width:640px){.replacement-pair{grid-template-columns:minmax(0,1fr)}.replacement-before{border-right:0;border-bottom:var(--theme-border)}.replacement-list{max-height:42dvh}}
</style>
