import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const bundled=await build({entryPoints:['src/mobile/codePresentation.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {renderSourceCode}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
import {codeFileInfo,sourceFileInfo,codeFormats} from '../src/mobile/codeFormats.ts'
const decode=s=>s.replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&')
test('JSON source shell leaves the 20-format import registry distinct',()=>{assert.equal(codeFormats.length,20);assert.equal(codeFileInfo('a.json'),undefined);assert.equal(sourceFileInfo('目录/a.JSON').language,'json');assert.equal(sourceFileInfo('a.js'),codeFileInfo('a.js'));assert.equal(sourceFileInfo('a.json.exe'),undefined)})
test('JSON display preserves literal unsafe text, duplicate keys, number spelling, BOM and physical rows',()=>{
 const source='\uFEFF{\r\n"same":9007199254740993,"same":-0,"exp":1e9999,"html":"<img src=https://example.invalid onerror=boom()>"\r\n}\r\n',html=renderSourceCode(source,'json')
 assert.equal(/<img\b/.test(html),false);assert.match(html,/reader-syntax-number/);assert.match(html,/reader-syntax-string/)
 const rows=[...html.matchAll(/<span class="reader-source-text">([\s\S]*?)<\/span><\/span>(?=\n|<\/code>)/g)].map(m=>decode(m[1]))
 assert.deepEqual(rows,source.replace(/\r\n?/g,'\n').split('\n'))
})
test('oversized JSON syntax falls back to real line text and numbering',()=>{const source='"'+'x'.repeat(33000)+'"\n',html=renderSourceCode(source,'json');assert.equal(/reader-syntax-/.test(html),false);assert.match(html,/reader-source-gutter[^>]*>2<\/span>/);assert.equal(decode(/<span class="reader-source-text">([\s\S]*?)<\/span>/.exec(html)[1]),source.slice(0,-1))})
