import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const out = path.resolve('docs/evidence/v119-session-proposal')
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }), errors=[]
  page.on('pageerror', error=>errors.push(error.message))
  await page.goto(pathToFileURL(path.resolve('docs/design/v119-session-transfer.html')).href)
  await page.screenshot({ path: path.join(out, 'entry.png') })
  await page.getByRole('button',{name:'导入预览',exact:true}).click()
  await page.getByRole('dialog').waitFor()
  await page.screenshot({ path: path.join(out, 'import-preview.png') })
  await page.getByRole('button',{name:'重新定位…'}).click()
  await page.getByText('4 份文件可恢复 · 原始资料与未保存草稿保持不变').waitFor()
  await page.getByRole('button',{name:'缺失项恢复',exact:true}).click()
  await page.getByRole('button',{name:'继续可用的文件'}).click()
  await page.getByText('示意：只恢复可用文件，缺失记录可稍后修复。').waitFor()
  await page.screenshot({ path: path.join(out, 'restore-preview.png') })
  await page.setViewportSize({width:360,height:900})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({ path: path.join(out, 'narrow.png') })
  await page.emulateMedia({colorScheme:'dark'})
  await page.screenshot({ path: path.join(out, 'dark.png') })
  assert.deepEqual(errors,[])
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({scope:'design proposal only, not implemented UI or native acceptance',states:3,checkedWidths:[1180,360],errors},null,2)+'\n')
  console.log('Design-only interaction and width checks passed; not product acceptance.')
} finally { await browser.close() }
