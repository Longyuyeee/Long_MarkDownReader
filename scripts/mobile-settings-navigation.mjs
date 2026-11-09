/** Navigate the visible mobile settings UI after records moved into a category. */
export async function leaveMobileSettingsDetail(page) {
  const up = page.locator('.settings-page-header').getByRole('button', { name: '返回设置', exact: true })
  if (await up.isVisible()) await up.tap()
}
export async function activateMobileRoot(page, name, method = 'tap') {
  await leaveMobileSettingsDetail(page)
  await page.getByRole('button', { name, exact: true })[method]()
}
export async function openMobileSettingsTransfer(page, name, method = 'tap') {
  const entry = page.getByRole('button', { name, exact: true })
  if (!await entry.isVisible()) await page.getByRole('button', { name: '导入与导出', exact: true }).tap()
  await entry[method]()
}
