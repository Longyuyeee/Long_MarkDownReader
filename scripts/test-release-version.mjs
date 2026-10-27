import assert from 'node:assert/strict'
import {test} from 'node:test'
import {releaseAtLeast} from './lib/release-version.mjs'
test('installer capability expectations survive minor and major transitions',()=>{
 for(const actual of ['1.2.37','1.2.45','1.3.0','1.3.1','2.0.0'])assert.equal(releaseAtLeast(actual,'1.2.37'),true,actual)
 for(const actual of ['1.2.36','1.1.99','0.9.99'])assert.equal(releaseAtLeast(actual,'1.2.37'),false,actual)
 for(const actual of ['','1.3','preview'])assert.throws(()=>releaseAtLeast(actual,'1.2.37'))
})
