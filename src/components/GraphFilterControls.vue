<template>
  <details :class="['graph-filter-control', { compact }]">
    <summary>
      <span>筛选</span>
      <span v-if="activeFilterCount()" class="filter-count">{{ activeFilterCount() }}</span>
    </summary>
    <div class="filter-panel" @click.stop>
      <label v-if="showSearch" class="filter-search">
        <span>搜索</span>
        <input v-model="filters.query" placeholder="标题、路径或标签" />
      </label>

      <div class="filter-row">
        <label>更新时间</label>
        <select v-model="filters.dateRange">
          <option value="all">全部时间</option>
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="365d">最近一年</option>
        </select>
      </div>

      <fieldset v-if="options.tags.length">
        <legend>标签</legend>
        <div class="filter-options">
          <label v-for="tag in options.tags" :key="tag"><input v-model="filters.tags" type="checkbox" :value="tag" /> #{{ tag }}</label>
        </div>
      </fieldset>

      <fieldset v-if="options.directories.length">
        <legend>目录</legend>
        <div class="filter-options">
          <label v-for="directory in options.directories" :key="directory || '__root__'"><input v-model="filters.directories" type="checkbox" :value="directory" /> {{ directory || '根目录' }}</label>
        </div>
      </fieldset>

      <fieldset v-if="options.relationTypes.length">
        <legend>关系类型</legend>
        <div class="filter-options">
          <label v-for="type in options.relationTypes" :key="type"><input v-model="filters.relationTypes" type="checkbox" :value="type" /> {{ relationTypeLabel(type) }}</label>
        </div>
      </fieldset>

      <fieldset v-if="options.objectTypes.length">
        <legend>对象类型</legend>
        <div class="filter-options horizontal">
          <label v-for="type in options.objectTypes" :key="type"><input v-model="filters.objectTypes" type="checkbox" :value="type" /> {{ objectTypeLabel(type) }}</label>
        </div>
      </fieldset>

      <label class="orphan-toggle"><input v-model="filters.showOrphans" type="checkbox" /> 显示孤立笔记</label>
      <button class="reset-filter" :disabled="!activeFilterCount() && !filters.query" @click="resetFilters">清除全部筛选</button>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { graphFilterOptions, useGraphFilters } from '../composables/useGraphFilters'
import type { GraphData } from '../types/graph'

const props = withDefaults(defineProps<{ graph: GraphData; compact?: boolean; showSearch?: boolean }>(), {
  compact: false,
  showSearch: true,
})
const { filters, resetFilters, activeFilterCount } = useGraphFilters()
const options = computed(() => {
  const available = graphFilterOptions(props.graph)
  return {
    tags: [...new Set([...available.tags, ...filters.tags])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    directories: [...new Set([...available.directories, ...filters.directories])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    relationTypes: [...new Set([...available.relationTypes, ...filters.relationTypes])].sort((a, b) => a.localeCompare(b)),
    objectTypes: [...new Set([...available.objectTypes, ...filters.objectTypes])].sort((a, b) => a.localeCompare(b)),
  }
})

const relationTypeLabel = (type: string) => ({
  'links-to': '普通引用', parent: '父级', child: '子级', 'depends-on': '依赖', related: '相关',
  contains: '包含', cites: '引用文献', annotates: '批注', 'derived-from': '派生自',
}[type] || type)
const objectTypeLabel = (type: string) => ({
  markdown: 'Markdown', canvas: 'Canvas', canvas_node: 'Canvas 节点', pdf: 'PDF', pdf_annotation: 'PDF 批注',
  table: '表格', table_view: '表格视图', opml: '思维导图', opml_node: '思维导图主题'
}[type] || type)
</script>

<style scoped>
.graph-filter-control { position: relative; color: var(--theme-text); font-size: var(--text-compact); }
.graph-filter-control summary { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 1px solid rgba(var(--theme-primary-rgb), 0.16); border-radius: 8px; background: rgba(var(--theme-primary-rgb), 0.055); cursor: pointer; list-style: none; font-weight: 700; }
.graph-filter-control summary::-webkit-details-marker { display: none; }
.graph-filter-control[open] summary { color: var(--theme-primary); border-color: rgba(var(--theme-primary-rgb), 0.38); }
.filter-count { display: grid; place-items: center; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 999px; color: #fff; background: var(--theme-primary); font-size: var(--text-compact); }
.filter-panel { position: absolute; top: calc(100% + 7px); left: 0; z-index: 40; display: flex; flex-direction: column; gap: 11px; width: 280px; max-height: min(560px, calc(100vh - 150px)); padding: 14px; overflow: auto; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb), 0.18); border-radius: 12px; background: color-mix(in srgb, var(--theme-card) 96%, transparent); box-shadow: 0 16px 44px rgba(0, 0, 0, 0.18); backdrop-filter: blur(22px); }
.compact .filter-panel { left: auto; right: 0; width: min(280px, calc(100vw - 56px)); max-height: 430px; }
.filter-search { display: grid; gap: 5px; color: var(--theme-text-secondary); }
.filter-search input, .filter-row select { min-height: 30px; padding: 0 9px; box-sizing: border-box; border: 1px solid rgba(var(--theme-primary-rgb), 0.15); border-radius: 7px; color: var(--theme-text); background: var(--theme-bg); outline: none; font: inherit; }
.filter-search input:focus, .filter-row select:focus { border-color: var(--theme-primary); }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--theme-text-secondary); }
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
legend { margin-bottom: 6px; color: var(--theme-text-secondary); font-size: var(--text-compact); font-weight: 750; }
.filter-options { display: grid; gap: 3px; max-height: 105px; overflow: auto; }
.filter-options.horizontal { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.filter-options label, .orphan-toggle { display: flex; align-items: center; gap: 7px; min-height: 25px; padding: 0 5px; border-radius: 6px; cursor: pointer; }
.filter-options label:hover { background: rgba(var(--theme-primary-rgb), 0.06); }
input[type='checkbox'] { accent-color: var(--theme-primary); }
.reset-filter { min-height: 30px; border: 1px solid rgba(var(--theme-primary-rgb), 0.16); border-radius: 7px; color: var(--theme-primary); background: rgba(var(--theme-primary-rgb), 0.055); cursor: pointer; font: inherit; font-weight: 700; }
.reset-filter:disabled { opacity: 0.42; cursor: default; }
</style>
