// Convert the path syntax emitted by the native JSON source analyzer. Do not
// parse the document itself: duplicate keys and large numbers must stay intact.
export function jsonPathToPointer(path: string): string | undefined {
  if (!path.startsWith('$')) return
  const parts: string[] = []
  let index = 1
  while (index < path.length) {
    if (path[index] === '.') {
      const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(path.slice(++index))
      if (!match) return
      parts.push(match[0]); index += match[0].length
    } else if (path.slice(index, index + 2) === '["') {
      index += 2
      let value = '', closed = false
      while (index < path.length) {
        const character = path[index++]
        if (character === '\\') {
          const escaped = path[index++]
          if (escaped !== '"' && escaped !== '\\') return
          value += escaped
        } else if (character === '"') { closed = true; break }
        else value += character
      }
      if (!closed || path[index++] !== ']') return
      parts.push(value)
    } else {
      const match = /^\[(\d+)\]/.exec(path.slice(index))
      if (!match) return
      parts.push(match[1]); index += match[0].length
    }
  }
  return parts.map(part => '/' + part.replace(/~/g, '~0').replace(/\//g, '~1')).join('')
}
