<template>
  <div class="mobile-notice" role="alert">
    <span>{{ message }}</span>
    <button class="notice-dismiss" aria-label="关闭提示" @click="$emit('dismiss')"><X :size="18" /></button>
    <div v-if="recovery || textCopy || copy" class="notice-actions">
      <button v-if="recovery" class="text-button recovery-trigger" :disabled="busy" @click="$emit('recovery')">查看保存恢复</button>
      <button v-if="textCopy" class="text-button" :disabled="busy" @click="$emit('text-copy')">仅存文字副本</button>
      <button v-if="copy" class="text-button" :disabled="busy" @click="$emit('copy')">存入手机资料库</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{ message: string; textCopy: boolean; copy: boolean; busy: boolean; recovery?: boolean }>()
defineEmits<{ 'text-copy': []; copy: []; dismiss: []; recovery: [] }>()
</script>
