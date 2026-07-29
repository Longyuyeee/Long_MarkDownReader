# S8-7E3B XLSX Pivot 真实生产者往返审计

> 审计日期：2026-07-29
> 分支：`main`
> 结论：标准本地 Pivot 的 LongEdit 新副本已通过 Excel、WPS、LibreOffice 3/3 真实刷新、保存、进程重启和重开

## 1. 验收范围

本阶段只验收一个行字段、一个列字段、一个 `sum` 值字段且无页面字段的本地工作表来源 Pivot。基准文件由 `xlsx-pivot-audit-copy` 调用与 Tauri 命令相同的签名、隔离摘要、原子新文件创建和写后复读事务生成，不覆盖源 fixture。

每个生产者使用独立的基准副本，执行“可写打开 → 刷新目标 Pivot → 保存 XLSX → 退出并释放进程 → 新进程只读重开 → 核对身份、范围和值”。三份生产者输出还必须由 LongEdit 重新解析。

## 2. 生产者矩阵

| 生产者 | 版本 | 刷新/保存 | 进程重启/重开 | 结果 |
|---|---|---|---|---|
| Microsoft Excel | `16.0` build `20228` | 通过 | 通过 | `A3:D7`、`D7=4` |
| WPS Spreadsheets | `12.0` build `26895` | 通过 | 通过 | `A3:D7`、`D7=4` |
| LibreOffice Calc | `26.2.4.2` | 通过 | 通过 | `A3:D7`、`D7=4` |

Excel 与 WPS 使用两个相互隔离的 COM 会话；Excel 自动化前先以 `/automation` 启动。LibreOffice 使用两个独立用户配置、UNO 端口和进程，调用 DataPilot `refresh()`、全表计算及存储。

## 3. 版本化证据

- 机器矩阵：`docs/evidence/s8-7e3b-xlsx-pivot-roundtrip/matrix.json`
- LongEdit 基准：`fixtures/xlsx/output-reopen/s8-7e3b-longedit-pivot-copy.xlsx`
- Excel 输出：`fixtures/xlsx/output-reopen/s8-7e3b-microsoft-excel.xlsx`
- WPS 输出：`fixtures/xlsx/output-reopen/s8-7e3b-wps-spreadsheets.xlsx`
- LibreOffice 输出：`fixtures/xlsx/output-reopen/s8-7e3b-libreoffice-calc.xlsx`

`check:s8-7e3b-xlsx-pivot-roundtrip` 固定校验 3/3 状态、版本、流程门禁、Pivot 快照、文件长度和 SHA-256。Rust 回归对四份 XLSX 重新执行包校验、Pivot 身份/字段/聚合复读和 `D7=4` 单元格复读。

## 4. 可重复执行

```powershell
npm run audit:s8-7e3b-xlsx-pivot-roundtrip
npm run check:s8-7e3b-xlsx-pivot-roundtrip
```

审计命令会先在临时目录重新生成 LongEdit 基准，再分别生成三份生产者输出。CI 只验证已提交证据，不要求 GitHub Runner 安装桌面办公软件。

## 5. 保持阻断

- 不覆盖源 XLSX，不替换已有目标。
- 不因此开放单轴、多度量、多层轴或页面字段保存。
- 不刷新切片器、外部连接、Power Query 或数据模型。
- 不把标准 Pivot 的 3/3 结果宣传为完整 Excel 等价或完整 Pivot 编辑。

## 6. 下一阶段

下一批进入 S8-7E3C：按单行轴、单列轴、三度量的顺序逐项扩展“新副本”保存白名单，并为每种布局重复 LongEdit 写后复读及 Excel/WPS/LibreOffice 3/3 往返。任何布局必须独立通过后才能开放；原件覆盖继续阻断。

## 7. 完整门禁

本地 `ci:check` 已通过：前端生产构建和全部格式/证据合同通过，Rust 功能测试 368/368、性能测试 1/1，100 MiB PDF 范围基准通过，生产依赖审计为 0 个漏洞。远端 GitHub Quality Gate 以本恢复点推送后的运行记录为准。
