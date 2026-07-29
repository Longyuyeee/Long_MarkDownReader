import json
import pathlib
import sys

import uno
from com.sun.star.beans import PropertyValue


def property_value(name, value):
    item = PropertyValue()
    item.Name = name
    item.Value = value
    return item


def main():
    if len(sys.argv) != 4:
        raise RuntimeError("usage: x3-b5-libreoffice-array-roundtrip.py PORT MODE XLSX")
    port = int(sys.argv[1])
    mode = sys.argv[2]
    workbook_path = pathlib.Path(sys.argv[3]).resolve()
    local_context = uno.getComponentContext()
    resolver = local_context.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_context
    )
    context = resolver.resolve(
        f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext"
    )
    desktop = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )
    document = desktop.loadComponentFromURL(
        uno.systemPathToFileUrl(str(workbook_path)),
        "_blank",
        0,
        (
            property_value("Hidden", True),
            property_value("ReadOnly", mode == "reopen"),
            property_value("UpdateDocMode", 3),
        ),
    )
    if document is None:
        raise RuntimeError("LibreOffice could not open the array-formula workbook")
    try:
        sheet = document.getSheets().getByName("Array Boundary")
        before = {
            "sheet": sheet.getName(),
            "legacyAnchorFormula": sheet.getCellRangeByName("B2").getFormula(),
            "dynamicAnchorFormula": sheet.getCellRangeByName("D2").getFormula(),
        }
        if mode == "save":
            document.store()
        elif mode != "reopen":
            raise RuntimeError(f"unsupported mode: {mode}")
        print(
            json.dumps(
                {
                    "mode": mode,
                    "saved": mode == "save",
                    "sheet": sheet.getName(),
                    "before": before,
                },
                ensure_ascii=False,
            )
        )
    finally:
        document.close(True)
        desktop.terminate()


if __name__ == "__main__":
    main()
