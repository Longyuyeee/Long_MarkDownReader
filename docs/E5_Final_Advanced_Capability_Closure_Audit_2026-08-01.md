# E5 高级能力最终收口审计

日期：2026-08-01

版本：`0.7.0`

审计基线：`313e8701825c29e69de9d0592df1ac462d3921a4`

## 结论

E5 已完成。当前高级能力、基础产品验收、格式注册表、安全降级合同和发布边界已经对齐，可以停止继续横向扩展大型功能，进入 U1 未签名内部候选安装包阶段。

本次收口不改变正式发布状态：`releaseCandidate=false`。

## 已冻结能力

- 41 类注册格式、74 个扩展名；
- 29 类 `verified`、6 类 `verified-with-limitations`、6 类 `external-dependency`；
- 日常管理、基础编辑、统一右侧工作区和知识组织已通过产品能力冻结验收；
- 知识图谱项目笔记、动态集合和关系生命周期已经进入管理主流程；
- E1A 动态数组仅提供受限内存预览，不写用户文件；
- E2A SVG 安全源码编辑和 E2B Draw.io 结构化基础编辑已经完成；
- PDF、Office、WPS 和复杂工作簿继续遵守只读、另存副本、有限写回或外部打开边界。

## 完整质量门禁

在审计基线上执行 `npm run ci:check`，实际结果为：

- 前端 TypeScript 检查与生产构建通过；
- 格式、主题、发布、数据恢复、安全降级和专项证据合同通过；
- Rust 功能回归：431 passed、0 failed；
- 工作簿性能回归：1 passed、0 failed；
- 100 MiB PDF 范围读取基准：57 ms，仅请求约 255.9 KiB；
- 生产依赖漏洞：0。

机器证据位于 `docs/evidence/e5-final-capability-closure/audit-manifest.json`。

## 未完成但不应伪装为完成的事项

- E1B 数组公式生产者证据仍为 1/3；
- E1C 多层 Pivot 生产者证据仍为 2/3；
- WPS ODF/ODT 生产者证据仍为 2/3；
- 已签名 Windows 10/11 安装运行证据仍为 0/2；
- PDF 正文等价编辑、复杂 Office/WPS 内核编辑、云协作和企业权限仍属于延后评估范围。

这些事项继续保持 fail-closed，不影响形成未签名内部候选包，但会阻止正式 RC 晋级。

## 下一阶段：U1

U1 只负责生成并登记未签名内部候选安装包：

1. 从当前通过 E5 的 `main` 构建 MSI 和 NSIS；
2. 记录源提交、版本、文件大小和 SHA-256；
3. 校验安装包确实未签名，并明确标记为 internal-only；
4. 在当前可用 Windows 环境执行非破坏性预检；
5. 不修改 `releaseCandidate=false`，不替代 Windows 10/11 隔离证据。

U1 完成后进入 U2 本机安装生命周期验证，再把结果交给既有 R5N 外部签名与双 Windows 通道。
