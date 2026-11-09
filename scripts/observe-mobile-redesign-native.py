"""Capture a current-candidate Android task without injecting application state.

Every observation verifies the exact installed APK and preserves earlier files.
UI actions remain explicit and use fresh Android UI trees between observations.
Without --expect this captures evidence and checks files only, not UI success.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import xml.etree.ElementTree as ET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--expect", action="append", default=[])
    parser.add_argument("--note", help="New synthetic local note created through the application")
    parser.add_argument("--expected-draft", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]+", args.stage):
        parser.error("Use a simple stage name")
    root = Path(__file__).resolve().parents[1]
    args.output = args.output.resolve()
    report_path = args.output / f"{args.stage}.json"
    if report_path.exists():
        parser.error("Observation exists; select a new stage")
    adb = "E:/Android/Sdk/platform-tools/adb.exe"
    app = "com.longyuye.mdreader.mobile.dev"

    def run(*command):
        return subprocess.check_output([adb, "-s", args.serial, *command], stderr=subprocess.PIPE, timeout=45)

    assert run("emu", "avd", "name").decode().splitlines()[0].strip() == "LongEdit_Compat_API29"
    assert run("shell", "getprop", "ro.build.version.sdk").strip() == b"29"
    build = json.loads((root / "release-artifacts/mobile-debug/x86_64/build-record.json").read_text(encoding="utf-8-sig"))
    candidate = json.loads((args.output / "candidate-start.json").read_text(encoding="utf-8-sig"))
    assert build["verification"]["versionCode"] == candidate["candidateVersionCode"]
    apk_path = run("shell", "pm", "path", app).decode().strip().removeprefix("package:")
    installed = run("shell", "sha256sum", apk_path).decode().split()[0]
    assert installed == build["sha256"], "Installed APK is not this candidate"
    before = json.loads((args.output / "before-install.json").read_text())
    report = {"kind": "redesigned-mobile-native-task-observation", "stage": args.stage,
              "time": datetime.now(timezone.utc).isoformat(), "serial": args.serial,
              "avd": "LongEdit_Compat_API29", "api": 29, "installedApkSha256": installed,
              "candidateVersionCode": build["verification"]["versionCode"], "nativeAndroidTest": True,
              "expectedNativeText": args.expect, "uiAssertionsRequested": bool(args.expect)}
    try:
        archive = run("exec-out", "run-as", app, "tar", "-cf", "-", "files")
        (args.output / f"{args.stage}-data.tar").write_bytes(archive)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            data = {entry.name: tar.extractfile(entry).read() for entry in tar if entry.isfile()}
        report["files"] = {name: {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()} for name, content in data.items()}
        changed = [name for name, info in before["files"].items()
                   if name.startswith("files/") and name != "files/profileInstalled"
                   and report["files"].get(name) != info]
        report["changedPriorFiles"] = changed
        run("shell", "uiautomator", "dump", "/sdcard/longedit-redesign-task.xml")
        xml = run("exec-out", "cat", "/sdcard/longedit-redesign-task.xml")
        (args.output / f"{args.stage}.xml").write_bytes(xml)
        (args.output / f"{args.stage}.png").write_bytes(run("exec-out", "screencap", "-p"))
        nodes = [{key: node.get(key) for key in ["text", "content-desc", "class", "bounds", "focused", "clickable", "enabled"]}
                 for node in ET.fromstring(xml).iter("node") if node.get("text") or node.get("content-desc") or node.get("focused") == "true"]
        report["nodes"] = nodes
        report["inputMethod"] = run("shell", "dumpsys", "input_method").decode()
        visible_nodes = [node for node in nodes if node.get("bounds") != "[0,0][0,0]"]
        visible = "\n".join((node.get("text") or "") + "\n" + (node.get("content-desc") or "") for node in visible_nodes)
        assert not changed, "Earlier source, draft or receipt bytes changed"
        for expected in args.expect:
            assert expected in visible, f"Expected visible task missing: {expected}"
        if args.expected_draft:
            assert args.note and "/" not in args.note and "\\" not in args.note
            expected = args.expected_draft.read_bytes().decode("utf-8")
            drafts = [json.loads(content) for name, content in data.items() if name.startswith("files/drafts-v1/") and name.endswith(".json")]
            matching = [draft for draft in drafts if draft.get("rootId") == "local" and draft.get("relativePath") == args.note]
            assert len(matching) == 1 and matching[0]["content"] == expected, "Complete original task draft was not protected"
            report["taskDraft"] = matching[0]
            source_name = "files/library/" + args.note
            creation = json.loads((args.output / "empty-editor.json").read_text())
            assert report["files"].get(source_name) == creation["files"].get(source_name), "The original task source changed"
            report["taskSourceUnchangedSinceCreation"] = True
        report["passed"] = True
    except Exception as error:
        report["failure"] = str(error)
        raise
    finally:
        with report_path.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(report, output, ensure_ascii=True, indent=2)
            output.write("\n")
        summary = {key: report.get(key) for key in ["stage", "passed", "failure", "changedPriorFiles"]}
        summary["visibleNodes"] = [node for node in report.get("nodes", []) if node.get("bounds") != "[0,0][0,0]"][:80]
        print(json.dumps(summary, ensure_ascii=True))


if __name__ == "__main__":
    main()
