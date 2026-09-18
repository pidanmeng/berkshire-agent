---
name: bk-ci-test-reliability
description: 设计与审查会在 CI 并发、共享宿主机资源、时钟、进程全局态、子进程、网络监听、异步 teardown 下产生不定失败（flaky）的测试与夹具——针对 BK 未来会写的关键测试面（DuckDB 单写者、Bun sidecar 子进程、数据源 provider、异步调度）。仓库当前**没有测试基础设施**，本技能提供「怎么写可靠测试」的设计准则，并把设施落地标注为待实现。
---

# 可靠的 BK 测试

构建在有真实资源竞争下仍正确的测试，而不只是在安静工作站的单跑结论。**注意状态：** 本仓库目前**没有测试框架/CI 测试车道**（package.json 无 test 脚本，[release.yml](../../../.github/workflows/release.yml) 只管构建发布）。因此本技能是**准则与目标态设计**，不是「现在就能跑的检查」。**可落实的最小闭环是「手动复现 + 明确断言」，详见末节。**

## 读所属规则

- 先读 [AGENTS.md](../../../AGENTS.md) 与 [docs/data-model.md](../../../docs/data-model.md)（单写者、缓存失效链）、[docs/plugin-development.md](../../../docs/plugin-development.md)（插件夹具形态）、[docs/architecture.md](../../../docs/architecture.md)（进程/生命周期）。
- 计划中的测试车道（目标态）：`bun test`（前端/TS）与 `cargo test`（Rust/DuckDB）——现状均无，落地前标「待实现」（诚实见 [AGENTS.md](../../../AGENTS.md)）。

## 建模执行拓扑

BK 的关键不确定性来自其真实拓扑，先假设在下层可重叠（除非被活动配置证明不）：
1. 同一测试文件内的用例；
2. 分离的测试文件/worker 进程；
3. 同一 job 里独立的测试/门禁进程；
4. 共享一台宿主机跑多个 CI job。

进程隔离**不**隔离宿主机端口、可预测文件路径、外部服务、数据库、套接字、继承的子进程。对每个获取的资源，识别其 owner、原子分配机制、可观测的就绪信号、登记过的清理、静止完成信号。

