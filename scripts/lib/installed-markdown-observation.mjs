// Read the rendered editor without relying on Vue's development-only setup state.
// Lute is the same parser already loaded by Vditor; conversion does not edit DOM.
export const installedMarkdownValueExpression=String.raw`(() => {
 const root=[...document.querySelectorAll('#vditor-lib .vditor-wysiwyg > pre, #vditor-lib .vditor-ir > pre, #vditor-lib .vditor-sv')].find(e=>e.getClientRects().length)
 if(!root||!window.Lute)return null
 if(root.classList.contains('vditor-sv'))return (root.textContent+'\n').replace(/\n\n$/,'\n').replace(/\u00a0/g,' ')
 const lute=window.Lute.New()
 return root.parentElement.classList.contains('vditor-ir')?lute.VditorIRDOM2Md(root.innerHTML):lute.VditorDOM2Md(root.innerHTML)
})()`
