# 配置层：profile / bundle / patch

> 运行中的 Berkshire Agent（BK）是**启动时由有序的层组合出的插件树**。这套机制照抄 dsh 的 profile/bundle/patch（[reference/cordis-pattern-report.md §6](reference/cordis-pattern-report.md#6-config-layer-profile--bundle--patch)），让“按需选择插件”、“环境差异”、“本地覆盖”都从配置完成，而无需改代码。

## 1. 三件套

| 术语 | 是什么 | 位置 |
| --- | --- | --- |
| **profile（配置档）** | 命名的组合：列出叠加的 bundle、持有的外部插件、用户自己的 `cordis.patch.yml` | `$BERKSHIRE_HOME/profiles/<name>/` |
| **bundle（分发包）** | Cordis 配置行 + 所挂代码的分发格式；保证它插入的行可被上方层 patch | `packages/bundle/<name>/`，`package.json` 里声明 `dsh.bundle.patch` |
| **patch（补丁）** | 按 `id` **整体替换**某行配置或插入新行 | 各层的 `cordis.patch.yml` / `--patch` overlay |

`$BERKSHIRE_HOME` 默认 `~/.berkshire`。兼容升级保留插件文件、刷新 host 包链接、不重装核心依赖（持续集成友好）。

> **已落地的简化装载锚点（M2，诚实标注）**：本文其余「profile/bundle/patch」三件套、`dump-config`、`!!js`、
> `isolate/extend` 为**目标态**（v2）。当前已实现的动态装配走 **`$BK_HOME/cordis.yml`**（Windows
> `%APPDATA%\.bk` / macOS `~/Library/Application Support/.bk` / Linux `~/.bk`，`BK_HOME` 环境变量优先，
> 见 [secondary-development.md §8](secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊) 的
> M2/M3/M4 节）：sidecar 只读 `$BK_HOME/cordis.yml` 声明「装哪些插件」，经 `@berkshire/boot` 内置
> `importPlugin` 动态 `import(name)`（npm 下载包 `$BK_HOME/node_modules` 与本地/裸名一条路径），**加载只由
> Cordis.yml + 下载的 npm 包驱动、零硬编码**；webview 半身经 `bk://` 运行时 `import(url)`。`$BK_HOME` 与
> 本文 `$BERKSHIRE_HOME` 是两条不同契约（前者已落地、后者为目标态的 profile 层），勿混用。

## 2. 层叠顺序（叠加到**空**根行表）

```
1) 每个 profile 列出的 bundle 补丁（按 bundles 顺序）
2) profile 自己的 cordis.patch.yml
3) home 级 $BERKSHIRE_HOME/cordis.patch.yml
4) 任意 --patch overlay（最后）
```

一个**补丁**按 `id` 定位一行并**整体替换**其 `config`（不做深合并），或用 `insert` 插入新行。某个 bundle 的代码即使内嵌了默认行，也能被上方任一层完全覆盖。

## 3. 内置 profile 模板（计划）

| profile | 叠加 bundle | 说明 | reload |
| --- | --- | --- | --- |
| `desktop` | `@berkshire/bundle-base` + `@berkshire/bundle-web-app` | 桌面应用全功能（默认） | live |
| `headless` | `@berkshire/bundle-base` + `@berkshire/bundle-headless` | 无 UI 的一次性 runner / 脚本 | startup |
| `sdk-minimal` | `@berkshire/bundle-sdk-minimal` | 最小显式 SDK 树（不叠 base） | startup |

> 自定义 profile 默认开启 live reload；`headless`/`sdk-minimal` 因为“一次性/接管某生命周期”，启动时一次性应用全部层。

## 4. 怎么写一个 bundle 的 patch

`packages/bundle/base/cordis.patch.yml`（示意）：

```yaml
- insert:
    - id: scheduler
      name: '@berkshire/cordis-plugin-timer'
    - id: database
      name: '@berkshire/database'
      disabled: false
      config:
        path: '{{BERKSHIRE_HOME}}/berkshire.duckdb'
    - id: dataSources
      name: '@berkshire/datasource'
```

`packages/bundle/desktop-app/cordis.patch.yml`（示意：**按 id 覆盖**整行配置，不做合并）：

```yaml
- id: dataSources
  config:
    defaultProvider: fuyao
    pollSeconds: !!js Number(process.env.BK_POLL_SECONDS ?? 30)
- insert:
    - id: ai-openai
      name: '@berkshire/ai-openai-compat'
```

> `!!js <表达式>`：允许配置在**使用点惰性求值**（环境变量/上下文值），`dump-config` 打印时原样保留，不在加载时暴力求值（否则 patch/热重载会误伤）。

## 5. 用户如何覆盖（无需写代码）

1. 在 `~/.berkshire/cordis.patch.yml` 放自己的补丁（如把日K数据源从 tickflow 换成 fuyao、调节午盘轮询秒数）。
2. 或在启动命令带 `--patch some/happy/path.yml` 叠加。
3. **`dump-config` 等价命令**：打印这台机器/这个 profile 启动时加载的**最终插件树**——打印出的任一行，你都可以复制到自己的 patch 里替换。

```bash
bk --profile desktop --dump-config
```

组合算法是导出的纯函数（`composeEntries` = 对空行表 `applyEntryPatches(flat(layers))`），`dump-config` 与挂载路径共用同一算法，保证“配置工具永不与装载路径漂移”（照抄 dsh [profile.ts](reference/cordis-pattern-report.md#6-config-layer-profile--bundle--patch) 的做法）。

## 6. 分组与隔离

需要给某个子系统一套独立世界或独立能力集时，用 `isolate` / `extend`（照抄 dsh [§7](reference/cordis-pattern-report.md#7-isolation--scoping)）：

```yaml
- id: market-sync-group
  name: '@berkshire/cordis:group'
  group: true
  isolate:
    dataSources: true     # 该组内的数据源在独立 realm，不污染全局
  config:
    - id: daily-sync
      name: '@berkshire/datasource-sync'
      config:
        datasets: [daily, adj_factor]
```

> 纪律：`isolate`（新建独立世界）与 `extend`（子作用域加 key）是作用域原语；给不同 Agent/workspace 不同能力集时用 `extend` 抛 scope 键。不要把运行期逻辑硬改成 patch——patch 只表达“配置选择”，表达“加载顺序/能力”的仍是 `inject`。