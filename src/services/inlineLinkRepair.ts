export interface InlineLinkRepairRequest {
 root:string; path:string; href:string
 current:()=>boolean
 refresh:()=>boolean
 commit:(target:string,fragment:string)=>void
}
