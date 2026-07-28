# E1B ODT 生产者门禁进展审计

> 审计日期：2026-07-28
> 阶段状态：E1B 实现完成，生产者门禁 2/3 通过
> 产品状态：`.odt` 继续未注册，不进入 E1C

## 本批结论

Microsoft Word 生产者已从阻断改为通过。当前 E1B 只剩 WPS Writer 一项外部生产者门禁；在该门禁通过前，不降低三生产者要求，不开放 `.odt` 产品能力。

| 生产者 | 状态 | 审计结果 |
|---|---|---|
| Microsoft Word 2021 `16.0.20228.20110` | 通过 | Word 的 ODT 过滤器实际存在；阻塞原因是另存 ODT 后出现格式兼容性模态提示，`DisplayAlerts=0` 未抑制该提示。本批通过受控桌面流程确认提示后生成真实 ODT，净化 Office 本机身份元数据，并在完全关闭文档后由 Word 原生重开净化后的最终包。 |
| LibreOffice Writer `26.2.4.2` | 通过 | 原有 `writer8` 真实 ODT、隔离 profile 重开、隐私和哈希证据继续有效。 |
| WPS Writer `12.1.0.26895` | 阻断 | COM `SaveAs2(..., 23)` 仍输出 OLE 复合文档而非 ODT ZIP；两套本机 WPS 安装目录均未发现 ODF 组件。WPS 官方页面指向的 ODF add-in 项目最后更新于 2013-03-28，不能在未确认兼容性与安全性的情况下作为当前 WPS 12 生产门禁依据。 |

## Word 真实 fixture

- 文件：`fixtures/odt/producers/microsoft-word-16.odt`
- 清单：`fixtures/odt/producers/microsoft-word-16.json`
- 大小：`10,372` bytes
- SHA-256：`056f6fd259946921755709db4d355a12f4e93ed79cc37bd62bbf991e1d9acc7e`
- 包头：`PK`
- MIME：`application/vnd.oasis.opendocument.text`
- 必需部件：`content.xml`、`META-INF/manifest.xml`
- 内容证据：`Microsoft Word Producer Fixture`
- 隐私检查：`meta.xml` 的创建者字段已确定性改写为 `LongEdit E1B Audit`，未发现本机 Office 显示名、用户名、用户目录或工作区绝对路径
- 包规范检查：净化后 `mimetype` 继续作为 ZIP 首项并使用 `ZIP_STORED`，压缩长度与原始长度均为 `39`
- 重开检查：关闭原文档后，由 Microsoft Word 原生重新打开净化后的最终包并恢复标题、正文和结构

## 门禁状态

`shared/odt-read-contract.json` 与 `fixtures/odt/producers/matrix.json` 已同步为：

- `verified = [microsoft-word-16, libreoffice-writer]`
- `blocked = [wps-writer]`
- `complete = false`
- `releaseGatePassed = false`
- `registeredAsSupported = false`

机器检查器已改为按矩阵动态校验每个已验证生产者的清单、哈希、大小、ZIP 包头、ODT MIME、原生保存、同生产者重开和隐私状态，不再硬编码旧的 Word/WPS 双阻断结论。Rust 真实包回归也已新增 Microsoft Word fixture，验证标题、正文、表格、内部图片和 `MicrosoftWord` 生成器。

## 验证结果

完整 `npm.cmd run ci:check` 已通过：

- 前端类型检查与生产构建通过
- ODT 契约：`2/3` 生产者已验证，唯一阻断为 `wps-writer`
- Rust 功能测试：`367/367`
- Rust 性能测试：`1/1`
- 100 MiB PDF 范围基准：`205 ms`，单次请求约 `255.9 KiB`
- 生产依赖审计：`0` 漏洞

实现提交 `4a2d009` 的 GitHub Quality Gate 已通过：
<https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/30346127166>

## 下一入口

1. 获取与 WPS Writer `12.1.0.26895` 明确匹配且来源可信的 ODF 组件，或在另一台已具备原生 ODT 能力的 WPS 环境生成 fixture。
2. 生成 `wps-writer.odt` 后验证 `PK`、MIME 首项、manifest、预期文本、隐私和 WPS 原生关闭重开。
3. 三生产者全部通过后，才把 E1B 契约切换为完成并登记 `.odt` 为 `preview-only`。
4. 完成 LongEdit 桌面打开、搜索、定位、明暗主题与紧凑窗口证据，然后进入 E1C。

WPS 组件依据：[WPS 官方 ODF add-in 说明](https://help.wps.com/articles/odf-ods-odp-document-in-wps-office)、[官方页面指向的 SourceForge 项目](https://sourceforge.net/projects/odf-converter/)。
