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

## 字体资源

`assets/Twemoji.Mozilla.woff2` 随客户端打包。来源和许可见 [TWEMOJI-LICENSE.md](assets/TWEMOJI-LICENSE.md)。修改字体资源时，需要同步更新构建脚本中的完整性校验。