**BK 特有关注 1：DuckDB 单写者。** 只有 Rust（`db.rs`）写 `.duckdb` 文件。测试须：每个用例独占私有临时 DB 文件（`mkdtemp`），绝不共享/复用可预测路径；读路径可并、写路径绝不被测试间竞争（[data-model.md §1](../../../docs/data-model.md#1-核心设计决策)）。

**BK 特有关注 2：Bun sidecar 子进程。** Cordis 插件 VM 跑在 Bun sidecar（stdio JSON-RPC）。测插件生命周期（`dispose`/fiber 状态）必须拉起真实 sidecar 入口（或明确替换该层的 mock），并**等待子进程退出**后再断言——`kill()` 不 await 完成信号是不完整 teardown（[architecture.md §2](../../../docs/architecture.md#2-运行时拓扑)、[secondary-development.md §2](../../../docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)）。

**BK 特有关注 3：数据源/网络 provider。** `ctx.dataSources` 的真实 provider（fuyao/tickflow/tushare/akshare）依赖外网与密钥。这些必须走「真凭据 e2e」（无 key 自跳过）与「夹具/桩」分离两层；夹具用固定回放（归一化 schema 输入），绝不引到测试每次命中真实 API。

## 原子分配资源

用资源 owner 的分配器，不「先查有空再认领」：网络夹具 `listen(0)` 后读分配地址；`mkdtemp` 造私有临时根；共享数据库/套接字/会话给唯一每测试命名空间；需不存在处用独占创建。字面路径/URL 若只作解析器输入或期望值，不是获取的资源，不必改写。

## 收敛进程全局态

把 `process.env`、`cwd`、假时钟、locale/时区、模块 mock、注册表、console hook、`globalThis`、全局 `fetch` 拦截当排它可变资源。优先注入依赖或实例本地适配器。需改时：捕获原值缺/在；精确恢复；立即注册恢复；`try/finally` 包最小变更范围；有 `afterEach` 兜底；只拦截夹具所属的最窄确切请求/调用。

## 尊重平台语义

同一套测试在 Windows 与 POSIX 跑。写回值只有在断言容忍写回失败时才安全；Windows 环境变量名大小写不敏感；Windows 异步释放文件句柄 → rename/删除需按观察到的争用尺寸的**有限重试**；Window 无 POSIX 权限/信号语义 → 依赖它的用例显式平台 skip 并命名理由，而非到处弱化断言。优先「全平台成立」的观察；确实不能者在该平台显式排除。

## 按车道预算超时

`describe`/用例级 timeout 覆盖运行器 `--testTimeout`，低于车道预算就把 CI 已给的空间降下来。以进程创建为界的套件取车道预算，更紧的值要带理由。把 hook 预算与用例预算一起抬——setup/teardown 付同样的争用。以超时为对象时，外层等待远大于被测超时，别让负载决定哪个 deadline 先报。

## 在状态上同步

固定 sleep 不是「setup 完成/cleanup 静止」的证据。等显式就绪事件、握手、状态转换、自有 promise、外部可观测条件；用 deferred/barrier 把竞态放到确定性点；用超时只限制等待，不作为使断言正确的条件。不断言调度相关顺序，除非那是被测产品行为。

## 处置到静止

获取后立即登记 cleanup，使断言失败也释放资源：停止新回调/请求、拆监听、恢复全局 hook、终止自己拥有的工作、并 await 子进程退出/服务器关闭/worker 终止或等价完成信号。调用 `abort()/close()/kill()` 而不 await 归属完成信号即不完整 teardown；可能迟到完成时，证明处置阻止其污染另一测试。

## 证明预期回归

- 有价值时先观察普通回归在修复前失败；
- 新静态/语料护栏临时引入被拒用例并观察预期失败；
- 竞态用 barrier 证明重叠；仅反复执行不是竞态测试；
- 端口/套接字/共享路径/子进程需并发时，并行跑独立测试进程证明跨进程隔离；
- 夹具带自身 deadline spawn 时，先断言无信号/超时提前结束子进程、再断言退出状态；
- 验证外部状态/事件/文件/日志/退出/处置，而非信任组件自报。

## 拒绝掩蔽 flaky 的修复

不要把这些当确定性本地测试的根因修复：加超时而不识别所等状态；加重试；全部串行化；吞错/未处理 rejection；弱化断言；把不稳定行为正常化；cleanup/断言前加 sleep。重试仅对文档化的、确实瞬态的外部 provider 测试（真凭据 e2e 层）有效，且该例外留在外部边界。

## 现状最小可落实闭环（无测试框架时）

在 CI 测试车道落地前（待实现），「可靠」的唯一可操作落实是：

1. **手动复现脚本**：把夹具/断言写成可重复执行的脚本（`scripts/` 下，标注待实现或直接可跑），每次改动数据红线逻辑后手动跑一遍（见 [data-model.md §7](../../../docs/data-model.md#7-验证命令目标) 的「目标」命令——先标注未落地）。
2. **明确断言**：任何对数据的临时验证，用脚本内显式断言表达预期，而非肉眼。
3. **诚实报告**：报告「已跑的最小手动复现 + 断言」与「待实现的 CI 车道」，不把本地单跑当 CI 稳定证据。

## 验证与报告

跑受影响行为的最小聚焦复现；仅当改动拥有该风险时补拓扑特有证据（全局变更→恢复证据；生命周期/子进程→静止 teardown 证据；端口/套接字/共享路径→并发独立进程证据；新护栏→负控制）。推送前用 [bk-pre-push-checks](../bk-pre-push-checks/SKILL.md) 选最小证据。报告确切命令与观察；不把重试/跳过/挂起的 CI 描述成通过。