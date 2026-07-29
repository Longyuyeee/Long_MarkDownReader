# E1B WPS ODF 最终能力诊断审计

> 审计日期：2026-07-29
> 基线：`main` / `59ff5af`
> 阶段状态：E1B 实现完成，生产者门禁保持 2/3
> 发布状态：`checkpoint`，`.odt` 未注册，`write=false`

## 1. 审计结论

本轮排除了“WPS COM 格式枚举使用错误”这一剩余疑点。

本机 WPS Writer `12.1.0.26895` 注册的 `wpsapi.dll` TypeLib 明确包含
`wdFormatOpenDocumentText=23`，因此原探针使用的格式编号正确。但三条独立保存路径均未生成
OpenDocument Text 包：

| 探针 | 请求 | 实际结果 |
|---|---|---|
| `save-as2-format-23` | `SaveAs2(path, 23)` | OLE Compound Document |
| `save-as-format-23` | `SaveAs(path, 23)` | OLE Compound Document |
| `save-as2-extension-inference` | `SaveAs2(path)`，目标扩展名 `.odt` | 非 ODT ZIP |

扩展名推断输出虽然以 `PK` 开头，但包内不存在值为
`application/vnd.oasis.opendocument.text` 的 `mimetype`，因此不得按 ODT 接纳。当前阻断不是
LongEdit 参数错误，而是这套 WPS 安装没有可工作的 ODT 写出链路。

## 2. 官方资料复核

WPS 官方帮助页仍说明 ODF 的打开、创建和保存依赖 ODF add-in，并链接到 SourceForge：

- [WPS：Open and Save to ODF, ODS and ODP Documents](https://help.wps.com/articles/odf-ods-odp-document-in-wps-office)
- [OpenXML/ODF Translator Add-in for Office](https://sourceforge.net/projects/odf-converter/)

SourceForge 项目最后更新时间为 `2013-03-28`，目标是 ODF 1.1 与 Office OpenXML 的旧式转换。
没有证据证明该组件与当前 WPS 12 兼容或仍具备受维护的安全资格，因此本轮没有下载或安装。
WPS 后续版本说明中的 ODF 支持主要描述“打开”，不能作为本机原生保存能力的证明。

## 3. 门禁加固

`scripts/audit-e1b-wps-odf-environment.ps1` 已升级为 schema v2：

1. 记录 32 位 COM 注册的 TypeLib ID、版本、文件名和 ODT 格式枚举。
2. 分别执行 `SaveAs2(23)`、`SaveAs(23)` 和扩展名推断。
3. ZIP 输出必须读取包内 `mimetype`，不再仅凭 `PK` 文件头判定 ODT。
4. 每条探针独立打开固定 DOCX，只记录稳定异常类型和 HRESULT，不写入本机绝对路径。
5. 每条输出均在审计后删除，COM 对象和随机临时目录始终清理。
6. `check:odt-read-contract` 固定校验 TypeLib、三探针、非 ODT 结果和清理状态。

机器证据位于
`fixtures/odt/producers/wps-writer-blocker.json`。

## 4. 后续入口

E1B 本机诊断已收口，不再继续猜测枚举或尝试不受维护的插件。关闭 E1B 只剩以下可信路径：

1. 在明确支持原生 ODT 保存和重开的 WPS 环境生成 `wps-writer.odt` 与生产者 manifest。
2. 使用 `export-e1b-wps-closure-bundle.ps1` 导出固定三成员交接包。
3. 在当前仓库使用 `import-e1b-wps-closure-bundle.ps1` 校验并导入。
4. 完成 WPS 同生产者复开及 LongEdit 桌面 `closure-candidate` 证据。
5. 在同一提交中把生产者矩阵、ODT 合同和格式注册表原子切换为 3/3 只读发布态。

在可信 WPS fixture 到位前，E1B 保持 2/3，不能提前进入 E1C 或暴露 `.odt`。
