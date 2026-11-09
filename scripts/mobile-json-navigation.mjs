/** Follow the actual reading or editing operation entry; never invoke Vue internals. */
export async function openJsonAction(page,name){
 const button=n=>page.getByRole('button',{name:n,exact:true})
 if(!await button(name).isVisible()){
  const selector=page.locator('.code-tool-selector:visible')
  if(await selector.count()){
   await selector.tap();await button('源码操作').tap()
  }else await button('文档操作').tap()
 }
 await button(name).tap()
}
