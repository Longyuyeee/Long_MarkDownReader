/** Consume exactly the result layer; callers still explicitly navigate its parent. */
export async function leavePackResult(page, back = () => page.evaluate(() => window.__longeditMobileBack())) {
  await page.getByRole('heading', {name:'导出结果',exact:true}).waitFor()
  await back()
  await page.waitForFunction(() => document.querySelector('.sheet-heading h2')?.textContent !== '导出结果')
}
export async function reopenPackResult(page) {
  await page.getByRole('button', {name:/^查看导出结果/}).tap()
  await page.getByRole('heading', {name:'导出结果',exact:true}).waitFor()
}
