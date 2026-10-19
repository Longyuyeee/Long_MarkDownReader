<template><n-dropdown :show="true" :x="x" :y="y" trigger="manual" :options="menuOptions" @select="key => $emit('select', String(key))" @clickoutside="$emit('close')" /></template>
<script setup lang="ts">
import { computed } from 'vue'
import { NDropdown, type DropdownOption } from 'naive-ui'
const props = defineProps<{x:number;y:number;options:DropdownOption[]}>()
defineEmits<{select:[key:string];close:[]}>()
// Menu labels must not become a new native text selection while the command
// moves focus back to CodeMirror.
const menuOptions = computed<DropdownOption[]>(() => props.options.map(option => ({
  ...option,
  props: { ...option.props, onMousedown: (event: MouseEvent) => {
    event.preventDefault()
    option.props?.onMousedown?.(event)
  } },
})))
</script>
