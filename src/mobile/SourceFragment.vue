<template><pre class="structured-source-preview" :class="kind?'kind-'+kind:undefined" role="group" tabindex="0" :aria-label="label" v-html="html" /></template>
<script setup lang="ts">
import {computed} from 'vue'
import {renderSourceCode} from './codePresentation'
import type {CodeLanguage} from './codeFormats'
const props=defineProps<{value:string;language:CodeLanguage;label:string;kind?:string}>()
// Bounded display only. The existing renderer escapes every source character.
const html=computed(()=>renderSourceCode(props.value,props.language).replace(/^<pre[^>]*><code>/,'').replace(/<span class="reader-source-gutter"[^>]*>.*?<\/span>/g,'').replace(/<\/code><\/pre>$/,''))
</script>
<style scoped>
.structured-source-preview{margin:0;padding:12px 16px;font:.875rem/1.8 ui-monospace,Consolas,monospace;white-space:normal;tab-size:2;overflow-wrap:anywhere;color:var(--ink)}
.structured-source-preview :deep(.reader-source-line){display:block;min-height:1.8em}.structured-source-preview :deep(.reader-source-gutter){display:none}.structured-source-preview :deep(.reader-source-text){white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}
.structured-source-preview.kind-string{color:var(--structured-string,#176928)}.structured-source-preview.kind-number,.structured-source-preview.kind-integer,.structured-source-preview.kind-float{color:var(--structured-number,#8b4a00)}.structured-source-preview.kind-boolean,.structured-source-preview.kind-null{color:var(--structured-bool,#6935b5)}
.structured-source-preview :deep(.reader-syntax-string){color:var(--structured-string,#176928)}.structured-source-preview :deep(.reader-syntax-number){color:var(--structured-number,#8b4a00)}.structured-source-preview :deep(.reader-syntax-keyword){color:var(--structured-bool,#6935b5)}.structured-source-preview :deep(.reader-syntax-comment){color:var(--muted)}.structured-source-preview :deep(.reader-syntax-symbol){color:var(--primary)}
:global(.theme-dark .structured-source-preview){--structured-string:#a9d994;--structured-number:#ffc784;--structured-bool:#d6b6ff}
</style>
