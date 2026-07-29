# E1B WPS 跨机器关闭证据交接审计

> 审计日期：2026-07-29
> 审计基线：`main` / `f09a5a1`
> 当前阶段：E1B 检查点，生产者门禁 2/3
> 产品边界：`.odt` 未注册，`write=false`

## 1. 本批结论

当前开发机的 WPS `12.1.0.26895` 仍没有 ODF 转换器，保存探针产出 OLE 而不是 ODT ZIP。本批没有绕过该阻断，也没有进入 E1C；新增的是可信跨机器交接通道，使具备 WPS ODF 能力的另一台机器可以生成关闭证据包，并由当前开发机严格复验后接入既有桌面关闭流水线。

交接包只允许三个根级成员：

- `bundle.json`
- `wps-writer.odt`
- `wps-writer.json`

缺件、多件、重复成员、子目录或路径穿越成员全部拒绝。

## 2. 导出与导入合同

导出前重新验证：

1. WPS manifest 的阶段、生产者、产品版本、生成时间和固定文件名。
2. 原生 ODT 保存、同生产者复开和隐私清理声明均为 true。
3. ODT 大小和 SHA-256 与 manifest 完全一致。
4. ODT 具有正确首项 mimetype、唯一 `content.xml` 和固定预期文本。
5. XML 条目数、单项与总解压预算受限，并拒绝本地用户目录、Home 路径和 UNC 路径。
6. 固定源 `wps-writer.docx` 的大小和 SHA-256 写入交接清单。

导入时使用当前仓库的同名 DOCX fixture 重新核对源摘要，再核对容器清单、ODT、producer manifest 和所有摘要。只有全部通过后才发布 fixture 与 manifest；已有 WPS 证据不会被覆盖，失败导入不会留下单边文件。

## 3. 使用流程

在具备可信 WPS ODF 能力的机器上：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-e1b-odt-producer-fixtures.ps1 -Producer wps
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/export-e1b-wps-closure-bundle.ps1 -OutputPath <handoff.zip>
```

通过可信通道把包转移到当前开发机后：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/import-e1b-wps-closure-bundle.ps1 -BundlePath <handoff.zip>
npm.cmd run audit:e1b-odt-desktop
npm.cmd run check:e1b-odt-desktop-evidence
npm.cmd run check:odt-read-contract
```

桌面清单进入三生产者 `closure-candidate` 后，才能按发布状态机原子更新生产者矩阵、阶段合同和只读格式注册表。

## 4. 自动验证与信任边界

`check:e1b-wps-closure-bundle` 使用隔离临时目录构造最小合法 ODT，验证：

- 合法交接包可导出和导入。
- 已有证据不允许覆盖。
- 当前仓库源 fixture 摘要不一致时拒绝。
- 容器摘要篡改时拒绝。
- ZIP 路径穿越成员拒绝且不会写出临时目录。

SHA-256 证明固定源、manifest 和 ODT 在交接过程中的一致性，但不是数字签名，不能独立证明产出机器身份。交接操作者仍必须确认产出机器、WPS 版本、ODF 组件来源和传输渠道可信，不接受来源不明的关闭包。

## 5. 当前状态

当前仓库没有导入 WPS 关闭包，生产者门禁仍为 2/3，WPS blocker 机器证据继续有效，`.odt` 未注册。本批只关闭了跨机器工程交接缺口，没有抬高产品能力或阶段完成度。
