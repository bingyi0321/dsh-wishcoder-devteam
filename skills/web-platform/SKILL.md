---
name: web-platform
description: "页面组件、API契约、表迁移、鉴权性能、uni-app小程序。做前端/后端/接口/白屏/5xx/CORS时加载。"
---

## 何时加载
写页面/组件/样式、接接口、改接口或表结构、鉴权限流、排查 5xx/慢查询/白屏/CORS、补测试、准备发布与回滚。uni-app / 微信小程序（mp-weixin）也加载，走下面「uni-app / 小程序」节，**验收不吃 Lighthouse/Playwright**。纯嵌入式或原生 App 不加载。

## 开工前勘察
```bash
cat package.json; npm ls react vue next vite --depth=0
ls src; cat vite.config.* next.config.* tsconfig.json
cat go.mod requirements.txt 2>/dev/null; ls migrations db/migrate alembic 2>/dev/null
```
记录：框架与版本、包管理器与锁文件、dev/build/lint/test 命令、路由与状态库、组件库与样式方案、DB 与迁移工具、鉴权方案、密钥来源、部署与回滚手段。沿用现有方案，不引入第二套状态库/样式方案；新依赖先看体积与维护状态。

## 接口契约
- 选型：对外资源型 REST，聚合用 GraphQL，服务间 gRPC；同一领域不混用。路径 `/v1/orders/{id}/items`；破坏性变更升 `/v2`，旧版加 Sunset 头。
- 错误统一 `{ code, message, details? }`：HTTP 码给类别，code 给业务分支；5xx 不暴露内部细节；401 与 403 不混用。
- 分页用游标 `?limit=20&cursor=`，返回 `{items,nextCursor}`；禁止大 OFFSET；过滤排序字段走白名单。
- 幂等：写接口支持 `Idempotency-Key`，按 key 存结果、重放返原响应；只对幂等请求自动重试（`ON CONFLICT (biz_key) DO NOTHING`）。限流按用户/IP/租户分层令牌桶，超限 429 + `Retry-After`。
- 前端类型从 OpenAPI 生成不手写两套：`npx openapi-typescript ./openapi.json -o src/api/schema.d.ts`；后端未就绪用 MSW 按契约 mock。

## 前端：组件与状态
- 一组件一职责；单文件 >200 行或 >3 个 `useEffect` 就拆；props 下行、事件上行，跨 3 层以上用 context/组合。
- 服务端状态给 TanStack Query/SWR，客户端状态（UI、表单草稿）才进 store；派生状态用计算不另存。
- URL 即状态：筛选、分页、搜索词进 query string，可刷新可分享；提交时禁用按钮，请求中不发第二次。
- 三态（加载/空/错误）必做，四态（加无权限）是验收项；全局错误边界防白屏。
- 时间存 ISO8601 UTC、展示层本地化；金额用整数分或十进制库，禁止 float 运算。

## 前端：性能与可访问性
```bash
npx lighthouse http://localhost:3000 --preset=desktop --view
npx vite-bundle-visualizer
```
先测量再改：Performance 录制看 LCP 元素、>50ms 长任务、布局偏移来源。路由级 lazy+Suspense；第三方按需引入；图片 WebP/AVIF+srcset+懒加载、字体 `font-display:swap`+子集化；长列表虚拟化；渲染期别给 memo 子组件传新对象；静态资源 hash+immutable 长缓存，接口按业务设 staleTime 与 ETag。CWV 目标 LCP<2.5s、INP<200ms、CLS<0.1。
可访问性：语义标签优先，可点击用 `button`/`a` 不给 div 绑 onClick；Tab 顺序合理、焦点可见、弹层做焦点陷阱且 Esc 关闭；图片给 alt、表单 label 关联、对比度 ≥4.5:1；先测 360px 与 1440px。

