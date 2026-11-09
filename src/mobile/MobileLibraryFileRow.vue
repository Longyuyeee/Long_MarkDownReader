<template>
  <div class="phone-file-item" @contextmenu.prevent="more">
    <button type="button" class="file-row" :data-focus-key="focusKey" :disabled="disabled" @click="$emit('open')">
      <MobileFileIcon :name="name" :directory="directory" />
      <span class="file-info"><strong>{{ name }}</strong><small>{{ detail }}</small></span>
    </button>
    <button ref="moreButton" type="button" class="icon-button library-file-more" :data-focus-key="`${focusKey}:more`" :aria-label="`文件操作：${name}`" aria-haspopup="dialog" @click="more"><MoreVertical :size="20" aria-hidden="true" /></button>
  </div>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import {MoreVertical} from 'lucide-vue-next'
import MobileFileIcon from './MobileFileIcon.vue'
defineProps<{name:string;detail:string;focusKey:string;directory?:boolean;disabled?:boolean}>()
const emit=defineEmits<{open:[];more:[]}>(),moreButton=ref<HTMLButtonElement>()
function more(){moreButton.value?.focus({preventScroll:true});emit('more')}
</script>
<style scoped>
.phone-file-item{display:flex;align-items:center;min-width:0;min-height:72px;border-bottom:1px solid var(--line)}
.phone-file-item>.file-row{flex:1;min-width:0;width:auto;min-height:72px;margin:0;padding:12px 0;gap:14px;border:0;align-self:stretch}
.file-info{flex:1;min-width:0}.file-info strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;font-size:1rem;line-height:1.4;font-weight:600}
.file-info small{display:block;margin-top:4px;font-size:.8125rem;line-height:1.45;color:var(--muted);overflow-wrap:anywhere}
.library-file-more{flex:0 0 48px;align-self:stretch;min-height:48px;margin-right:-12px;margin-left:4px;border-radius:8px}
</style>
