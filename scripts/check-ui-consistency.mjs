import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];
const fail = (message) => failures.push(message);

const formats = read("src/config/fileFormats.ts");
const library = read("src/views/LibraryMode.vue");
const app = read("src/App.vue");
const home = read("src/views/WorkspaceHome.vue");
const tokens = read("src/styles/tokens.scss");

for (const route of ["Canvas", "Pdf", "Table", "Workbook", "Diagram", "MindMap", "OdfReader"]) {
  if (!formats.includes(`'${route}'`)) fail(`embedded route is missing: ${route}`);
  if (!library.includes(`${route}: defineAsyncComponent`)) fail(`embedded component is missing: ${route}`);
}

for (const token of ["--workspace-toolbar-height", "--workspace-control-height", "--workspace-status-height"]) {
  if (!tokens.includes(token)) fail(`workspace token is missing: ${token}`);
}

for (const source of [app, home]) {
  if (!source.includes('/icon.png')) fail("application shell must use the shared brand icon");
}

for (const path of [
  "src/views/CanvasView.vue",
  "src/views/PdfView.vue",
  "src/views/TableView.vue",
  "src/views/WorkbookView.vue",
  "src/views/DiagramStudio.vue",
]) {
  const source = read(path);
  if (/\b(?:width|height):\s*100v[wh]\b/.test(source)) {
    fail(`embedded workspace still depends on viewport units: ${path}`);
  }
}

if (failures.length) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("UI consistency contract passed: shared branding, workspace tokens, embedded routes, and container-relative sizing are aligned.");
