import fs from 'node:fs'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v1113-proposal';fs.mkdirSync(output,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}})
try{for(const [name,query]of[['annotations',''],['note-preview','?preview']]){await page.goto('http://127.0.0.1:9022/scripts/fixtures/v1113-pdf-proposal.html'+query);await page.screenshot({path:output+'/'+name+'.png'})}}finally{await browser.close()}
console.log('UI proposal captured; not product acceptance')
