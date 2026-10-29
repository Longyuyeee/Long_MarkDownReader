import {positionSource} from '../lib/structured-source-position-fixture.mjs'
import {sourcePositionAnalysis} from './v134-source-position-analysis.mjs'
const mode=new URLSearchParams(location.search).get('mode')||'json'
import { createApp, h, computed, watch } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import * as naive from 'naive-ui'
import LibraryMode from '/src/views/LibraryMode.vue'
import { useAppStore } from '/src/store/app.ts'
import '/src/styles/tokens.scss'
import '/src/styles/themes.scss'
import '/src/styles/motion.scss'
import '/src/styles/vditor-content-themes.scss'
import '/src/styles/display-preferences.scss'
import {getThemeTone,resolveThemeName,isDarkTheme} from '/src/config/themePresets.ts'
import {VISUAL_STYLE_RADII} from '/src/config/displayPreferences.ts'
const root = 'C:/shell-fixture'
const directories = [root + '/项目资料.md']
const pinia = createPinia(), store = useAppStore(pinia)
const disk=new Map([[`${root}/A.${mode}`,positionSource(mode)],[`${root}/B.${mode}`,positionSource(mode,'另一份资料')]])

const snapshot = path => ({path,content:disk.get(path),encoding:'utf-8',encodingConfidence:'high',bom:'none',lineEnding:'lf',hasFinalNewline:true,signature:disk.get(path),contentDigest:disk.get(path),size:disk.get(path)?.length || 0,modified:1})
window.shellAudit = { calls: [], store, disk, failSave: false, commands: 0 }
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
window.addEventListener('longedit:open-command-palette', () => window.shellAudit.commands++)
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }, transformCallback: () => 1,
  invoke: async (command, args) => {
    window.shellAudit.calls.push({ command, args })
    if (command === 'plugin:event|listen') return 1
    if (command === 'plugin:event|unlisten') return
    if (command === 'plugin:app|version') return '1.3.13'
    if (command === 'scan_directory') return [...directories.map(path => ({name:path.split('/').pop(),path,is_dir:true})), ...[...disk.keys()].map(path => ({name:path.split('/').pop(),path,is_dir:false}))].filter(entry => entry.path.slice(0,entry.path.lastIndexOf('/')) === args.path)
    if(command==='get_tag_catalog_page')return{items:[],tags:[],total:0,nextCursor:null}
    if (command === 'get_folder_order') return { items: [], pinned: [] }
    if (command === 'get_library_stats') return { file_count: 2, total_words: 300 }
    if (command === 'get_knowledge_index_status') return { state: 'ready', schemaVersion: 1, sourceCount: 2, objectCount: 2, relationCount: 0, progress: 100, cacheBytes: 0, recoveryAvailable: false }
    if(command.startsWith('analyze_')){const r=sourcePositionAnalysis(args.content,mode);if(mode==='json'){try{JSON.parse(args.content)}catch{return{...r,valid:false}}}return r}
    if(command==='validate_local_json_schema')return{status:'no-schema',schemaApplied:false,diagnostics:[],diagnosticsTruncated:false}
    if(command==='get_json_schema_config')return null
    if(command.startsWith('read_')&&command.endsWith('_source_document'))return snapshot(args.path)
    if(command.startsWith('read_')&&command.includes('text_document')){const r=snapshot(args.path);return command.endsWith('_range')?{...r,offset:0,nextOffset:r.size,eof:true,readOnlyReason:''}:r}
    if (command === 'read_text_document') { if (!disk.has(args.path)) throw Error('文件不存在'); return snapshot(args.path) }
    if (command === 'write_text_document') { if (window.shellAudit.failSave) throw Error('保存失败，请重试'); disk.set(args.path,args.content); return snapshot(args.path) }
    if (command === 'prepare_writing_delivery') { if(window.shellAudit.failDelivery)throw Error('图片缺失，未完成');return window.shellAudit.deliveryResources||{images:[],warnings:[]} }
    if (command === 'save_writing_delivery') { if(window.shellAudit.failExport)throw Error('目录不可写');if(window.shellAudit.cancelExport)return null;return 'C:/另一个 目录/交付.'+args.format }
    if (command === 'create_note_from_template') {if(window.shellAudit.failCreate)throw Error('目录正在移动');const {renderNoteTemplate}=await import('/src/config/noteTemplates.ts');let name=args.name,index=0;while(disk.has(args.targetDir+'/'+name+'.md'))name=args.name+' '+ ++index;const path=args.targetDir+'/'+name+'.md';disk.set(path,renderNoteTemplate(args.content,name,new Date(),args.parameters));return path}
    if (command === 'import_writing_image' || command==='insert_writing_image') return '.assets/fixture-image.png'
    if (command === 'get_image_base64') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
    if (command === 'create_new_folder') { const path = args.parentPath + '/新建文件夹'; directories.push(path); return path }
    if (command === 'rename_item') { const path=args.oldPath.slice(0,args.oldPath.lastIndexOf('/')+1)+args.newName; if(disk.has(path))throw Error('同名文件已存在'); disk.set(path,disk.get(args.oldPath));disk.delete(args.oldPath);return path }
    if (command === 'create_format_file') { const path = args.targetDir + '/' + (args.prefix || '新笔记') + '.md'; disk.set(path, args.content || '# 新笔记\n'); return path }
    if (command === 'search_knowledge') return [...disk.keys()].filter(path => disk.get(path).includes(args.query)).map(path => ({title:path.split('/').pop(),path,objectType:'markdown',matchKind:'body',context:'保存的位置应该在记录的时候就确定。',score:100,extractionFailed:false}))
    if (command === 'preview_search_document') return { text: disk.get(args.path), label: 'Markdown', matchFound: true, truncated: false }
    if (command === 'list_history') return []
    if (command === 'open_quick_note' || command === 'save_config') return
    if (['get_all_tags','discover_external_applications','summarize_graph_relations','find_backlinks','extract_wikilinks'].includes(command)) return []
    throw Error('Unmodeled library fixture IPC: '+command)
  },
}
store.activeLibraryPath = root
store.libraries = [{ name: '工作资料库', path: root }]
store.tabs = [...disk].map(([path,content]) => ({id:path,path,title:path.split('/').pop(),content,isDirty:false}))
store.activeTabId = [...disk.keys()][0]
store.loadConfig = async () => {}
const router = createRouter({history:createMemoryHistory(),routes:[{path:'/',name:'LibraryMode',component:LibraryMode}]})
await router.push({name:'LibraryMode',query:{path:store.activeTabId}})
store.theme='white';store.visualStyle='minimal';store.motionSpeed='normal'
const systemDark=matchMedia('(prefers-color-scheme: dark)').matches
watch(()=>store.theme,value=>{document.body.dataset.theme=resolveThemeName(value,systemDark);document.body.classList.toggle('is-dark',isDarkTheme(value,systemDark))},{immediate:true})
watch(()=>store.visualStyle,value=>document.body.dataset.style=value,{immediate:true})
const overrides=computed(()=>{const tone=getThemeTone(store.theme,systemDark).ui,radius=VISUAL_STYLE_RADII[store.visualStyle];return {common:{primaryColor:tone.primary,primaryColorHover:tone.primary,primaryColorPressed:tone.primary,textColor1:tone.text,textColor2:tone.text+'c7',textColor3:tone.text+'8f',borderColor:tone.text+'26',cardColor:tone.surface,modalColor:tone.surface,popoverColor:tone.surface,bodyColor:'transparent',borderRadius:radius.normal,borderRadiusSmall:radius.small}}})
const app = createApp({render:() => h(naive.NConfigProvider, {theme:isDarkTheme(store.theme,systemDark)?naive.darkTheme:null,themeOverrides:overrides.value}, {default:() => h(naive.NDialogProvider, {}, {default:() => h(naive.NMessageProvider, {}, {default:() => h(LibraryMode)})})})})
const {registerNaiveComponents}=await import('/src/services/naiveComponents.ts')
registerNaiveComponents(app)
app.use(pinia).use(router).mount('#app')
document.body.style.margin = '0'
document.querySelector('#app').style.height = '100vh'
document.querySelector('#app > div').style.height = '100%'
