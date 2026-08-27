<template>
  <section class="graph-semantic-legend" data-testid="graph-semantic-legend" :class="{ collapsed }" aria-label="知识图谱语义图例">
    <button class="legend-toggle" type="button" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <span>语义图例</span><small>{{ objectItems.length }} 类对象 · {{ relationItems.length }} 类关系</small>
    </button>
    <div v-if="!collapsed" class="legend-body">
      <div class="legend-group" data-testid="graph-object-legend">
        <strong>对象</strong>
        <span v-for="item in objectItems" :key="item.semantic.id" class="legend-item" :data-semantic-id="item.semantic.id">
          <i class="object-mark" :data-shape="item.semantic.shape" :style="{ '--semantic-color': semanticColor(item.semantic.id) }"><span>{{ item.semantic.glyph }}</span></i>
          <span>{{ item.semantic.shortLabel }}</span><small>{{ item.count }}</small>
        </span>
      </div>
      <div class="legend-group" data-testid="graph-relation-legend">
        <strong>关系</strong>
        <span v-for="item in relationItems" :key="item.semantic.id" class="legend-item" :data-semantic-id="item.semantic.id" :data-directed="item.semantic.directed">
          <i class="relation-mark" :data-line="item.semantic.line" :style="{ '--semantic-color': item.semantic.color }"></i>
          <span>{{ item.semantic.label }}</span><b v-if="item.semantic.directed">→</b><b v-else>↔</b><small>{{ item.count }}</small>
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { graphObjectSemantic, graphRelationSemantic, graphSemanticColor } from '../config/graphSemantics'
import type { GraphData } from '../types/graph'
const props = defineProps<{ graph: GraphData; dark: boolean }>()
const collapsed = ref(false)
const counted = (values: string[]) => [...new Set(values)].map(id => ({ id, count: values.filter(value => value === id).length }))
const objectItems = computed(() => counted(props.graph.nodes.map(node => node.objectType || 'unknown')).map(item => ({ ...item, semantic: graphObjectSemantic(item.id) })).sort((a, b) => a.semantic.order - b.semantic.order || a.id.localeCompare(b.id)))
const relationItems = computed(() => counted(props.graph.edges.map(edge => edge.relationType || 'unknown')).map(item => ({ ...item, semantic: graphRelationSemantic(item.id) })).sort((a, b) => a.semantic.order - b.semantic.order || a.id.localeCompare(b.id)))
const semanticColor = (id: string) => graphSemanticColor(id, props.dark)
</script>

<style scoped>
.graph-semantic-legend { position: absolute; z-index: 8; top: 126px; left: 16px; width: min(260px, calc(100% - 32px)); border: 1px solid color-mix(in srgb, var(--theme-primary) 18%, var(--theme-border-color)); border-radius: 10px; color: var(--theme-text); background: color-mix(in srgb, var(--theme-card) 94%, transparent); box-shadow: 0 10px 28px rgba(0,0,0,.12); backdrop-filter: blur(14px); }
.graph-semantic-legend.collapsed { width: 190px; }
.legend-toggle { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 34px; padding: 0 10px; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.legend-toggle span, .legend-group strong { font-size: var(--text-compact); font-weight: 800; }
.legend-toggle small, .legend-item small { color: var(--theme-text-secondary); font-size: 9px; }
.legend-body { display: grid; gap: 9px; max-height: min(420px, calc(100vh - 190px)); padding: 0 10px 10px; overflow: auto; }
.legend-group { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 8px; }
.legend-group strong { grid-column: 1 / -1; color: var(--theme-text-secondary); }
.legend-item { min-width: 0; display: grid; grid-template-columns: 16px minmax(0,1fr) auto auto; align-items: center; gap: 4px; font-size: 10px; }
.legend-item > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legend-item b { color: var(--theme-text-secondary); font-size: 10px; }
.object-mark { width: 14px; height: 14px; display: grid; place-items: center; color: #fff; background: var(--semantic-color); font-size: 8px; font-style: normal; font-weight: 900; }
.object-mark[data-shape="circle"] { border-radius: 50%; }.object-mark[data-shape="square"] { border-radius: 3px; }.object-mark[data-shape="diamond"] { transform: rotate(45deg); border-radius: 2px; }.object-mark[data-shape="diamond"] span { transform: rotate(-45deg); }.object-mark[data-shape="hexagon"] { clip-path: polygon(25% 4%,75% 4%,100% 50%,75% 96%,25% 96%,0 50%); }
.relation-mark { width: 16px; height: 0; border-top: 2px solid var(--semantic-color); }.relation-mark[data-line="dashed"] { border-top-style: dashed; }.relation-mark[data-line="dotted"] { border-top-style: dotted; }
@media (max-width: 720px) { .graph-semantic-legend { top: 118px; left: 10px; }.legend-body { max-height: 240px; } }
</style>
