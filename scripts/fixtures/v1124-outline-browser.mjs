// Actual LibraryMode and Vditor, with explicitly mocked file IPC.
import './save-history-v117-browser.mjs'
import {sectionFixture} from '../lib/markdown-sections-fixture.mjs'
const a=window.workflowAudit
a.store.motionSpeed='calm'
a.sectionFixture=sectionFixture
a.disk.set(a.store.libraryPath+'/项目方案.md',sectionFixture)
a.store.tabs[0].content=sectionFixture
