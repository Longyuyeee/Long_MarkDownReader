<template>
  <div class="library-roots">
    <div class="settings-library-list task-scroll"><div v-for="root in roots" :key="root.id" class="root-management-row"><button class="settings-row root-option" :data-focus-key="`library-choice-${root.id}`" :aria-pressed="root.id === current" :disabled="busy" @click="$emit('select', root)"><component :is="root.external ? FolderOpen : Smartphone" :size="28" aria-hidden="true" /><span><strong>{{ root.name }}</strong><small><Check v-if="root.id === current" :size="16" aria-hidden="true" /><span>{{ root.available ? root.external ? root.writable ? '已连接 · 可读写' : '已连接 · 仅可阅读' : '可用 · 本机存储' : '需要重新授权' }}</span></small></span></button><button v-if="root.external && root.available" class="icon-button root-more" :data-focus-key="`library-more-${root.id}`" :aria-label="`${root.name} 的文件夹操作`" aria-haspopup="dialog" :disabled="busy" @click="$emit('actions', root)"><MoreVertical :size="22" aria-hidden="true" /></button></div></div>
    <button class="button primary-button full-width library-connect" data-focus-key="library-choose" :disabled="busy" :aria-busy="choosing" @click="$emit('choose')"><Link :size="21" aria-hidden="true" />{{ choosing ? '正在连接…' : '连接文件夹' }}</button>
  </div>
</template>
<script setup lang="ts">
import { Check, FolderOpen, Link, MoreVertical, Smartphone } from 'lucide-vue-next'
import type { Library } from './storage'
defineProps<{ roots: Library[]; current: string; busy: boolean; choosing: boolean }>()
defineEmits<{ select: [root: Library]; actions: [root: Library]; choose: [] }>()
</script>
<style scoped>
.library-roots{display:flex;flex-direction:column;min-width:0}.library-roots .settings-library-list{display:flex;flex-direction:column;gap:16px;padding:0;border:0;border-radius:0;background:transparent}.library-roots .root-management-row,.library-roots .root-management-row:last-child{display:flex;align-items:center;gap:0;min-height:80px;border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}.library-roots .root-option{display:flex;align-items:center;gap:16px;flex:1;min-width:0;min-height:80px;padding:16px;border:0;border-radius:0;background:transparent;color:var(--ink);text-align:left}.library-roots .root-option>svg{flex:none;color:var(--primary)}.library-roots .root-option>span{flex:1;min-width:0}.library-roots .root-option strong{display:block;font-size:1rem;line-height:1.5;font-weight:650;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.library-roots .root-option small{display:flex;align-items:center;gap:5px;margin-top:4px;color:var(--muted);font-size:.875rem;line-height:1.5;overflow-wrap:anywhere}.library-roots .root-option small>svg{flex:none;color:var(--primary)}.library-roots .root-more{flex:0 0 48px;margin-right:8px}.library-roots .library-connect.button{margin-top:clamp(24px,12dvh,104px);min-height:52px;border-radius:12px;font-size:1rem;line-height:1.5;padding:12px 16px}.root-picker-task{min-height:0}
.root-picker-task .settings-library-list{min-height:0;overflow:auto;overscroll-behavior:contain}
.root-picker-task .root-management-row{flex:none}
.root-picker-task .library-connect.button{flex:none;margin-top:16px}.library-roots .root-option:focus-visible{outline-offset:-4px}.library-roots .root-option:active{background:var(--panel)}
@media(max-height:600px),(max-width:340px){.library-roots:not(.root-picker-task) .library-connect.button{margin-top:24px}}
@media(max-width:340px){
  .library-roots .root-option{gap:10px;padding:12px}
  .library-roots .root-option>svg{width:24px;height:24px}
  .library-roots .root-option strong{font-size:.9375rem;line-height:1.4}
  .library-roots .root-option small{font-size:.75rem;line-height:1.4}
  .library-roots .root-more{margin-right:4px}
}
.library-roots .root-option small>span{word-break:keep-all;overflow-wrap:anywhere}
</style>
