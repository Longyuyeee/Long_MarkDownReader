<template><n-dropdown :show="true" :x="x" :y="y" trigger="manual" :options="options" @select="key => $emit('select', String(key))" @clickoutside="$emit('close')" /></template>
<script setup lang="ts">
import { NDropdown, type DropdownOption } from 'naive-ui'
defineProps<{x:number;y:number;options:DropdownOption[]}>()
defineEmits<{select:[key:string];close:[]}>()
</script>
