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
    sheet = document.getSheets().getByName("Pivot")
    tables = sheet.getDataPilotTables()
    names = list(tables.getElementNames())
    if len(names) != 1:
        raise RuntimeError(f"expected one Pivot on Pivot sheet, found {len(names)}")
    pivot = tables.getByName(names[0])
    output = pivot.getOutputRange()
    output_range = (
        f"{a1_column(output.StartColumn)}{output.StartRow + 1}:"
        f"{a1_column(output.EndColumn)}{output.EndRow + 1}"
    )
    return pivot, {
        "pivotCount": len(names),
        "pivotName": names[0],
        "outputRange": output_range,
        "keyCell": "I12",
        "keyValue": sheet.getCellRangeByName("I12").getValue(),
    }


def main():
    if len(sys.argv) != 4:
        raise RuntimeError("usage: verify-s8-7e3g-libreoffice-pivot.py PORT MODE XLSX")
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
            property_value("ReadOnly", False),
            property_value("UpdateDocMode", 3),
        ),
    )
    if document is None:
        raise RuntimeError("LibreOffice could not open the multi-axis Pivot workbook")
    try:
        pivot, before = inspect_pivot(document)
        refreshed = False
        if mode == "refresh-save":
            pivot.refresh()
            document.calculateAll()
            document.store()
            refreshed = True
        elif mode != "reopen":
            raise RuntimeError(f"unsupported mode: {mode}")
        _, after = inspect_pivot(document)
        if (
            after["pivotName"] != "MultiAxisPivot"
            or after["outputRange"] != "A3:I12"
            or after["keyValue"] != 424
        ):
            raise RuntimeError(f"multi-axis Pivot semantic drift after {mode}: {after}")
        print(
            json.dumps(
                {
                    "mode": mode,
                    "refreshed": refreshed,
                    "before": before,
                    "after": after,
                },
                ensure_ascii=False,
            )
        )
    finally:
        document.close(True)
        desktop.terminate()


if __name__ == "__main__":
    main()