## uni-app / 小程序（mp-weixin）
- **先判工程形态**：有 `package.json` + `vite.config.*` = CLI 版，命令以 scripts 为准（`npm run dev:mp-weixin` / `npm run build:mp-weixin`，即 `uni -p mp-weixin`），产物 `dist/dev|build/mp-weixin`；只有 `manifest.json`/`pages.json` 无 node 构建 = HBuilderX 版，产物 `unpackage/dist/dev/mp-weixin`，**必须靠 HBuilderX 编译**，别硬跑 npm（跑不通只会多几个失败步，且构建产物不会更新）。
- **构建通过 ≠ 能跑**：小程序的一切验收只认微信开发者工具或真机，浏览器里跑的 H5 版不能作证。
- 写 `uni.*` 优先于 `wx.*`（多端复用），平台差异用条件编译 `// #ifdef MP-WEIXIN` … `// #endif`，不用 `process.env` 判平台。
- **体积硬线**：主包 ≤2MB、单分包 ≤2MB、总包 ≤20MB。页面/组件超了拆 `subPackages` + `preloadRule`；大图走 CDN，只留小图标进包。交付前看产物目录体积，别等上传才报。
- 尺寸：设计稿按 **750 宽**出图，1px = 1rpx；不用 vh/vw 混排；底部按钮给 `env(safe-area-inset-bottom)`。
- 渲染：`setData` 单次 ≤1MB，别整对象替换大数组（用路径赋值/`$set`）；长列表 `scroll-view` + 分页，禁一次渲染上千条。
- 原生组件层级：`video/map/textarea/canvas/camera/live-player` 最高，被遮住用 `cover-view`/`cover-image`（新基础库多数已同层渲染，map/video 仍需注意）。
- 生命周期：页面靠 `onLoad/onShow/onReady/onHide/onUnload`，`mounted` 不等于页面显示；返回刷新放 `onShow`；`navigateTo` 栈上限 10 层，超了用 `redirectTo`/`reLaunch`。
- **登录**：`uni.login({provider:'weixin'})` 拿 code → **后端** `jscode2session` 换 openid/session_key。code 一次性、5 分钟有效，**禁止前端换**；`session_key`/`appsecret` 不下发前端。
- 用户信息：`getUserProfile` 自 2022-10-25 起已回收，头像昵称走「头像昵称填写能力」（`<button open-type="chooseAvatar">` + `<input type="nickname">`），别照旧教程接 `scope.userInfo`。
- 支付：`uni.requestPayment({provider:'wxpay',…})` 参数全部服务端签名（v3 用 RSA），前端只透传；开发者工具无法模拟，只能用真实小额订单验。
- 隐私合规：小程序后台配隐私协议 + `__usePrivacyCheck__`/`uni.requirePrivacyAuthorize`，缺了会审核驳回。
- **验证回路**（替代 Lighthouse/Playwright）：构建 → 微信开发者工具 CLI（先开「设置→安全设置→服务端口」）：
  ```bash
  "<微信开发者工具>\cli.bat" preview --project <dist/build/mp-weixin> --qr-format terminal
  "<微信开发者工具>\cli.bat" upload --version <1.0.0> --desc "<变更说明>"
  ```
  性能看开发者工具「体验评分」与 setData 次数/耗时；自动化用官方 `miniprogram-automator` 连开发者工具端口，**不要用 Playwright 测小程序本体**（它只能测 H5 端，测不到小程序运行时）。
- 交付前：真机至少 iOS + Android 各 1 台走主流程，传体验版给用户验收，类目/资质/隐私协议先对齐。

## 后端：数据建模与迁移
- 索引跟随查询：`EXPLAIN` 后按最左前缀建；写多表少建索引；大表用 `CREATE INDEX CONCURRENTLY`（PG）。
- 禁止 N+1：批量 `IN`/`JOIN`/DataLoader；事务只包必要语句且保持短小，跨服务用 outbox/Saga，不跨库开事务。
- 乐观锁 `UPDATE t SET version=version+1 WHERE id=? AND version=?`，影响 0 行则重读重试；软删行的唯一索引带 `WHERE deleted_at IS NULL`。
- 零停机迁移四步：①加可空新列 ②双写/分批限速回填 ③切读 ④删旧列；分多次发布，每步可回滚，迁移文件带版本号与描述。

