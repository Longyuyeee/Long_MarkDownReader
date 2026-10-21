export const readingContinuityTitle='接续阅读笔记二九'
export const readingContinuityTail='二九未保存补写，必须保留。'
export const readingContinuityComment='从右键更新的评论二九'
export const readingContinuityConcurrent='另一个窗口更新的评论二九'
export const readingContinuityAppend='供新版追加的最新评论二九'
export const readingContinuityInside='我在生成内容里补写的说明二九'
export function continuityAnnotations(file,size){
 const entry=(id,page,quote,comment)=>({id,kind:'comment',color:'yellow',page,quote,comment,rects:[],createdAt:1,updatedAt:1})
 return {schemaVersion:1,source:{pdfFile:file,size,modifiedAt:1},annotations:[entry('continue-a',2,'接续摘录甲','初始评论甲'),entry('continue-b',3,'接续摘录乙','初始评论乙'),entry('unselected',1,'原来未选中的摘录','不要带入阅读笔记')]}
}
