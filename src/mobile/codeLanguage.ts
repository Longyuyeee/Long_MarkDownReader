import { StreamLanguage } from '@codemirror/language'
import { javascript, typescript } from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { css, sCSS as scss, less } from '@codemirror/legacy-modes/mode/css'
import { html } from '@codemirror/legacy-modes/mode/xml'
import { rust } from '@codemirror/legacy-modes/mode/rust'
import { go } from '@codemirror/legacy-modes/mode/go'
import { c, cpp, java, kotlin, csharp } from '@codemirror/legacy-modes/mode/clike'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { powerShell as powershell } from '@codemirror/legacy-modes/mode/powershell'
import { standardSQL as sql } from '@codemirror/legacy-modes/mode/sql'
import type { CodeLanguage } from './codeFormats'
import {json} from '@codemirror/lang-json'
import {yaml} from '@codemirror/lang-yaml'
import {xml} from '@codemirror/lang-xml'
import {toml} from '@codemirror/legacy-modes/mode/toml'
export function codeLanguage(language: CodeLanguage) {
  if(language === 'json') return json().language
  if(language === 'yaml') return yaml().language
  if(language === 'xml') return xml({autoCloseTags:false}).language
  if(language === 'toml') return StreamLanguage.define(toml)
  // Plain source remains editable without pretending to parse mixed syntax.
  if (language === 'jsx' || language === 'tsx' || language === 'vue') return []
  return StreamLanguage.define({ javascript, typescript, python, css, html, scss, less, rust, go, c, cpp, java, kotlin, csharp, shell, powershell, sql }[language])
}
