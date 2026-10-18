# 0.2 发布清单

## 上传源码清单

- `.gitignore`
- `package.json`
- `README.md`
- `ASSETS.md`
- `VERIFICATION.md`
- `DEPLOYMENT.md`
- `index.html`
- `styles.css`
- `src/game.js`
- `src/render.js`
- `src/main.js`
- `public/favicon.svg`
- `public/_headers`
- `scripts/build.mjs`
- `scripts/serve.mjs`
- `test/game.test.mjs`
- `test/policies.mjs`
- `test/main.test.mjs`
- `test/render.test.mjs`

不要上传 `evidence/`、临时浏览器测试脚本、`node_modules/`、`.git/` 或运行日志。`dist/` 为自动生成产物，默认不提交到源码分支；Pages 构建后部署它。

## 待发布事项

- [ ] 仓库维护者选择代码许可证；未选择前不要把“公开仓库”表述为已经完成开源许可。
- [ ] 确认更新分支与是否会自动触发生产发布，再提交已检查源码到 `chenqcodes/ad-to-play`。
- [ ] 核对 Cloudflare Pages 现有站点（初版预览 `game-dx1.pages.dev`）关联的正确仓库及分支，不重复创建项目。
- [ ] 构建 `npm run build`，输出目录 `dist`。
- [ ] 取得 0.2 的可访问 HTTPS 预览，完成 `VERIFICATION.md` 中待验收项。
- [ ] 确认正式域名 `game.cqzzz.top` 指向正确项目并 HTTPS 正常。
- [ ] 回报准确 commit SHA、预览/正式 URL、通过与未通过的检查。

不需要配置环境变量、Secrets、数据库或第三方分析服务。
