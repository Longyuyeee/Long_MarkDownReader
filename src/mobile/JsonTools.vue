<template>
  <section class="json-tools" :class="{ 'structure-open': taskOpened }" aria-label="JSON 检查与排版">
    <JsonStructure v-if="mounted" v-show="opened" :key="identity" ref="structure" :name="name" :content="content" :identity="identity" :editing="editing" @edit="emit('edit')" @source="closeStructure(false);emit('source')" @close="closeStructure()" @apply="value => { closeStructure(false); emit('patch', value) }" @locate="value => { closeStructure(false); emit('locate', value) }" />
    <JsonDiagnostic v-if="diagnosticOpened" ref="diagnostic" :content="content" :identity="identity" :name="name" @close="closeDiagnostic()" @source="closeDiagnostic(false);emit('source')" @locate="value => { closeDiagnostic(false); emit('locate', value) }" />
    <JsonFormat v-if="formatOpened" ref="format" :content="content" :identity="identity" :name="name" :editing="editing" @close="closeFormat()" @source="closeFormat(false);emit('source')" @apply="value => { closeFormat(false); emit('apply', value) }" @locate="value => { closeFormat(false); emit('locate', value) }" />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import JsonStructure from './JsonStructure.vue'
import JsonDiagnostic from './JsonDiagnostic.vue'
import JsonFormat from './JsonFormat.vue'
import type { JsonValuePatch } from './jsonStructure'
const props = defineProps<{ content: string; editing: boolean; identity: string; name: string }>()
const emit = defineEmits<{ apply: [value: { source: string; formatted: string }]; locate: [value: { source: string; offset: number }]; patch: [value: JsonValuePatch]; structure: [opened: boolean];edit:[];return:[];source:[] }>()
const opened = ref(false), mounted = ref(false), structure = ref<InstanceType<typeof JsonStructure>>()
const diagnosticOpened = ref(false), diagnostic = ref<InstanceType<typeof JsonDiagnostic>>()
const formatOpened = ref(false), format = ref<InstanceType<typeof JsonFormat>>()
const taskOpened = computed(() => opened.value || diagnosticOpened.value || formatOpened.value)
function openDiagnostic() { closeStructure(false); diagnosticOpened.value = true; emit('structure', true) }
function closeDiagnostic(restore = true) { if (!diagnosticOpened.value) return; diagnostic.value?.stop(); diagnosticOpened.value = false; emit('structure', false); if (restore) emit('return') }
function openFormat() { closeStructure(false); formatOpened.value = true; emit('structure', true) }
function closeFormat(restore = true) { if (!formatOpened.value) return; format.value?.stop(); formatOpened.value = false; emit('structure', false); if (restore) emit('return') }
async function openStructure() { closeDiagnostic(false); closeFormat(false); mounted.value = true; opened.value = true; emit('structure', true); await nextTick(); structure.value?.resume() }
function closeStructure(restore = true) { if (formatOpened.value) { closeFormat(restore); return }; if (diagnosticOpened.value) { closeDiagnostic(restore); return }; if (!opened.value) return; structure.value?.suspend(); opened.value = false; emit('structure', false); if (restore) emit('return') }
function back() { if (formatOpened.value) { closeFormat(); return true }; if (diagnosticOpened.value) { closeDiagnostic(); return true }; if (!opened.value) return false; if (!structure.value?.back()) closeStructure(); return true }
defineExpose({ back, closeStructure, openStructure, openDiagnostic, openFormat })
watch(() => props.identity, () => { if (taskOpened.value) closeStructure(false); mounted.value = false }, { flush: 'sync' })
watch(() => props.editing, editing => { if (!editing && formatOpened.value) closeFormat(false) }, { flush: 'sync' })
onBeforeUnmount(() => emit('structure', false))
</script>
<style scoped>
.json-tools { display:none; }
.json-tools.structure-open { display:flex; flex-direction:column; flex:1; min-height:0; max-height:none; padding:0; border:0; overflow:hidden; }
.json-tool-actions { display:flex; align-items:center; flex-wrap:wrap; gap:4px 12px; }
@media(max-height:400px) { .json-tools { max-height:30dvh; } }
</style>
