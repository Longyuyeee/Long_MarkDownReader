import './v1312-structure-navigation-browser.mjs'
import {contextCommands} from '/src/services/contextCommands.ts'
const command=()=>contextCommands.capture().find(c=>c.id==='structured-search-forward')
structuredAudit.forwardTest={available:()=>!!command(),run:()=>command()?.run(),capture:()=>command()}
