import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const out=`docs/evidence/mobile-0.1.0/markdown-v3-2026-11-05/code-unit-${Date.now()}`;await mkdir(out,{recursive:true})
await build({entryPoints:['src/mobile/markdownCode.ts'],outfile:out+'/code.mjs',bundle:true,platform:'node',format:'esm',packages:'external'})
const {renderMarkdownCode,markdownCodeLanguage,escapeCode}=await import(pathToFileURL(process.cwd()+'/'+out+'/code.mjs'))
const plain=html=>html.replace(/<span class="reader-syntax-[a-z]+">|<\/span>/g,'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
test('actual parsers color common fenced languages without changing source text',()=>{
 for(const[lang,source]of [['js','const books = ["阅读😀", 42];\nreturn books;'],['python','def read_text(path):\n    return "原文"'],['json','{"中文":true,"count":2}'],['yaml','title: "中文"\ncount: 2'],['xml','<node name="中文">正文</node>'],['toml','title = "中文"\ncount = 2'],['html','<button onclick="leak()">原文</button>']]){
  const rendered=renderMarkdownCode(source,lang,65536);assert.ok(rendered.highlighted,lang);assert.match(rendered.html,/reader-syntax-/);assert.equal(plain(rendered.html),source+'\n',lang)
 }
})
test('unknown and explicitly unsupported mixed syntax remain escaped plaintext',()=>{
 const source='<script>parent.pwned = true</script> &lt;literal 😀'
 for(const lang of ['unknown','jsx','tsx','vue','']){const r=renderMarkdownCode(source,lang,65536);assert.equal(r.highlighted,false);assert.equal(r.html,escapeCode(source)+'\n');assert.equal(plain(r.html),source+'\n');assert.ok(!r.html.includes('<script>'))}
 assert.equal(markdownCodeLanguage('javascript extra-info').label,'JavaScript');assert.equal(markdownCodeLanguage('py').label,'Python');assert.equal(markdownCodeLanguage('text').label,'纯文本')
})
test('highlight budgets degrade only styling and preserve all code bytes in output text',()=>{
 for(const[source,budget]of [['const value = "完整原文";',0],['const value = 1;\n'.repeat(3000),65536]]){const r=renderMarkdownCode(source,'js',budget);assert.equal(r.highlighted,false);assert.equal(plain(r.html),source+'\n');assert.equal(r.used,0)}
 const source='const value = "\r\n😀";';assert.equal(plain(renderMarkdownCode(source,'js',65536).html),source+'\n')
})
