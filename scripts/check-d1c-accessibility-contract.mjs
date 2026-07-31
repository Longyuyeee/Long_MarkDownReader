import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  throw new Error(`[d1c-accessibility] ${message}`);
};
const requireText = (source, text, label) => {
  if (!source.includes(text)) fail(`${label} is missing`);
};

const table = read("src/views/TableView.vue");
const diagram = read("src/views/DiagramStudio.vue");
const canvas = read("src/views/CanvasView.vue");
const pdf = read("src/views/PdfView.vue");
const pptx = read("src/views/PptxReaderView.vue");
const json = read("src/views/JsonEditorView.vue");

requireText(table, 'class="view-tab-delete"', "keyboard-focusable table view deletion");
requireText(table, ':aria-label="`删除视图 ${view.name}`"', "named table view deletion");
if (table.includes('<i v-if="views.length > 1"')) {
  fail("table view deletion must not use a non-focusable i element");
}

requireText(diagram, ':aria-pressed="showStructure"', "diagram structure toggle state");
requireText(diagram, 'role="dialog" aria-label="导出图表"', "named diagram export dialog");
requireText(canvas, 'aria-label="缩小画布"', "named canvas zoom control");
requireText(json, ':aria-pressed="viewMode === \'source\'"', "JSON source mode state");

requireText(pdf, 'aria-label="上一页"', "named PDF previous-page control");
requireText(pdf, 'aria-label="下一页"', "named PDF next-page control");
requireText(pdf, "annotationColorLabel(color)", "named PDF color controls");
requireText(pdf, 'role="tablist"', "PDF sidebar tablist semantics");
requireText(pdf, 'aria-label="PDF 侧栏"', "named PDF sidebar tabs");
requireText(pdf, "moveSidebarTabFocus", "PDF sidebar arrow-key navigation");

requireText(pptx, 'aria-label="演示文稿放映"', "named PPTX presenter dialog");
requireText(pptx, 'tabindex="-1"', "focusable PPTX presenter dialog");
requireText(pptx, '@keydown.tab.prevent.stop="trapPresenterFocus"', "PPTX presenter focus trap");
requireText(pptx, "else presentButtonRef.value?.focus()", "PPTX presenter focus return");

console.log(
  "D1C accessibility contract passed: named controls, exposed toggle state, keyboard-focusable table actions, and PPTX presenter focus lifecycle are present.",
);
