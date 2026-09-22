import fs from 'node:fs/promises'
import path from 'node:path'

export async function reviewInstalledFeedback({ evaluate, navigate, capture, output, sourceCommit, installerSha256 }) {
  const report = { sourceCommit, installerSha256, evidenceLevel: 'installed-webview-read-only-observation', status: 'running', samples: [] }
  const sample = async () => {
    const state = await evaluate(`({loading: !!document.querySelector('.graph-loading'), crash: !!document.querySelector('.crash-fallback'), messages: [...document.querySelectorAll('.n-message')].map(e=>e.innerText), graph: !!document.querySelector('.graph-container')})`)
    report.samples.push({ elapsedMs: Date.now() - start, ...state })
    return state
  }
  const start = Date.now()
  try {
    await navigate('#/graph', '.graph-container', 'final graph loading observation')
    await capture('final-graph-initial.jpg')
    let state = await sample()
    while (Date.now() - start < 8000 && (state.loading || state.messages.length)) {
      await new Promise(resolve => setTimeout(resolve, 250))
      state = await sample()
    }
    if (!state.graph || state.loading || state.crash || state.messages.length) throw new Error('Graph loading or notification did not clear within 8 seconds')
    await capture('final-graph-settled.jpg')
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = String(error)
    await capture('final-feedback-failure.jpg').catch(() => {})
    throw error
  } finally {
    await fs.writeFile(path.join(output, 'installed-final-feedback-review.json'), JSON.stringify(report, null, 2) + '\n')
  }
}
