# S8-7E3G-C XLSX Pivot 多层轴 LibreOffice 往返审计

## 1. 阶段结论

S8-7E3G 生产者矩阵已从 `1/3` 推进到真实的 `2/3`。LibreOffice Calc 已对固定 LongEdit 多层轴基线完成刷新、保存、退出、独立配置的新进程重开和 LongEdit 反向语义复读。

当前已验证：

- WPS Spreadsheets
- LibreOffice Calc

仍待验证：

- Microsoft Excel

因此多层轴可靠新副本仍不开放，原文件覆盖、已有目标覆盖、Page Fields、外部数据和切片器继续阻断。

## 2. 隔离生产者环境

本机没有预装 LibreOffice，且当前进程没有机器级 MSI 安装权限。审计采用以下受控方式建立测试运行时：

1. 从 The Document Foundation 官方下载 LibreOffice `26.2.5.2` MSI；
2. 校验 MSI SHA-256：
   `f15ba07bfcb0186986cf3171063506f5d207c11f8cc051ba0d135209e9e915f9`；
3. 使用 MSI 管理映像模式解包到系统临时目录；
4. 不写系统安装注册表，不修改默认文件关联；
5. 通过 `LONGEDIT_LIBREOFFICE_ROOT` 指向隔离的 `program` 目录；
6. 完成证据后删除临时运行时与安装包。

验证器同时支持标准安装路径和显式隔离路径：

```powershell
$env:LONGEDIT_LIBREOFFICE_ROOT = "<LibreOffice program directory>"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer libreoffice-calc
```

## 3. LibreOffice 固定证据

- 生产者：LibreOffice Calc
- 版本：`26.2.5.2`
- 构建：`cd7284b4cbbfeb507e630c1aac019f4157393acb`
- 输出：`fixtures/xlsx/output-reopen/s8-7e3g-libreoffice-calc.xlsx`
- 字节数：`12257`
- SHA-256：`acb9bbbeb102152337c0f4bc5c94ce18be64a398da6bb5a336ad78d504c2b3d4`
- 刷新：通过
- 保存：通过
- 独立配置和新进程重开：通过
- 修复提示：未观察到
- LongEdit 反向复读：通过
- Pivot：`MultiAxisPivot`
- 行字段 / 列字段 / 数据字段 / 页面字段：`2 / 2 / 1 / 0`
- 输出范围：`A3:I12`
- 输出单元格：`80`
- 预览分组：`16`
- Grand Total：`I12 = 424`

UNO 负责验证生产者会话中的 Pivot 身份、输出范围和关键总计；字段角色数量由生产者保存后的 OOXML 经 LongEdit 独立复读确认，避免把 UNO 未公开的 DataPilot 描述接口当作证据。

## 4. 增量矩阵

证据矩阵：

- `docs/evidence/s8-7e3g-xlsx-pivot-multi-axis-roundtrip/matrix.json`

当前状态：

- `status = partial`
- `verifiedCount = 2`
- `requiredCount = 3`
- `reliableSaveAllowed = false`
- `sourceOverwriteAllowed = false`

剩余阻断条件：

- Microsoft Excel 环境可用；
- 三生产者往返达到 `3/3`。

## 5. 能力边界

本阶段只增加真实生产者兼容性证据，没有改变用户可写能力：

- 多层轴可靠新副本：阻断；
- 原文件覆盖：阻断；
- 已存在目标覆盖：阻断；
- Page Fields：阻断；
- 外部数据：阻断；
- 切片器：阻断。

## 6. 下一步

下一阶段只补 Microsoft Excel：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-s8-7e3g-xlsx-pivot-multi-axis-roundtrip.ps1 -Producer microsoft-excel
```

达到 `3/3` 后先完成完整矩阵审计和生产者输出提交，再单独进入多层轴同目录可靠新副本白名单评估。即使三生产者通过，也不自动开放原文件覆盖。

## 7. 验证入口

```powershell
npm.cmd run check:s8-7e3g-xlsx-pivot-multi-axis-roundtrip
npm.cmd run check:workbook-contract
npm.cmd run ci:check
```
