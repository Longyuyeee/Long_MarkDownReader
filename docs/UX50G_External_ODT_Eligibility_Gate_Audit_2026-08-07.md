# UX-50G / EA-3D 外部 ODT 资格门禁审计

日期：2026-08-07

## 本阶段结论

EA-3D 审计与安全加固已完成，但 ODT **不开放外部预览**。当前机器事实源 `shared/odt-read-contract.json` 仍为 `checkpoint`：Microsoft Word 与 LibreOffice Writer 已验证，WPS Writer 因缺少可工作的 ODF 输出组件而保持阻断，生产者门禁为 2/3。

ODT 的发布合同要求生产者矩阵、桌面证据、机器合同和共享格式注册表在 3/3 后原子切换。现在提前把 `.odt` 登记为 `preview` 会绕过既有发布边界，因此本阶段保持未注册、无外部命令、无安装器关联。

## 已完成加固

- ODT 有界解析、内部图片提取完成后，后端重新读取同一源文件并逐字节比对。
- 只读期间源文件发生变化会立即失败，不返回可能已经过期的解析结果。
- 返回报告新增 `sourcePreserved`，现有 ODT 工作区状态栏显示“源文件未修改”。
- Word 与 LibreOffice 两个真实 ODT fixture 新增命令层零修改测试。
- 新增 `check:external-odt-gate`，持续锁定 2/3 生产者状态、ODT 未注册、无外部命令、无系统关联和源文件复核。
- 门禁加入 `check:current-development-audit`，后续变更无法静默绕过。

## 需求对齐

- 满足“所有格式显式保存才写回”的上位原则：ODT 当前没有编辑或保存能力，读取路径也验证源文件不变。
- 没有因为 ODS/ODP 已开放就推断 ODT 同样安全；每类格式继续独立审计。
- 没有把实现完成、两家生产者通过或桌面截图写成三家生产者发布完成。
- 安装器关联仍只有 `.md/.markdown`，不会接管 ODT。
- 当前外部能力数字保持 23 类 `edit` 与 5 类 `preview`。

## 自动化证据

- `check:external-odt-gate`：通过。
- `check:odt-read-contract`：通过，结论为 `checkpoint`、2/3、WPS blocked、write disabled。
- `commands::odt::tests`：1/1 通过，两个已验证生产者源文件均保持不变。
- `cargo check --locked`：通过。

## 阻断关闭条件

只有以下条件全部满足，才能在同一提交中开放 ODT：

1. 在具备原生 ODT 保存能力的可信 WPS 环境生成合格 fixture。
2. WPS 同生产者原生重开通过，fixture 与交接清单 SHA-256 一致且完成隐私净化。
3. 三生产者 `closure-candidate` 桌面搜索、定位、主题、窄窗口和源文件不变证据通过。
4. `shared/odt-read-contract.json` 切换为 `released-preview`，生产者矩阵改为 3/3。
5. 同一提交原子加入只读注册表条目、外部授权命令、界面会话和专项回归。

## 下一入口

EA-3E 转向 DOCX、PPTX、XLSX 的外部策略审计。三类格式已有资料库保存或可靠副本能力，不能直接套用只读预览；应逐类判断是保持 `import`、开放只读工作区，还是提供用户明确选择的新副本流程。ODT 阻断保持为外部证据任务，不占用可继续推进的代码阶段。
