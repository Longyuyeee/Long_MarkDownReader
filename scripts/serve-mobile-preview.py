"""Serve a completed mobile build on loopback with stable module MIME types.

Windows registry MIME overrides can make http.server serve .mjs as text/plain.
Do not rebuild dist while browser evidence is being collected from this server.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class MobilePreviewHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".wasm": "application/wasm",
    }

    def end_headers(self):
        # A newly built candidate must not mix with a previous cached worker.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Open /mobile.html to preview the completed build")
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--port", type=int, default=9012)
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not (directory / "mobile.html").is_file():
        parser.error(f"Missing {directory / 'mobile.html'}; complete npm run build:mobile first")
    with ThreadingHTTPServer(("127.0.0.1", args.port), partial(MobilePreviewHandler, directory=str(directory))) as server:
        print(f"Mobile preview: http://127.0.0.1:{server.server_port}/mobile.html", flush=True)
        print(f"Serving completed build: {directory}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
