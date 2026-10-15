const busyReason = 'Error: 知识索引正在构建，请稍后再试'

// Poll only the explicit, side-effect-free "already building" precondition.
// Never retry a failed rebuild, an invalid ready result, or a transport timeout.
export async function waitForInstalledIndex(rebuild, {
  timeoutMs = 30000,
  now = Date.now,
  delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onBusy = () => {},
} = {}) {
  const deadline = now() + timeoutMs
  let busy = false
  for (;;) {
    if (busy && now() >= deadline) throw Error('等待已有知识索引构建完成超时；未跳过重建验收')
    try {
      const result = await rebuild()
      if (!result || result.state !== 'ready') throw Error('原生索引重建未返回 ready；不能继续安装验收')
      return result
    } catch (cause) {
      if (String(cause) !== busyReason) throw cause
      busy = true; onBusy()
      const remaining = deadline - now()
      if (remaining <= 0) throw Error('等待已有知识索引构建完成超时；未跳过重建验收')
      await delay(Math.min(100, remaining))
    }
  }
}