## 后端：安全、并发与可观测
- 输入白名单校验（类型/长度/枚举/范围）失败 400；SQL 全参数化。
- 越权必测：每个"按 id 读写"的接口都校验资源归属（IDOR）；管理接口独立鉴权，不靠前端隐藏。
- JWT：access 15 分钟、refresh 轮换且可吊销，权限服务端聚合校验；密钥进环境或 Vault/KMS；密码 bcrypt/argon2；敏感字段加密。Cookie 会话防 CSRF；CORS 白名单；上传校验类型与大小；敏感操作写审计日志。
- 耗时任务（发信、导出、调第三方）丢队列，接口只返任务 id 并提供状态查询；消费端按业务唯一键去重，重试有上限与退避，超限进死信并告警；外部调用设超时与重试上限。
- 缓存写后删（Cache-Aside）+ 短 TTL 兜底；穿透用空结果短 TTL；雪崩 TTL 加随机抖动；强一致场景直接读库。
- 日志结构化（JSON）含 traceId/userId/耗时/结果，不打密钥与完整 PII；指标 QPS、P95/P99、错误率、饱和度。

## 调试速查
- 前端：Console 首个错误即根因；Network 看状态码/请求头（CORS 看 OPTIONS 与 `Access-Control-*`）/响应体/耗时；401 查 token 刷新时序；白屏看 SSR 与首帧是否一致；卡顿看 Long Task 栈与谁在重渲染。
- 后端：按 traceId 串日志找第一个异常节点；慢查询 `EXPLAIN (ANALYZE, BUFFERS)` 看 Seq Scan，`pg_stat_statements` 找 Top SQL；CPU 高用 `go tool pprof`/`py-spy` 火焰图。
- 小程序：白屏先查 `pages.json` 页面是否注册、分包路径是否写对（报 `not found page`）；只在真机复现的先对齐基础库版本与 `wx.getSystemInfoSync()`；Console 看 appservice 报错，Network 面板看 `uni.request`（域名未加白名单在这里现形）。

## 测试与发布
- 前端：单元 60% / 组件 30% / E2E 10%，登录、下单、支付必须有 E2E；按 role/label 定位、禁固定 sleep。`npx vitest run --coverage`、`npx playwright test --trace on`。
- 后端：单测覆盖分支与边界；集成测用真库/容器（Testcontainers）；契约测进 CI，schema 变更未同步调用方直接失败；回归三件套：正常路径、鉴权失败、非法输入。`go test ./... -race -cover`、`pytest -q --cov=app`。
- 发布：flag 关 → 灰度 1%→10%→50% → 观察错误率/延迟/日志 10 分钟 → 全量；门槛 5xx<0.1%、P95 不劣化 20%，任一不达标立即回滚；DB 变更与代码解耦，先兼容新旧两端再删旧逻辑。回滚预案写清回滚命令、配置开关与回滚后验证的关键 API。
- 小程序：构建 → CLI 预览/上传 → 体验版 → 提审，**不以 CWV/Lighthouse 作为验收指标**（那是 H5 的）；小程序体验评分、启动耗时、setData 次数才是它的数。

## 交付自检
- [ ] dev/build/lint/typecheck 全绿；四态 + 360px 实际点过；Network 无失败与重复请求
- [ ] 契约/错误码/分页/幂等/限流齐备并有文档；迁移可回滚且索引经 EXPLAIN 验证
- [ ] 越权用例通过、敏感信息未入日志；关键路径有测试；发布与回滚步骤写进 PR 描述
- [ ] 小程序任务另加：`build:mp-weixin` 通过、主包 <2MB、开发者工具预览无红错、真机 iOS+Android 各 1 台走过主流程
- [ ] 自检回路：按 `devteam-flow`「收尾沉淀」的那条合并命令（写记忆 + 回读 + `session-friction.cjs` 取数）一次跑完 → 交付里写 errorSteps/exitNZ/dupCalls/approvals；四列（单文件小改两列）
