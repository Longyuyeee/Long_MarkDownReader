"""Observe Android nodes through the dedicated API29 fixture's bound service.

No UiAutomation attachment, DOM access, retries or node actions. Each stage keeps
its first result, including empty trees. This is not a TalkBack acceptance test.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stage", required=True)
    parser.add_argument("--expect", action="append", default=[])
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--refresh-descendants", action="store_true")
    parser.add_argument("--target", choices=["main", "control"], default="main")
    parser.add_argument("--expect-webview", help="Exact package@version required before requesting any nodes")
    args = parser.parse_args()
    if args.expect_webview and not re.fullmatch(r"[a-zA-Z0-9_.]+@\d+(?:\.\d+){3}", args.expect_webview):
        parser.error("Use an exact WebView package@four-part-version")
    if not re.fullmatch(r"[a-z0-9-]{1,48}", args.stage):
        parser.error("Use a unique simple stage name, at most 48 characters")
    args.output = args.output.resolve()
    if not args.output.is_dir() or any(args.output.glob(args.stage + ".*")):
        parser.error("Existing evidence directory and a new stage are required")
    adb = ["E:/Android/Sdk/platform-tools/adb.exe", "-s", args.serial]
    app = "com.longyuye.mdreader.mobile.dev"
    fixture = "com.longyuye.mdreader.storagefixture"

    def run(*command):
        return subprocess.check_output(adb + list(command), stderr=subprocess.PIPE, timeout=45)

    assert run("emu", "avd", "name").decode().splitlines()[0].strip() == "LongEdit_Compat_API29"
    assert run("shell", "getprop", "ro.build.version.sdk").strip() == b"29"
    root = Path(__file__).resolve().parents[1]
    build = json.loads((root / "release-artifacts/mobile-debug/x86_64/build-record.json").read_text(encoding="utf-8-sig"))
    installed_path = run("shell", "pm", "path", app).decode().strip().removeprefix("package:")
    installed_hash = run("shell", "sha256sum", installed_path).decode().split()[0]
    assert installed_hash == build["sha256"], "Unexpected product APK"
    fixture_path = run("shell", "pm", "path", fixture).decode().strip().removeprefix("package:")
    fixture_hash = run("shell", "sha256sum", fixture_path).decode().split()[0]
    report = {"stage": args.stage, "time": datetime.now(timezone.utc).isoformat(),
              "serial": args.serial, "api": 29, "installedApkSha256": installed_hash,
              "fixtureApkSha256": fixture_hash, "expectedVisibleText": args.expect,
              "refreshRequested": args.refresh, "uiAutomationAttached": False,
              "refreshDescendantsRequested": args.refresh_descendants,
              "target": args.target,
              "expectedWebView": args.expect_webview,
              "talkBackAcceptance": False, "assertionsPassed": None}
    try:
        webview = run("shell", "dumpsys", "webviewupdate")
        (args.output / (args.stage + ".webview.txt")).write_bytes(webview)
        report["webViewStateSha256"] = hashlib.sha256(webview).hexdigest()
        current = re.search(r"Current WebView package \(name, version\): \(([^,\s]+), ([\d.]+)\)", webview.decode())
        assert current, "No current WebView implementation reported by Android"
        report["currentWebView"] = current[1] + "@" + current[2]
        if args.expect_webview:
            assert report["currentWebView"] == args.expect_webview, "Unexpected WebView implementation; no nodes requested"
        command = ["shell", "am", "broadcast", "-a", fixture + ".TEST_ACCESSIBILITY_SNAPSHOT",
                   "-p", fixture, "--es", "token", args.stage]
        if args.refresh:
            command += ["--ez", "refresh", "true"]
        if args.refresh_descendants:
            command += ["--ez", "refreshDescendants", "true"]
        if args.target == "control":
            command += ["--ez", "control", "true"]
        result = run(*command).decode()
        report["broadcastResult"] = result
        assert re.search(r"Broadcast completed: result=1(?:\D|$)", result), "Native observation rejected"
        raw = run("exec-out", "run-as", fixture, "cat", "files/a11y-snapshot-" + args.stage + ".json")
        native_path = args.output / (args.stage + ".native.json")
        native_path.write_bytes(raw)
        report["nativeSnapshotSha256"] = hashlib.sha256(raw).hexdigest()
        (args.output / (args.stage + ".png")).write_bytes(run("exec-out", "screencap", "-p"))
        (args.output / (args.stage + ".services.txt")).write_bytes(run("shell", "dumpsys", "accessibility"))
        native = json.loads(raw)
        report["nativeServiceFlags"] = native.get("serviceFlags")
        report["nativeServiceEventTypes"] = native.get("serviceEventTypes")
        assert not native["nodeLimitReached"], "Truncated native observation"
        nodes = native["nodes"]
        assert all("unavailableChildren" in node for node in nodes), "Update fixture for subtree completeness diagnostics"
        report["unavailableChildren"] = sum(len(node.get("unavailableChildren", [])) for node in nodes)
        child_counts = Counter(node["parent"] for node in nodes)
        report["childCountMismatches"] = [index for index, node in enumerate(nodes)
                                          if node["children"] != child_counts[index]]
        report["refreshFailures"] = sum(node.get("refreshResult") is False for node in nodes)
        report["nodeCount"] = len(nodes)
        if args.refresh_descendants:
            assert not report["refreshFailures"], "Android rejected one or more node refreshes"
        visible = [node for node in nodes if node["visible"] and
                   len(bounds := node["bounds"].split()) == 4 and
                   int(bounds[2]) > int(bounds[0]) and int(bounds[3]) > int(bounds[1])]
        report["visibleLabels"] = [node["text"] or node["description"] or node["hint"]
                                   for node in visible if node["text"] or node["description"] or node["hint"]]
        if args.expect:
            assert not report["unavailableChildren"] and not report["childCountMismatches"], "Android returned an incomplete subtree"
        labels = "\n".join(report["visibleLabels"])
        for expected in args.expect:
            assert expected in labels, "Expected visible native text missing: " + expected
        if args.expect:
            report["assertionsPassed"] = True
    except Exception as error:
        report["failure"] = str(error)
        if args.expect:
            report["assertionsPassed"] = False
        raise
    finally:
        with (args.output / (args.stage + ".json")).open("x", encoding="utf-8", newline="\n") as output:
            json.dump(report, output, ensure_ascii=True, indent=2)
            output.write("\n")
        print(json.dumps(report, ensure_ascii=True)[:4000])


if __name__ == "__main__":
    main()
