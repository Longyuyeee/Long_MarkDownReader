// Follow visible child tasks; each helper returns only the one level it entered.
export const recoveryBack = page => page.evaluate(() => window.__longeditMobileBack())
export async function selectRecoveryVersion(page, label) {
  await page.getByRole('button', {name:/^恢复版本/}).click()
  await page.getByRole('dialog', {name:'选择恢复版本',exact:true}).getByRole('button', {name:label,exact:true}).click()
  await page.getByRole('dialog', {name:'选择恢复版本',exact:true}).waitFor({state:'hidden'})
}
export async function selectedRecoveryVersion(page, label) {
  const row=page.getByRole('button',{name:/^恢复版本/})
  return (await row.innerText()).includes(label)
}
export async function openRecoveryPreview(page) {
  await page.getByRole('button',{name:/^查看完整内容/}).click()
  await page.getByRole('heading',{name:'内容预览',exact:true}).waitFor()
}
export async function readRecoveryPreview(page,label,back=()=>recoveryBack(page)) {
  await openRecoveryPreview(page)
  const text=page.getByLabel(label,{exact:true});await text.waitFor()
  const value=await text.inputValue();await back()
  await page.getByRole('button',{name:/^查看完整内容/}).waitFor()
  return value
}
export async function openRecoveryExport(page) {
  await page.getByRole('button',{name:/^导出完整恢复记录/}).click()
  await page.getByRole('heading',{name:/^导出(恢复记录|结果)$/}).waitFor()
}
