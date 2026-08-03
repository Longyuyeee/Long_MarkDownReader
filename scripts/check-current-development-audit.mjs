import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(
  root,
  "docs",
  "Development_Alignment_and_Closure_Plan_2026-08-02.md",
);
const matrixPath = path.join(root, "shared", "release-capability-matrix.json");

const fail = (message) => {
  throw new Error(`[current-development-audit] ${message}`);
};

for (const requiredPath of [auditPath, matrixPath]) {
  if (!fs.existsSync(requiredPath)) {
    fail(`missing required source: ${path.relative(root, requiredPath)}`);
  }
}

const audit = fs.readFileSync(auditPath, "utf8");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

const readinessCounts = matrix.formats.reduce((counts, item) => {
  counts[item.readiness] = (counts[item.readiness] ?? 0) + 1;
  return counts;
}, {});

const expectedFacts = [
  ["41 类格式", matrix.formats.length === 41],
  ["29 类为已验证", readinessCounts.verified === 29],
  [
    "6 类为有限能力",
    readinessCounts["verified-with-limitations"] === 6,
  ],
  ["6 类依赖外部程序", readinessCounts["external-dependency"] === 6],
  ["10 套发布能力配置", matrix.profiles.length === 10],
  ["当前版本：`1.0.1`", matrix.appVersion === "1.0.1"],
  [
    "当前能力矩阵仍保持 `releaseCandidate=false`",
    matrix.releaseCandidate === false,
  ],
  ["P0、UI-1、UI-2、UI-3、UI-4A 与 UI-4B 均已完成", true],
  [
    "当前唯一下一阶段为：**UI-4C 全面复核、事实源收敛与 `1.0.2` 发布判定**",
    true,
  ],
];

for (const [token, condition] of expectedFacts) {
  if (!condition) {
    fail(`source-of-truth no longer supports documented fact: ${token}`);
  }
  if (!audit.includes(token)) {
    fail(`audit is missing source-backed token: ${token}`);
  }
}

const requiredSections = [
  "## 1. 审计结论",
  "## 2. 最初需求基线",
  "## 3. 当前能力盘点",
  "## 4. 与原计划的对齐情况",
  "## 5. 当前 UI 收口审计",
  "## 6. 后续开发计划",
  "## 7. 最终收口定义",
  "## 8. 当前下一步",
];

for (const section of requiredSections) {
  if (!audit.includes(section)) {
    fail(`audit is missing required section: ${section}`);
  }
}

console.log(
  `[current-development-audit] PASS version=${matrix.appVersion} formats=${matrix.formats.length} verified=${readinessCounts.verified} limited=${readinessCounts["verified-with-limitations"]} external=${readinessCounts["external-dependency"]}`,
);
