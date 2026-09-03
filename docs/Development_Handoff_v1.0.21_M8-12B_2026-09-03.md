# Long编辑 v1.0.21 M8-12B 暂停交接审计

日期：2026-09-03

## 当前结论

开发已按用户要求暂停在 **M8-12B 官方 v1.0.20 → v1.0.21 应用内更新观察待执行**。当前 `main` 已推送至 `bbe4c03534ebcf06acbf90239cc53444f08b68ae`；工作区在本交接文档创建前干净并与 `origin/main` 一致。

公开版本、运行时版本仍为 `1.0.21`，下一开发目标仍登记为 `1.0.22`。尚未开始 v1.0.22 产品功能开发，未提升任何版本，未重建、替换或修改 v1.0.21 Tag、Release、NSIS、MSI 与校验文件。

## 本轮已经完成并推送

### M8-12A Quality Gate 纠偏

- 提交 `49fcc52e65d3accccde190a2873f0b2fa0aa6fea` 修复通用 Quality Gate 的浅克隆问题，显式获取完整历史和标签。
- 同批补齐 Node 22 直接加载 TypeScript 图谱工具时的类型剥离运行声明。
- 本地完整 `npm run ci:patch-release` 通过：前端 6,276 modules、Rust check 通过、生产依赖 0 漏洞。
- 远端 Quality Gate [`33760803962`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33760803962) 成功。
- 回执文档提交为 `4ad577dc572136f07a9c15f45668b23f3121e0b1`。

### M8-12B 托管观察合同

- 提交 `bbe4c03534ebcf06acbf90239cc53444f08b68ae` 新增：
  - `.github/workflows/v121-managed-updater-lifecycle.yml`
  - `shared/v121-managed-updater-lifecycle-policy.json`
  - `scripts/check-v121-managed-updater-lifecycle.mjs`
  - `scripts/import-v121-managed-updater-evidence.mjs`
  - M8-12B 审计说明及当前开发总审计接线
- 专项合同检查和当前开发总审计通过。
- 该提交远端 Quality Gate [`33762171375`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33762171375) 成功，耗时约 6 分钟。

## 当前准确的未完成项

- `V1.0.21 Managed Updater Lifecycle` **从未触发**，GitHub 运行列表为空。
- `shared/v121-managed-updater-lifecycle-policy.json` 保持 `hosted-execution-pending`。
- `docs/evidence/v1.0.21-managed-updater/` 尚不存在，因为没有可接受的托管证据。
- M8-12B 审计文档保持“托管执行待完成”。
- M8 尚未完全关闭，不能把候选安装生命周期误写成正式应用内更新观察。
- v1.0.22 范围选择审计尚未开始，更没有冻结产品实现切片。

## 下一台电脑的唯一接续顺序

1. 拉取 `origin/main`，确认至少包含 `bbe4c03534ebcf06acbf90239cc53444f08b68ae`，并确认工作区干净。
2. 复核 Quality Gate `33762171375` 为成功，不要再次修改或重建 v1.0.21。
3. 手动触发 `.github/workflows/v121-managed-updater-lifecycle.yml`，且只运行一次。
4. 等待 GitHub 托管的一次性 Windows 环境完成公开 v1.0.20 → v1.0.21 更新观察。
5. 只有取得 12/12、失败 0 后，下载该次运行的 `v121-managed-updater-lifecycle-<run-id>` artifact。
6. 人工复核三张稳定截图，确认更新发现/确认、更新后首次启动及最新版状态；不得把自动标记代替视觉复核。
7. 使用 `scripts/import-v121-managed-updater-evidence.mjs` 导入九个脱敏证据文件，填写真实 run、artifact、digest、HEAD 与导入时间。
8. 将 `shared/v121-managed-updater-lifecycle-policy.json`、M8-12B 审计、开发版本政策、社区发布政策和本交接入口更新为真实完成状态。
9. 运行 `npm run check:v121-managed-updater-lifecycle`、`npm run check:current-development-audit` 和完整 `npm run ci:patch-release`；通过后独立提交、推送并确认远端 Quality Gate。
10. M8 完全关闭后，另建 v1.0.22 范围选择审计；一次只选择一个可真实验收的切片。

## 禁止边界

- 不得重建或替换已公开的 v1.0.21 安装包。
- 不得移动、重建或强制覆盖 v1.0.20/v1.0.21 Tag。
- 不得在本机用户环境执行安装、覆盖或卸载；更新观察只允许 GitHub 托管的一次性 Windows 环境。
- 不得导入用户真实资料，只允许工作流生成的合成、脱敏证据。
- 托管运行失败时必须记录真实失败和纠偏，不得手工伪造通过状态。
- M8-12B 未关闭前不得提升到 v1.0.22 或进入新功能开发。
