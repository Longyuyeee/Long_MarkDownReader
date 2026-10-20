export const structuredHistoryFixtures=[
 ['json','jsonc','// 保留中文注释\n{\n  "value": "初稿",\n  "middle": "不动",\n  "other": "保留"\n}\n'],
 ['yaml','yaml','# 保留中文注释\nvalue: 初稿\nmiddle: 不动\nother: 保留\n'],
 ['xml','xml','<root>\n<!--保留中文注释-->\n<value>初稿</value>\n<middle>不动</middle>\n<other>保留</other>\n</root>\n'],
 ['toml','toml','# 保留中文注释\nvalue = "初稿"\nmiddle = "不动"\nother = "保留"\n'],
]
export const structuredHistoryBytes=source=>Buffer.from('\ufeff'+source.replace(/\r\n?/g,'\n').replaceAll('\n','\r\n'),'utf8')
