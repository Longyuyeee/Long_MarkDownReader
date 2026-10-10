<template>
  <div class="search-navigation" role="group" aria-label="文内搜索结果" @keydown.esc.stop.prevent="$emit('close')">
    <span class="query" :title="query">查找：{{ query }}</span>
    <span role="status" aria-live="polite">{{ count === null ? '内容已变化，请重新定位' : count ? `${index + 1} / ${count}` : '当前内容无匹配' }}</span>
    <button type="button" :disabled="count === 0" @click="$emit('move', -1)">上一处</button>
    <button type="button" :disabled="count === 0" @click="$emit('move', 1)">下一处</button>
    <button type="button" @click="$emit('refresh')">重新定位</button>
    <small>{{ scope }} · 首尾循环</small>
    <button type="button" aria-label="关闭文内搜索导航" @click="$emit('close')">关闭</button>
  </div>
</template>
<script setup lang="ts">
defineProps<{ query: string; index: number; count: number | null; scope: string }>()
defineEmits<{ move: [direction: number]; refresh: []; close: [] }>()
</script>
<style scoped>
.search-navigation { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; flex-shrink: 0; border-bottom: var(--theme-border); background: var(--theme-bg); color: var(--theme-text); font-size: 12px; }
.query { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button { font: inherit; color: inherit; background: transparent; border: var(--theme-border); border-radius: 5px; padding: 4px 8px; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--theme-primary); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: default; }
small { opacity: .7; }
</style>
