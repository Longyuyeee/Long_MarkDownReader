<template>
  <mark class="annotation-excerpt" :class="['annotation-color-'+color,{'is-panel':panel}]">
    <span v-if="panel" class="annotation-excerpt-lines">{{ excerpt }}</span>
    <template v-else>{{ excerpt }}</template>
  </mark>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import type {PdfAnnotation} from '../types/pdfAnnotations'
const props=defineProps<{text:string;color:PdfAnnotation['color'];limit?:number;panel?:boolean}>()
const excerpt=computed(()=>{if(!props.limit)return props.text;const chars=Array.from(props.text);return chars.length>props.limit?chars.slice(0,props.limit).join('')+'…':props.text})
</script>
<style scoped>
.annotation-excerpt{--excerpt:#fff0bd;background:var(--excerpt);color:var(--ink);border-radius:4px;padding:2px 4px;box-decoration-break:clone;-webkit-box-decoration-break:clone;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:400}
.annotation-excerpt.is-panel{display:block;padding:6px 10px;border-radius:8px}
.annotation-excerpt-lines{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.annotation-color-green{--excerpt:#ddecbd}.annotation-color-pink{--excerpt:#f8dce8}.annotation-color-blue{--excerpt:#dce9fa}
:global(.theme-dark .annotation-excerpt){--excerpt:#5c491c}:global(.theme-dark .annotation-color-green){--excerpt:#304e2e}:global(.theme-dark .annotation-color-pink){--excerpt:#563750}:global(.theme-dark .annotation-color-blue){--excerpt:#2c465b}
</style>
