<template>
  <n-modal :show="!!search.matchList.value" preset="card" title="查找结果" class="structured-search-matches-dialog"
    :style="{ width: 'min(760px,94vw)', maxHeight: 'calc(100dvh - 24px)' }"
    @update:show="value => { if (!value) search.closeMatches() }" @close="search.closeMatches" @after-leave="finish">
    <template v-if="shown">
      <div class="matches-summary"><strong>{{ shown.plan.ranges.length.toLocaleString() }}{{ shown.plan.capped ? '+' : '' }} 处 <span>· {{ shown.scope }}{{ flags }}</span></strong><n-button size="small" @click="search.refreshMatches">刷新结果</n-button></div>
      <code class="matches-query">{{ short(shown.plan.query.search) }}</code>
      <p v-if="shown.error" role="alert" class="matches-error">{{ shown.error }}</p>
      <p v-else-if="!shown.plan.ranges.length" role="status" class="matches-empty">没有匹配内容</p>
      <div v-if="rows.length" ref="list" class="matches-list" aria-label="匹配位置" @keydown="navigate">
        <button v-for="row in rows" :key="row.id" type="button" class="matches-item" :disabled="!!shown.error" @click="search.jumpToMatch(shown!.plan, row.id - 1)">
          <span class="matches-location">{{ row.id }} · 第 {{ row.line }} 行，第 {{ row.column }} 列</span>
          <code><span class="context">{{ row.prefix }}</span><mark>{{ row.zeroWidth ? '（匹配位置）' : row.match }}</mark><span class="context">{{ row.suffix }}</span></code>
        </button>
      </div>
      <div v-if="pages > 1" class="matches-pagination"><n-button size="small" :disabled="page === 1" @click="move(-1)">上一页</n-button><span>{{ page }} / {{ pages }}</span><n-button size="small" :disabled="page === pages" @click="move(1)">下一页</n-button></div>
    </template>
    <template #footer><div class="matches-actions"><span v-if="shown?.plan.capped">仅列出前 10,000 处，可缩小选区</span><n-button @click="search.closeMatches">关闭</n-button></div></template>
  </n-modal>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { NButton, NModal } from 'naive-ui'
import type { useStructuredSearch } from '../composables/useStructuredSearch'
import { searchMatchRows } from '../services/structuredSearchMatches'
const props = defineProps<{ search: ReturnType<typeof useStructuredSearch> }>()
const shown = shallowRef<typeof props.search.matchList.value>(), page = ref(1), list = ref<HTMLElement>()
watch(() => props.search.matchList.value, value => {
  if (value) { if (value.plan !== shown.value?.plan) { page.value = 1; if (list.value) list.value.scrollTop = 0 }; shown.value = value }
}, { immediate: true })
const rows = computed(() => shown.value ? searchMatchRows(shown.value.plan, page.value) : [])
const pages = computed(() => Math.ceil((shown.value?.plan.ranges.length || 0) / 20))
const flags = computed(() => { const q = shown.value?.plan.query; return (q?.regexp ? ' · 正则' : '') + (q?.caseSensitive ? ' · 区分大小写' : '') + (q?.wholeWord ? ' · 完整词' : '') })
const short = (text: string) => text.length > 120 ? text.slice(0, 120).replace(/[\uD800-\uDBFF]$/, '') + '…' : text
const move = (step: number) => { page.value = Math.max(1, Math.min(pages.value, page.value + step)); if (list.value) list.value.scrollTop = 0 }
const navigate = (event: KeyboardEvent) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]
  const current = buttons.indexOf(event.target as HTMLButtonElement)
  if (current < 0) return
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
  event.preventDefault(); buttons[next]?.focus({ preventScroll: false })
}
const finish = () => { if (!props.search.matchList.value) shown.value = undefined; props.search.finishMatches() }
</script>
<style scoped>
:global(.structured-search-matches-dialog .n-card__content){min-height:0;overflow:auto}
.matches-summary,.matches-pagination,.matches-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}
.matches-summary strong{min-width:0}.matches-summary span,.matches-location,.matches-pagination,.matches-actions>span,.matches-empty{font-size:var(--text-sm);color:var(--theme-text-secondary)}
.matches-query{display:block;margin:12px 0;overflow-wrap:anywhere;font:var(--text-sm) var(--font-mono)}
.matches-list{max-height:48dvh;overflow:auto;border:var(--theme-border);border-radius:var(--theme-radius-sm)}
.matches-item{display:block;width:100%;padding:9px 12px;text-align:left;border:0;background:var(--theme-bg);color:var(--theme-text);cursor:pointer;min-width:0}
.matches-item+.matches-item{border-top:var(--theme-border)}.matches-item:hover:not(:disabled),.matches-item:focus-visible{background:var(--theme-surface);outline:2px solid var(--theme-primary);outline-offset:-2px}.matches-item:disabled{cursor:default;opacity:.6}
.matches-location{display:block;margin-bottom:4px}.matches-item code{white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:var(--text-sm)}.context{color:var(--theme-text-secondary)}
mark{background:color-mix(in srgb,var(--theme-primary) 20%,transparent);color:inherit;border-radius:3px}
.matches-error{color:var(--status-danger);overflow-wrap:anywhere}.matches-pagination{justify-content:center;margin-top:12px}.matches-actions{justify-content:flex-end}.matches-actions>span{margin-right:auto}
@media(max-width:640px){.matches-list{max-height:42dvh}}
</style>
