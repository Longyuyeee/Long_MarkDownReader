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


def a1_column(index):
    name = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def inspect_pivot(document):
    sheet = document.getSheets().getByName("Tabelle2")
    tables = sheet.getDataPilotTables()
    names = list(tables.getElementNames())
    if len(names) != 1:
        raise RuntimeError(f"expected one Pivot on Tabelle2, found {len(names)}")
    pivot = tables.getByName(names[0])
    output = pivot.getOutputRange()
    key_cell = f"{a1_column(output.EndColumn)}{output.EndRow + 1}"
    return sheet, pivot, {
        "pivotCount": len(names),
        "pivotName": names[0],
        "outputRange": (
            f"{a1_column(output.StartColumn)}{output.StartRow + 1}:"
            f"{a1_column(output.EndColumn)}{output.EndRow + 1}"
        ),
        "keyCell": key_cell,
        "keyValue": sheet.getCellRangeByName(key_cell).getValue(),
    }


def main():
    if len(sys.argv) != 5:
        raise RuntimeError(
            "usage: verify-s8-7e3c-libreoffice-pivot.py "
            "PORT MODE XLSX KEY_VALUE"
        )
    port = int(sys.argv[1])
    mode = sys.argv[2]
    workbook_path = pathlib.Path(sys.argv[3]).resolve()
    expected_value = float(sys.argv[4])
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
            property_value("ReadOnly", False),
            property_value("UpdateDocMode", 3),
        ),
    )
    if document is None:
        raise RuntimeError("LibreOffice could not open the Pivot workbook")
    try:
        sheet, pivot, before = inspect_pivot(document)
        refreshed = False
        if mode == "refresh-save":
            pivot.refresh()
            document.calculateAll()
            document.store()
            refreshed = True
        elif mode != "reopen":
            raise RuntimeError(f"unsupported mode: {mode}")
        _, _, after = inspect_pivot(document)
        if abs(after["keyValue"] - expected_value) > 1e-9:
            raise RuntimeError(f"Pivot semantic drift after {mode}: {after}")
        print(json.dumps({
            "mode": mode,
            "refreshed": refreshed,
            "before": before,
            "after": after,
        }, ensure_ascii=False))
    finally:
        document.close(True)
        desktop.terminate()


if __name__ == "__main__":
    main()
