import { defineStore } from 'pinia'

export type SessionMode = 'TEMP' | 'LIBRARY'

export interface TabInfo {
  id: string
  title: string
  path: string
  isDirty: boolean
}

export const useAppStore = defineStore('app', {
  state: () => ({
    activeSession: 'LIBRARY' as SessionMode,
    tabs: [] as TabInfo[],
    activeTabId: null as string | null,
    theme: 'system' as 'light' | 'dark' | 'system',
    libraryPath: '', // 初始为空
    isZen: false,
  }),
  actions: {
    addTab(tab: TabInfo) {
      const exists = this.tabs.find(t => t.path === tab.path)
      if (exists) {
        this.activeTabId = exists.id
      } else {
        this.tabs.push(tab)
        this.activeTabId = tab.id
      }
    },
    removeTab(tabId: string) {
      this.tabs = this.tabs.filter(t => t.id !== tabId)
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[this.tabs.length - 1].id : null
      }
    },
    toggleZen() {
      this.isZen = !this.isZen
    }
  }
})
