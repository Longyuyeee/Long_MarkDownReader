<template>
  <section class="yaml-tools" :class="{ 'structure-open': taskOpened }" aria-label="YAML 检查">
    <YamlStructure v-if="mounted" v-show="opened" :key="identity" ref="structure" :name="name" :content="content" :identity="identity" :editing="editing" @edit="emit('edit')" @source="closeStructure(false);emit('source')" @close="closeStructure()" @apply="value => { closeStructure(false); emit('patch', value) }" @locate="value => { closeStructure(false); emit('locate', value) }" />
    <YamlDiagnostic v-if="diagnosticOpened" ref="diagnostic" :content="content" :identity="identity" :name="name" @source="closeDiagnostic(false);emit('source')" @close="closeDiagnostic()" @locate="value => { closeDiagnostic(false); emit('locate', value) }" />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import YamlStructure from './YamlStructure.vue'
import YamlDiagnostic from './YamlDiagnostic.vue'
import type { YamlValuePatch } from './yamlStructure'
const props = defineProps<{ content: string; identity: string; name: string; editing: boolean }>()
const emit = defineEmits<{ locate: [value: { source: string; offset: number }]; patch: [value: YamlValuePatch]; structure: [value: boolean]; edit: []; return: []; source: [] }>()
const opened = ref(false), mounted = ref(false), structure = ref<InstanceType<typeof YamlStructure>>()
const diagnosticOpened = ref(false), diagnostic = ref<InstanceType<typeof YamlDiagnostic>>()
const taskOpened = computed(() => opened.value || diagnosticOpened.value)
async function openStructure() { closeDiagnostic(false); mounted.value = true; opened.value = true; emit('structure', true); await nextTick(); structure.value?.resume() }
function openDiagnostic() { closeStructure(false); diagnosticOpened.value = true; emit('structure', true) }
function closeDiagnostic(restore = true) { if (!diagnosticOpened.value) return; diagnostic.value?.stop(); diagnosticOpened.value = false; emit('structure', false); if (restore) emit('return') }
function closeStructure(restore = true) { if (diagnosticOpened.value) { closeDiagnostic(restore); return }; if (!opened.value) return; structure.value?.suspend(); opened.value = false; emit('structure', false); if (restore) emit('return') }
function back() { if (diagnosticOpened.value) { if (!diagnostic.value?.back()) closeDiagnostic(); return true }; if (!opened.value) return false; if (!structure.value?.back()) closeStructure(); return true }
defineExpose({ back, closeStructure, openStructure, openDiagnostic })
watch(() => props.identity, () => { closeStructure(false); mounted.value = false }, { flush: 'sync' })
onBeforeUnmount(() => emit('structure', false))
</script>
<style scoped>
.yaml-tools { display:none; }
.yaml-tools.structure-open { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
</style>
