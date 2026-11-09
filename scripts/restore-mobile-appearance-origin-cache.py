"""Restore only the observed WebView daily origin-log date in this dedicated test AVD."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import xml.etree.ElementTree as ET

root, stage = Path(sys.argv[1]), sys.argv[2]
assert stage in ("seed", "closeout")
assert not (root / (stage + "-origin-cache.json")).exists()
prefix = ["E:/Android/Sdk/platform-tools/adb.exe", "-s", "emulator-5558"]
def adb(*args):
    return subprocess.check_output(prefix + list(args))
assert adb("emu", "avd", "name").decode().splitlines()[0].strip() == "LongEdit_Compat_API29"
app = "com.longyuye.mdreader.mobile.dev"
name = "shared_prefs/AwOriginVisitLoggerPrefs.xml"
baseline = json.loads((root / "baseline.json").read_text(encoding="utf-8"))
with tarfile.open(root / "baseline-private.tar") as archive:
    original = archive.extractfile(name).read()
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(original) == baseline["files"][name]
adb("shell", "am", "force-stop", app)
current = adb("exec-out", "run-as", app, "cat", name)
(root / (stage + "-origin-before.xml")).write_bytes(current)
old, new = ET.fromstring(original), ET.fromstring(current)
assert old.tag == new.tag == "map"
old_date = old.find("./string[@name='origins_visited_date']")
new_date = new.find("./string[@name='origins_visited_date']")
assert old_date is not None and new_date is not None
device_date = adb("shell", "date", "+%m/%d/%y").decode().strip()
assert new_date.text in (old_date.text, device_date)
changed_date = new_date.text
new_date.text = old_date.text
assert ET.tostring(old) == ET.tostring(new), "Unexpected origin metadata change"
saved = root / (stage + "-origin-original.xml")
saved.write_bytes(original)
adb("push", str(saved), "/data/local/tmp/longedit-appearance-origin-original.xml")
adb("shell", "run-as", app, "cp", "/data/local/tmp/longedit-appearance-origin-original.xml", name)
assert sha(adb("exec-out", "run-as", app, "cat", name)) == sha(original)
report = {"time": datetime.datetime.now(datetime.timezone.utc).isoformat(), "stage": stage,
          "path": name, "originalSHA256": sha(original), "observedSHA256": sha(current),
          "originalDate": old_date.text, "observedDate": changed_date, "deviceDate": device_date,
          "guard": "Only origins_visited_date changed; all other XML nodes and values are identical. Restored after force-stop from the hashed original TAR member.",
          "passed": True}
(root / (stage + "-origin-cache.json")).write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
