<template>
  <button
    class="relation-summary"
    :class="{ isolated: summary.isolated, compact }"
    type="button"
    :title="title"
    @click.stop="emit('open')"
  >
    <NetworkIcon />
    <span v-if="summary.isolated">孤立风险</span>
    <template v-else>
      <strong>{{ summary.relationCount }}</strong>
      <span>关系</span>
      <small v-if="!compact">{{ detail }}</small>
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Network as NetworkIcon } from 'lucide-vue-next'

export interface GraphRelationSummary {
  path: string
  nodeId: string
  relationCount: number
  incomingCount: number
  outgoingCount: number
  relatedCount: number
  relationTypes: string[]
  isolated: boolean
}

const props = withDefaults(defineProps<{ summary: GraphRelationSummary; compact?: boolean }>(), {
  compact: false,
})
const emit = defineEmits<{ open: [] }>()
const detail = computed(() => [
  props.summary.incomingCount ? `${props.summary.incomingCount} 入` : '',
  props.summary.outgoingCount ? `${props.summary.outgoingCount} 出` : '',
  props.summary.relatedCount ? `${props.summary.relatedCount} 相关` : '',
].filter(Boolean).join(' · '))
const title = computed(() => props.summary.isolated
  ? '当前文件已进入知识图谱，但还没有关系；点击以它为中心打开图谱'
  : `${detail.value || `${props.summary.relationCount} 条关系`}；点击打开局部图谱`)
</script>

<style scoped>
.relation-summary {
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid rgba(var(--theme-primary-rgb), .18);
  border-radius: 999px;
  color: var(--theme-primary);
  background: rgba(var(--theme-primary-rgb), .06);
  cursor: pointer;
  font-size: var(--text-compact);
  white-space: nowrap;
}
.relation-summary:hover { border-color: rgba(var(--theme-primary-rgb), .42); background: rgba(var(--theme-primary-rgb), .11); }
.relation-summary svg { width: 12px; height: 12px; }
.relation-summary strong { font-size: var(--text-compact); }
.relation-summary small { color: var(--theme-text-secondary); font-size: var(--text-compact); }
.relation-summary.isolated { color: #a46a12; border-color: rgba(164, 106, 18, .2); background: rgba(164, 106, 18, .07); }
.relation-summary.compact { min-height: 20px; padding: 2px 6px; }
</style>
