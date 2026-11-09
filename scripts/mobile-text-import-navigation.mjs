// Each preview assertion enters the child task and returns exactly one level.
// Dismissal is separate from Back-contract assertions in the task-specific suite.
export async function readTextImportPreview(page, back = () => page.evaluate(() => window.__longeditMobileBack())) {
  await page.getByRole('button', { name: /^查看(?:完整文字|全文)/ }).click()
  const text = page.getByLabel('待导入文字（只读）', { exact: true })
  await text.waitFor()
  const value = await text.inputValue()
  await back()
  await page.getByRole('button', { name: /^查看(?:完整文字|全文)/ }).waitFor()
  return value
}
export async function dismissTextImportTask(page) {
  for (let level = 0; level < 3 && await page.locator('.file-import-panel').isVisible(); level++) {
    await page.evaluate(() => window.__longeditMobileBack())
    await page.waitForFunction(() => !document.querySelector('.file-import-panel [role=status]')?.textContent?.includes('正在'))
  }
  if (await page.locator('.file-import-panel').isVisible()) throw Error('Text import task did not return to its caller')
}
