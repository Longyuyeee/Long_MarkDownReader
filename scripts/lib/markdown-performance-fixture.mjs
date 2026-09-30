// Generated content only. Never use a user's document as a hosted test fixture.
export function markdownPerformanceFixture() {
  const fence = '```'
  let markdown = ''
  for (let i = 0; i < 225; i++) {
    markdown += `## Synthetic section ${i}\n\nDocumentation sample line with generic values.\n\n`
    if (i < 167) markdown += '| Field | Type | Required | Description |\n| --- | --- | --- | --- |\n' +
      Array.from({ length: 5 }, (_, j) => `| field${j} | string | yes | Generic documentation description |`).join('\n') + '\n\n'
    if (i < 71) markdown += fence + (i < 45 ? 'json' : '') + '\n{\n' +
      Array.from({ length: 12 }, (_, j) => `  "field${j}": "synthetic value",`).join('\n') + '\n  "done": true\n}\n' + fence + '\n\n'
  }
  return markdown
}
