import fs from 'node:fs'
import {createRequire} from 'node:module'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const root='docs/evidence/v1112-proposal';fs.mkdirSync(root,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
page.on('pageerror',e=>errors.push(String(e)))
for(const [name,query]of[['export',''],['restore','?restore']]){await page.goto('http://127.0.0.1:9022/scripts/fixtures/v1112-backup-proposal.html'+query);await page.getByRole('dialog').waitFor();await page.screenshot({path:root+'/'+name+'.png'})}
if(errors.length)throw Error(errors.join('\n'))
await browser.close();console.log('Proposal screenshots captured; no native or product acceptance asserted.')
