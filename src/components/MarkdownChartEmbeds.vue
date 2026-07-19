<template>
  <section v-if="references.length || invalidCount" class="markdown-chart-panel" :class="{ collapsed }">
    <header>
      <div><strong>文档内嵌图表</strong><span>{{ references.length }} 个实时引用<span v-if="invalidCount"> · {{ invalidCount }} 个配置无效</span></span></div>
      <button @click="collapsed = !collapsed">{{ collapsed ? '展开' : '收起' }}</button>
    </header>
    <div v-if="!collapsed" class="embed-list">
      <TableChartEmbed
        v-for="reference in references"
        :key="reference.key"
        :library-root="libraryRoot"
        :source="reference.source"
        :view-id="reference.view"
        :host-path="hostPath"
        @open="$emit('open', $event)"
      />
      <div v-if="invalidCount" class="invalid-reference">有 {{ invalidCount }} 个 `longedit-chart` 代码块无法解析。配置必须是包含 source 和 view 的 JSON。</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TableChartEmbed from './TableChartEmbed.vue'

interface ChartReference { key: string; source: string; view: string }
const props = defineProps<{ markdown: string; libraryRoot: string; hostPath: string }>()
defineEmits<{ (event: 'open', path: string): void }>()
const collapsed = ref(false)
const parsed = computed(() => {
  const references: ChartReference[] = []
  let invalidCount = 0
  const expression = /^```longedit-chart[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm
  let match: RegExpExecArray | null
  while ((match = expression.exec(props.markdown))) {
    try {
      const value = JSON.parse(match[1].trim()) as { source?: unknown; view?: unknown }
      if (typeof value.source !== 'string' || !value.source.trim() || typeof value.view !== 'string' || !value.view.trim()) throw new Error('invalid reference')
      references.push({ key: `${match.index}:${value.source}:${value.view}`, source: value.source.trim(), view: value.view.trim() })
    } catch { invalidCount += 1 }
  }
  return { references, invalidCount }
})
const references = computed(() => parsed.value.references)
const invalidCount = computed(() => parsed.value.invalidCount)
</script>

<style scoped>
.markdown-chart-panel { min-height: 0; flex: 0 0 390px; display: grid; grid-template-rows: 42px minmax(0,1fr); border-top: 1px solid rgba(0,0,0,.09); background: color-mix(in srgb, var(--theme-bg) 96%, #dce7f0); }.markdown-chart-panel.collapsed { flex-basis: 42px; }
.markdown-chart-panel > header { display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid rgba(0,0,0,.07); background: var(--theme-card); }.markdown-chart-panel header > div { display: flex; flex-direction: column; }.markdown-chart-panel header strong { font-size: 11px; }.markdown-chart-panel header span { color: var(--theme-text-secondary); font-size: 8px; }.markdown-chart-panel header button { height: 26px; padding: 0 9px; border: 1px solid rgba(0,0,0,.09); border-radius: 6px; color: var(--theme-text-secondary); background: transparent; cursor: pointer; font-size: 9px; }
.embed-list { min-width: 0; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(620px, 1fr); gap: 12px; padding: 12px; overflow: auto; }.invalid-reference { width: 320px; display: grid; place-items: center; padding: 20px; border: 1px dashed #d08845; border-radius: 10px; color: #b16a27; background: color-mix(in srgb, #f5a64a 7%, var(--theme-card)); font-size: 10px; text-align: center; }
@media (max-height: 760px) { .markdown-chart-panel { flex-basis: 310px; } }
</style>
