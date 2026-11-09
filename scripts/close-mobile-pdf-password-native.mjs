import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
const folder='docs/evidence/mobile-0.1.0/pdf-password-native-2026-10-26',before=JSON.parse((await readFile(folder+'/before.json','utf8')).replace(/^\uFEFF/,'')),adb='E:/Android/Sdk/platform-tools/adb.exe'
const run=(...args)=>{const r=spawnSync(adb,args,{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);return r.stdout.trim()},device=(...a)=>run('-s','emulator-5558',...a)
assert.equal(device('emu','avd','name').split(/\r?\n/)[0].trim(),'LongEdit_Compat_API29')
const get=(ns,values)=>Object.fromEntries(Object.keys(values).map(k=>[k,device('shell','settings','get',ns,k)]))
for(const [ns,values]of [['secure',before.settings],['system',before.orientationSettings]])for(const[k,v]of Object.entries(values)){if(v==='null')device('shell','settings','delete',ns,k);else device('shell','settings','put',ns,k,v)}
const settingsRestored=get('secure',before.settings),orientationRestored=get('system',before.orientationSettings)
assert.deepEqual(settingsRestored,before.settings);assert.deepEqual(orientationRestored,before.orientationSettings)
device('shell','sync');device('emu','kill')
let devices='';for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,500));devices=run('devices');if(!devices.includes('emulator-5558'))break}
assert.ok(!devices.includes('emulator-5558'))
await writeFile(folder+'/closeout.json',JSON.stringify({passed:true,settingsBefore:before.settings,settingsRestored,orientationBefore:before.orientationSettings,orientationRestored,syncAfterSettingsRestore:true,ownedAvdStopped:true,adbDevicesAfter:devices},null,2)+'\n')
console.log('Actual settings restored, synced, owned AVD stopped')
