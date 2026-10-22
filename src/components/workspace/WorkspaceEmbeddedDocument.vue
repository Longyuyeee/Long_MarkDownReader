<template><div class="workspace-embedded-document"><slot /></div></template>

<script setup lang="ts">
import { provide } from 'vue'
import { embeddedDocumentKey } from '../../services/embeddedDocument'
provide(embeddedDocumentKey, true)
</script>

<style scoped>
.workspace-embedded-document { height: 100%; min-height: 0; min-width: 0; }
/* The library's document header remains the single file identity. Editable
   document titles and all format-specific actions remain in the child view. */
.workspace-embedded-document :deep(.workspace-file-name) { display: none; }
/* The shell already supplies navigation and file identity. Keep the format's
   state and tools together, even when its standalone layout wraps the title. */
.workspace-embedded-document :deep(.workspace-document-header.workspace-document-header) { flex-direction: row; flex-wrap: nowrap; align-items: center; flex-shrink: 0; }
.workspace-embedded-document :deep(.workspace-document-header > :is(.document-identity, .identity, .table-title, .header-main, .toolbar-leading, .studio-title)) { flex: 0 1 auto; width: auto; min-width: 0; }
.workspace-embedded-document :deep(.workspace-document-header > [data-command-strip]) { flex: 1 1 0; width: auto; flex-wrap: nowrap; overflow-x: auto; }
.workspace-embedded-document :deep(.workspace-document-header button:is([aria-label="返回知识库"], [aria-label="返回资料库"], [aria-label="返回上一页"], [title="返回知识库"], [title="返回资料库"], [title="返回上一页"])) { display: none; }
.workspace-embedded-document :deep(.pdf-toolbar.pdf-toolbar) { grid-template-columns: auto minmax(0, 1fr) auto; }
.workspace-embedded-document :deep(.pdf-toolbar .pdf-task-navigation) { grid-column: 2; grid-row: 1; min-width: 0; overflow-x: auto; }
.workspace-embedded-document :deep(.pdf-toolbar .toolbar-center) { grid-column: 3; grid-row: 1; }
</style>
