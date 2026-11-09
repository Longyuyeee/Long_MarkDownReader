export function documentBudgetFixture() {
  const line = '中文阅读😀 **原样保留** [链接](https://example.invalid/source)\r\n第二行\n第三行\r'
  const begin = '# 大文稿验收\r\n\r\nFirstNeedle\n', end = '\r\nTailNeedle\r\n最后一句，不能丢失。\r\n'
  const target = 4 * 1024 * 1024 - 1024
  const repeat = Math.floor((target - Buffer.byteLength(begin + end)) / Buffer.byteLength(line))
  let content = begin + line.repeat(repeat)
  content += 'x'.repeat(target - Buffer.byteLength(content + end)) + end
  return { content, bytes: Buffer.byteLength(content), small: '# 普通文稿\n\n中文 **重点** 与图片引用。\n', dense: ('<b>密集</b> '.repeat(3) + '\n').repeat(700), longLine: 'LongLineStart' + 'a'.repeat(100000) + 'LongLineEnd' }
}
