// Install before App mounts so its real Tauri event subscriptions are retained.
const callbacks = new Map(), listeners = new Map(); let next = 10, runtime
window.moveFixtureEvents = { callbacks, listeners }
Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, get: () => runtime, set: value => {
  runtime = value; if (!value) return
  value.transformCallback = callback => { const id = ++next; callbacks.set(id, callback); return id }
  const invoke = value.invoke
  value.invoke = async (command, args = {}) => {
    if (command === 'plugin:event|listen') { const rows = listeners.get(args.event) || []; rows.push(args.handler); listeners.set(args.event, rows); return args.handler }
    return invoke(command, args)
  }
} })
