# UI-F1-01 R2 生成记录

模式：内置 imagegen 编辑现有设计稿。输入：`UI-F1-01-quick-note.png`。输出：`UI-F1-01-quick-note-r2.png`。
用户修订：资料库、保存到、模板合并一行，将节省空间交给编辑区。用途：设计效果确认，不是运行截图。R1 保留，产品代码未修改。

## 提示词

Use case: ui-mockup. Edit the supplied quick-note design only to implement the user's compact-layout feedback. Preserve the same window bounds, white/blue style, Chinese typography, draggable title header, unsaved status, close X, footer discard/save-after dropdown/save button, note text and outer background. Replace the TWO tall settings rows with ONE slim single horizontal toolbar: three compact dropdown controls side by side, labeled inline within each control '资料库：工作资料库', '保存到：收集箱', '模板：空白笔记'. All three labels and selected values MUST be on ONE horizontal line, no label above a field, no second row. Reduce toolbar vertical padding substantially, height roughly 42 logical pixels at a 560x460 logical window. Expand the editor UPWARD into all the reclaimed space; do NOT increase window width or height to fake space savings. Keep editor bottom and footer locations unchanged. Editor text stays '下周产品讨论' followed by '整理用户反馈，优先解决资料查找和归档的问题。'. Keep local explicit-save hint below editor. Outer title now 'UI-F1-01 R2 · 快速笔记', subtitle '设计示意 · 尚未实现 · 待确认'. Footer outside window remains '保存后也可选择：继续记录 / 在主编辑区打开'. Clear readable Chinese, no new controls, no functionality removal. This is a targeted compact toolbar revision, not a redesign.
