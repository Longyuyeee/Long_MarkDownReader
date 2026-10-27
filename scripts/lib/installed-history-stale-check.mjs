import assert from 'node:assert/strict'

// A background history reader can briefly hold the cache-wide read lease.
// Retry only the explicit, non-mutating busy response, as a user can do.
// Every such response must leave both the current draft and disk untouched;
// the final stale-signature rejection is still mandatory.
export async function checkStaleHistory({click,readError,assertUnchanged,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  for(let attempt=0;attempt<4;attempt++) {
    await click()
    const error=await readError()
    await assertUnchanged()
    if(error.includes('变化'))return
    assert.equal(error,'恢复未完成：历史记录正在读取、保存或整理，请稍后重试','unexpected history restore error')
    assert.ok(attempt<3,'history remained busy after three explicit retries')
    await pause(250)
  }
}
