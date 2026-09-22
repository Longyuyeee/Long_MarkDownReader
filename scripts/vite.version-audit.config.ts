import { defineConfig, mergeConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import baseConfig from '../vite.config'

// Opt-in local UI fault injection. Never imported by the shipping Vite config.
export default defineConfig(async env => {
  if (env.command !== 'serve') throw new Error('Version audit fixture cannot build production assets')
  const base = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig
  return mergeConfig(base, {
    plugins: [{
      name: 'isolated-version-api-fixture',
      enforce: 'pre',
      transform(code: string, id: string) {
        if (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/services/appUpdater.ts')) {
          for (const source of ['@tauri-apps/api/core', '@tauri-apps/plugin-opener']) {
            const token = `from '${source}'`
            if (code.split(token).length !== 2) throw new Error(`Unexpected updater import: ${source}`)
            code = code.replace(token, "from '/scripts/fixtures/version-updater-bridge'")
          }
          return code
        }
      },
      configureServer(server: any) {
        server.middlewares.use('/__version_audit_scenario', (req: any, res: any) => {
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('Content-Type', 'application/json')
          try {
            if (req.method !== 'GET') throw new Error('Read-only fixture')
            res.end(fs.readFileSync(path.resolve('version-audit.local/scenario.json'), 'utf8'))
          } catch {
            res.statusCode = 503
            res.end('{"error":"fixture unavailable"}')
          }
        })
      },
    }],
  })
})
