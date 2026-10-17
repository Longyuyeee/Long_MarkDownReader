// Read only the rendered interface. Production script-setup internals are not a
// stable public API; no product test-only state or native bridge interception.
export function contentBackupDomObservation(field){
 const modal=document.querySelector('.content-backup-dialog');if(!modal)throw Error('Actual content backup dialog is not rendered')
 if(field==='targetError')return [...modal.querySelectorAll('[data-state="error"]')].find(e=>e.textContent.includes('请调整恢复位置'))?.textContent||''
 if(field==='summary'){
  const summary=modal.querySelector('.content-summary');if(!summary)return null
  const counts=Object.fromEntries([...modal.querySelectorAll('.content-counts>span')].map((el,i)=>[['documents','attachments','annotations','history'][i],Number(el.querySelector('b').textContent)]))
  return {observedFrom:'rendered-native-preflight',entryCount:Number(summary.textContent.match(/(\d+) 个条目/)[1]),counts,excludedCount:Number(modal.textContent.match(/未包含的内容（(\d+) 项）/)[1])}
 }
 if(field==='completed'){
  const notice=modal.querySelector('[data-state="saved"]');if(!notice)return null
  return {observedFrom:'rendered-native-completion',path:notice.querySelector('.content-path').textContent.trim(),sha256:notice.querySelector('.content-digest').textContent.match(/[a-f0-9]{64}/)[0],entryCount:Number(notice.textContent.match(/(\d+) 个条目/)[1]),status:notice.querySelector('strong').textContent.includes('已')?'completed':'unknown',sourceUnchanged:modal.querySelector('.content-actions').textContent.includes('原资料和未保存内容均未改变')}
 }
 throw Error('Unsupported observation: '+field)
}
