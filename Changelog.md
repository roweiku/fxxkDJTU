## v0.1.12

### 🔧 工程化

- ci 怎么不触发啊，邪恶栀子花！

## v0.1.11

### ✨ 新功能

- 批量处理结果表格的文件名支持点击，使用系统默认应用打开源文件（截图、发票 PDF 均可）。鼠标悬停时显示下划线和"点击打开"提示，点击不会影响行选中状态
- 配套放开 Tauri opener 插件 `opener:allow-open-path` 的路径白名单（用户选取的目录无法预先枚举，使用 `**` 通配符）

### 🐞 修复

- 修复部分电子发票盖章（金税盘签章）在生成 PDF 时丢失的问题
  - 根因：电子发票把盖章存为 `/Subtype /Stamp` 的 annotation 而不是页面 content stream，pdf-lib 的 `embedPdf+drawPage` 内部把页面打包成 Form XObject，规范禁止 Form XObject 携带 annotations，盖章因此被丢弃；预览能看到是因为 pdfjs 渲染时会一并绘制 annotations
  - 修复：新增 `flattenStampAnnotations()`，在嵌入前把每个 stamp 的 `/AP /N` 外观流按 PDF 1.7 §12.5.5 的 BBox+Matrix→Rect 变换烘焙进 content stream 并清理 `/Annots`，让原 `embeddedPdfPage` 路径保持矢量无损
  - 失败时有 fallback：保留原 PDF 继续走原流程，最坏情况退化到老版本行为，不会让生成中断

- 修复 OCR 进程被中途强杀后，重启或重装应用仍卡死在"处理中"，无法重新开始的问题
  - 根因：`pinia-plugin-persistedstate` 升到 v4 后将 `paths` 选项改名为 `pick`，旧的 `paths: ['modelConfig']` 被静默忽略，整个 ocrStore 被持久化，包括 `isBatchProcessing: true`、`activeTaskCount: 1` 等运行时状态。Tauri WebView 的 localStorage 在用户数据目录下，卸载安装包不会清，所以重装也无效
  - 修复：改用 v4 正确的 `pick: ['modelConfig']`；同时在 `main.ts` 启动时一次性剥离 localStorage 中残留的运行时键（`isBatchProcessing`、`activeTaskCount`、`isProcessing`、进度、结果列表等），让存量用户启动后自动恢复

- 修复淘宝订单截图中"实付款"上方金额提取失败的问题
  - 根因：金额行右侧的箭头/勾选图标常被 OCR 误识为字符（`v`、`>`、`^` 等），例如 `¥46.96v`、`￥4.68 ^`，原正则 `^[￥¥]([\d.]+)$` 严格锚定行尾，导致这些案例 amount=null
  - 修复：放宽正则为 `^[￥¥]\s*(\d+(?:\.\d+)?)`，仍以 ￥/¥ 开头（避免误命中"共减￥3"减免行），但不锚定行尾；同时把 `[\d.]+` 收窄到合法数字格式。新增针对真实失败样本的单元测试

### 🔧 工程化

- 完善开发环境初始化流程，避免 fresh clone 后 `pnpm tauri dev` 启动报错
  - `pdfme` 子模块需要先 `git submodule update --init --recursive` 拉取，再 `npm install && npm run build` 构建 6 个 workspace 包到各自 `dist/`，否则 Vite 无法解析 `@pdfme/common` 等 file: 链接
  - 主项目首次 `pnpm i` 会在 pdfme dist 不存在时缓存空目录，需要在构建完成后清理 `node_modules/@pdfme*` 和 `node_modules/.pnpm/@pdfme*` 后重跑 `pnpm i`
  - `@pdfme/schemas` 的 `embeddedPdfPage` 在 dev 模式下会动态 import 一个 CJS 风格的 `pdf.worker.entry.js`（`require()` 在 Vite ESM 下解析失败），改为在 `plugins.ts` 启动时用 Vite `?url` 静态预设 worker 入口

## v0.1.10

### ✨ 新功能

- 应用内自动更新：启动时检查新版本，支持下载进度展示
- 自定义更新弹窗：提供"下次提醒"、"不再提醒"、"立即安装"三个选项
- 自动更新回退机制：不支持自动更新的系统引导到 Release 页面手动下载
- 设置页面显示当前版本号 + 手动检查更新按钮
- 更新日志 Markdown 渲染（DOMPurify 安全消毒）

### 🐞 修复

- 修复 pdfme embeddedPdfPage 缓存键碰撞导致多组 PDF 显示相同内容
- 修复 Release Notes 未正确显示 Changelog 内容
- 修复下载链接版本号前缀问题

### 🔧 CI/CD

- 完整 Release 流水线：check-version → 2 平台并行构建 → update-release 发布
- Tauri updater 签名支持（NSIS + AppImage）
- 自动生成 latest.json 用于客户端更新检查
- Changelog 驱动的 Release Notes（awk 提取 + gh release edit）
- Release Profile 优化：strip + lto + codegen-units=1
- 构建目标精简为 NSIS + deb + AppImage
- NSIS 安装包简体中文语言

### 🔧 工程化

- 添加 pdfme 为 git submodule（roweiku/pdfme）
- 添加 GitHub Actions CI 检查流程
- 添加 vitest 测试框架
