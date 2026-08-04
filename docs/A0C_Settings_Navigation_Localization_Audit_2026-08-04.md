# A0C 设置导航与中文化审计

日期：2026-08-04  
对应需求：UX-02、UX-04

## 本阶段结论

- 设置页进入“格式能力”时携带来源与定位信息。
- 格式能力页不再固定返回资料库：设置来源返回设置并定位“格式能力”，直接访问仍返回资料库。
- 隐私诊断的入口标题、隐私说明、操作按钮、保存对话框、成功反馈和失败反馈已全部中文化。
- 新增 `check:settings-navigation-localization`，并接入 `ci:patch-release`，防止来源感知返回和中文文案回退。

## 验证结果

- `npm.cmd run build`：通过，6206 个模块完成生产构建。
- `npm.cmd run check:settings-navigation-localization`：通过。
- `npm.cmd run check:r1-release-capability-matrix`：通过，41 类格式合同保持一致。
- `npm.cmd run check:r3-data-resilience-contract`：通过，诊断包后端合同未改变。
- `git diff --check`：通过。

## 安装态复测边界

UX-02 与 UX-04 当前为“待复测”，不是“已验收”。下一安装包需要确认：

1. 从设置页打开格式能力矩阵，点击返回后回到设置页并能看到“格式能力”项。
2. 直接进入格式能力页时，返回资料库。
3. 隐私诊断导出流程中不再出现英文标题、说明或结果消息。
4. 导出的 ZIP 内容和脱敏边界与此前一致。

## 下一步

按 UX 清单继续进行设置页分类与内部审计术语降噪，重点处理 UX-01、UX-05、UX-06。
