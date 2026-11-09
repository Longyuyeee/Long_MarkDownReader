<template>
  <button type="button" class="mobile-help-trigger" :aria-label="mobileHelpTopics[topic].title" aria-haspopup="dialog" :aria-expanded="mobileHelpState?.topic === topic" @click="openMobileHelp(topic, $event.currentTarget as HTMLElement)"><CircleHelp :size="20" aria-hidden="true" /></button>
</template>
<script setup lang="ts">
import { CircleHelp } from 'lucide-vue-next'
import { mobileHelpTopics, mobileHelpState, openMobileHelp, type MobileHelpTopic } from './mobileHelp'
defineProps<{ topic: MobileHelpTopic }>()
</script>
<style scoped>
button.mobile-help-trigger{display:inline-flex;align-items:center;justify-content:center;flex:0 0 48px;width:48px;height:48px;min-width:48px;min-height:48px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted,#657469);vertical-align:middle}
button.mobile-help-trigger:active{background:var(--panel,#e9f0e5)}button.mobile-help-trigger:focus-visible{outline:2px solid var(--primary,#37765a);outline-offset:-4px}
</style>
