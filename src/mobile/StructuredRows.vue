<template><ul class="structured-rows" :class="'structured-rows--'+format" :aria-label="format.toUpperCase()+' 字段树'"><li v-for="row in rows" :key="row.node.key+(row.more?'-more':'')" :class="{'is-container':row.node.container&&!row.more,'is-expanded':expanded.has(row.node.key),'is-nested':row.depth>0}" :style="{'--depth':Math.min(row.depth,3)}">
 <button v-if="row.more" class="structured-more" @click="emit('select',row.node.key)">查看其余项目<ChevronRight :size="18" /></button>
 <template v-else><button v-if="row.node.children.length" class="structured-toggle" :aria-label="(expanded.has(row.node.key)?'收起':'展开')+'：'+row.node.label" :aria-expanded="expanded.has(row.node.key)" @click="emit('expand',row.node.key)"><ChevronDown v-if="expanded.has(row.node.key)" :size="18" /><ChevronRight v-else :size="18" /></button><span v-else class="structured-leaf" aria-hidden="true"><Code2 v-if="format==='xml'&&!row.node.container" :size="18" /><KeyRound v-else-if="!row.node.container" :size="16" /></span>
 <button :class="[format+'-field','structured-field',{'structured-pair':format==='toml'&&(!row.node.container||row.node.kind==='array')}]" :data-node-id="row.node.key" :data-field-key="row.node.key" @click="emit('select',row.node.key)">
  <Folder v-if="row.node.container&&format==='yaml'" :size="19" class="structured-folder" aria-hidden="true" />
  <Code2 v-else-if="row.node.container&&format==='xml'" :size="19" class="structured-folder" aria-hidden="true" />
  <span v-if="format==='toml'&&row.node.kind==='table'" class="structured-section-name"><span aria-hidden="true">[</span><strong>{{ row.node.label || '（空名称）' }}</strong><span aria-hidden="true">]</span></span>
  <strong v-else-if="format==='toml'"><template v-for="(part,index) in tomlKeyParts(row.node.label)" :key="index"><wbr v-if="index" />{{ part }}</template></strong>
  <strong v-else>{{ row.node.label || '（空名称）' }}</strong>
  <span v-if="format==='yaml'||(format==='toml'&&row.node.container&&!['table','array'].includes(row.node.kind))" class="structured-kind" :class="'kind-'+row.node.kind">{{ typeLabel(row.node.kind) }}</span>
  <span v-if="row.node.attributes?.length" class="structured-attributes">
   <span v-for="(attribute,index) in row.node.attributes" :key="index" class="structured-attribute">{{ attribute }}</span>
  </span>
  <span v-else-if="!row.node.container||format==='xml'||(format==='toml'&&row.node.kind==='array'&&!expanded.has(row.node.key))" class="structured-preview" :class="'kind-'+row.node.kind">{{ row.node.value }}</span>
 </button></template>
</li></ul></template>
<script setup lang="ts">
import {ChevronRight,ChevronDown,Folder,KeyRound,Code2} from 'lucide-vue-next'
import type {StructuredRow} from './structuredTree'
defineProps<{format:'yaml'|'xml'|'toml';rows:StructuredRow[];expanded:ReadonlySet<string>}>()
const emit=defineEmits<{select:[key:string];expand:[key:string]}>()
const typeLabel=(kind:string)=>({map:'map',sequence:'seq',stream:'docs',string:'str',number:'num',integer:'int',float:'float',boolean:'bool',null:'null',table:'table','inline-table':'table',array:'array','array-tables':'tables',alias:'ref',scalar:'value'}[kind]||kind)
const tomlKeyParts = (label:string) => (label || '（空名称）').split(/(?<=[a-z0-9])(?=[A-Z])/)
</script>
<style scoped>
.structured-rows{list-style:none;padding:0;margin:0}.structured-rows>li{display:flex;align-items:stretch;min-width:0;margin-left:calc(var(--depth)*12px);border-bottom:1px solid var(--line)}.structured-rows>li.is-container{margin-top:4px}.structured-rows>li.is-expanded{background:var(--primary-soft);border-radius:7px}
.structured-toggle,.structured-leaf{display:grid;place-items:center;flex:0 0 48px;width:48px;color:var(--primary);background:transparent;border:0;min-height:48px;padding:0}.structured-leaf{width:24px;flex-basis:24px;color:var(--muted)}
.structured-field{display:flex;align-items:center;gap:8px;min-height:48px;min-width:0;flex:1;padding:8px 4px;text-align:start;background:transparent;border:0;line-height:1.5}.structured-folder{flex:none;color:var(--primary)}.structured-field strong{font-size:1rem;min-width:0;overflow-wrap:anywhere;font-weight:600}.structured-kind{font:.75rem/1.5 system-ui,sans-serif;padding:2px 7px;border-radius:14px;background:var(--primary-soft);color:var(--primary);flex:none}.structured-preview{font:.9375rem/1.6 ui-monospace,Consolas,monospace;min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:start}.structured-field .kind-string{color:var(--structured-string,#176928)}.structured-field .kind-number,.structured-field .kind-integer,.structured-field .kind-float{color:var(--structured-number,#8b4a00)}.structured-field .kind-boolean,.structured-field .kind-null{color:var(--structured-bool,#6935b5)}.structured-more{display:flex;align-items:center;justify-content:space-between;min-height:48px;width:100%;text-align:start;background:none;border:0;color:var(--primary);padding:8px}
@media(max-width:360px){.structured-field{flex-wrap:wrap;gap:4px 6px}.structured-preview{flex-basis:100%;padding-left:2px}.structured-kind{margin-left:auto}.structured-folder{display:none}}
.structured-rows--yaml > li.is-expanded{background:transparent}
.structured-rows--yaml > li.is-nested,.structured-rows--xml > li.is-nested{position:relative}
.structured-rows--yaml > li.is-nested::before,.structured-rows--xml > li.is-nested::before{content:'';position:absolute;inset-block:0;inset-inline-start:-4px;border-inline-start:1px solid var(--line);pointer-events:none}
.structured-rows--yaml .structured-field,.structured-rows--xml .structured-field{flex-wrap:wrap}
.structured-rows--yaml .structured-preview{flex:1 0 8ch}
@media(max-width:360px){.structured-rows--yaml .structured-preview{flex-basis:100%}}
.structured-rows--yaml .structured-field:focus-visible{border-radius:7px;background:var(--primary-soft)}
.structured-rows--xml .structured-folder,.structured-rows--xml .structured-leaf{color:var(--structured-bool)}
.structured-attributes{display:flex;flex:1 0 max-content;flex-wrap:wrap;gap:4px;min-width:0;max-width:100%}
.structured-attribute{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 7px;border-radius:8px;background:var(--primary-soft);border:1px solid var(--line);color:var(--primary);font-size:.8125rem;line-height:1.5}
.structured-rows--toml .structured-leaf{display:none}
.structured-rows--toml .structured-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.16fr);gap:8px}
.structured-rows--toml .structured-section-name{color:var(--primary);font-family:ui-monospace,Consolas,monospace;min-width:0;overflow-wrap:anywhere}
.structured-rows--toml .structured-preview{padding-inline-start:0}
.structured-rows--toml .kind-array{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:anywhere;color:var(--structured-string)}
:global(.theme-dark .structured-rows){--structured-string:#a9d994;--structured-number:#ffc784;--structured-bool:#d6b6ff}
</style>
