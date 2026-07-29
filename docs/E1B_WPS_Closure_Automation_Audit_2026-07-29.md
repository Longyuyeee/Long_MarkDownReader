# E1B WPS 关闭自动化审计

> 审计日期：2026-07-29
> 代码基线：`main` / `483d2f2`
> 阶段状态：WPS 关闭候选自动接入能力完成；生产者门禁仍为 2/3
> 产品状态：`.odt` 继续未注册，`write=false`

## 1. 本批结论

本批关闭了 E1B 的下一项工程缺口：此前 WPS 环境即使成功生成真实 `wps-writer.odt`，桌面审计仍只认识 Word/LibreOffice，无法自动形成三生产者关闭证据。现在桌面流水线支持严格的双状态：

- `checkpoint`：当前没有 WPS fixture，继续精确验证 Word/LibreOffice 的 8 项检查和 4 张截图。
- `closure-candidate`：检测到通过 manifest 与 SHA-256 验证的 WPS fixture 后，自动升级为三生产者矩阵，并追加 WPS 明色正常搜索和暗色紧凑精确定位两项证据。

当前机器没有可信 WPS ODF 组件，因此本批没有生成、复制或伪造 WPS fixture，E1B 仍保持 2/3。

## 2. WPS 接纳合同

`run-e1b-odt-desktop-audit.ps1` 只有在 `wps-writer.odt` 与 `wps-writer.json` 同时存在时才检查 WPS；任一文件单独出现会立即失败。manifest 必须同时满足：

1. `schemaVersion=1`、`stage=E1B`、`id=wps-writer`、`producer=WPS Writer`，并提供非空产品版本。
2. fixture 与来源分别为 `wps-writer.odt`、`wps-writer.docx`。
3. 预期文本为 `WPS Writer Producer Fixture`。
4. `nativeOdtSave=true`。
5. `sameProducerReopenVerified=true`。
6. `privacySanitized=true`。
7. manifest 的文件大小与 SHA-256 和真实 fixture 完全一致。

只有全部通过后，fixture 才会复制到隔离桌面审计知识库。

## 3. 关闭候选桌面证据

WPS fixture 到位后，现有 4 个 Word/LibreOffice 场景保持不变，并自动追加：

| 场景 | 视口 | 主题 | 退出条件 |
|---|---|---|---|
| `wps-light-normal-search` | `1280x820` | professional-light | 标题唯一命中、当前命中高亮并居中 |
| `wps-dark-compact-locator` | `760x720` | professional-dark | 动态发现 `After explicit page break.` 的 `odt-block`，路由重开后精确高亮并居中 |

关闭候选 manifest 必须包含三个生产者、6 个场景、WPS 源字节不变，以及 WPS 搜索和定位专属检查。现有检查器同时精确验证两种 gate mode，不接受模糊的中间状态。

检查点模式会删除 WPS 专属截图，检查器还会枚举证据目录并拒绝任何清单外 JPG，避免不同 gate mode 的截图残留混入提交。

## 4. 当前验证

- `npm.cmd run build`：通过。
- `npm.cmd run audit:e1b-odt-desktop`：当前 `checkpoint` 模式通过。
- `npm.cmd run check:e1b-odt-desktop-evidence`：2 个生产者、8 项检查、4 张截图通过。
- `npm.cmd run check:odt-read-contract`：通过，WPS 仍 blocked，产品暴露关闭。
- `shared/odt-read-contract.json` 已记录 WPS 关闭自动化就绪，但没有修改 `complete=false`、`releaseGatePassed=false` 或生产者 2/3 状态。

## 5. 下一步

下一步仍由真实外部环境触发：

```powershell
npm.cmd run audit:e1b-wps-odf-environment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-e1b-odt-producer-fixtures.ps1 -Producer wps
npm.cmd run audit:e1b-odt-desktop
npm.cmd run check:e1b-odt-desktop-evidence
```

只有环境预检 ready、WPS 原生 ODT 保存与复开通过、桌面清单进入 `closure-candidate` 且三生产者证据完整后，才能审查生产者矩阵和产品注册表变更。自动化就绪不等于 WPS 门禁通过。

## 6. 后续发布状态机

关闭候选自动化之后，发布控制已进一步固化为双状态机器。当前 `checkpoint` 和未来 `released-preview` 都有独立正例，提前注册、误开写能力和生产者状态不同步有反例门禁。三生产者证据到位后必须原子更新矩阵、阶段合同和精确只读注册表，不再依赖人工检查中间态。详见 [`E1B_ODT_Release_State_Machine_Audit_2026-07-29.md`](./E1B_ODT_Release_State_Machine_Audit_2026-07-29.md)。
