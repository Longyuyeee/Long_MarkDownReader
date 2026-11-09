import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import path from 'node:path'
const require=createRequire(import.meta.url),{parse,compileScript,compileStyle}=require('@vue/compiler-sfc'),esbuild=require('esbuild')
/** Compile a repo-native design or isolated component fixture; never writes a production bundle. */
export async function compileMobileVuePrototype(source){
 const result=await esbuild.build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'vue-prototype',setup(build){build.onLoad({filter:/\.vue$/},async args=>{const text=await readFile(args.path,'utf8'),{descriptor}=parse(text,{filename:args.path}),id=createHash('sha256').update(args.path).digest('hex').slice(0,8),script=compileScript(descriptor,{id,inlineTemplate:true}),css=descriptor.styles.map(s=>compileStyle({source:s.content,filename:args.path,id:'data-v-'+id,scoped:s.scoped}).code).join('\n');return{contents:script.content.replace('export default','const component =')+`;component.__scopeId='data-v-${id}';const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);export default component;`,loader:'ts',resolveDir:path.dirname(args.path)}})}}]})
 return result.outputFiles[0].text
}
