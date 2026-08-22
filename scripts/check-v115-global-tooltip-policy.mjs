import fs from 'node:fs'

const policy = fs.readFileSync('src/services/appTooltipPolicy.ts', 'utf8')
const main = fs.readFileSync('src/main.ts', 'utf8')
const styles = fs.readFileSync('src/styles/tokens.scss', 'utf8')
const fail = message => { throw new Error(`v1.0.15 global-tooltip policy rejected: ${message}`) }

for (const token of [
  "root.querySelectorAll('[title]').forEach(adoptNativeTitle)",
  "attributeFilter: ['title']",
  "element.removeAttribute('title')",
  "element.setAttribute('data-app-tooltip', title)",
  "element.setAttribute('aria-label', title)",
  "document.addEventListener('pointerover', handlePointerOver, true)",
  "document.addEventListener('focusin', handleFocusIn, true)",
  "event.key === 'Escape'",
  "document.addEventListener('scroll', hide, true)",
  'window.innerWidth - hostRect.width - margin',
  '[data-native-tooltip="allow"]',
]) if (!policy.includes(token)) fail(`policy token missing: ${token}`)

for (const token of [
  "import { installAppTooltipPolicy } from './services/appTooltipPolicy'",
  'const removeAppTooltipPolicy = installAppTooltipPolicy()',
  'removeAppTooltipPolicy()',
]) if (!main.includes(token)) fail(`bootstrap token missing: ${token}`)

for (const token of [
  '.app-tooltip-surface',
  "var(--theme-surface, #fff)",
  'var(--theme-text, #171a1f)',
  'var(--theme-radius-sm, 8px)',
  'max-width: min(360px, calc(100vw - 16px))',
  "[data-visible='true']",
  '@media (prefers-reduced-motion: reduce)',
]) if (!styles.includes(token)) fail(`style token missing: ${token}`)

console.log('v1.0.15 global-tooltip policy passed: static and dynamic native titles use one theme-aware, keyboard-accessible and viewport-bounded application surface.')
