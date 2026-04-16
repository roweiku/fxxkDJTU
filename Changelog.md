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
