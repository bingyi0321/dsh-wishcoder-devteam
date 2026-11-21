# 子代理模型白名单 · 使用说明

让 `subagent` 能派一个**和当前会话不同模型**的子代理。默认不行：子代理模型必须等于父路由，否则被拒。这个功能补的是"白名单"那一环。

两处入口，改的是同一份数据：

- **设置页**：侧栏 → **Plugins** → **子代理模型白名单**（本包自己的页，页内也写着下面第 3 节的用法）。
- **配置文件**：`cordis.patch.yml` 里 `subagent-model-selection-settings` 行的 `config`，那是**出厂默认值**。

---

## 1. 它做了什么

子代理工具在派发前读会话级投影 `subagentModelSelectionPolicy`：

- 有白名单 → 显式 `provider`/`model` 只要落在名单里就放行；
- 没有白名单 → 显式选择必须等于父路由。

白名单来自会话日志里的一条事件：

```
subagent/model-selection-policy
{ "allowedModels": [ {provider, model}, … ] }
```

写者是官方插件 `@deepseek-ai/dsh-tool-subagent/model-selection-settings`（Service `subagentModelSelection`）：它在新顶层会话 created 时写入，子代理会话继承父会话的白名单。事件类型是已注册的（`surface: false`），不会让会话拒绝重开，也不进模型可见的历史。

> 本 bundle 早先自写过一份等价实现（`route-policy/index.js`），现在**不再装配**。两个写者会让投影只认第一条（`apply` 在 `policy !== null` 时忽略后续事件），所以保留代码仅作参考与回退。

---

## 2. 用设置页改（推荐）

**侧栏 → Plugins → 子代理模型白名单**。

页面上：

1. **怎么用** 一节就是三段式的调用方式，忘了随时看；
2. **启用模型选择**：关掉则新会话不写白名单，子代理只能继承父路由；
3. **允许的路由**：每行一个 `provider` + `model`，可删可加（两个都填才生效，重复会被挡）；
4. **保存** → 写入 Host 设置文档的 `subagent-model-selection-settings` 命名空间。

保存后：

- 对**之后新建的会话**生效；
- 已存在的会话保留它创建时拿到的白名单（投影只读第一条事件）；
- 页面上的值来自 Host 当前解析结果；别处改动过会立刻反映在页面上。

命名空间没被 Host 提供（没装 `model-selection-settings` 行）时，页面显示"Host 没有提供这个命名空间"，插件列表里也不会出现这个入口。

---

## 3. 怎么调用

插件不用调，用 `subagent` 时多传两个参数即可：

```json
subagent({
  "description": "实现段",
  "prompt": "……任务书七项……",
  "provider": "dsh-opencode-go",
  "model": "deepseek-v4.1-flash"
})
```

硬规则（都是运行时校验）：

- `provider` 与 `model` **必须成对**出现；
- `reasoning_effort` 只在两者都在时才允许；
- 组合必须落在白名单里，否则 `child LLM route "x/y" is not allowed for this Session`；
- **三个都不传** = 继承父路由（默认，大多数情况该这么做）。

典型用法是三段式的段 2：主会话判愿、写验收 → 派子代理照判据跑绿 → 三次不绿回主会话接管。

---

## 4. 改出厂默认值（配置文件）

```yaml
# cordis.patch.yml
- id: subagent-model-selection-settings
  name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
  config:
    enabled: true
    allowedModels:
      - provider: dsh-opencode-go
        model: deepseek-v4-pro
      - provider: dsh-opencode-go
        model: deepseek-v4.1-flash
```

这两项在官方实现里是 `.volatile()` 字段：写进 Host 设置文档后，用户层覆盖这里的默认值。改完跑：

```bash
node dsh-wishcoder-devteam/validate.cjs
```

`enabled: true` 而 `allowedModels` 为空会被 Host 拒绝（`enabled subagent model selection requires at least one allowed model`）。

配套开关在 `tool-subagent` 行：`modelSelection: true`。关掉它，调用里传 `provider`/`model` 会直接报 `child model selection is disabled for this tool instance`，走不到白名单。

---

## 5. 怎么确认生效

**会话里有没有那条事件**

```bash
node .research/tools/session-read.cjs "C:\Users\Administrator\.dsh\sessions\--D-agent--\<会话目录>" \
  --grep '"type":"subagent/model-selection-policy"'
```

**子代理真的换了模型**

```bash
node .research/tools/session-read.cjs "<子代理会话目录>" --grep 'request/header' \
  | grep -o '"provider":"[^"]*","model":"[^"]*"'
```

父会话本身就是 flash 时，派 flash 不算跨路由，要验跨模型得派一个与父路由不同的。

**页面逻辑的本地回归**（不需要会话，秒级）：

```bash
node .research/tmp/test-settings-page.mjs    # 期望 24 项全通过
node .research/tmp/test-route-policy.mjs     # 旧写者的逻辑回归，9 项
```

---

## 6. 限制

- **一个会话只认第一条 policy**。改配置对老会话无效，只能开新会话。
- **白名单不校验 model id 是否存在**。写错要到子代理解析该路由时才失败。
- **设置页入口只在 Host 提供该命名空间时出现**；本包这条 Loader 行（`devteam-settings`）只负责把浏览器半 serve 出去。
- 旧的 `route-policy/index.js` 不再装配；它的 `config.provider` 单值设计只支持一个 provider，官方实现用 `{provider, model}` 数组，没有这个限制。

---

## 7. 排错

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| Plugins 里没有这个页面 | 本包 client 未加载，或命名空间未提供 | 确认 `devteam-settings` 行存在、刷新页面；确认 `subagent-model-selection-settings` 行装配 |
| 页面显示"Host 没有提供这个命名空间" | 上面那行没装 | 补上再开新会话 |
| `child model selection is disabled for this tool instance` | `tool-subagent.modelSelection` 不是 `true` | 打开它，开新会话 |
| `… is not allowed for this Session; without a recorded model-selection policy…` | 会话里没有 policy 事件（非 devteam 预设，或 `enabled` 为 false） | 用 devteam 会话，或在设置页开启 |
| `… is not allowed for this Session`（无后半句） | 有 policy，但组合不在名单里 | 设置页加这条路由 |
| 保存后提示被拒 | 值不合法，或被更高层配置锁定 | 看报错文本；`enabled` 时至少要一条路由 |
| 保存成功但旧会话仍被拒 | 老会话保留创建时的白名单 | 开新会话 |
