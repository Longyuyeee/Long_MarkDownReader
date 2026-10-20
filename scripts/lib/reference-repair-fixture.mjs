export const repairQuote='二八独特来源文字'
export const repairTail='二八未保存补充，必须保留'
export const repairText=repairQuote+'\n预算资料，原文件必须保持\n'
export function referenceRepairFixture(directory){
 const oldPath=directory+'/旧目录/资料.txt',newPath=directory+'/新目录/资料.txt',uri='longedit://source?'+new URLSearchParams({path:oldPath,quote:repairQuote}),nextUri='longedit://source?'+new URLSearchParams({path:newPath,quote:repairQuote})
 return {oldPath,newPath,uri,nextUri,note:'# 引用修复二八\n\n[来源修复二八]('+uri+')\n\n```md\n[示例]('+uri+')\n```\n'}
}
