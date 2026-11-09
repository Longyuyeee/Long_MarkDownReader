"""Freeze the existing mobile dist into the test APK's offline WebView assets.

Does not build, alter dist, or read Android private data. Generated assets and
their identity record stay in the fixture's ignored build directory.
"""
import hashlib
import json
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
html = (dist / "mobile.html").read_bytes()
entries = re.findall(r'(?:src|href)="\./(assets/[^"?]+)"', html.decode())
assert len(entries) == 2 and all(".." not in Path(name).parts for name in entries)
assets = {"mobile.html": html}
for name in entries:
    assets[name] = (dist / name).read_bytes()
# Import chunks, workers and other packaged resources remain offline as well.
for path in sorted((dist / "assets").rglob("*")):
    if path.is_file():
        assert not path.is_symlink(), path
        assets[path.relative_to(dist).as_posix()] = path.read_bytes()
record = {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
          for name, data in assets.items()}
folder = root / "tests/android-storage-provider/build/generated/control-assets"
report = folder / "control-assets.json"
encoded = (json.dumps({"entrypoints": entries, "files": record}, indent=2) + "\n").encode()
if report.exists():
    assert report.read_bytes() == encoded, "Different snapshot exists; preserve it before preparing another"
for name, data in assets.items():
    destination = folder / "control-web" / name
    if destination.exists():
        assert destination.read_bytes() == data, "Different snapshot exists; preserve it before preparing another"
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
if not report.exists():
    report.write_bytes(encoded)
print(json.dumps({"files": len(assets), "bytes": sum(map(len, assets.values())), "entrypoints": entries}))
