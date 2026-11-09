"""Offline candidate inventory; never starts adb, an emulator, a build or an install.

This detects stale artifacts. Matching static fields cannot prove source/build
correspondence, valid signing, installed identity or native interaction success.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import zipfile


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def inspect_artifact(root, target, expected, asset_names):
    folder = root / "release-artifacts/mobile-debug" / target
    record_path = folder / "build-record.json"
    if not record_path.is_file():
        return {"target": target, "staticIdentityCompatible": False, "mismatches": ["missing-build-record"]}
    record = json.loads(record_path.read_text(encoding="utf-8-sig"))
    # Exact known target paths: never choose the newest APK from a mixed folder.
    abi, elf_machine = ("arm64-v8a", 183) if target == "aarch64" else ("x86_64", 62)
    apk = folder / f"app-{'arm64' if target == 'aarch64' else 'x86_64'}-debug.apk"
    result = {"target": target, "apk": str(apk), "record": record, "mismatches": []}
    mismatch = result["mismatches"]
    if not apk.is_file():
        mismatch.append("missing-exact-target-apk")
    else:
        result["actualSha256"] = file_hash(apk)
        result["actualBytes"] = apk.stat().st_size
        if result["actualSha256"] != record.get("sha256") or result["actualBytes"] != record.get("bytes"):
            mismatch.append("apk-differs-from-build-record")
        with zipfile.ZipFile(apk) as archive:
            libraries = [entry for entry in archive.infolist() if re.fullmatch(r"lib/[^/]+/[^/]+\.so", entry.filename)]
            actual_abis = sorted({entry.filename.split("/")[1] for entry in libraries})
            result["actualAbis"] = actual_abis
            if actual_abis != [abi]:
                mismatch.append("unexpected-abi")
            native = archive.getinfo(f"lib/{abi}/libtauri_app_lib.so")
            if native.file_size > 256 * 1024 * 1024:
                raise ValueError("Unexpectedly large native library; inspect the artifact manually")
            data = archive.read(native)
            result["actualNativeSha256"] = sha256(data)
            verification = record.get("verification", {})
            if result["actualNativeSha256"] != verification.get("nativeSha256"):
                mismatch.append("native-library-differs-from-build-record")
            if data[:6] != b"\x7fELF\x02\x01" or int.from_bytes(data[18:20], "little") != elf_machine:
                mismatch.append("unexpected-elf")
            # Tauri embeds frontend assets in the native library, not APK assets/.
            # Name absence proves a mismatch; name presence is not byte equality.
            result["embeddedMobileAssetNames"] = sorted({name.decode() for name in re.findall(rb"mobile-[A-Za-z0-9_-]+\.(?:js|css)", data)})
            if not asset_names or not set(asset_names).issubset(result["embeddedMobileAssetNames"]):
                mismatch.append("mobile-entry-assets-differ-from-preview")
    verification = record.get("verification", {})
    for key, value in expected.items():
        if verification.get(key) != value:
            mismatch.append(f"record-{key}-differs-from-candidate")
    result["staticIdentityCompatible"] = not mismatch
    result["nativeAccepted"] = False
    return result


def inventory(root, sdk):
    android = json.loads((root / "src-tauri/tauri.android.conf.json").read_text(encoding="utf-8-sig"))
    base = json.loads((root / "src-tauri/tauri.conf.json").read_text(encoding="utf-8-sig"))
    expected = {"applicationId": android["identifier"], "versionCode": android["bundle"]["android"]["versionCode"], "versionName": base["version"], "minSdk": android["bundle"]["android"]["minSdkVersion"]}
    tracked = git(root, "ls-files", "-z", "src", "public", "src-tauri", "mobile.html", "package.json", "package-lock.json", "vite.config.ts", "vite.mobile.config.ts").decode().split("\0")
    sources = {name: file_hash(root / name) if (root / name).is_file() else "missing" for name in tracked if name}
    entry = root / "dist/mobile.html"
    entry_text = entry.read_text(encoding="utf-8") if entry.is_file() else ""
    assets = sorted(set(re.findall(r"assets/(mobile-[A-Za-z0-9_-]+\.(?:js|css))", entry_text)))
    preview_files = {"mobile.html": file_hash(entry)} if entry.is_file() else {}
    for name in assets:
        asset = root / "dist/assets" / name
        preview_files[f"assets/{name}"] = file_hash(asset) if asset.is_file() else "missing"
    components = {}
    for relative in ["platform-tools/source.properties", "platforms/android-36/android.jar", "build-tools/36.0.0/aapt.exe", "build-tools/36.0.0/apksigner.bat", "ndk/27.2.12479018/source.properties", "emulator/emulator.exe"]:
        components[relative] = (sdk / relative).is_file()
    try:
        with socket.create_connection(("127.0.0.1", 5037), timeout=0.3):
            adb_port = "listening-not-identified"
    except OSError:
        adb_port = "not-listening"
    artifacts = [inspect_artifact(root, target, expected, assets) for target in ["aarch64", "x86_64"]]
    return {
        "kind": "mobile-native-candidate-offline-inventory",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "sourceCommit": git(root, "rev-parse", "HEAD").decode().strip(),
        "sourceFiles": sources,
        "candidate": expected,
        "preview": {"files": preview_files, "sourceBuildCorrespondence": "not-established-by-offline-inventory"},
        "environment": {"sdk": str(sdk), "componentsPresent": components, "javaHome": os.environ.get("JAVA_HOME"), "adbPort5037": adb_port, "deviceDiscovery": "not-performed; adb was not invoked", "installedApplication": "not-inspected"},
        "artifacts": artifacts,
        "currentCandidateNativeAccepted": False,
        "next": ["Build a new explicitly identified candidate and verify signature, native library and frontend bytes using the existing build pipeline.", "Select a dedicated emulator or a connected physical device explicitly; record installed APK identity before accepting UI results.", "Run the stage-5 task itinerary with real IME, SAF, Back, lifecycle and independent byte checks."],
        "limits": "File presence is not a successful toolchain build. Static compatibility is not native acceptance. No device, settings, SDK, application or existing artifact was changed.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get("ANDROID_HOME", "E:/Android/Sdk")))
    parser.add_argument("--output", type=Path, required=True, help="New JSON path; existing evidence is never overwritten")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output exists; select a new evidence path")
    root = Path(__file__).resolve().parents[1]
    report = inventory(root, args.sdk.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(report, output, ensure_ascii=True, indent=2)
        output.write("\n")
    print(json.dumps({"output": str(args.output), "artifacts": [{"target": item["target"], "mismatches": item["mismatches"]} for item in report["artifacts"]], "currentCandidateNativeAccepted": False}, indent=2))


if __name__ == "__main__":
    main()
