<template><span class="search-code-excerpt"><template v-for="(part,i) in parts" :key="i"><mark v-if="part.match" :class="part.css">{{ part.text }}</mark><span v-else :class="part.css">{{ part.text }}</span></template></span></template>
<script setup lang="ts">
import {computed} from 'vue'
import {highlightTree,tagHighlighter,tags} from '@lezer/highlight'
import {codeLanguage} from './codeLanguage'
import type {CodeLanguage} from './codeFormats'
import type {Excerpt} from './librarySearch'
const props=defineProps<{excerpt:Excerpt;language:CodeLanguage}>()
const colors=tagHighlighter([{tag:[tags.keyword,tags.tagName],class:'excerpt-keyword'},{tag:[tags.string,tags.bool,tags.atom],class:'excerpt-string'},{tag:tags.number,class:'excerpt-number'},{tag:tags.comment,class:'excerpt-comment'},{tag:[tags.function(tags.variableName),tags.function(tags.propertyName)],class:'excerpt-function'}])
const parts=computed(()=>{
 const {before,hit,after}=props.excerpt,text=before+hit+after,language=codeLanguage(props.language),ranges:{from:number;to:number;css:string}[]=[]
 if(!Array.isArray(language))highlightTree(language.parser.parse(text),colors,(from,to,css)=>ranges.push({from,to,css}))
 const points=[...new Set([0,text.length,before.length,before.length+hit.length,...ranges.flatMap(r=>[r.from,r.to])])].sort((a,b)=>a-b)
 return points.slice(0,-1).map((from,i)=>({text:text.slice(from,points[i+1]),match:!!hit&&from>=before.length&&from<before.length+hit.length,css:ranges.find(r=>r.from<=from&&r.to>from)?.css||''}))
})
</script>
<style scoped>
.search-code-excerpt{display:block;max-width:100%;padding:10px 12px;border-radius:7px;background:#1e2b32;color:#edf4f5;white-space:pre-wrap;overflow-wrap:anywhere;font-family:Consolas,"SFMono-Regular",monospace;font-size:.8125rem;line-height:1.65;tab-size:2}
.excerpt-keyword{color:#e5a1e5}.excerpt-string{color:#d2cf85}.excerpt-number{color:#e6bd80}.excerpt-comment{color:#aebec5}.excerpt-function{color:#ffe087}
.search-code-excerpt mark{background:#f8dd78;color:#172a24;border-radius:2px}
</style>
