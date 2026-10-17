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

// Locate the user-visible file-open control, not the non-clickable grouped row
// or its separate reference button. Historical packages used a clickable row.
export function paletteFileOpenExpression(fileName, prefix = '.command-palette-container') {
  const scope = `${prefix} `
  const legacyTitle = fileName.replace(/\.[^.]+$/, '')
  return `(()=>{if(document.querySelector(${JSON.stringify(scope + '.search-file-card')}))return [...document.querySelectorAll(${JSON.stringify(scope + '.search-file-title')})].find(e=>e.getAttribute('aria-label')===${JSON.stringify('打开 ' + fileName)});return [...document.querySelectorAll(${JSON.stringify(scope + '.result-item')})].find(e=>{const title=e.querySelector('.item-title')?.textContent.trim();return title===${JSON.stringify(fileName)}||title===${JSON.stringify(legacyTitle)}})})()`
}
