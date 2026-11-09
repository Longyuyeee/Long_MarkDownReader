<template>
  <section class="code-touch-tools" aria-label="源码触摸工具">
    <button class="code-tool-selector" :aria-label="`切换编辑工具：${modeLabel}`" aria-haspopup="dialog" :aria-expanded="pickerOpen" :disabled="disabled" @pointerdown.prevent @click="emit('choose')"><component :is="mode === 'symbols' ? Code2 : mode === 'cursor' ? MoveHorizontal : IndentIncrease" :size="21" aria-hidden="true" /><ChevronDown :size="13" aria-hidden="true" /></button>
    <div v-if="mode === 'symbols'" class="code-symbols" role="region" tabindex="0" aria-label="代码符号工具栏"><button v-for="token in codeTokens" :key="token.value" :aria-label="token.name" :disabled="disabled" @pointerdown.prevent @click="emit('token',token.value)">{{ token.label }}</button></div>
    <div v-else class="code-line-actions" role="region" tabindex="0" :aria-label="mode === 'cursor' ? '代码光标工具栏' : '代码缩进工具栏'"><button v-for="item in shownActions" :key="item.id" :aria-label="item.name" :disabled="disabled" @pointerdown.prevent @click="emit('action',item.id)"><component :is="item.icon" :size="20" aria-hidden="true" /><span>{{ item.label }}</span></button></div>
    <div class="code-edit-actions" role="group" aria-label="源码编辑操作"><button aria-label="撤销" :disabled="disabled || !history.undo" @pointerdown.prevent @click="emit('format','undo')"><Undo2 :size="21" /></button><button aria-label="重做" :disabled="disabled || !history.redo" @pointerdown.prevent @click="emit('format','redo')"><Redo2 :size="21" /></button></div>
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {Code2,ChevronDown,MoveHorizontal,ArrowLeft,ArrowRight,ArrowLeftToLine,ArrowRightToLine,TextSelect,IndentIncrease,IndentDecrease,Undo2,Redo2} from 'lucide-vue-next'
import {codeTokens,type CodeToolMode} from './codeCommands'
import type {CodeLineAction} from './codeLineActions'
const props=defineProps<{mode:CodeToolMode;pickerOpen:boolean;disabled:boolean;history:{undo:boolean;redo:boolean}}>()
const emit=defineEmits<{choose:[];token:[value:string];action:[value:CodeLineAction];format:[value:'undo'|'redo']}>()
const modeLabel=computed(()=>({symbols:'符号',cursor:'光标',indent:'缩进'})[props.mode])
const actions=[
 {id:'left',group:'cursor',label:'左移',name:'左移光标',icon:ArrowLeft},{id:'right',group:'cursor',label:'右移',name:'右移光标',icon:ArrowRight},
 {id:'start',group:'cursor',label:'行首',name:'移动到行首',icon:ArrowLeftToLine},{id:'end',group:'cursor',label:'行尾',name:'移动到行尾',icon:ArrowRightToLine},
 {id:'select',group:'indent',label:'选行',name:'选行',icon:TextSelect},{id:'indent',group:'indent',label:'缩进',name:'增加缩进',icon:IndentIncrease},{id:'outdent',group:'indent',label:'退缩进',name:'退缩进',icon:IndentDecrease}
] as const
const shownActions=computed(()=>actions.filter(item=>item.group===props.mode))
</script>
