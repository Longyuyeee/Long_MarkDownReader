// Read-only installed UI observation shared by old array and new file-page
// workflows. A partial/failure explanation must never count as a genuine empty.
export function searchFeedbackContract(paged,prefix='') {
  const scope=prefix?`${prefix} `:''
  return {error:`${scope}${paged?'.search-page-error':'.search-feedback-error'}`,
    emptyExpression:paged
      ? `document.querySelector(${JSON.stringify(scope+'.search-page-empty')})?.textContent.trim()==='没有找到匹配内容'`
      : `!!document.querySelector(${JSON.stringify(scope+'.no-results')})`,
    incompleteText:paged?'无法读取搜索结果':'搜索未完成'}
}
