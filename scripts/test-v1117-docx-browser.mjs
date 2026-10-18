// Production component + simulated IPC. Trusted user actions; NOT native installation evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(process.env.LONGEDIT_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.LONGEDIT_BROWSER_EVIDENCE_DIRECTORY || 'docs/evidence/v1117-docx-browser'
await fs.mkdir(output)
const browser = await chromium.launch({ headless: true }), page = await browser.newPage({ viewport: { width: 1360, height: 925 } }), checks = [], errors = []
page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message))
const base = process.env.LONGEDIT_TEST_BASE_URL || 'http://127.0.0.1:9022'
const open = async () => { await page.goto(base + '/scripts/fixtures/v1117-docx-browser.html'); await page.locator('.docx-page').waitFor(); const toggle = page.getByTitle('打开 DOCX 页面编辑'); if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click(); await text().waitFor() }
const text = () => page.locator('.docx-editor textarea'), drafts = () => page.locator('.draft-list article')
const confirm = async () => { await page.getByTitle('保存到原文件', { exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '保存到原文件', exact: true }).click() }
const noDrafts = async () => { await page.waitForFunction(() => document.querySelectorAll('.draft-list article').length === 0) }
let status = 'failed'
try {
  await open(); await text().fill('无需先执行技术检查，我直接保存。'); assert.equal(await page.getByTitle('保存到原文件').isEnabled(), true)
  assert.equal(await page.evaluate(() => docxAudit.writes.length), 0)
  await page.getByTitle('保存到原文件').click(); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click(); assert.equal(await drafts().count(), 1)
  assert.equal(await page.evaluate(() => docxAudit.writes.length), 0); checks.push('Explicit Save is available before manual verification; cancel never writes or clears the draft')
  await confirm(); await noDrafts(); assert.equal(await text().inputValue(), '无需先执行技术检查，我直接保存。'); assert.equal(await page.evaluate(() => docxAudit.writes.length), 1)
  checks.push('Source Save automatically verifies its immutable snapshot and rereads the saved document')
  await open(); await text().fill('第一版'); await page.locator('.verification-details summary').click(); await page.evaluate(() => docxAudit.holdPreview = true)
  await page.locator('.verify-edit').click(); await page.waitForFunction(() => docxAudit.previewQueue.length === 1); await text().fill('检查期间继续改为第二版')
  await page.evaluate(() => docxAudit.previewQueue[0].resolve()); await page.waitForFunction(() => !document.querySelector('.verify-edit').disabled)
  assert.equal(await page.locator('.edit-verification').count(), 0); assert.equal(await text().inputValue(), '检查期间继续改为第二版')
  await page.evaluate(() => docxAudit.holdPreview = false); await confirm(); await noDrafts(); assert.equal(await text().inputValue(), '检查期间继续改为第二版')
  checks.push('A stale preview cannot be reused; direct Save validates the newer draft instead')
  await text().fill('这段还没有保存'); await page.getByTitle('重新读取', { exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.equal(await text().inputValue(), '这段还没有保存'); await page.evaluate(() => docxAudit.failRead = true)
  await page.getByTitle('重新读取', { exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '放弃并重新读取', exact: true }).click(); await page.locator('.docx-read-error').waitFor()
  assert.equal(await text().inputValue(), '这段还没有保存'); assert.equal(await drafts().count(), 1)
  await page.getByTitle('重新读取', { exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: '放弃并重新读取', exact: true }).click(); await noDrafts()
  checks.push('Reload requires a deliberate discard; cancellation and read failure retain the draft, successful reload clears it')
  await text().fill('保存期间锁定这份草稿'); await page.evaluate(() => docxAudit.holdSave = true); await confirm(); await page.waitForFunction(() => docxAudit.saveQueue.length === 1)
  assert.equal(await text().isDisabled(), true); assert.equal(await page.getByTitle('撤销草稿修改').isDisabled(), true); assert.equal(await page.getByTitle('重新读取', { exact: true }).isDisabled(), true)
  await page.locator('#b1').click(); assert.equal(await text().inputValue(), '保存期间锁定这份草稿')
  await page.evaluate(() => docxAudit.router.push('/other')); assert.equal(await page.locator('.docx-workspace').count(), 1)
  await page.screenshot({ path: output + '/01-saving-locked.png' }); await page.evaluate(() => docxAudit.saveQueue[0].resolve()); await noDrafts(); assert.equal(await text().isEnabled(), true)
  checks.push('During native writing, target selection, edit, undo, reload and navigation cannot alter the saving document; editing resumes after completion')
  await open(); await text().fill('检查失败也不能丢'); await page.evaluate(() => docxAudit.failPreview = true); await confirm(); await page.getByRole('alert').filter({ hasText: '检查未通过' }).waitFor()
  assert.equal(await drafts().count(), 1); assert.equal(await page.evaluate(() => docxAudit.writes.length), 0)
  await page.evaluate(() => { docxAudit.failPreview = false; docxAudit.failSave = true }); await confirm(); await page.getByRole('alert').filter({ hasText: '目录不可写' }).waitFor()
  assert.equal(await text().inputValue(), '检查失败也不能丢'); await page.evaluate(() => docxAudit.failSave = false); await confirm(); await noDrafts()
  checks.push('Validation and write failures preserve the exact draft; explicit retry succeeds without weakening native gates')
  await text().fill('写入成功但读取失败'); await page.evaluate(() => docxAudit.failRead = true); await confirm(); await page.locator('.docx-read-error').waitFor(); assert.equal(await drafts().count(), 1)
  await page.getByText('文件已写入，但页面重新读取失败。', { exact: false }).waitFor(); assert.equal(await text().inputValue(), '写入成功但读取失败')
  checks.push('A successful write followed by a read failure is reported honestly and retains the draft')
  await open(); await page.locator('#b1').click(); await text().fill('会议先安排用户试用'); await page.locator('#b2').click(); await text().fill('核对交付日期'); await page.locator('#table td').first().click(); await text().fill('下一步事项')
  assert.equal(await drafts().count(), 3); await page.locator('.copy-save input').fill('项目计划.docx'); await page.locator('.copy-save button').last().click(); await page.getByRole('alert').filter({ hasText: '目标文件已存在' }).waitFor(); assert.equal(await drafts().count(), 3)
  await page.locator('.copy-save input').fill('我的项目副本.docx'); await page.locator('.copy-save button').last().click(); await noDrafts()
  assert.match(await page.locator('.document-title strong').innerText(), /我的项目副本/)
  assert.equal(await page.evaluate(() => docxAudit.disk.get('C:/ui/项目计划.docx').model.blocks[1].text), '先确定用户需要，再改进编辑体验。')
  assert.equal(await page.locator('#complex').innerText(), '复杂域与批注保持只读，不删除。')
  checks.push('Body/list/table multi-target copy saves automatically, collision retains all edits, source remains unchanged, complex content is preserved')
  await open(); await text().fill('快捷键同样需要我确认'); await page.keyboard.press('Control+s'); await page.getByRole('dialog').waitFor(); assert.equal(await page.evaluate(() => docxAudit.writes.length), 0)
  await page.getByRole('dialog').getByRole('button', { name: '保存到原文件', exact: true }).click(); await noDrafts(); checks.push('Ctrl+S uses the same explicit confirmation and safe save workflow')
  await text().fill('保存并离开也自动检查'); await page.evaluate(() => { void docxAudit.router.push('/other') }); await page.getByRole('dialog').getByRole('button', { name: '保存并离开', exact: true }).click(); await page.getByText('其他页面', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => docxAudit.writes.length), 2); checks.push('Save-and-leave checks and saves before navigation without requiring a separate verification step')
  await open(); await text().fill('确认后我又改了草稿'); await page.getByTitle('保存到原文件').click(); await page.evaluate(() => docxAudit.store.activeLibraryPath = 'C:/another'); await page.getByRole('dialog').getByRole('button', { name: '保存到原文件', exact: true }).click()
  assert.equal(await page.evaluate(() => docxAudit.writes.length), 0); assert.equal(await drafts().count(), 1); checks.push('A confirmation from another library cannot authorize a stale save')
  await open(); await text().fill('查看不同风格，不改变文件'); await page.locator('.verification-details summary').click()
  for (const style of ['soft', 'neo', 'glass', 'airy', 'minimal', 'sharp']) for (const dark of [false, true]) {
    await page.evaluate(({ style, dark }) => { docxAudit.store.visualStyle = style; docxAudit.store.theme = dark ? 'dark' : 'white' }, { style, dark })
    await page.screenshot({ path: `${output}/style-${style}-${dark ? 'dark' : 'light'}.png` })
    assert.equal(await text().inputValue(), '查看不同风格，不改变文件'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  }
  for (const width of [760, 480, 360]) { await page.setViewportSize({ width, height: 925 }); await text().scrollIntoViewIfNeeded(); assert.equal(await text().isVisible(), true); await page.locator('.copy-save button').last().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/narrow-${width}.png` }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) }
  checks.push('All six visual styles, light/dark, normal motion and 760/480/360px preserve readable controls and drafts without page overflow')
  await open(); await page.evaluate(() => docxAudit.router.replace('/docx?path=C:/ui/项目计划.docx&external=1')); await page.locator('.document-title span').filter({ hasText: '只读' }).waitFor(); assert.equal(await page.getByTitle('保存到原文件').count(), 0); assert.equal(await page.locator('.docx-editor').count(), 0); assert.equal(await page.evaluate(() => docxAudit.writes.length), 0)
  checks.push('External documents remain read-only with no write entry point')
  assert.deepEqual(errors, []); status = 'passed'; console.log(checks.join('\n'))
} finally {
  await fs.writeFile(output + '/results.json', JSON.stringify({ status, checks, errors, nativeBridgeMocked: true, desktopInputUsed: false, releaseCandidate: false }, null, 2) + '\n')
  if (status !== 'passed') await page.screenshot({ path: output + '/failure.png' })
  await browser.close()
}
