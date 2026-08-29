# M4D-0 临时产物与冗余证据清理选择审计

日期：2026-08-29

阶段：M4D-0

状态：通过；未删除文件，下一接续点为 M4D-1 有界生成图谱导出产物清理

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 需求与实际范围

原始 M4 要求清理本周期的临时脚本、候选输出和重复证据，同时只保留可重复生成或发布需要的文件。实际仓库不能把“名称像临时”“内容相同”直接等同于可删除：审计脚本是跨电脑复验入口；减少动效的前后截图必须逐字节相同；重复检测夹具必须真的重复；不同阶段可能有意保存相同返回画面。

本阶段以公开 `v1.0.15` 到 M4C-6 完成提交 `20ab256` 为冻结盘点范围，只建立分类和精确候选，不执行删除。

## 2. 机器盘点

| 类别 | 实际结果 |
| --- | ---: |
| 新增文件 | 931 个 Git blob 路径，58,155,445 bytes |
| 新增脚本 | 179 个：45 capture、74 check、58 run、1 invoke、1 verify |
| 新增证据文件 | 573 个 |
| 新增阶段文档 | 79 个 |
| 新增 shared 政策/事实文件 | 69 个 |
| 逐字节重复 | 8 组、16 个路径 |
| 本阶段选择删除 | 4 个生成导出负载，13,883,957 bytes |

`node_modules`、`dist`、`src-tauri/target`、`src-tauri/gen` 与 `.release-secrets` 均未进入冻结提交且已由 `.gitignore` 隔离，属于本机状态，不纳入跨电脑 Git 清理范围，也没有为了数字好看而删除本机依赖或凭据目录。

## 3. 重复证据为何不删除

8 组相同 blob 已分为四类并全部保护：

- 减少动效的 before/after 相同，是“没有方向动画”的正向证据；
- 大资料库 baseline/current 相同，是重启结果等价证据；
- M0 的 `copy-a.txt` / `copy-b.txt` 是重复检测功能夹具；
- 关系来源返回、思维导图 calm/reduced、Table 定位等相同画面分别属于独立阶段合同。

这些路径即使内容相同，Git 对象库已经只保存一个 blob；删除某一路径不会减少历史 blob，反而会破坏自包含的阶段语义、证据 JSON 或 manifest 引用。因此 M4D 不选择它们。

## 4. 唯一选择的清理批次

M3C-4 通过真实 Windows 保存对话框产生以下四个中间输出：

- `full-5000.svg`：6,916,219 bytes；
- `full-5000.png`：6,255,432 bytes；
- `filtered-5000.svg`：99,887 bytes；
- `filtered-5000.png`：612,419 bytes。

四份文件的 SHA-256、字节数、节点/边数、有限几何、PNG 签名与尺寸、导出耗时都已保存在 `tier-5000.json#actual.exports`。现有 M3C-4 checker 只消费该结构化记录，不读取四个负载文件；现有 capture/runner 能重新生成它们，package、发布工作流和发布事实中也没有文件名依赖。因此它们符合“可重复生成的候选输出、已有替代证据、无发布依赖”三个条件。

## 5. 审计纠偏

首轮 Git 盘点使用换行分隔的 `git diff` / `git ls-tree`，中文路径分别被引用转义，导致 6 个夹具路径漏配；切换为 NUL 分隔后得到 931 个完整路径。随后又把 Windows 工作区 CRLF 大小与 Git blob 大小区分开，最终冻结的 58,155,445 bytes 是可跨电脑复核的仓库对象事实，没有通过调整候选范围迁就脚本。

## 6. 证据与门禁

机器证据：[`evidence/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection/inventory.json`](./evidence/post-v115-m4d0-temporary-artifact-and-redundant-evidence-cleanup-selection/inventory.json)

```text
npm run audit:post-v115-m4d0-cleanup-selection
npm run check:post-v115-m4d0-cleanup-selection
npm run check:post-v115-m4c6-controlled-conversion-exit
npm run check:development-version-identity
npm run build
git diff --check
```

## 7. 下一接续点

下一阶段固定为 **M4D-1 有界生成图谱导出产物清理**：只删除上述四个精确路径，并修改 M3C-4 runner，使未来复验在结构化指标通过后自动清除重新生成的负载文件，保留 `tier-5000.json`、三档截图、生成脚本和检查器。

M4D-1 不得删除其他脚本、截图、manifest、JSON 证据、夹具或发布文件；完成后应运行 M3C-4、M4D-0、M4C-6 和开发版本链检查，再决定是否进入 M4D 清理退出审计。
