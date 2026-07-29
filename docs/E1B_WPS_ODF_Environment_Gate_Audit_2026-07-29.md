# E1B WPS ODF 环境门禁加固审计

> 审计日期：2026-07-29
> 代码基线：`main` / `1695f7e`
> 阶段状态：E1B 实现完成，生产者门禁仍为 2/3
> 产品状态：`.odt` 继续未注册，`write=false`

## 1. 本批结论

本批没有降低 E1B 的 Word、WPS、LibreOffice 三生产者要求，也没有把无效 WPS 输出改名冒充 ODT。当前 WPS Writer `12.1.0.26895` 仍不具备可审计的原生 ODT 写出能力，因此 E1B 不能关闭。

本批完成的是门禁工程化：新增隔离环境预检、固定机器阻断证据、修正 fixture 生成器验证顺序，并保证所有失败探测删除临时输出。以后只有 WPS 实际生成 ODT ZIP 时，fixture 生成器才会继续执行净化、隐私检查和同生产者复开。

## 2. 真实环境证据

机器证据：`fixtures/odt/producers/wps-writer-blocker.json`

| 检查项 | 结果 |
|---|---|
| WPS 产品版本 | `12,1,0,26895` |
| WPS COM Build | `12.1.0.26895` |
| COM ProgID | `KWPS.Application` |
| 注册文件转换器 | `0` |
| 安装目录内 ODF/OpenDocument 命名组件 | `0` |
| `SaveAs2(..., 23)` 输出大小 | `86,016` bytes |
| 输出文件头 | `d0 cf 11 e0 a1 b1 1a e1` |
| 实际输出类型 | OLE Compound Document |
| ODT ZIP 判定 | 失败 |
| 临时输出清理 | 通过 |

该结果与 2026-07-28 的人工审计一致，但现在已成为可重复生成、可由 CI 合同校验的机器事实。

## 3. 实现内容

1. 新增 `scripts/audit-e1b-wps-odf-environment.ps1`：
   - 从注册表或命令路径定位 WPS；
   - 记录版本、COM Build、文件转换器数量和 ODF 命名组件；
   - 在随机临时目录对真实 DOCX 执行 `SaveAs2(..., 23)`；
   - 区分 ODT ZIP、OLE 复合文档和未知二进制；
   - 始终关闭 COM 对象并删除临时目录；
   - `-RequireReady` 模式在非 ODT 输出时稳定失败。
2. `generate-e1b-odt-producer-fixtures.ps1` 在 WPS 导出前执行强制预检。
3. Word、WPS、LibreOffice 三条路径都先验证 ODT ZIP，再调用元数据净化器，净化后再次复验。
4. 生产者矩阵与 `shared/odt-read-contract.json` 记录 WPS 阻断证据路径。
5. `check:odt-read-contract` 校验阻断证据的版本、状态、COM、转换器、组件、文件头、输出类型和清理结果。

## 4. 官方资料复核

WPS 当前帮助页仍声称可通过 ODF add-in 打开和保存 ODF，并链接到 SourceForge 的 OpenXML/ODF Translator 项目：

- <https://help.wps.com/articles/odf-ods-odp-document-in-wps-office>
- <https://sourceforge.net/projects/odf-converter/>

该项目页面显示最后更新日期为 `2013-03-28`，目标是 ODF 1.1 与 ECMA Office OpenXML 的旧式转换器。没有证据证明它与当前 WPS 12 安装匹配，也没有当前维护和安全资格，因此本批不安装该组件。

## 5. 验证结果

- `npm.cmd run audit:e1b-wps-odf-environment`：成功生成阻断证据。
- fixture 生成器 `-Producer wps`：按预期以明确 OLE 原因失败。
- 无 `wps-writer.odt` 无效残留。
- 无 `longedit-e1b-wps-odf-*` 临时目录残留。
- `npm.cmd run check:odt-read-contract`：通过，状态保持 2/3。
- 完整 `npm.cmd run ci:check` 复跑通过：Rust `367/367`、工作簿性能 `1/1`、100 MiB PDF 范围基准和生产依赖 `0` 漏洞。

第一次完整门禁中，未改动的 50k 行 Table 性能测试在本机负载下出现一次 `2.149s` 超时；原测试单独复跑为 `0.60s`，随后完整门禁通过。本批没有修改 Table 实现或放宽性能阈值。

## 6. 下一入口

E1B 的下一动作仍是获得以下任一可信环境：

1. 与当前 WPS 版本明确匹配、来源可信且可审计的 ODF 组件；或
2. 另一台已具备原生 ODT 打开、保存和重开能力的 WPS 环境。

环境就绪后执行：

```powershell
npm.cmd run audit:e1b-wps-odf-environment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-e1b-odt-producer-fixtures.ps1 -Producer wps
```

只有真实输出为 ODT ZIP、WPS 原生重开成功、三生产者达到 3/3，并补齐 LongEdit 桌面打开/搜索/定位/主题证据后，才登记 `.odt` 为 `preview-only` 并进入 E1C。
