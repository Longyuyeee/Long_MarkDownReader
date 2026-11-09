<template>
  <form class="code-line-form" :class="{'code-line-compact':compact}" aria-label="按行定位源码" @submit.prevent="locate">
    <div class="code-line-fields"><div class="code-line-field"><label for="code-line-number">{{ compact ? '行号' : `前往第几行（共 ${codeLineCount(content)} 行）` }}</label>
    <input id="code-line-number" v-model="target" @input="error = ''; emit('target',target)" inputmode="numeric" maxlength="9" autocomplete="off" :aria-invalid="!!error" :aria-describedby="error ? 'code-line-error' : undefined" /><span v-if="compact" class="code-line-total">共{{ codeLineCount(content) }}行</span></div>
    <p v-if="error" id="code-line-error" role="alert">{{ error }}</p></div>
    <div v-if="compact" class="code-line-submit"><button class="button" type="button" @click="emit('cancel')">取消</button><button class="button primary-button" type="submit">前往</button></div><button v-else class="button primary-button" type="submit">前往这一行</button>
  </form>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { codeLineCount, codeLineOffset } from './codeCommands'
const props = defineProps<{ content: string; compact?:boolean;initialTarget?:string }>()
const emit = defineEmits<{ locate: [value: { source: string; offset: number }];target:[value:string];cancel:[] }>()
const target = ref(props.initialTarget||''), error = ref('')
function locate() {
  try { const offset = codeLineOffset(props.content, target.value); error.value = ''; emit('locate', { source: props.content, offset }) }
  catch (failure) { error.value = String(failure).replace(/^Error: /, '') }
}
</script>
