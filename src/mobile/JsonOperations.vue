<template>
  <section class="json-operations" aria-label="JSON 结构操作">
    <button ref="toggleButton" :class="compact ? 'json-operation-toggle' : 'button'" aria-label="更多结构操作" aria-haspopup="dialog" :aria-expanded="expanded" @click="openMenu()"><MoreVertical v-if="compact" :size="22" aria-hidden="true" /><template v-else>更多结构操作</template></button>
    <dialog ref="dialog" class="json-operation-dialog" aria-label="结构操作" aria-modal="true" @cancel.prevent="closeMenu()" @close="expanded = false" @click="backdrop" @keydown="trapFocus">
      <header class="json-operation-menu-header"><h2>结构操作</h2><button type="button" class="json-operation-close" aria-label="关闭结构操作" @click="closeMenu()"><X :size="22" aria-hidden="true" /></button></header>
      <template v-if="browseActions"><button v-if="canFilter" class="json-operation-choice" @click="closeMenu(false);emit('filter')">筛选本层字段或值</button><button class="json-operation-choice" @click="closeMenu(false);emit('find')">查找整个 JSON</button><button v-if="canFilter" class="json-operation-choice" @click="closeMenu(false);emit('source')">前往这段源码</button></template>
      <template v-if="editing || requestEditing">
      <button v-if="field.keyFrom !== undefined" class="json-operation-choice" data-operation="rename" @click="closeMenu(false); emit('rename')">重命名字段</button>
      <button v-if="field.kind === 'object' || field.kind === 'array'" class="json-operation-choice" data-operation="append" @click="closeMenu(false); emit('append')">{{ field.kind === 'object' ? '新增字段' : '追加数组项' }}</button>
      <button v-if="field.parent !== null" class="json-operation-choice" data-operation="remove" @click="closeMenu(false); emit('remove')">移除此项</button>
      <template v-if="parent?.kind === 'array'"><button class="json-operation-choice" :disabled="index === 0" data-operation="previous" @click="closeMenu(false); emit('move', -1)">向前移动一项</button><button class="json-operation-choice" :disabled="index === parent.children.length - 1" data-operation="next" @click="closeMenu(false); emit('move', 1)">向后移动一项</button></template>
      </template>
    </dialog>
  </section>
</template>
<script setup lang="ts">
import { X,MoreVertical } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import type { JsonField } from './jsonStructure'
const props = withDefaults(defineProps<{ content: string; identity: string; fields: JsonField[]; field: JsonField;compact?:boolean;browseActions?:boolean;canFilter?:boolean;editing?:boolean;requestEditing?:boolean }>(),{editing:true})
const emit = defineEmits<{ rename: []; append: []; remove: []; move: [direction: -1 | 1];filter:[];find:[];source:[] }>()
const expanded = ref(false)
const toggleButton = ref<HTMLButtonElement>(), dialog = ref<HTMLDialogElement>()
const parent = computed(() => props.field.parent === null ? undefined : props.fields[props.field.parent]), index = computed(() => parent.value?.children.indexOf(props.field.id) ?? -1)
function back() { if (!expanded.value) return false; closeMenu(); return true }
watch(() => [props.content, props.identity, props.field.id], () => closeMenu(false), { flush: 'sync' })
async function openMenu(action?: 'rename' | 'append' | 'remove' | 'previous' | 'next') { expanded.value = true; await nextTick(); if (!expanded.value || !dialog.value?.isConnected) return; if (!dialog.value.open) dialog.value.showModal(); (action ? dialog.value.querySelector<HTMLElement>(`[data-operation="${action}"]`) : dialog.value.querySelector<HTMLElement>('.json-operation-choice:not(:disabled)'))?.focus({ preventScroll: true }) }
function closeMenu(restore = true) { expanded.value = false; dialog.value?.close(); if (restore) void nextTick(() => toggleButton.value?.focus({ preventScroll: true })) }
function backdrop(event: MouseEvent) { if (event.target !== dialog.value) return; const r = dialog.value.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeMenu() }
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])], first = controls[0], last = controls[controls.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
defineExpose({ back, openMenu,focus:()=>toggleButton.value?.focus({preventScroll:true}) })
</script>
<style scoped>
.json-operation-dialog { position:fixed; inset:auto 0 0; margin:0 auto; width:100%; max-width:600px; max-height:90dvh; overflow:auto; padding:12px 16px calc(24px + env(safe-area-inset-bottom)); border:0; border-radius:24px 24px 0 0; color:var(--ink); background:var(--bg); box-shadow:0 -15px 55px #00000015; }
.json-operation-dialog::backdrop { background:#0008; }
.json-operation-handle { display:block; width:36px; height:4px; margin:0 auto 12px; border-radius:5px; background:var(--line); }
.json-operation-menu-header { display:flex; align-items:center; gap:8px; min-height:48px; margin-bottom:8px; }
.json-operation-menu-header h2 { flex:1; margin:0; font-size:1.25rem; line-height:1.5; letter-spacing:0; font-weight:700; overflow-wrap:anywhere; }
.json-operation-close { display:grid; place-items:center; flex:0 0 48px; width:48px; height:48px; padding:0; border:0; color:var(--muted); background:transparent; }
.json-operation-choice { display:flex; align-items:center; width:100%; min-height:56px; padding:12px 0; border:0; border-bottom:1px solid var(--line); background:transparent; text-align:start; font-size:.875rem; line-height:1.7142857143; font-weight:400; overflow-wrap:anywhere; }
.json-operations { margin:0;border:0;padding:0;flex:none }.json-operation-toggle{display:grid;place-items:center;min-width:48px;min-height:48px;padding:0;border:0;background:transparent;color:var(--ink)}
</style>
