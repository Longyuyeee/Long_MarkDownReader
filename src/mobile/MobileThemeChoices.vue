<template>
  <fieldset class="theme-cards" :aria-busy="busy"><legend class="assistive-status">主题</legend>
    <label v-for="option in themeOptions" :key="option.id" class="theme-card" :class="{'is-selected':value===option.id}" :data-theme="option.id">
      <input type="radio" :name="groupName" :value="option.id" :aria-label="option.label" :checked="value===option.id" :data-focus-key="'theme-'+option.id" @change="emit('choose',option.id)" />
      <span class="theme-radio-mark" aria-hidden="true"></span><span class="theme-card-label"><template v-if="option.id==='system'">跟随<wbr>系统</template><template v-else>{{ option.label }}</template></span>
      <span v-if="option.id==='system'" class="theme-preview theme-system-preview" aria-hidden="true"><span><Sun :size="24" /></span><span><Moon :size="24" fill="currentColor" /></span></span>
      <span v-else class="theme-preview theme-window-preview" :class="'preview-'+option.id" aria-hidden="true"><span class="theme-preview-toolbar"><i></i><i></i><i></i></span><span class="theme-preview-lines"><i></i><i></i><i></i></span></span>
    </label>
  </fieldset>
</template>
<script setup lang="ts">
import {Sun,Moon} from 'lucide-vue-next'
import {themeOptions,type ThemePreference} from './settings'
defineProps<{value:ThemePreference;busy:boolean;groupName:string}>()
const emit=defineEmits<{choose:[value:ThemePreference]}>()
</script>
<style scoped>
.theme-cards{display:flex;flex-direction:column;gap:16px;min-inline-size:0;padding:0;margin:0;border:0}.theme-card{--theme-card-fill:var(--surface);position:relative;display:flex;align-items:center;gap:16px;min-width:0;min-height:104px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--theme-card-fill);cursor:pointer;-webkit-tap-highlight-color:transparent}.theme-card.is-selected{--theme-card-fill:var(--primary-soft);border-color:var(--primary)}.theme-card:has(input:focus-visible){outline:3px solid var(--primary);outline-offset:3px}.theme-card>input{position:absolute;inset:0;width:100%;height:100%;margin:0;appearance:none;background:transparent;border:0;border-radius:inherit;cursor:pointer}.theme-card>input:focus-visible{outline:0}.theme-radio-mark{display:block;width:24px;height:24px;flex:0 0 24px;border:2px solid var(--muted);border-radius:50%;background:transparent}.theme-card input:checked~.theme-radio-mark{border-color:var(--primary);background:var(--primary);box-shadow:inset 0 0 0 5px var(--theme-card-fill)}.theme-card-label{flex:1;min-width:0;font-size:1rem;line-height:1.5;font-weight:650;word-break:keep-all}.theme-preview{flex:0 0 96px;width:96px;height:72px;border:1px solid #ccd3d5;border-radius:8px;overflow:hidden;pointer-events:none}.theme-system-preview{display:flex}.theme-system-preview>span{display:grid;place-items:center;flex:1;min-width:0;color:#27343f;background:#f5f7f7}.theme-system-preview>span+span{color:#fff;background:#27343f}.theme-window-preview{display:flex;flex-direction:column;background:#fff}.theme-preview-toolbar{display:flex;align-items:center;gap:4px;flex:none;height:18px;padding:0 8px;background:#267458}.theme-preview-toolbar>i{width:6px;height:6px;background:#76d5ac;border-radius:50%}.theme-preview-lines{display:flex;flex:1;flex-direction:column;justify-content:center;gap:7px;padding:9px 12px}.theme-preview-lines>i{display:block;height:6px;border-radius:6px;background:#d9dddd}.theme-preview-lines>i:nth-child(2){width:90%}.theme-preview-lines>i:last-child{width:65%}.preview-dark{border-color:#27343f;background:#27343f}.preview-dark .theme-preview-toolbar{background:#1a2931}.preview-dark .theme-preview-lines>i{background:#63727e}
@media(max-width:360px){.theme-card{gap:12px}.theme-preview{flex-basis:80px;width:80px;height:64px}.theme-preview-lines{padding:8px 10px;gap:6px}}
@media(max-width:340px){.theme-card{gap:10px}.theme-preview{flex-basis:72px;width:72px}}
</style>
