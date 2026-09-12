<template>
  <div v-if="running" class="search-feedback" role="status">正在搜索工作区已索引内容…</div>
  <div v-else-if="failed" class="search-feedback search-feedback-error" role="alert">
    <strong>搜索未完成</strong>
    <span>暂时无法读取搜索结果。请重试，或检查资料库是否可访问。</span>
    <button type="button" @click="$emit('retry')">重新搜索</button>
  </div>
  <div v-else-if="empty" class="search-feedback" role="status">没有找到匹配内容</div>
</template>

<script setup lang="ts">
defineProps<{ running: boolean; failed: boolean; empty: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<style scoped>
.search-feedback { padding: 20px 12px; color: var(--theme-text-secondary, #636973); font-size: 12px; text-align: center; line-height: 1.6; overflow-wrap: anywhere; }
.search-feedback-error { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.search-feedback-error strong { color: var(--theme-text, #20252d); font-size: 13px; }
button { color: var(--theme-text, #20252d); background: transparent; border: 1px solid currentColor; border-radius: 6px; padding: 5px 12px; font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>
