import {readFile,writeFile} from 'node:fs/promises'
import {mobileHelpTopics} from '../src/mobile/mobileHelp.ts'
const file=new URL('../docs/design/mobile-interaction-v2/prototype/help-catalog.js',import.meta.url)
const source='/* Generated from src/mobile/mobileHelp.ts by scripts/sync-mobile-prototype-help.mjs. */\n'+'globalThis.LongEditHelpTopics='+JSON.stringify(mobileHelpTopics,null,2)+'\n'
if(process.argv.includes('--check')){if((await readFile(file,'utf8')).replace(/\r\n/g,'\n')!==source)throw Error('Prototype help is out of sync')}else await writeFile(file,source)
