# UX-50F / EA-3C 外部 ODS、ODP 结构化只读预览审计

日期：2026-08-07

## 本阶段结论

EA-3C 已完成。ODS 与 ODP 现在可由“打开外部文件”、Windows 启动参数或用户逐项选择的默认应用入口直接进入 LongEdit 的结构化只读工作区。两类格式复用资料库内已有的有界解析器，但使用独立外部授权命令，不要求伪造知识库路径，也不写回源文件。

外部打开能力现为：

- `edit`：23 类 Markdown、文本、代码和结构化源码，只有点击保存才写回。
- `preview`：图片、视频、PDF、ODS、ODP 共 5 类，只读打开且永不写回。

## 需求对齐

- ODS 提供工作表、单元格、公式缓存值、搜索、定位和滚动位置恢复；不计算公式。
- ODP 提供幻灯片顺序、文本、备注线索、图片数量、搜索和定位；复杂版式、动画和媒体继续明确降级。
- 外部标题显示“外部文件 · 只读 · 不会写回”，纳入统一标签会话，并提供返回资料库入口。
- 新增 `read_external_odf_content_document`；命令只接受已经由用户授权且注册为 `preview` 的 `.ods/.odp` 文件。
- 外部命令与资料库命令最终复用同一只读解析路径，读取后再次核对源字节，检测到变化即失败。
- 两类格式均无 writer、无保存按钮、无转换操作，不执行宏、不跟随外部链接，也不加载嵌入内容。
- 64 MiB 文件预算保持不变；外部预览本身不把文件加入知识库索引。
- 安装器关联仍只有 `.md/.markdown`，不会自动接管 ODS 或 ODP。

## 自动化证据

- `check:external-odf-preview`：通过，锁定 ODS/ODP 授权、只读界面、源字节不变和零新增关联。
- `check:e1c-ods-odp-contract`：通过，资料库内 ODS/ODP 读取与索引合约未回退。
- `check:external-file-workspace`、`check:external-media-preview`、`check:external-pdf-preview`：通过。
- `vue-tsc --noEmit` 与 Vite 生产构建：通过。
- `commands::odf_content::tests`：2/2 通过，覆盖真实 ODS/ODP fixture 零修改和格式门禁。
- `services::external_file_access::tests`：4/4 通过，覆盖 ODS/ODP preview 授权与禁止 edit。
- `cargo check --locked`：通过。

## 保留边界

- 本阶段没有开放 ODS/ODP 编辑、另存副本、公式重算、幻灯片播放或嵌入对象执行。
- ODT 仍需单独核对生产者兼容和解析边界，不能因为同属 OpenDocument 就自动登记为外部预览。
- DOCX、PPTX、XLSX 存在保存、可靠副本或复杂对象语义，继续单独审计，不随本阶段批量开放。
- 安装态仍需复测双击 ODS/ODP、单实例二次打开、关闭标签、返回资料库和损坏/超限文件失败语料。

## 下一入口

进入 EA-3D：单独审计 ODT 的外部只读资格与生产者门禁。先确认真实 LibreOffice、Microsoft Office 和 WPS 生产样本的解析结果、资源预算、外部链接与嵌入对象降级策略，再决定是否登记为 `preview`；在证据齐备前保持 `import`。DOCX、PPTX、XLSX 继续保持原策略。
