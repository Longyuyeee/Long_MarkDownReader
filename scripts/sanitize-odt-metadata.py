from __future__ import annotations

import argparse
import os
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


NAMESPACES = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "meta": "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def sanitize_metadata(data: bytes, fixture_author: str) -> bytes:
    root = ET.fromstring(data)
    office_meta = root.find("office:meta", NAMESPACES)
    if office_meta is None:
        raise ValueError("ODT meta.xml is missing office:meta")
    for selector in ("meta:initial-creator", "dc:creator"):
        node = office_meta.find(selector, NAMESPACES)
        if node is not None:
            node.text = fixture_author
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def clone_info(source: zipfile.ZipInfo, compression: int) -> zipfile.ZipInfo:
    target = zipfile.ZipInfo(source.filename, source.date_time)
    target.compress_type = compression
    target.comment = source.comment
    target.extra = source.extra
    target.create_system = source.create_system
    target.create_version = source.create_version
    target.extract_version = source.extract_version
    target.external_attr = source.external_attr
    target.internal_attr = source.internal_attr
    target.flag_bits = source.flag_bits
    return target


def sanitize(path: Path, fixture_author: str) -> None:
    resolved = path.resolve(strict=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f"{resolved.name}.sanitized-",
        suffix=".tmp",
        dir=resolved.parent,
    )
    os.close(handle)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(resolved, "r") as source:
            entries = source.infolist()
            if not entries or entries[0].filename != "mimetype":
                raise ValueError("ODT mimetype is not the first package entry")
            with zipfile.ZipFile(temporary, "w") as target:
                for entry in entries:
                    compression = (
                        zipfile.ZIP_STORED
                        if entry.filename == "mimetype"
                        else zipfile.ZIP_DEFLATED
                    )
                    data = source.read(entry)
                    if entry.filename == "meta.xml":
                        data = sanitize_metadata(data, fixture_author)
                    target.writestr(clone_info(entry, compression), data)
        os.replace(temporary, resolved)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True, type=Path)
    parser.add_argument("--fixture-author", default="LongEdit E1B Audit")
    args = parser.parse_args()
    sanitize(args.path, args.fixture_author)


if __name__ == "__main__":
    main()
