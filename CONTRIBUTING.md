# 开发 Nestquay

需要 Node.js 22.15 或更新版本，以及 DSH 0.2.0-rc.2。

## 安装依赖

```sh
npm ci --ignore-scripts --legacy-peer-deps
```

DSH 由你的开发环境提供，不随插件打包。构建和集成测试会先查找本地安装的 DSH，再查找 npm 全局安装。其他安装方式可以设置 `NESTQUAY_DSH_ROOT`，指向包含 DSH 自身 `package.json` 的目录。

## 构建和测试

```sh
npm run build
npm test
```

客户端适配当前版本的官方工作区界面。升级 DSH 后，需要检查适配并验证侧栏行为。涉及交互或视觉的修改还需要在实际页面中检查。

## 打包

```sh
npm pack --ignore-scripts
```

## CI 和发布

推送到 `main`、提交目标为 `main` 的 PR，或手动运行 Actions，都会构建、执行测试并上传安装包。CI 从 `peerDependencies` 读取 DSH 版本，安装到 runner 的临时目录，不依赖开发者机器上的 DSH。

发布步骤：

1. 更新 `package.json` 和 `package-lock.json` 中的版本，提交并推送到 `main`，确认 CI 通过。
2. 为该提交创建与包版本一致的标签，例如 `v0.1.15`，然后推送标签。标签与包版本不匹配时 CI 会拒绝发布。
3. 标签的构建和测试通过后，Actions 会创建 GitHub Release，上传 `dsh-nestquay.tgz` 和 `SHA256SUMS`，确认上传成功后才公开发布。带预发布后缀的版本会标记为 prerelease。

安装包始终使用固定附件名，市场条目可指向：

```text
https://github.com/HumXC/dsh-nestquay/releases/latest/download/dsh-nestquay.tgz
```

重跑发布任务会替换该 Release 的同名附件。发布使用仓库内置的 `GITHUB_TOKEN`，无需配置 npm 凭据或额外的发布密钥。

## 字体资源

`assets/Twemoji.Mozilla.woff2` 随客户端打包。来源和许可见 [TWEMOJI-LICENSE.md](assets/TWEMOJI-LICENSE.md)。修改字体资源时，需要同步更新构建脚本中的完整性校验。
