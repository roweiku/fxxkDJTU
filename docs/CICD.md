# CI/CD 文档

## 概述

项目使用 GitHub Actions 实现自动化 CI 检查和发布构建。

| Workflow | 文件 | 触发条件 | 用途 |
|----------|------|----------|------|
| **Release** | `.github/workflows/release.yml` | `push tags: v*.*.*` | 正式发布，2 平台构建 |
| **CI Check** | `.github/workflows/build.yml` | PR to main / 手动触发 | 编译验证 + 测试 |

## Release 流水线架构

```
push tag v*.*.*
     │
     ▼
┌─────────────┐
│ check-version│  ← 校验 tag 来自 main + 版本号一致
└──────┬──────┘
       │
       ├──────────────┐
       ▼              ▼
┌───────────┐  ┌───────────┐
│  Win x64  │  │ Linux x64 │
│   NSIS    │  │ deb+AppImg│
└─────┬─────┘  └─────┬─────┘
      └──────────────┘
              │
              ▼
     ┌─────────────────┐
     │ update-release  │  ← 提取 Changelog + 生成下载链接
     │ Draft → Publish │
     └─────────────────┘
```

### 2 个构建目标

| # | Job | 目标 | Runner | 输出格式 |
|---|-----|------|--------|----------|
| 1 | release | `x86_64-pc-windows-msvc` | windows-latest | NSIS installer |
| 2 | release | `x86_64-unknown-linux-gnu` | ubuntu-22.04 | deb + AppImage |

> **注意**: ARM64 构建目标（Win ARM64、Linux ARM64）已移除，因为 ocr-rs/MNN 不支持交叉编译。WebView2 内置版已移除以简化流水线。

## 发布步骤

### 1. 更新 Changelog

在 `Changelog.md` 顶部添加新版本条目：

```markdown
## v0.x.x

### 🚀 新功能

- 功能描述

### 🐞 修复

- 修复描述

### 🔧 其他

- 变更描述
```

### 2. 同步版本号

三个文件中的版本号必须一致：

```
package.json         → "version": "0.x.x"
src-tauri/tauri.conf.json → "version": "0.x.x"
src-tauri/Cargo.toml      → version = "0.x.x"
```

### 3. 提交并推送

```bash
git add -A
git commit -m "release: v0.x.x"
git push origin main
```

### 4. 创建并推送 Tag

```bash
git tag v0.x.x
git push origin v0.x.x
```

Tag 推送后，Release workflow 自动触发：
1. `check-version` 校验 tag 来自 main 且版本号与 package.json 一致
2. 2 个构建 job 并行执行（Win x64 + Linux x64），产物以 draft release 上传
3. `update-release` 从 Changelog.md 提取更新日志，生成含下载链接的 Release Notes，发布正式版

### 预发布版本

Tag 包含 `-rc` 后缀时（如 `v0.2.0-rc1`），Release 自动标记为 prerelease。

## CI Check 流水线

PR 或手动触发时运行，仅验证编译是否通过：

- Windows x64 + Ubuntu x64 双平台验证
- 运行 `pnpm test` 单元测试
- 使用 `tauri-action` 构建但不创建 release
- 使用 `Swatinem/rust-cache` 加速 Rust 编译

## 缓存策略

| 缓存类型 | 工具 | 策略 |
|----------|------|------|
| Rust 编译 | `Swatinem/rust-cache@v2` | 按 OS + target 分组，避免缓存膨胀 |
| pnpm 依赖 | `actions/cache@v4` | 按 `pnpm-lock.yaml` hash |

## Secrets 配置

| Secret | 用途 | 是否必需 |
|--------|------|----------|
| `GITHUB_TOKEN` | Release 上传、创建 | 自动提供 |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater 签名 | **必需**（自动更新功能） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 签名密钥密码 | 可选（空密码时留空） |

### 配置 Tauri 签名密钥

1. 生成密钥对：

```bash
pnpm tauri signer generate --ci -w ~/.tauri/fxxkdjtu.key
```

2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/fxxkdjtu.key` 文件内容
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：密码（空密码则留空）

3. 公钥已配置在 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 中

## 自动更新

### 工作流程

1. Release 构建时，`tauri-action` 的 `includeUpdaterJson: true` 自动在 Release 中生成 `latest.json`
2. 客户端启动时请求 `https://github.com/roweiku/fxxkDJTU/releases/latest/download/latest.json`
3. 比较版本号，有新版本时展示更新弹窗
4. 用户选择"立即安装"后自动下载并安装

### 支持矩阵

| 平台 | 安装包格式 | 自动更新 |
|------|-----------|----------|
| Windows x64 | NSIS | ✅ 支持 |
| Linux x64 AppImage | AppImage | ✅ 支持 |
| Linux x64 deb | deb | ❌ 引导到 Release 页面 |

### 回退机制

当 `downloadAndInstall()` 失败时（如 deb 安装的用户），弹窗自动切换为"手动下载引导"模式，提供 Release 页面链接。
