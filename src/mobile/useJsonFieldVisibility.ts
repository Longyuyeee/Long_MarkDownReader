import {onBeforeUnmount,watch,type Ref} from 'vue'
/** Follow real body/IME/textZoom changes without changing a field's selection. */
export function useJsonFieldVisibility(body:Ref<HTMLElement|undefined>,active:()=>boolean,error?:Ref<string>){
 let frame=0,observer:ResizeObserver|undefined
 const reveal=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  const area=body.value,focused=document.activeElement
  if(!active()||!area||area.closest('[inert]'))return
  const input=focused instanceof HTMLElement&&area.contains(focused)&&focused.matches('input,textarea,select')?focused:area.querySelector<HTMLElement>('[aria-invalid=true]')
  const alert=error?.value?area.querySelector<HTMLElement>('[role=alert]'):null,target=input||alert
  if(!target)return
  const r=target.getBoundingClientRect(),bounds=area.getBoundingClientRect(),a=alert?.getBoundingClientRect()
  if(bounds.height<=0)return
  const bottom=a&&a.bottom-r.top<=bounds.height-16?Math.max(r.bottom,a.bottom):r.bottom
  if(r.height>bounds.height-16)area.scrollTop+=r.top-bounds.top-8
  else if(bottom>bounds.bottom-8)area.scrollTop+=bottom-bounds.bottom+8
  else if(r.top<bounds.top+8)area.scrollTop+=r.top-bounds.top-8
 })}
 const detach=(area:HTMLElement|undefined)=>{area?.removeEventListener('focusin',reveal);observer?.disconnect()}
 watch(body,(area,previous)=>{detach(previous);if(area){area.addEventListener('focusin',reveal);observer=new ResizeObserver(reveal);observer.observe(area);reveal()}},{flush:'post'})
 watch(()=>error?.value,reveal,{flush:'post'})
 window.addEventListener('resize',reveal)
 onBeforeUnmount(()=>{detach(body.value);window.removeEventListener('resize',reveal);cancelAnimationFrame(frame)})
 return reveal
}
