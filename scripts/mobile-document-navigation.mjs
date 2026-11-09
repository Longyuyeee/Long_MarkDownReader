/** Follow the visible document menu on text documents, preserving source/PDF entry points. */
export async function openMobileDocumentAction(page, name, method = 'tap') {
  const action = page.getByRole('button', { name, exact: true })
  if (!await action.isVisible()) await openMobileDocumentMenu(page,method)
  await action[method]()
}

export async function openMobileIncoming(page, method = 'tap') {
  const action = page.getByRole('button', { name: /^查看收到的内容/ })
  if (!await action.isVisible()) await openMobileDocumentMenu(page,method)
  await action[method]()
}

/** Code editing places file actions under its single-row tool selector. */
export async function openMobileDocumentMenu(page,method='tap'){
  const more=page.getByRole('button',{name:'文档操作',exact:true})
  if(await more.isVisible())await more[method]()
  else{await page.getByRole('button',{name:/切换编辑工具/})[method]();await page.getByRole('button',{name:'源码操作',exact:true})[method]()}
}

/** Markdown has a single formatting row; reading remains in its document menu. */
export async function readMobileDocument(page) {
  const direct=page.getByRole('button',{name:'阅读',exact:true})
  if(await direct.isVisible()) await direct.tap()
  else await openMobileDocumentAction(page,'阅读文稿')
}
