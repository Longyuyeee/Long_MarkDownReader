/** Bound only the display snippet. The patch always retains the complete source. */
export function boundedJsonPreview(value:string){
 if(value.length<=1600)return{text:value,truncated:false}
 const pair=(at:number)=>value.charCodeAt(at-1)>=0xd800&&value.charCodeAt(at-1)<=0xdbff&&value.charCodeAt(at)>=0xdc00&&value.charCodeAt(at)<=0xdfff
 return{text:value.slice(0,pair(1200)?1199:1200)+'\n…\n'+value.slice(pair(value.length-400)?value.length-399:value.length-400),truncated:true}
}
