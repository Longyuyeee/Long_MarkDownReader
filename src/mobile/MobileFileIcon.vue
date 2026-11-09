<template>
  <span class="phone-file-icon" :class="`file-kind-${kind}`" aria-hidden="true">
    <Folder v-if="directory" :size="23" />
    <svg v-else-if="kind === 'markdown'" width="25" height="22" viewBox="0 0 25 22" fill="none"><path d="M2 18V4l5 7 5-7v14M20 4v12m-4-4 4 4 4-4" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" /></svg>
    <Braces v-else-if="kind === 'structured'" :size="23" />
    <CodeXml v-else-if="kind === 'code'" :size="23" />
    <template v-else-if="kind === 'pdf'"><FileText :size="25" /><span class="pdf-file-label">PDF</span></template>
    <template v-else-if="textBadge && /\.txt$/i.test(name)"><File :size="32" /><span class="txt-file-label">TXT</span></template>
    <FileText v-else :size="23" />
  </span>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {Braces,CodeXml,File,FileText,Folder} from 'lucide-vue-next'
import {codeFileInfo} from './codeFormats'
const props=defineProps<{name:string;directory?:boolean;textBadge?:boolean}>()
const kind=computed(()=>props.directory?'folder':/\.md$/i.test(props.name)?'markdown':/\.pdf$/i.test(props.name)?'pdf':/\.(?:json|ya?ml|xml|toml)$/i.test(props.name)?'structured':codeFileInfo(props.name)?'code':'text')
</script>
<style scoped>
.phone-file-icon{position:relative;display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;background:#e5eee9;color:#286c56}
.file-kind-structured{background:#fbefda;color:#855811}.file-kind-code{background:#eee7fa;color:#6844a4}.file-kind-pdf{background:#fce5e2;color:#ad403c}.file-kind-folder{background:#f5ecd7;color:#86651d}.file-kind-text{background:#e9edf0;color:#586b7a}
.txt-file-label{position:absolute;inset:auto auto 9px;padding:0 3px;border-radius:3px;background:var(--text-icon-background,#e9edf0);font-size:11px;font-weight:750;line-height:13px}
.pdf-file-label{position:absolute;top:15px;left:8px;padding:0 1px;background:#fce5e2;font-size:7px;font-weight:750;line-height:9px;letter-spacing:.1px}
:global(.theme-dark .phone-file-icon){background:#314b40;color:#b1d5c6}
:global(.theme-dark .file-kind-structured){background:#4a3d25;color:#efd09c}
:global(.theme-dark .file-kind-code){background:#3c3152;color:#d0b8f2}
:global(.theme-dark .file-kind-pdf){background:#513532;color:#f2b6ad}
:global(.theme-dark .pdf-file-label){background:#513532}
:global(.theme-dark .file-kind-folder){background:#453e2b;color:#e1c78d}
:global(.theme-dark .file-kind-text){--text-icon-background:#32424c;background:#32424c;color:#bdd2df}
</style>
