# 0.4 发布清单

## 提交源码

- 根文件：`.gitignore`、`package.json`、`index.html`、`styles.css`、`README.md`、`ASSETS.md`、`VERIFICATION.md`、`DEPLOYMENT.md`
- `src/`：game.js、render.js、main.js、storage.js、sound.js
- `public/`：favicon.svg、_headers
- `scripts/`：build.mjs、serve.mjs
- `test/`：game.test.mjs、policies.mjs、main.test.mjs、render.test.mjs、storage.test.mjs、site.test.mjs、sound.test.mjs
- `games/pin-rescue/`：index.html、style.css、engine.mjs、main.mjs、README.md、test/engine.test.mjs、test/ui.test.mjs

不提交 `dist/`、运行日志、截图、临时文件或凭据。构建只复制运行必需文件，不发布测试文件。

## 已有基础设施

仓库 `chenqcodes/ad-to-play`，Cloudflare Pages 项目 `game`。使用现有资源，避免重复创建。构建命令 `npm run build`，输出目录 `dist`；无需环境变量、Secrets、数据库或第三方服务。

## 更新流程

1. `npm run check` 全部通过。
2. 推送预览分支，核对 Cloudflare 检查成功及部署 SHA。
3. 在 HTTPS 预览检查两个入口、游戏交互、刷新和返回导航；查看页面脚本错误。
4. 确认最终内容后合入生产 `main`，再核对生产实际内容与 SHA。
5. 域名 `game.cqzzz.top` 需另核对 DNS、绑定和 HTTPS 状态，不以 pages.dev 可访问代替域名验证。
6. 保留准确 SHA、预览/正式 URL、测试范围和未完成的真机检查。

维护者需选择适用许可证；未选择前不要把公开仓库表述为已完成开源许可。
