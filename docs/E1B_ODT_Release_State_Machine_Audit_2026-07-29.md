# E1B ODT 发布状态机审计

> 审计日期：2026-07-29
> 审计基线：`main` / `1308a71`
> 当前阶段：E1B 检查点，生产者门禁 2/3
> 产品边界：`.odt` 未注册，`write=false`

## 1. 本批结论

E1B 的发布控制已从固定的“2/3 检查点断言”升级为可验证的双状态机器：

| 状态 | 允许的生产者证据 | 注册表 | 生命周期 |
|---|---|---|---|
| `checkpoint` | Word、LibreOffice 通过；WPS 有机器阻断证据 | 不得出现 `.odt` | `complete=false`，下一步仍为 E1B 收口 |
| `released-preview` | Word、WPS、LibreOffice 全部通过，并有 `closure-candidate` 桌面证据 | 只能登记精确的 ODT 只读预览合同 | `complete=true`，下一步为 E1C |

状态切换必须同时更新生产者矩阵、阶段合同、桌面证据和共享格式注册表。任何提前注册、半完成矩阵、证据不同步或开放写能力都会使 CI 失败。

## 2. 发布合同

未来 `.odt` 只有满足以下条件时才能登记：

1. 三个真实生产者 fixture 均通过原生 ODT 保存、同生产者复开、隐私清理、大小和 SHA-256 校验。
2. 桌面证据处于 `closure-candidate`，覆盖三个生产者、正常/紧凑布局、专业浅色/深色、搜索、定位和源字节不变。
3. 注册表条目精确为 `OdtReader`、64 MiB、`preview-only`、`saveMode=none`。
4. `read/index=supported`，`edit/create=unsupported`；writer 和 creator adapter 必须为 `null`。
5. 阶段合同同步切换为 `released-preview`、`releaseGatePassed=true`、`nextStage=E1C`。

桌面关闭候选是在产品尚未注册时采集的发布前证据，因此其 `productExposure` 继续为 `preview-route-only-unregistered`。证据通过后，注册变更与阶段合同必须在同一提交中完成。

## 3. 自动验证

- `scripts/odt-release-state-machine.mjs`：集中定义两种状态及唯一允许的 ODT 只读注册表条目。
- `scripts/check-odt-release-state-machine.mjs`：在内存中验证当前检查点和未来 3/3 发布态，并证明提前注册、可写发布、生产者不同步会被拒绝。
- `scripts/check-odt-read-contract.mjs`：继续验证真实 fixture、manifest、ZIP mimetype、阻断机器证据、解析器、命令、工作面与索引实现。
- `scripts/check-format-contract.mjs`：若将来出现 `.odt`，通用格式门禁会要求其与精确只读合同完全一致。

## 4. 当前事实与下一步

当前状态没有被抬高：WPS Writer 仍因本机缺少可信 ODF 组件而阻塞，矩阵为 2/3，`.odt` 仍未注册。下一步只执行真实 WPS 外部能力收口：

1. 在可审计环境安装或提供可信 WPS ODF 能力。
2. 生成真实 `wps-writer.odt` 与 manifest，并完成 WPS 原生复开。
3. 运行桌面审计生成三生产者 `closure-candidate` 证据。
4. 同一批原子更新矩阵、合同和只读格式注册表。
5. 完整 CI 与 GitHub Quality Gate 通过后进入 E1C。
