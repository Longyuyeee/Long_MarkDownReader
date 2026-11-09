"""Verify frozen APK resources, build receipts and the actually installed test APK."""
from pathlib import Path
import hashlib,json,re,subprocess,zipfile,shutil

root=Path(__file__).resolve().parent.parent
out=root/'docs/evidence/mobile-0.1.0/pdf-password-native-2026-10-26'
def digest(data): return hashlib.sha256(data).hexdigest()
def file_hash(file):
    h=hashlib.sha256()
    with file.open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''): h.update(data)
    return h.hexdigest()
assets=re.findall(r'(?:src|href)="(?:\./|/)?(assets/[^"]+)"',(root/'dist/mobile.html').read_text(encoding='utf-8'))
assets += ['assets/'+next((root/'dist/assets').glob('pdf-*.js')).name]
result={'passed':False,'artifacts':[]}
for target,filename,abi in [('x86_64','app-x86_64-debug.apk','x86_64'),('aarch64','app-arm64-debug.apk','arm64-v8a')]:
    folder=root/'release-artifacts/mobile-debug'/target
    apk=folder/filename
    record=json.loads((folder/'build-record.json').read_text(encoding='utf-8-sig'))
    sha=file_hash(apk)
    assert sha==record['sha256'] and apk.stat().st_size==record['bytes']
    assert record['verification']['versionCode']==1002048
    assert record['sourceCommit'].startswith('0d672730c') and record['sourceDirty']
    with zipfile.ZipFile(apk) as z:
        native=z.read(f'lib/{abi}/libtauri_app_lib.so')
        assert digest(native)==record['verification']['nativeSha256']
        assert len(native)==record['verification']['nativeBytes']
        for asset in assets: assert asset.encode() in native,asset
        for name in z.namelist():
            if name.endswith('.dex'):
                dex=z.read(name)
                assert b'TEST_PDF_PINCH' not in dex and b'FixtureAccessibilityService' not in dex
    badging=subprocess.check_output(['E:/Android/Sdk/build-tools/36.0.0/aapt.exe','dump','badging',str(apk)],text=True)
    assert "versionCode='1002048'" in badging and "name='com.longyuye.mdreader.mobile.dev'" in badging
    for file in ['build-record.json','tauri-build.log','gradle-build.log']:
        shutil.copy2(folder/file,out/f'{target}-{file}')
    result['artifacts'].append({'target':target,'sha256':sha,'bytes':apk.stat().st_size,'versionCode':1002048,'embeddedMobileAssets':assets,'nativeSha256':digest(native),'testGestureEndpointAbsent':True})
adb=['E:/Android/Sdk/platform-tools/adb.exe','-s','emulator-5558']
installed=subprocess.check_output(adb+['shell','pm','path','com.longyuye.mdreader.mobile.dev'],text=True).strip().removeprefix('package:')
installed_sha=subprocess.check_output(adb+['shell','sha256sum',installed],text=True).split()[0]
assert installed_sha==result['artifacts'][0]['sha256']
result['installed']={'sha256':installed_sha,'matchesFinalX86':True}
result['passed']=True
(out/'artifact-consistency.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print('Frozen APK resources and installed x86 APK verified')
