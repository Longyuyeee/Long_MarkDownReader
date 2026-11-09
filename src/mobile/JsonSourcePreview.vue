<template><pre class="json-source-preview" :class="{'without-numbers':!numbered}" role="group" tabindex="0" :aria-label="label" v-html="html" /></template>
<script setup lang="ts">
import {computed} from 'vue'
import {renderSourceCode} from './codePresentation'
const props=withDefaults(defineProps<{value:string;label:string;numbered?:boolean}>(),{numbered:true})
// This is the already bounded display preview, never the content applied to a file.
// The source renderer escapes text and only emits internal span/class markup.
const html=computed(()=>renderSourceCode(props.value,'json').replace(/^<pre[^>]*><code>/,'').replace(/<\/code><\/pre>$/,''))
</script>
<style scoped>
.json-source-preview{margin:0;padding:12px 0;font:.875rem/1.8 ui-monospace,Consolas,monospace;white-space:normal;tab-size:2;color:var(--ink);overflow-wrap:anywhere}
.json-source-preview :deep(.reader-source-line){display:grid;grid-template-columns:36px minmax(0,1fr);min-height:1.8em}
.json-source-preview :deep(.reader-source-gutter){padding-right:12px;text-align:right;color:var(--muted);border-right:1px solid var(--line);user-select:none}
.json-source-preview :deep(.reader-source-text){padding:0 12px;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}
.json-source-preview :deep(.reader-syntax-keyword){color:var(--json-preview-bool,#6935b5)}
.json-source-preview :deep(.reader-syntax-string){color:var(--json-preview-string,#176928)}
.json-source-preview :deep(.reader-syntax-number){color:var(--json-preview-number,#a35b00)}
.json-source-preview.without-numbers :deep(.reader-source-line){display:block}
.json-source-preview.without-numbers :deep(.reader-source-gutter){display:none}
:global(.theme-dark .json-source-preview){--json-preview-bool:#d6b6ff;--json-preview-string:#a9d994;--json-preview-number:#ffc784}
</style>
