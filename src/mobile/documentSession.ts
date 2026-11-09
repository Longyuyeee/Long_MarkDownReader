import type { Document, Draft, Identity, Storage } from './storage.ts'

export interface EditorState {
  document: Document | null; content: string; dirty: boolean; loading: boolean; saving: boolean
  revision: number; error: string; draftStatus: string; recovery: Draft | null; sourceError: string
}
export const createEditorState = (): EditorState => ({ document: null, content: '', dirty: false, loading: false,
  saving: false, revision: 0, error: '', draftStatus: '', recovery: null, sourceError: '' })

/** Serialize durable draft changes and writes; a receipt owns only its captured document and edit. */
export class DocumentSession {
  private epoch = 0
  private creating = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private tail: Promise<unknown> = Promise.resolve()
  private committed = new Map<string, { revision: number; signature: string | null }>()
  private key(identity: Identity) { return JSON.stringify([identity.rootId, identity.relativePath]) }
  private storage: Storage
  readonly state: EditorState
  constructor(storage: Storage, state: EditorState) { this.storage = storage; this.state = state }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const task = this.tail.catch(() => undefined).then(action)
    this.tail = task
    return task
  }
  async open(identity: Identity) {
    if (this.creating) throw new Error('正在准备笔记，请稍候。')
    await this.flush()
    const epoch = ++this.epoch
    this.state.loading = true; this.state.error = ''
    try {
      const recovery = await this.storage.draft(identity)
      let document: Document, sourceError = ''
      try { document = await this.storage.read(identity) }
      catch (error) {
        if (!recovery) throw error
        if (recovery.expectedSignature !== null || !String(error).includes('NOT_FOUND')) sourceError = String(error)
        document = { ...identity, content: '', signature: recovery.expectedSignature, modified: 0 }
      }
      if (epoch !== this.epoch) return
      this.committed.delete(this.key(identity))
      Object.assign(this.state, { document, content: document.content, dirty: false,
        revision: Math.max(Date.now(), recovery?.revision ?? 0), recovery, draftStatus: '', sourceError })
    } catch (error) { if (epoch === this.epoch) this.state.error = String(error); throw error }
    finally { if (epoch === this.epoch) this.state.loading = false }
  }
  async create(identity: Identity, beforeActivate?: () => Promise<void>) {
    if (this.creating || this.state.saving || this.state.loading) throw new Error('正在准备笔记，请稍候。')
    this.creating = true
    try {
      await this.flush()
      const revision = Math.max(Date.now(), this.state.revision + 1)
      const draft: Draft = { ...identity, content: '', expectedSignature: null, revision, updated: Date.now() }
      await this.enqueue(async () => {
        if (await this.storage.draft(identity)) throw new Error('同名草稿仍在，请从最近打开中继续，或换一个名称。')
        try { await this.storage.read(identity) }
        catch (error) { if (!/^(?:Error: )?NOT_FOUND(?::|$)/.test(String(error))) throw error; await this.storage.saveDraft(draft); return }
        throw new Error('已经有这个名字了，换一个名称即可。')
      })
      await beforeActivate?.()
      ++this.epoch
      this.committed.delete(this.key(identity))
      Object.assign(this.state, { document: { ...identity, content: '', signature: null, modified: 0 }, content: '',
        dirty: true, loading: false, saving: false, revision, recovery: null, error: '', draftStatus: '草稿已保护', sourceError: '' })
    } catch (error) {
      // A rejected admission has no new active document to flush. Settle its
      // queue before exposing the error so a later retry can run normally.
      await this.enqueue(async () => undefined)
      throw error
    } finally { this.creating = false }
  }
  update(content: string) {
    if (!this.state.document || this.state.loading) return
    this.state.content = content
    this.state.dirty = content !== this.state.document.content || this.state.document.signature === null || !!this.state.sourceError
    this.state.revision++
    this.state.draftStatus = '正在保护草稿…'
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; void this.persist().catch(() => undefined) }, 450)
  }
  private capture(): Draft | null {
    const state = this.state, document = state.document
    return document ? { rootId: document.rootId, relativePath: document.relativePath, content: state.content,
      expectedSignature: document.signature, revision: state.revision, updated: Date.now() } : null
  }
  private persist() {
    const snapshot = this.capture(), epoch = this.epoch
    if (!snapshot || (!this.state.dirty && this.state.recovery)) return this.tail
    const clean = !this.state.dirty
    return this.enqueue(async () => {
      try {
        if (clean) {
          await this.storage.discardDraft(snapshot, snapshot.revision)
          if (epoch === this.epoch && this.state.revision === snapshot.revision) this.state.draftStatus = '与文件一致'
          return
        }
        const committed = this.committed.get(this.key(snapshot))
        if (committed && snapshot.revision <= committed.revision) return
        await this.storage.saveDraft(committed ? { ...snapshot, expectedSignature: committed.signature } : snapshot)
        if (epoch === this.epoch && this.state.revision === snapshot.revision) this.state.draftStatus = '草稿已保护'
      } catch (error) {
        if (epoch === this.epoch) { this.state.error = `草稿暂未保护：${String(error)}`; this.state.draftStatus = '草稿保护失败' }
        throw error
      }
    })
  }
  async flush() {
    for (;;) {
      const revision = this.state.revision
      clearTimeout(this.timer); this.timer = undefined
      await this.persist()
      await this.tail
      if (revision === this.state.revision) return
    }
  }
  restore() {
    const recovery = this.state.recovery
    if (!recovery || !this.state.document) return
    // Preserve the saved source signature so subsequent save detects an external change.
    this.state.document = { ...this.state.document, signature: recovery.expectedSignature }
    this.state.revision = Math.max(this.state.revision, recovery.revision)
    this.update(recovery.content)
    this.state.recovery = null
  }
  async save() {
    if (!this.state.document || this.state.saving || this.state.loading) return
    if (this.state.sourceError) throw new Error('SOURCE_UNAVAILABLE: 原资料暂不可用，请将草稿存入手机资料库。')
    clearTimeout(this.timer); this.timer = undefined
    const snapshot = this.capture()!, epoch = this.epoch
    this.state.saving = true; this.state.error = ''
    try {
      const saved = await this.enqueue(async () => {
        await this.storage.saveDraft(snapshot)
        const result = await this.storage.write(snapshot, snapshot.content, snapshot.expectedSignature)
        this.committed.set(this.key(snapshot), { revision: snapshot.revision, signature: result.signature })
        try { await this.storage.discardDraft(snapshot, snapshot.revision) }
        catch { if (epoch === this.epoch) this.state.error = '文件已保存；旧恢复记录暂未清理，下次打开时会再次核对。' }
        return result
      })
      if (epoch === this.epoch) {
        this.state.document = saved
        this.state.dirty = this.state.content !== saved.content
        this.state.draftStatus = this.state.dirty ? '正在保护后续输入…' : '已保存到文件'
        if (this.state.dirty) await this.persist()
      }
    } catch (error) {
      if (epoch === this.epoch) this.state.error = String(error)
      throw error
    } finally { if (epoch === this.epoch) this.state.saving = false }
  }
  async close() {
    if (this.creating) throw new Error('正在准备笔记，请稍候。')
    await this.flush()
    ++this.epoch
    Object.assign(this.state, createEditorState())
  }
}
