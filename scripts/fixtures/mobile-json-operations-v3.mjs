import {jsonV3Source} from './mobile-json-v3.mjs'
export const opsName='结构操作-v3.json'
export const opsSource=jsonV3Source.replace('"editor": { "wrap": true, "tabSize": 2 }','"editor": {\r\n      "wrap": true,\r\n      "tabSize": 2\r\n    }')
