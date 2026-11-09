<template>
  <section class="toml-tools" :class="{ 'structure-open': taskOpened }" :aria-label="taskOpened ? 'TOML 任务工作区' : 'TOML 检查'">
    <TomlStructure v-if="mounted" v-show="opened" :key="identity" ref="structure" :name="name" :content="content" :identity="identity" :editing="editing" @edit="emit('edit')" @source="closeStructure(false);emit('source')" @close="closeStructure()" @diagnostic="openDiagnostic(true)" @apply="value => { closeStructure(false); emit('patch', value) }" @locate="value => { closeStructure(false); emit('locate', value) }" />
    <TomlDiagnostic v-if="diagnosticOpened" ref="diagnostic" :name="name" :identity="identity" :content="content" :from-structure="diagnosticFromStructure" @source="closeDiagnostic(false);emit('source')" @close="closeDiagnostic()" @diagnostic="emit('diagnostic', $event)" @locate="value => { closeDiagnostic(false); emit('locate', value) }" />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TomlStructure from './TomlStructure.vue'
import TomlDiagnostic from './TomlDiagnostic.vue'
import type { TomlValuePatch } from './tomlStructure'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ locate: [value: { source: string; offset: number }]; diagnostic: [value: { source: string; offset?: number }]; patch: [value: TomlValuePatch]; structure: [value: boolean]; edit: []; return: []; source: [] }>()
const opened = ref(false), mounted = ref(false), structure = ref<InstanceType<typeof TomlStructure>>()
const diagnosticOpened = ref(false), diagnostic = ref<InstanceType<typeof TomlDiagnostic>>()
const diagnosticFromStructure = ref(false)
const taskOpened = computed(() => opened.value || diagnosticOpened.value)
async function openStructure() { if (opened.value) return; closeDiagnostic(false); mounted.value = true; opened.value = true; emit('structure', true); await nextTick(); structure.value?.resume() }
function openDiagnostic(fromStructure = false) {
  if (diagnosticOpened.value) return
  diagnosticFromStructure.value = fromStructure && opened.value
  if (opened.value) structure.value?.suspend()
  opened.value = false
  diagnosticOpened.value = true
  emit('structure', true)
}
async function closeDiagnostic(restore = true) {
  if (!diagnosticOpened.value) return
  const resumeStructure = restore && diagnosticFromStructure.value
  diagnosticFromStructure.value = false
  diagnostic.value?.stop()
  diagnosticOpened.value = false
  if (resumeStructure) {
    opened.value = true
    await nextTick()
    if (opened.value) structure.value?.resume(true)
    return
  }
  emit('structure', false)
  if (restore) emit('return')
}
function closeStructure(restore = true) { if (diagnosticOpened.value) { closeDiagnostic(restore); return }; if (!opened.value) return; structure.value?.suspend(); opened.value = false; emit('structure', false); if (restore) emit('return') }
function back() { if (diagnosticOpened.value) { closeDiagnostic(); return true }; if (!opened.value) return false; if (!structure.value?.back()) closeStructure(); return true }
defineExpose({ back, openStructure, closeStructure, openDiagnostic })
watch(() => props.content, () => emit('diagnostic', { source: props.content }), { flush: 'sync' })
watch(() => props.identity, () => { closeStructure(false); mounted.value = false; emit('diagnostic', { source: props.content }) }, { flush: 'sync' })
onBeforeUnmount(() => { emit('diagnostic', { source: props.content }); emit('structure', false) })
</script>
<style scoped>
.toml-tools { display:none; }
.toml-tools.structure-open { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
</style>
