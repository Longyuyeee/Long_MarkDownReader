// Independent task fixtures, not generated from the product format registry.
const examples = {
  javascript: '// 原文😎\nexport const name = "你好";\n',
  jsx: '// 原文😎\nconst App = () => <h1>你好</h1>;\n',
  typescript: '// 原文😎\nconst name: string = "你好";\n',
  tsx: '// 原文😎\nconst App = (p: {name: string}) => <h1>{p.name}</h1>;\n',
  python: '# 原文😎\ndef greet():\n\treturn "你好"\n',
  rust: '// 原文😎\nfn greet() -> String {\n\tString::from("你好")\n}\n',
  go: '// 原文😎\npackage main\nfunc greet() string { return "你好" }\n',
  java: '// 原文😎\nclass Hello { String greet() { return "你好"; } }\n',
  kotlin: '// 原文😎\nfun greet(): String = "你好"\n',
  c: '// 原文😎\nconst char *name = "你好";\n',
  cpp: '// 原文😎\nconst char *name = "你好";\n',
  csharp: '// 原文😎\nclass Hello { string Name = "你好"; }\n',
  shell: '# 原文😎\nprintf "%s" "你好"\n',
  powershell: '# 原文😎\nWrite-Output "你好"\n',
  sql: '-- 原文😎\nSELECT \'你好\' AS name;\n',
  html: '<!-- 原文😎 -->\n<script>window.__languageRan=1;fetch("https://example.invalid/source")</script><img src="https://example.invalid/image">\n',
  css: '/* 原文😎 */\n@import url("https://example.invalid/style");body { display:none; }\n',
  scss: '/* 原文😎 */\n$name: green; p { color: $name; }\n',
  less: '/* 原文😎 */\n@name: green; p { color: @name; }\n',
  vue: '<!-- 原文😎 -->\n<template><img src="https://example.invalid/vue"><h1>{{ name }}</h1></template>\n<script>window.__languageRan=1;</script>\n<style>@import "https://example.invalid/vue-css";</style>\n'
}
const groups = [
 ['javascript','JavaScript','js mjs cjs','text/javascript',true],['jsx','JSX','jsx','text/jsx',false],
 ['typescript','TypeScript','ts mts cts','text/typescript',true],['tsx','TSX','tsx','text/tsx',false],
 ['python','Python','py','text/x-python',true],['rust','Rust','rs','text/x-rust',true],['go','Go','go','text/x-go',true],
 ['java','Java','java','text/x-java-source',true],['kotlin','Kotlin','kt kts','text/x-kotlin',true],
 ['c','C','c','text/x-c',true],['cpp','C / C++','cpp h cc cxx hpp','text/x-c++src',true],
 ['csharp','C#','cs','text/x-csharp',true],['shell','Shell','sh bash zsh','application/x-sh',true],
 ['powershell','PowerShell','ps1','text/x-powershell',true],['sql','SQL','sql','application/sql',true],
 ['html','HTML','html htm','text/html',true],['css','CSS','css','text/css',true],
 ['scss','SCSS','scss','text/x-scss',true],['less','Less','less','text/x-less',true],['vue','Vue','vue','text/x-vue',false]
]
export const languageCases = groups.flatMap(([language,label,extensions,mime,highlight])=>extensions.split(' ').map(ext=>({ext,language,label,mime,highlight,source:'\uFEFF'+examples[language].replace('\n','\r\n')+'\r'})))
export const canonicalCases = groups.map(([language])=>languageCases.find(item=>item.language===language))
