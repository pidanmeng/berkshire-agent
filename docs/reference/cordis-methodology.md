# Cordis 架构与方法论详解

> 本文档综合 Cordis 官方文档、学术论文、社区深度文章，并结合本项目（DeepSeek Harness，下称 dsh）的实际应用，系统总结 Cordis 的架构理念、设计原则、关键组件、数据流、扩展机制，以及其方法论如何迁移到其他项目。
>
> 配套项目内一手资料：`docs/cordis-primer.md`、`docs/cordis-tutorial/`、`docs/architecture.md`，以及被 vendor 的源码 `vendor/cordis/`。

---

## 目录

1. [概览：Cordis 是什么](#1-概览cordis-是什么)
2. [核心架构理念：时空可组合性](#2-核心架构理念时空可组合性)
3. [设计原则](#3-设计原则)
4. [关键组件](#4-关键组件)
5. [数据流与生命周期](#5-数据流与生命周期)
6. [扩展机制](#6-扩展机制)
7. [Cordis 在 DeepSeek Harness 中的应用](#7-cordis-在-deepseek-harness-中的应用)
8. [如何把 Cordis 方法论应用于其他项目](#8-如何把-cordis-方法论应用于其他项目)
9. [参考资料](#9-参考资料)

---

## 1. 概览：Cordis 是什么

**Cordis** 是一个独立的开源 TypeScript **元框架（meta-framework）**——"一个用于构建框架的框架"。它的定位标语是 **"A Meta-Framework of Spatiotemporal Composability"（时空可组合性的元框架）**，由开发者 **Shigma（Yifan Shi）** 创建，其核心能力是**运行时动态可组合性**：应用在运行中即可加载、配置、更新、卸载插件，且**零内存泄漏、零进程重启**。

- **出身**：Cordis 最初诞生于 2019 年起 Long-term 生产的聊天机器人框架 **Koishi**（跨平台、长期保持 WebSocket 长连接的机器人社区，插件生态超过 4000 个社区插件、数千个线上实例）。其核心机制——“卸载组件必须完全撤销它做过的一切”——是 Koishi 的设计原语，多年后才被命名为"时空可组合性"。
- **独立成库**：团队意识到动态插件模型并不限于聊天机器人，而是 Node.js 领域的通用问题，于是把内核抽取成 Cordis（源自拉丁语 *cor*，意为 "心"）。
- **学术化**：Shigma 与 DeepSeek、北京大学研究者共同发表了预印本论文 **["A Programming Paradigm for Spatiotemporal Composability"](https://arxiv.org/abs/2608.25512)（arXiv:2608.25512, cs.PL）**，把这两个概念形式化。
- **进入 dsh**：DeepSeek 把 Cordis vendor 进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，让"每个部件都是插件"成为 dsh 的根基——模型适配器、工具注册表、会话日志、agent 循环全部是可插拔组件。
- **当前版本**：dsh vendor 的 Cordis 为 `4.0.0-rc.7`（`vendor/cordis/`），MIT 许可。

> **一个容易忽略的关键事实**：Cordis 并非为 AI Agent 设计，而是为了解决"聊天机器人几千个社区插件被反复安装、更新、卸载而不腐蚀"的问题。dsh 押注的是：**同样的性质正是一个长期运行、自我修改的 agent 所需要的**。

### 与其他框架的对比（一图理解差异）

| 维度 | 传统框架（Express / NestJS / Spring Boot） | Cordis |
|---|---|---|
| 启动假设 | 应用启动一次、静态运行、进程退出才关闭 | 运行中动态加载/卸载/热重载 |
| 依赖注入 | 静态、单调，启动后"冻结"，服务消失会抛异常 | 活性的、响应式的，依赖消失时依赖者优雅暂停 |
| 更新模块 | 只能重启进程 | 热替换，无需重启 |
| 卸载副作用 | 依赖开发者手动清理，易泄漏 | 通过 `ctx.effect` 自动逆序撤销，默认可逆 |
| 隔离机制 | 各框架不同（OSGi 用 ClassLoader，易引 ClassLoader Hell） | 单 JS 运行时内用 `Proxy` + 自动清理栈 |

---

## 2. 核心架构理念：时空可组合性

论文把"组件能否在运行时被安全地组合"拆成两个正交问题，并各给出精确的形式化答案。

### 2.1 时间可组合性（Temporal Composability）

> **关于时间的问题**：当一个组件被移除时，它的**所有副作用**能否被完全撤销？

如果插件注册过事件监听、打开过连接、改动过共享状态，把它移除后是否真的全部撤销了，还是残留了"幽灵"（zombie）监听器、悬挂的 socket、无法回收的内存？

解决方案是 **可撤销的效应（revertible effects）**：每一次上下文变换都携带一个"逆操作"（inverse），由运行时跟踪。这就是 `ctx.effect()` 背后的机制——凡是通过它注册的东西，Cordis 都知道如何反注册。

### 2.2 空间可组合性（Spatial Composability）

> **关于关系的问题**：组件能否声明自己依赖什么，并让运行时**响应式地**管理这些依赖随时间的变化？

若插件 B 依赖插件 A 提供的某个服务，系统需要保证：**B 只在 A 就绪后加载、在 A 停止前卸载、且 A 加载失败时 B 永不启动**。

解决方案是 **响应式协效应（reactive coeffects）**：每个插件通过 `inject` 声明它所需要的外部上下文，运行时只要该上下文发生变化（服务装载、卸载、替换）就通知它，而不是让插件轮询或假设依赖是静态的。

> **通俗定义**：*效应（effect）* 是代码除了返回值之外对世界做的一切（写库、注册监听、改全局）；*协效应（coeffect）* 是与之对偶的概念——不是代码"对环境做了什么"，而是代码"**需要从环境得到什么**"。Cordis 的贡献是让两者都成为一等公民、可被追踪，并且——关键地——**可自动撤销**。

### 2.3 上下文范式（The Context Paradigm）与统一

论文把效应上下文与协效应上下文**统一进同一个 `Context` 类型**：一个对象同时是"插件效应被记录的地方"和"插件协效应需求被解析的地方"。这种统一使得"安装一个插件"、"一个依赖改变了"、"移除一个插件"变成了**同一种底层操作**的三种情形，而不是三个独立的特例。

这种中介（mediation）还诱导出一种 **观察等价（observational equivalence）**：不同组件的效应可以交错（interleave）而不互相干扰。把这些机制组合成"组件（component）"的概念，论文给出了一个动态组合的演算（calculus），其元理论把时空可组合性从单个组件推广到整个相互交错的组件系统。

### 2.4 汇合性（Confluence）

还有一个由实现引出的第三种性质：**汇合性**。无论某个配置是如何到达的——先装后卸、一次失败的更新被回滚、依赖消失又回来——只要**最终期望的配置相同**，系统就应该收敛到**同一个稳定、可解释的状态**。被热补丁五十次的系统，行为不应该与第一次就配置正确的系统不同，也不应该拖着三次迭代前"被移除"的插件的监听器。

---

## 3. 设计原则

综合论文与 dsh 的实践，Cordis 的方法论可提炼为以下设计原则：

1. **每个副作用默认可逆（Reversibility by default）**。不信任插件作者手动写清理函数；效应通过 `ctx` 注册，运行时记录"撤销操作"到私有清理栈，卸载时**逆序**执行。这是时间可组合性的落地。
2. **依赖通过声明解析，而非手工排序（Declarative, not manual boot ordering）**。插件用 `inject` 声明所需服务，加载顺序由服务需求表达，而不是手工编排启动序列。这是空间可组合性的落地。
3. **插件是被装载进当前上下文的对象**。它可以是一个带可选 `inject` 与 `apply(ctx)` 字段的函数，也可以是一个 `Service` 子类，由 Cordis 把其生命周期挂载进当前上下文。
4. **上下文是服务的仓库（A context is a repository of services）**。服务在 `ctx` 上声明一个稳定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`），其他插件通过 key 而非导入具体实现来发现服务。
5. **类型化事件用于通信**。服务通过 TypeScript 声明合并（declaration merging）声明事件名，再按 `emit`/`waterfall`/`parallel`/`serial`/`bail` 五种派发模式之一派发，取决于监听器是观察、包装、扇出、按序还是首个 bail 值即停。
6. **注册即效应（Registrations are effects）**。提示片段、工具 schema、适配器、provider、监听器全部通过 `ctx.effect()` 或 `ctx.on()` 安装，使热重载与拆除都能可预期地展开。
7. **没有特权核心可打补丁（No privileged core to patch）**。dsh 的表述："你通过在一个插件旁边再装载一个插件来扩展 dsh，注册是效应，会在其插件卸载时展开。"
8. **配置由 schema 校验，默认失败要响亮（Fail loud）**。插件 config 通过 `Config`（standard-schema）校验，无效配置在加载时（或最早可解析点）抛出，绝不静默跳过缺失的引用。
9. **类型即契约，零魔法字符串**。得益于 `declare module 'cordis'` 的声明合并，`ctx.database`、`ctx.on('...')` 都有完整类型提示与自动补全，无需装饰器字符串 token 或复杂 DI 容器。

---

## 4. 关键组件

Cordis 依赖四个核心构建块：**Context、Fiber、Service、Event**（外加其背后的 Reflect 与 Registry）。以下基于 vendor 源码 `vendor/cordis/src/` 逐一说明。

### 4.1 Context（上下文）

`Context`（`ctx`）是每个插件交互的唯一对象——服务、事件、生命周期操作的共享容器，结构是一棵"根上下文 + 子上下文"的树。

- **根上下文**：`new Context()` 创建根依赖容器，并安装内置服务（`reflect`、`registry`、`events`、`logger`）。
- **代理（Proxy）实现**：Cordis 把具体 `Context` 类用 JS `Proxy` 包装。普通属性读取（如 `ctx.database`）会走服务解析器：动态检查该服务对该分支是否可见、是否被隔离、并追踪插件正在使用什么。
- **作用域操作永不修改父级**，总是产生新子上下文：
  - `ctx.extend(meta?)`——创建继承（且可遮蔽）父级属性的子上下文。
  - `ctx.isolate(name, label?)`——给某个服务一个独立的作用域；其下对 `name` 的读写解析到新 label，可在不影响父作用域的情况下提供不同实现。
  - `ctx.intercept(name, config)`——为子上下文中启动的插件注入该服务特有的配置（`Service.resolveConfig` 按祖先优先合并）。
- **底层读写**：`ctx.get(name, strict?)` / `ctx.set(name, value)` / `ctx.provide(name, value)`。
- **暴露派生成员**：`ctx.accessor(name, options)`、`ctx.mixin(name, mixins)`。
- **常用共享句柄**：`ctx.root`、`ctx.events`、`ctx.logger`、`ctx.registry`、`ctx.fiber`。

### 4.2 Fiber（插件运行实例）

**Fiber** 是一个已装载插件实例的运行时表示：它的生命周期状态、校验过的 config、它所注册的效应。每个上下文都拥有一个 fiber（`ctx.fiber`），`ctx.effect()` 委托给它来登记"可感知清理的副作用"——这就是"可撤销效应"真正被实现的地方。

| 属性 | 作用 |
|---|---|
| `uid` | 注册表内唯一 id；根 fiber 为 `0`，销毁后为 `null` |
| `ctx` | 插件运行的上下文（从父级 extend 而来） |
| `config` | 插件校验后的配置 |
| `state` | 当前生命周期阶段（见第 5 节状态机） |
| `store` | 装载时依赖服务的实现快照 |

生命周期方法：`dispose()` 卸载插件并等待清理完成；`restart()` 重载；`update(config)` 校验新配置后重启；`await()` 等待启动工作完成并重抛启动错误。

### 4.3 Service（服务）

`Service` 是在 `ctx` 上暴露命名 API 的基类。子类在构造函数中调用 `super(ctx, name)`，会立刻把自己注册为 `ctx.<name>`，并在拥有它的 fiber 终止时**自动移除**。

- **可用性谓词**：`Service.check` 是传给 `ctx.provide()` 的存在性谓词（判定"该服务此刻是否可用"）。
- **可调用服务**：`Service.invoke` 使服务可直接被调用（如 `ctx.logger()`）。
- **扩展钩子**：`Service.init`（构造后初始化）、`Service.extend`（派生扩展实例）、`Service.tracker`（上下文追踪元数据）、`Service.resolveConfig` / `Service.config`（配置解析）。
- **隔离子类**：dsh 大量使用 `isolate()` 在同一全局下为不同会话提供彼此独立的某类服务实现。

### 4.4 Events（事件系统）

Cordis 的事件系统远超标准 `EventEmitter`，提供**五种派发模式**：

| 模式 | 是否 await | 派发顺序 | 是否有返回值 |
|---|---|---|---|
| `emit` | 否 | 按注册顺序观察 | 无 |
| `waterfall` | 否 | 按注册顺序观察 | 有（中间件式） |
| `parallel` | 是 | 所有监听器并行观察 | 无 |
| `serial` | 是 | 按注册顺序，直到某个返回值中止 | 有 |
| `bail` | 否 | 按注册顺序，直到某个返回 bail 值 | 有 |

- **`emit`**：同步、fire-and-forget。
- **`parallel`**：并发运行所有监听器，全部 settle 后 resolve；任何 reject 聚合成 `AggregateError`。
- **`serial`**：按序 await，直到返回一个 "bail 值"（`isBailed`：非 `null`/`false`/`undefined`）。
- **`bail`**：`serial` 的同步版本，如一个认证门（多个插件都能认证，任一给出确定答案即停）。
- **`waterfall`**：中间件式。每个监听器收到 `(...args, next)`；调用 `next()` 把（可能被包装的）结果委托给下一个服务，不调用 `next()` 则短路。值通过 `next()` 的返回值传播。这是 dsh 里策略与拦截的主要手段。

监听器注册：`ctx.on(name, listener, options?)` 返回一个清理函数（由注册它的 fiber 拥有）；`ctx.once(...)` 首次调用后自毁；`options.prepend` 前插、`options.global` 绕过上下文过滤。

> **Cordis Waterfall 语义**：它是"环绕中间件"（around-middleware）。协作型监听器通常修改共享的请求/决策对象后委托；也可以整体替换结果，下游只看到替换后的结果。仅当监听器必须在普通注册之前运行时才用 `prepend: true`。对单决策事件，短路就是设计——策略监听器在拥有决策时可不调 `next()`，而只做注解/观察的监听器必须委托。

### 4.5 Registry 与 Reflect（注册表与反射层）

- **RegistryService（`ctx.registry`）**：规范化插件形态（函数 / 类 / `{apply}` 对象）、按可执行回调做身份键（registry identity）、启动 fiber、提供 map 式检查与遍历。`ctx.plugin(plugin, ...args)` 与 `ctx.inject(deps, callback)` 都经它实现。
- **ReflectService（`ctx.reflect`）**：支撑上下文代理的后端，负责 `get`/`set`/`provide`、`getImpl`、监听器绑定 `bind`、以及服务可用性变化时对依赖者 `notify`。
- **LoggerService（`ctx.logger`）**：`ctx.logger(name)` 取命名 logger，是一个可调用服务。

### 4.6 内建服务与继承层

除了上面四块，每个插件还能看到 Cordis 自带的一层公共能力：事件派发、插件管理、`effect`、底层服务访问、上下文派生、运行时句柄（`root`/`scope`/`fiber`）、计时工具（`timer`/`interval`/`timeout`/`throttle`/`debounce`）、系统访问（`loader`、`hmr`），以及约十几个继承事件（插件生命周期、状态变化、服务绑定、配置更新、文件监听、进程退出）。**这一层保持通用、由 Cordis 提供**，正是 dsh 文档可以聚焦"tools、sessions、agents"等 harness 词汇、而不必每次重新解释插件机制的原因。

---

## 5. 数据流与生命周期

### 5.1 Fiber 状态机

```
PENDING  --(所有依赖服务就绪: _refresh 计算 epoch)-->  LOADING  --(callback 执行完)-->  ACTIVE
   ^                                                         |                          |
   |                                                         | (配置或 callback 抛错)       | (依赖消失: epoch 归 INACTIVE)
   +---------------------------------------------------------+                          |
                                              FAILED <------------------------------------------------+-->  UNLOADING --(清理栈跑完)-->  DISPOSED
```

- **`PENDING`**：插件已安装，但一个或多个所需服务缺失，静默等待，不运行任何代码（依赖的"延迟满足"）。
- **`LOADING`**：插件 callback 正在运行。
- **`ACTIVE`**：所有必需服务就绪，callback 已执行、效应已激活。
- **`FAILED`**：callback 或配置抛错。
- **`UNLOADING`**：disposer 正在运行。
- **`DISPOSED`**：已卸载，不可重启。

**响应式依赖解析**是其中的魔法：若 B 声明 `inject: ['database']`，而 `database` 服务尚不存在，则 B 停在 `PENDING`；一旦 `database` 服务装载，Cordis 检测到匹配立即把 B 启动为 `ACTIVE`；若某时刻卸载了 `database` 服务，Cordis **自动挂起 B**（运行其清理函数），避免 B 因使用不存在的库而崩溃。

### 5.2 效应（Effect）的数据流

`ctx.effect(execute)` 的流程：

```
execute()
  ├─ 立即运行 body
  ├─ body 返回一个 disposer（或 Promise/迭代器产生的多个 disposer）
  └─ 运行时的 Fiber._disposables 按注册顺序收集这些 disposer
卸载时：
  _disposables.clear() 逆序（reverse registration order）运行每个 disposer
  每个 disposer 可 async，卸载会 await 它们
  disposer 是单发的（single-shot），重复调用是 no-op
  单个 disposer 抛错被 logger 记录，不阻断其余清理
```

- 注册时机：`ctx.on()`、`ctx.plugin()`、`ctx.provide()`、`ctx.timer/...` 等辅助函数底层都注册为效应，附带人类可读的标签（如 `ctx.on("event")`），供 `getEffects()` 诊断树展示。
- dsh 的实践原则：**每个注册都要有 disposer**——要么从 `ctx.effect()` 返回一个，要么使用 Cordis 已替你做好这件事的辅助函数。若清理顺序重要，把相关工作放进**同一个 effect**，使拆除按预期顺序展开。
- 效应注册在 owner 处于 `UNLOADING` 时被拒绝（`CordisError('INACTIVE_EFFECT')`），防止清理期注册逃出卸载快照。

### 5.3 事件派发的数据流

以 `ctx.waterfall` 为例（也是 dsh 中 `internal/config`、`internal/update`、策略类、`agent/*`、`tools/*` 事件的机理）：

```
dispatch(mode, ...args)
  -> 解析 thisArg 与事件名
  -> 触发 internal/dispatch（诊断）
  -> 按 hook 过滤（global 或上下文过滤器）
  -> 对 waterfall：最后一个参数是内层 next；next() 依次 shift 出监听器，最内层是内置行为
```

事件过滤（`dispatch` 中的 `filter`）：监听器 `hook.global` 或 `!filter || filter.call(thisArg, hook.ctx)` 才被选中——这使 **Context 树与事件传递天然关联**：只有过滤范围内的上下文里的监听器会收到该事件。这与 `isolate()` 一起，是实现"每个会话/每个 agent 各看各的事件"的机制。

---

## 6. 扩展机制

Cordis 的扩展点可以分为两类：**代码层（API）** 与 **配置层（Loader）**。

### 6.1 插件形态

一个插件可以有三种形态，Registry 会自动规范化：

```ts
// 函数插件
export const inject = ['database', 'logger']
export function apply(ctx: Context, config: Config) { ... }

// 类插件（构造时调用 super(ctx, name) 自动提供服务）
class MyService extends Service { constructor(ctx){ super(ctx, 'name') } }

// 对象插件
export default { name, inject: [...], apply(ctx, config){...} }
```

公共元数据字段：`name`（显示名）、`Config`（standard-schema 校验器）、`inject`（所需服务）、`provide`（提供的服务）、`intercept`（声明消费哪些服务的 intercept 配置）。

### 6.2 协效应机制（coeffects）

- **`ctx.inject(deps, callback)`**：所需服务就绪后运行 callback，服务变化时自动重载。`deps` 可以是数组，或"服务名 → 配置"的映射。
- **`@Inject(name, config?)` 装饰器**：用于类（贡献静态 `inject` 映射）或类方法（把该方法延迟到所需服务就绪）。
- 两层协效应语境被统一进 Fiber：`Fiber._checkImpl`（检查并用 `Service.check` 判定可用）→ `Fiber._refresh`（把依赖的服务 fiber uid 拼成 **epoch**）→ `_setEpoch`（epoch 变化触发 `_reload`/`_unload`）。这是"空间可组合性"的具体实现。

### 6.3 事件作为观察/拦截扩展点

事件是可用的拦截点。选择正确的领域是大多数改动中的第一个决定：

- **观察/包装（emit/waterfall）**：监听以观察或改写在途工作。
- **策略（bail/serial）**：多个候选实现，任一给出确定答案即停。
- **管道（waterfall）**：串行变换请求/结果，必须调 `next()` 委托。

### 6.4 配置层：Loader、Include、Group、HMR

代码层之上，Cordis 官方插件提供了**配置驱动的加载**：

- **`@cordisjs/plugin-loader`**（dsh 中 vendor 为 `@deepseek-ai/cordis-plugin-loader`）：运行时插件树与 `loader` 服务；`loader.config` 声明插件行与它们依赖的模块。
- **`@cordisjs/plugin-include`**（`cordis-plugin-include`）：让 loader 支持 YAML/JSON 配置文件包含（dsh 的 `cordis.yml`）。解析 `!!js` 表达式节点；当一个条目的 `config`（在声明的 injections 激活后、针对该插件上下文解析）与 `disabled` 字段（在每次装载决策时、针对 loader 上下文解析）时进行插值。用 overlays 表达"环境选择插件"。
- **`@cordisjs/plugin-group`**：loader 配置里的嵌套插件组。
- **`@cordisjs/plugin-hmr`**：loader 管理的插件热模块替换（更新、删除文件即热重载）。
- **`@cordisjs/plugin-logger-console`**：内置 logger 的控制台导出。
- **`@cordisjs/plugin-timer`**：可感知清理的 timeout/interval/throttle/debounce。

### 6.5 低层内建事件（内置扩展枢纽）

Events 接口里定义的 `internal/*` 事件是核心服务的拦截枢纽：`internal/plugin`（fiber 创建/销毁）、`internal/status`（状态变化）、`internal/config`（waterfall，回调注入激活后解析原始 config）、`internal/update`（waterfall，config 更新应用，`next()` 跳过可 veto）、`internal/get`/`internal/set`（waterfall，服务经上下文代理读写）、`internal/listener`（bail，监听器注册）、`internal/service`、`internal/dispatch`（诊断）。

---

## 7. Cordis 在 DeepSeek Harness 中的应用

dsh 的架构文档给出了把 Cordis 角色讲得最直白的一段话：

> "Cordis is the framework under dsh: plugins contribute services, typed events, and reversible effects to a shared context. Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the agent loop itself, so every part is replaceable from configuration. There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads."
>
> —— `docs/architecture.md`

### 从理论到 dsh 的映射

| Cordis 概念 | dsh 中的应用 |
|---|---|
| `Context` 服务仓库 | `ctx.llm`（模型适配器）、`ctx.tools`（工具注册表）、`ctx.sessions`（会话日志）、`ctx.systemPrompt`、`ctx.agents`、`ctx.agentLoop`、`ctx.webhookRuntime`…… |
| `inject` 依赖声明 | 每个 dsh 插件声明它需要的服务；例如工具插件 `inject: ['tools']`，而 `dsh-tools` 又注入 `systemPrompt`（因为工具 schema 进提示词） |
| 类型化事件 | `session/event`（持久化事实）、`agent/*`（在途工作：inbox/step/status/request/validation/continuation）、`capability/*`（`fs/*`、`tools/*`、`telemetry/*` 策略与适配器） |
| 可逆效应 | 工具注册、事件监听、provider 绑定全部为效应，卸载插件即撤销 |
| `Service` 子类 | 每个核心包都是服务：`session`、`system-prompt`、`tools`、`agent`、`agent-loop`、`llm`、`webhook` |
| Loader 配置 | **profile + bundle + patch 层** 驱动的插件树 |
| `isolate` | 给不同会话独立的某类服务作用域（如每个会话一套策略/会话级能力集） |
| watermark/bail 事件 | `agent/pre-step`、`agent/request`、`llm/stream`、若干 `tools/*` 是 waterfall，监听器必须调 `next()`；`agent/turn-stopping` 是 serial |

### profile / bundle / patch（配置组合，DSH 特有）

- **profile（配置档）**：命名的组合，列出它叠加的 bundle、持有的外部插件、以及用户自己的 `cordis.patch.yml`。`web`、`headless`、`sdk`、`sdk-minimal`、`acp` 是内置模板。
- **bundle（分发包）**：Cordis 配置行与它们所挂载代码的分发格式，保证其插入的行可被其上方的层 patch。
- **layers（层）**：对一个空条目表按序应用——每个 bundle 依次、profile 的 `cordis.patch.yml`、home 级 patch、任意 `--patch` overlay。patch 按 id 定位一行并整体替换其配置，或插入新行。
- **`dsh --profile web --dump-config`** 打印你的机器启动时加载的树——打印出的任一行你都可以用自己的 patch 替换。

### dsh 中"能力缝"（Capability Seam）的三角色模型

这是 dsh 在 Cordis 之上提炼的重要方法论：一个可替换的能力缝（seam）永远是完整的三个角色——

1. **Service Definition**（服务定义）：声明接口；
2. **Service Provider**（服务提供者）：实现它；
3. **Consumer**（消费者）：使用它，通常是模型面对的工具。

三者缺一不可。正因如此，**一个 provider 的替换改变整个产品**：文件和子进程 provider 共享一个执行世界，把它们指向远程沙箱就同时把 Bash、PTY、LSP 一起迁移过去，无需按 provider 分叉。

### dsh 中"新行为放哪里"的速查

| 目标 | 机制（扩展点） |
|---|---|
| 新增模型 provider | 在 `ctx.llm` 注册适配器 |
| 新增模型可用能力 | 在 `ctx.tools` 注册；其 schema 加入提示词组装 |
| 给某会话不同能力集 | 组合 agent preset；服务行需 `isolate` realm |
| 新增持久终端执行 | 注册 `ctx.terminals` 后端 + `dsh-tool-terminal` |
| 拦截一次请求/工具/回合 | 用其 `agent/*` 或 `tools/*` 事件；`agent/turn-stopping` 停止回合 |
| 新增后台任务 | 注册 `ctx.jobs`；`job_*` 工具收集/停止 |
| 会话历史存进新后端 | 实现 `SessionPersistence`（`create`/`open`/`stat`/`list`/`export`） |
| 把注册限定到一个 agent | 用该 agent 的 `agent.ctx` |

### 事件领域的三层选择

dsh 明确：**事件是扩展点，选对领域是大多数改动的第一个决定**。
- **会话事件**：写入日志的持久事实，经 `session/event` 广播；用于必须跨重载存活的事实。
- **Agent 事件（`agent/*`）**：携带活动 `Agent`（inbox/step/status/request/validation/continuation）；用于观察或拦截在途工作。
- **能力事件**：把策略与适配器挂到能力缝（`fs/*`、`tools/*`、`telemetry/*`）而不导入循环。

### dsh 的实践原则（可直接复用的方法论）

1. 把行为封装进插件：工具管道事件归 `ctx.tools`、模型流式归 `ctx.llm`、实时 agent 协调归 `ctx.agents`；**拦截/策略用事件，直接能力调用用服务方法**。
2. 每个注册都有 disposer；清理顺序重要时放进同一个 effect。
3. **模型可见 ⟺ 已记录**：任何到达模型请求的东西都必须能从会话日志重建；新的模型可见输入必须有会话事件。插件改消息内容时注册"纯消息投影"（pure message projections）。
4. `inject` 用 `Service.check` 判定可用性，依赖消失时依赖者**明确失败**而非静默默认缺省。
5. 配置原子地走 "source → spec（resolve 步骤）" 分离，不在 `run()` 里藏隐式默认。
6. 跨边界 id 用品牌类型（`Branded<T>`）隔离，绝不用裸 `string`。

---

## 8. 如何把 Cordis 方法论应用于其他项目

### 8.1 何时该/不该用 Cordis

**适合**：
- 组件需要**运行中被加载/卸载/热重载**，且不能容忍重启（长期连接、自我修改的 agent、二进制/设备交互）。
- 需要一个可安全**回滚**的插件生态（社区插件型应用）。
- 需要"每个部件都可从配置替换"的框架内核。
- 必须在**单进程内**、零泄漏地管理大量动态挂载（dsh、Koishi 的典型场景）。

**不适合 / 权衡**：
- 一次启动、静态组装、极少改动的小应用——Cordis 的运行时追踪是额外成本，收益不明显。
- 需要强进程隔离（安全边界）的场景——Cordis 在**单 JS 进程内**做生命周期管理与清理栈，不提供 OSGi 式的隔离 ClassLoader 或沙箱；跨进程/跨语言隔离需在插件的 provider 层另做（dsh 的做法是把 bash/ptty/lsp 收敛进可替换的 provider）。

### 8.2 上手路径（对照 dsh 教程）

1. **建立根上下文**：`new Context()`。
2. **用 `ctx.plugin()` 装载组件**；用函数插件 + `apply(ctx)` 起步。
3. **用 `inject` 声明依赖**，让加载顺序由需求而非手工排序决定。
4. **用 `ctx.effect()` 登记一切副作用**，并返回清理函数（disposer）。
5. **用 `ctx.on()`/`ctx.emit()` 做插件间通信**，选对派发模式（观察 `emit`、管道 `waterfall`、竞态 `bail` 等）。
6. **用 `Service` 子类暴露公共 API**，配合 `declare module` 获得全类型安全。
7. **把配置收敛进 `Config` schema**，让无效配置响亮失败。
8. **用 Loader/Include/HMR** 把代码层提升为"配置驱动的插件树"（dsh 的 profile+bundle+patch 就是这一层的实践）。

### 8.3 方法论文档化的通用清单

当你在自己的项目里应用 Cordis 时，可以照 dsh 的标准沉淀：
- **一张"新行为放哪"的速查表**（目标 → 机制/扩展点）。
- **事件却领域分明**（持久事实 / 在途工作 / 能力策略分三层）。
- **能力缝三角色模型**（服务定义 / 提供者 / 消费者）作为"添加能力"的完整度检查。
- **dataflow/lifecycle 图**（fiber 状态机、效应清理顺序、事件 filter 与 Context 树）。
- **对 downstream 的开发约束**（waterfall 必须调 `next()`、注册即效应、`inject` 声明式依赖、跨边界 id 品牌化）。

### 8.4 与其他 DI/插件框架的对比，及其启示

- **对比 Spring Boot / NestJS**：它们的 DI 是静态、单调、启动后冻结的；Cordis 是活性、响应式的。启示：若应用需要在运行时愈合/重组依赖，选择响应式 DI。
- **对比 OSGi**：两者共享"服务注册表 + 声明依赖 + 运行期动态"的愿景，但 OSGi 用 ClassLoader 隔离导致版本地狱、且清理靠手动；Cordis 用 `Proxy` + 自动清理栈消除这两类痛点。启示：**单运行时内用清晰的清理契约替代类加载器隔离**，能显著降低动态化成本。

---

## 9. 参考资料

**论文（一手理论）**
- ["A Programming Paradigm for Spatiotemporal Composability"](https://arxiv.org/abs/2608.25512)（arXiv:2608.25512, cs.PL）— Shi, Yifan; Zhang, Wei; Cui, Tianyi；[paper 仓库](https://github.com/cordiverse/paper)。

**官方 / 上游**
- [cordiverse/cordis](https://github.com/cordiverse/cordis)（npm: `cordis`）
- Koishi：<https://koishi.chat/>

**本项目一手资料（vendor 源码与 docs）**
- `vendor/cordis/src/`：`context.ts`、`fiber.ts`、`service.ts`、`events.ts`、`registry.ts`、`reflect.ts`、`logger.ts`
- `vendor/cordis/README.md`；`vendor/README.md`（manifest + 本地修改日志）
- `docs/cordis-primer.md`、`docs/cordis-tutorial/`、`docs/architecture.md`

**社区深度文章**
- [AgentAtlas — "Cordis Explained: How DeepSeek Harness's Plugin Framework Works"](https://agentatlas.org/blog/cordis-explained-how-deepseek-harness-plugin-framework-works/)
- [WorldLine Tech — "Understanding Cordis: The TypeScript Framework Built for Hot-Swapping Everything"](https://dev.to/worldlinetech/understanding-cordis-the-typescript-framework-built-for-hot-swapping-everything-1ihb)
- [Floatboat — "Cordis, the Plugin Kernel Behind DeepSeek Harness"](https://floatboat.ai/blog/cordis-plugin-framework)
- [Lilian Weng — "Harness Engineering for Self-Improvement"](https://lilianweng.github.io/posts/2026-07-04-harness/)（dsh / Cordis 为何值得关心）