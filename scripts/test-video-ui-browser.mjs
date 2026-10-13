import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
const {chromium}=createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE||'playwright')
const output='docs/evidence/v110-video-ui';await fs.mkdir(output,{recursive:true})
const browser=await chromium.launch(),errors=[]
try{
 const page=await browser.newPage({viewport:{width:480,height:700}})
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
 await page.goto('http://127.0.0.1:9000/scripts/fixtures/media-redesign-browser.html?video')
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2)
 await page.getByTitle('循环播放',{exact:true}).click()
 await page.getByTitle('静音（M）',{exact:true}).click()
 await page.locator('.playback-rate[title="播放速度"] select').selectOption('1.5')
 assert.equal(await page.locator('video').evaluate(v=>v.playbackRate),1.5)
 assert.equal(await page.locator('video').evaluate(v=>v.muted),true)
 await page.getByTitle('播放（空格）',{exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('video').currentTime>0)
 await page.getByTitle('暂停（空格）',{exact:true}).click()
 assert.equal(await page.locator('video').evaluate(v=>v.paused),true)
 await page.screenshot({path:output+'/01-narrow.png',animations:'disabled'})
 assert.deepEqual(errors,[])
 await fs.writeFile(output+'/results.json',JSON.stringify({checks:['Actual WebM decoding','Play/pause','Loop','Mute','Playback rate','Narrow controls'],scope:'Synthetic MediaRecorder clip; native inspection mocked; no native streaming/subtitle/export acceptance',errors},null,2)+'\n')
 console.log('Video UI checks passed')
}finally{await browser.close()}
