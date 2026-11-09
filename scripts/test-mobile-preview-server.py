"""Exercise actual HTTP responses with the problematic Windows MIME override."""
import mimetypes
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.error import HTTPError
from urllib.request import urlopen
import unittest
import sys

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("mobile_preview", Path(__file__).with_name("serve-mobile-preview.py"))
preview = module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(preview)


class PreviewHttpTests(unittest.TestCase):
    def test_worker_mime_cache_and_missing_resource(self):
        mimetypes.init()
        previous = mimetypes.types_map.get(".mjs")
        mimetypes.add_type("text/plain", ".mjs")
        try:
            with TemporaryDirectory() as directory:
                for name in ["mobile.html", "worker.mjs", "module.js", "module.wasm"]:
                    (Path(directory) / name).write_bytes(b"fixture")
                handler = partial(preview.MobilePreviewHandler, directory=directory)
                with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
                    thread = Thread(target=server.serve_forever, daemon=True)
                    thread.start()
                    try:
                        base = f"http://127.0.0.1:{server.server_port}"
                        for name, mime in [("worker.mjs", "application/javascript"), ("module.js", "application/javascript"), ("module.wasm", "application/wasm")]:
                            with self.subTest(name=name), urlopen(base + "/" + name) as response:
                                self.assertEqual(response.headers.get_content_type(), mime)
                                self.assertEqual(response.headers["Cache-Control"], "no-store")
                                self.assertEqual(response.read(), b"fixture")
                        for target in ["/missing-worker.mjs", "/"]:
                            with self.subTest(target=target), self.assertRaises(HTTPError) as error:
                                urlopen(base + target)
                            self.assertEqual(error.exception.code, 404)
                    finally:
                        server.shutdown()
                        thread.join()
        finally:
            if previous is None:
                mimetypes.types_map.pop(".mjs", None)
            else:
                mimetypes.add_type(previous, ".mjs")


if __name__ == "__main__":
    unittest.main()
