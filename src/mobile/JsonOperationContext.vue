<template><div class="json-operation-context"><Folder :size="22" aria-hidden="true" /><div><div class="json-operation-location" role="group" :aria-label="label">{{ path }}</div><p class="json-operation-file">{{ name }}</p></div></div></template>
<script setup lang="ts">
import {computed} from 'vue'
import {Folder} from 'lucide-vue-next'
const props=defineProps<{name:string;location:string;label:string}>()
const path=computed(()=>props.location==='$'?'根目录':props.location.replace(/^\$ \/ /,''))
</script>
