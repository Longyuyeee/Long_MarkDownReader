# P1-B2B0 PDF 能力登记对齐审计

审计日期：2026-08-15

阶段状态：B2B 写入前置门禁完成，下一步实现 B2B1 可靠填写副本后端

## 需求对齐

用户需要 PDF 的日常管理和基础编辑，但不应把页面级可靠副本夸大成通用正文重排。现有产品早已支持旋转、排序、排除、范围提取、合并和插页的新副本，注册表却仍写成 `edit: unsupported` / sidecar-only。B1 将其列为 B2B 前必须修正的问题，本阶段只完成事实对齐，不新增写入代码。

## 对齐结果

- 资料库 PDF 登记为 `basic-edit`、`saveMode: copy`、writer `pdf-copy`；`create` 仍不支持。
- 公开说明明确当前能力是 sidecar 加页面级可靠新副本，表单仍只有结构检查，尚未开放填写。
- 发布能力使用独立 `pdf-copy` profile，不借用 Office 或图片副本语义。
- 安全降级通道改为 `pdf-reliable-copy-isolation`：只允许 sidecar 与新副本，永不覆盖源文件。
- 外部 PDF 继续 `externalPolicy: preview`，没有 writer、表单、页面整理或 sidecar 入口。
- 签名、加密、XFA、JavaScript、动作和结构歧义阻断不变。

## 不构成的能力

本次登记不表示已经支持表单填写、任意正文编辑、PDF 创建、签名修改、源文件覆盖或外部 PDF 编辑。B2B1/B2B2 通过保存后字段树、Widget、外观、渲染和源摘要复验后，才允许把表单填写加入说明。

## 门禁

`check:p1b2b0-pdf-registry-reconciliation` 同时核对格式注册表、发布矩阵、安全降级合同与 PDF 高级编辑合同；既有格式总门禁、外部 PDF 只读合同和 B1 历史边界必须继续通过。
