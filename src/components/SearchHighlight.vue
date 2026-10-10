<template>
  <span><template v-for="(part, index) in parts" :key="index"><mark v-if="part.match" class="search-match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { searchHighlight } from '../utils/searchHighlight'
const props = defineProps<{ text: string; query: string }>()
const parts = computed(() => searchHighlight(props.text, props.query))
</script>

<style scoped>
.search-match { color: inherit; background: color-mix(in srgb, var(--theme-primary) 22%, transparent); text-decoration: underline; text-decoration-color: var(--theme-primary); text-underline-offset: 2px; border-radius: 2px; }
</style>
