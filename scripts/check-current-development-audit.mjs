import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(
  root,
  "docs",
  "Current_Development_Audit_and_Next_Plan_2026-07-31.md",
);
const statusPath = path.join(
  root,
  "docs",
  "Current_Development_Status_and_Next_Plan_2026-07-30.md",
);
const matrixPath = path.join(root, "shared", "release-capability-matrix.json");
const environmentPath = path.join(
  root,
  "docs",
  "evidence",
  "r5n-external-release",
  "environment-audit.json",
);
const promotionPath = path.join(
  root,
  "docs",
  "evidence",
  "r5n-release-promotion",
  "preflight.json",
);

const fail = (message) => {
  throw new Error(`[current-development-audit] ${message}`);
};

for (const requiredPath of [
  auditPath,
  statusPath,
  matrixPath,
  environmentPath,
  promotionPath,
]) {
  if (!fs.existsSync(requiredPath)) {
    fail(`missing required source: ${path.relative(root, requiredPath)}`);
  }
}

const audit = fs.readFileSync(auditPath, "utf8");
const status = fs.readFileSync(statusPath, "utf8");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const environment = JSON.parse(fs.readFileSync(environmentPath, "utf8"));
const promotion = JSON.parse(fs.readFileSync(promotionPath, "utf8"));

const readinessCounts = matrix.formats.reduce((counts, item) => {
  counts[item.readiness] = (counts[item.readiness] ?? 0) + 1;
  return counts;
}, {});

const expectedFacts = [
  ["39 类注册格式", matrix.formats.length === 39],
  ["27 类已验证", readinessCounts.verified === 27],
  [
    "6 类已验证但存在明确限制",
    readinessCounts["verified-with-limitations"] === 6,
  ],
  ["6 类依赖外部", readinessCounts["external-dependency"] === 6],
  ["10 套发布能力配置", matrix.profiles.length === 10],
  ["对应版本：0.7.0", matrix.appVersion === "0.7.0"],
  ["当前发布阶段：R5N", environment.stage === "R5N"],
  ["5 个阻塞项", environment.blockers.length === 5],
  ["`releaseCandidate=false`", matrix.releaseCandidate === false],
  [
    "`promotionEligible=false`",
    promotion.promotionEligible === false,
  ],
  [
    "`automatedGatesPassed=false`",
    promotion.automatedGatesPassed === false,
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
  "## 2. 与初始需求的对齐结果",
  "## 4. 关键子系统审计",
  "### 4.2 知识图谱",
  "## 5. 发布与质量状态",
  "## 6. 后续开发阶段",
  "## 8. 收口定义",
];

for (const section of requiredSections) {
  if (!audit.includes(section)) {
    fail(`audit is missing required section: ${section}`);
  }
}

const auditFileName =
  "Current_Development_Audit_and_Next_Plan_2026-07-31.md";
if (!status.includes(auditFileName)) {
  fail("current status document does not link to the comprehensive audit");
}

console.log(
  `[current-development-audit] PASS formats=${matrix.formats.length} verified=${readinessCounts.verified} limited=${readinessCounts["verified-with-limitations"]} external=${readinessCounts["external-dependency"]} blockers=${environment.blockers.length}`,
);
