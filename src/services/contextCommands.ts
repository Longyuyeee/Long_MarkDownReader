import { onScopeDispose, shallowReactive } from 'vue'

export interface ContextCommand {
  id: string
  title: string
  description: string
  keywords?: string
  run: () => unknown | Promise<unknown>
}
interface Provider { owner: () => string; commands: () => ContextCommand[] }

// Commands belong to the mounted document, never to an old palette result.
export function createContextCommands() {
  const providers = shallowReactive(new Map<symbol, Provider>())
  return {
    register(owner: Provider['owner'], commands: Provider['commands']) {
      const token = Symbol('document commands')
      providers.set(token, { owner, commands })
      return () => providers.delete(token)
    },
    capture() {
      return [...providers].flatMap(([token, provider]) => {
        const owner = provider.owner()
        return provider.commands().map(command => {
          const check = () => {
            const live = providers.get(token)
            if (live !== provider || live.owner() !== owner) throw Error('文件已切换，请关闭后重新打开命令；当前内容仍保留。')
            const current = live.commands().find(item => item.id === command.id)
            if (!current) throw Error('当前操作暂不可用，请等待文件加载完成后重试。')
            return current
          }
          return { ...command, check, run: async () => await check().run() }
        })
      })
    },
  }
}
export const contextCommands = createContextCommands()
export function useContextCommands(owner: Provider['owner'], commands: Provider['commands']) {
  const dispose = contextCommands.register(owner, commands)
  onScopeDispose(dispose)
}
