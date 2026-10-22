<template><n-dropdown :show="true" :x="x" :y="menuY" trigger="manual" :options="menuOptions" scrollable :flip="false" :placement="above ? 'top-start' : 'bottom-start'" :menu-props="menuProps" @select="key => $emit('select', String(key))" @clickoutside="$emit('close')" /></template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { NDropdown, type DropdownOption } from 'naive-ui'
const props = defineProps<{x:number;y:number;options:DropdownOption[]}>()
const viewportHeight = ref(window.innerHeight)
const resize = () => { viewportHeight.value = window.innerHeight }
onMounted(() => window.addEventListener('resize', resize))
onBeforeUnmount(() => window.removeEventListener('resize', resize))
const menuY = computed(() => Math.max(12, Math.min(props.y, viewportHeight.value - 12)))
const above = computed(() => menuY.value > viewportHeight.value / 2)
const availableHeight = computed(() => Math.max(48, (above.value ? menuY.value : viewportHeight.value - menuY.value) - 12))
const menuProps = () => ({ style: `max-height: ${availableHeight.value}px` })
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
