// A readonly article remains a keyboard reading surface. Remove the explicit
// tab stop when reusing the editor for an editable document.
export function setVditorReadOnly(editor:any,readOnly:boolean){
 const root=editor?.vditor?.[editor.getCurrentMode()]?.element as HTMLElement|undefined
 if(!root)return false
 if(readOnly){editor.disabled();root.setAttribute('tabindex','0')}
 else{editor.enable();root.removeAttribute('tabindex')}
 return true
}
