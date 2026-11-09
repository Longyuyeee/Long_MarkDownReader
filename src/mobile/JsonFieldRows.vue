<template>
 <ul class="json-fields" :aria-label="label">
  <li v-for="row in rows" :key="`${row.id}-${!!row.more}`" class="json-tree-row" :class="{'json-row-open':!row.more&&expanded?.has(row.id),'json-row-current':row.id===selected,'json-leaf-row':expandable&&isJsonScalar(fields[row.id]!.kind)}" :style="{'--json-depth':row.depth}">
   <button v-if="row.more" class="json-more-children" @click="emit('select',row.id)">查看 {{ short(fields[row.id]!.label) }} 的全部字段<ChevronRight :size="18" aria-hidden="true" /></button>
   <template v-else>
    <button v-if="expandable&&!isJsonScalar(fields[row.id]!.kind)" class="json-expand" :aria-label="`${expanded?.has(row.id)?'收起':'展开'} ${short(fields[row.id]!.label)}`" :aria-expanded="!!expanded?.has(row.id)" @click="emit('expand',row.id)"><ChevronDown v-if="expanded?.has(row.id)" :size="20" aria-hidden="true" /><ChevronRight v-else :size="20" aria-hidden="true" /></button>
    <button class="json-field" :class="`json-kind-${fields[row.id]!.kind}`" :data-node-id="row.id" :aria-current="row.id===selected?'true':undefined" @click="emit('select',row.id)">
     <span class="json-type-icon" aria-hidden="true"><Box v-if="fields[row.id]!.kind==='object'" :size="20" /><Layers v-else-if="fields[row.id]!.kind==='array'" :size="20" /><span v-else>{{fields[row.id]!.kind==='number'?'#':fields[row.id]!.kind==='boolean'?'✓':fields[row.id]!.kind==='null'?'∅':'T'}}</span></span>
     <span class="json-field-copy"><span class="json-entry-main"><strong>{{short(fields[row.id]!.label)}}</strong><span v-if="isJsonScalar(fields[row.id]!.kind)" class="json-row-value">：{{fields[row.id]!.preview}}</span><span v-else class="json-row-kind">{{fields[row.id]!.kind==='object'?'{object}':'[array]'}}</span></span><small v-if="fields[row.id]!.siblings>1">同名第 {{fields[row.id]!.occurrence}} / {{fields[row.id]!.siblings}} 项</small></span>
     <ChevronRight v-if="!expandable&&!isJsonScalar(fields[row.id]!.kind)" :size="20" aria-hidden="true" />
    </button>
   </template>
  </li>
 </ul>
</template>
<script setup lang="ts">
import {Box,Layers,ChevronDown,ChevronRight} from 'lucide-vue-next'
import {isJsonScalar,type JsonField} from './jsonStructure'
import type {JsonTreeRow} from './jsonTree'
defineProps<{fields:JsonField[];rows:JsonTreeRow[];label:string;expanded?:Set<number>;selected?:number;expandable?:boolean}>()
const emit=defineEmits<{select:[id:number];expand:[id:number]}>()
const short=(s:string)=>s.length>160?s.slice(0,160)+'…':s||'（空名称）'
</script>
<style scoped>
.json-fields{list-style:none;margin:0;padding:0}.json-tree-row{display:flex;align-items:stretch;min-height:48px;padding-left:calc(min(var(--json-depth),5)*16px);border-radius:8px}.json-tree-row+.json-tree-row{border-top:1px solid var(--json-row-line,transparent)}.json-row-open,.json-row-current{background:var(--primary-soft)}.json-expand{display:grid;place-items:center;flex:none;min-width:48px;min-height:48px;padding:0;border:0;background:none;color:var(--primary)}.json-field{flex:1;min-width:0;display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px;border:0;border-radius:8px;background:transparent;color:var(--ink);text-align:left;line-height:1.5}.json-leaf-row .json-field{margin-left:48px}.json-entry-main{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.json-field-copy{flex:1;min-width:0;overflow-wrap:anywhere}.json-field strong{font-size:1rem;font-weight:500}.json-field small{display:block;color:var(--muted);font-size:.75rem}.json-row-kind{margin-left:8px;font-size:.875rem;color:var(--muted)}.json-row-value{font:1rem/1.5 ui-monospace,Consolas,monospace}.json-type-icon{display:grid;place-items:center;flex:none;min-width:24px;min-height:24px;border-radius:6px;color:var(--primary)}.json-kind-string .json-row-value{color:var(--json-string)}.json-kind-number .json-row-value{color:var(--json-number)}.json-kind-boolean .json-row-value{color:var(--json-boolean)}.json-kind-null .json-row-value{color:var(--muted)}:is(.json-kind-string,.json-kind-number,.json-kind-boolean,.json-kind-null) .json-type-icon{background:var(--json-type-bg);color:var(--json-type-ink);font:1rem/1 ui-monospace,monospace}.json-more-children{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:48px;border:0;padding:8px;background:transparent;color:var(--primary);text-align:left;font:inherit;overflow-wrap:anywhere}
</style>
