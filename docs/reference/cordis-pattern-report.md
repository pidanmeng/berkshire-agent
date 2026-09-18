# How the Cordis Plugin Framework Is Applied in `deepseek-harness`

Repo read only at `C:\Code\deepseek-harness`. All paths below are relative to that tree; line numbers cite the file as of this read. Cordis is **vendored as `@deepseek-ai/cordis`** (scope is `@deepseek-ai`, never bare `cordis`), so every `import`/`declare module` uses the scoped name.

---

## 1. Package / workspace layout

`pnpm-workspace.yaml` workspaces (`vendor/*`, `packages/*/*`, `native/system`, `native/system/packages/*`, `apps/*`, `benchmarks`, `website`, `python/sdk-runtime`) plus `overrides` for `@deepseek-ai/cosmokit` and `@deepseek-ai/schemastery` (both `link:vendor/...`).

Root `package.json`: `@deepseek-ai/dsh-root` (private, pnpm@11.7.0), `dsh` bin runs `apps/cli/src/bin.ts`, `build:desktop`/`package:desktop:*` target `@deepseek-ai/dsh-desktop`, and a large verification script set (e.g. `verify-no-bare-dispatcher`, `verify-cordis-config`, `gen-cordis-catalog`, `gen-config-catalog`).

Top-level `apps/`:
- `cli` — owns the `dsh` bin + `--profile`/`--dump-config`/`plugin` launcher.
- `desktop` — Electron shell (main + renderer + packaging).
- `desktop-host` — private process that hosts the bundled dsh backend + client graph.
- `web` — web app shell (via `@deepseek-ai/dsh-web-frontend`).

Top-level `packages/` (two-level: category/package), one-line purposes:
- `core/` — agency core: `agent` (registry), `agent-loop` (default driver), `agent-tool-presentation`, `agent-default-model`, `scope`, `session` (append-only log), `system-prompt` (prompt/tool-schema assembly), `tools` (scoped registry + execution).
- `llm/llm` (adapter seam), plus `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `token-meter`, `deepseek-llm-api-extensions`, `plugin-package-inventory-deepseek`.
- `webhook/webhook` (dispatch seam) + `webhook-github`.
- `jobs/jobs` (abstract job registry seam) + `jobs-local` + `tool-jobs`.
- `bundle/<base|web-app|headless|sdk-app|sdk-minimal|acp-app>` — distribution-format patch layers composed into profiles.
- `boot/app-boot` (profile/bundle/patch composition + dump) and `boot/cmdline`.
- `session/…` (`session-persistence`, `session-persistence-jsonl`, `session-projection`, `session-stats`, `session-title`, `session-telemetry-otel`, …), `session-query/…`, `storage/…`, `sandbox/…`, `shell/…` (bash/pwsh backends), `subprocess/…`, `fs/…` (fs + tool-fs), `subagent/…` (many providers), `context/…`, `interaction/…` (commands, user-questions, user-approval, permission-presets), `plan/plan-mode`, `goal/…`, `preset/…` (agent-presets, persona), `workflow/…`, `web/…` (web + search/fetch tools), `mcp/…`, `skill/…`, `schedule`, `experimental/…`, `client/…` (browser UI, ~60 ui-* packages), `api/…` (gateway, controllers), `typert/…` (typed-RPC compiler/loader/registry/protocol), `host/…`, `sdk/{client,protocol,server}`, `util/…`, `test-support/…`, `spill/…`, `ssh/…`, `terminal/…`, `compaction/…`, `attachment/…`, `feedback/…`, `credentials/…`, `lsp/…`, `identity/…`, `workspace/…`, `runtime-diagnostics/invariants`, `acp/acp`, `browser-use/…`, `computer-use/…`, `hooks/…`, `ptc-runtime/…`, `settings/…`.

`vendor/` and `native/` are described in §2 and §8.

---

## 2. How Cordis is vendored / used

`vendor/README.md` (§ manifest) states: source-vendored copies of the Cordis framework and foundation libraries, "copied into this monorepo instead of being depended on via npm, so that the harness fully owns its framework layer". All vendored packages use the **`@deepseek-ai` scope** (e.g. `cordis` → `@deepseek-ai/cordis`). `cordis/` is upstream `cordis@4.0.0-rc.7`; `loader`, `include`, `group`, `timer`, `hmr`, `logger-console` are the upgraded plugins. `cosmokit` and `schemastery` are the foundation libs.

`vendor/cordis/` top: `src/` (vendored TS), `lib/` (built), `node_modules/`, `bin.js`, `LICENSE`, `package.json`, `tsconfig.json`.

The repo never imports bare `cordis` — consumers import the scoped `@deepseek-ai/cordis` (see §5) and the runtime `Context`/`Service` symbols. Example import line:

`packages/boot/app-boot/src/index.ts:16` — `import Include, { applyEntryPatches, entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'`

---

## 3. Core `Service` subclasses (`super(ctx, name)` + typed methods)

Pattern: a class `extends Service` (or `TypertRemoteService` for wire-exposed ones) whose constructor calls `super(ctx, '<ctx key>')`; typed methods are plain class methods. Representative quitations:

**`ctx.llm`** — `packages/llm/llm/src/index.ts:344-346`
```ts
constructor(ctx: Context) {
  super(ctx, 'llm')
}
```
Typed method `registerAdapter(providers, adapter)` at `:390` returns a `replace`-able disposer built on `this.ctx.effect(...)`.

**`ctx.tools`** — `packages/core/tools/src/index.ts:828-839`
```ts
constructor(ctx: Context, config: Config = {}) {
  super(ctx, 'tools')
  this.defaultMode = config.mode ?? 'native'
  ...
  ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))
  ...
}
```

**`ctx.sessions`** — `packages/core/session/src/index.ts:935-946`
```ts
constructor(ctx: Context) {
  super(ctx, 'sessions')
  ctx.inject(['typert'], (typeCtx) => { typeCtx.typert.lookups.register('session', {...}) })
}
```
Typed method `create(id?, options?): Session` at `:969`.

**`ctx.systemPrompt`** — `packages/core/system-prompt/src/index.ts:422-425`
```ts
constructor(ctx: Context, config: Config) {
  super(ctx, 'systemPrompt')
```
Typed method `section(section: PromptSection)` at `:455`; emits `system-prompt/change` on register/dispose.

**`ctx.agents`** — `packages/core/agent/src/index.ts:245,255-256`
```ts
export class AgentRegistry extends Service {
  constructor(ctx: Context) {
    super(ctx, 'agents')
```
Typed method `currentInitiator(): Agent | undefined` at `:292`, `requireInitiator()` at `:305`.

**`ctx.agentLoop`** — `packages/core/agent-loop/src/index.ts:382-383`
```ts
constructor(ctx: Context, config: Config) {
  super(ctx, 'agentLoop')
```

**`ctx.webhookRuntime`** — `packages/webhook/webhook/src/index.ts:72-74`
```ts
constructor(ctx: Context) {
  super(ctx, 'webhookRuntime')
```
Typed method `register<K extends string>(rule): () => Promise<void>` at `:89`; `dispatch()` at `:126`.

**`ctx.jobs`** — `packages/jobs/jobs/src/index.ts:62-71` (abstract seam, guarded against direct load)
```ts
export abstract class JobRegistry extends Service {
  constructor(ctx: Context) {
    if (new.target === JobRegistry) throw new Error(...)
    super(ctx, 'jobs')
  }
```
Typed abstract methods `start(spec)`/`list(caller?)`/`get`/`read`/`kill`/`wait` at `:82-133`.

The `super(ctx, name)` registration means services are named by a **string ctx key**, so consumers read them via `ctx.inject([...])` and the typed `declare module` augmentation (below).

---

## 4. Plugin metadata: `inject` / `name` / `Config` / `provide`

Two shapes both appear. (a) separate named exports `inject` + `Config` + `apply`; (b) a plugin object that carries `name`/`inject`/`Config`/`apply` (and runtime `ctx.provide(...)` / `ctx.reflect.provide(...)`).

Representative (a) — `packages/fs/tool-fs/src/index.ts:22,36,54`:
```ts
export const inject = ['tools', 'fs', 'systemPrompt']
...
export const Config: z<Config> = z.object({
  readLimit: z.number().default(READ_LIMIT),
  ...
})
...
export function apply(ctx: Context, config: Config): void {
  ...
  ctx.inject(['attachments'], (imageCtx) => { applyReadImageTool(imageCtx) })
}
```

Representative (a) with `name` — `apps/cli/config/examples/github-review/github-ready-review-rule.mjs:4-15`:
```js
export const name = 'github-ready-review-rule'
export const inject = ['webhookRuntime']
export const Config = z.object({ source: z.string().required(), ... })
export function apply(ctx, config) { ctx.effect(() => ctx.webhookRuntime.register({...})) }
```

Representative host service `static inject` — `packages/webhook/webhook/src/index.ts:59-66`:
```ts
static inject = ['agents', 'agentDefaultModel', 'agentPresets', 'permissionPresets', 'sessionTitle', 'workspaceRegistry']
```

`provide` is used at runtime to install a service value on the context: production call sites use `ctx.provide(...)` / `ctx.reflect.provide(...)`, e.g. `packages/client/locale/src/client/index.ts:544 justify` (`ctx.provide('locale', locale)`), `packages/client/resources/src/client/index.ts:34` (`ctx.reflect.provide('resources', resources)`). Lazy service wiring uses `ctx.inject([...deps], (scopedCtx) => ...)`.

---

## 5. Typed events (`declare module` merging) and dispatch modes

Type merging is done with **`declare module '@deepseek-ai/cordis'`** augmenting `interface Context` and `interface Events` in the owning package (NOT bare `cordis`).

Example — `packages/llm/llm/src/index.ts:54-75`:
```ts
declare module '@deepseek-ai/cordis' {
  interface Context { llm: LlmRuntime }
  interface Events {
    /**
     * Waterfall around every streaming model call (retry, replay, routing).
     * Bound to the LlmRuntime; call `next()` to reach the resolved adapter's stream...
     * @mode waterfall
     */
    'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
  }
}
```
Note the `@mode ...` JSDoc tag formalizes the dispatch mode per event. A simpler `emit`-mode example is `packages/core/agent-loop/src/index.ts:243-245` `'agent-loop/config-start-failed'(payload: {sessionId, error}): void` (`@mode emit`). The scoped wrapper `actx` (from `packages/api/session-controller/src/client/scope.ts`) re-exports `actx.bail(actx, evt, payload)` / `actx.emit(actx, ...)` for scope-aware dispatch on the agent context.

The five dispatch modes are used with real event names:

- **emit** (all listeners), e.g. `packages/llm/llm/src/index.ts:354` `this.ctx.events.dispatch('emit', ['llm/adapters-updated'])`; `packages/core/tools/src/index.ts:815` `this.ctx.emit('tools/change')`.
- **waterfall** (chain with `next()`), e.g. `packages/interaction/user-questions/src/index.ts:136` `this.ctx.waterfall('user-questions/request', request, noAnswerer)`; declared `'llm/stream'` above.
- **parallel** (await all), e.g. `packages/feedback/message-feedback/src/index.ts:271` `await this.ctx.parallel('feedback/committed', {...})`.
- **serial** (sequential = chain without `next`), e.g. `ctx.serial('agent/created', { agent, source: 'startup' })` at `packages/context/file-reference-local/tests/service.spec.ts:153` and scoped `agentEvents(ctx, root.agent).serial('agent/created', { source: 'resume' })` at `packages/goal/tool-goal/tests/tool-goal.spec.ts:450`.
- **bail** (return boolean to stop), e.g. `packages/client/ui-input-trigger/src/client/controller.ts:418` `actx.bail(actx, 'slash/input-begin-command', { claim: outcome.claim, span }) === true` (also `'slash/input-insert-text'`, `'slash/input-insert-reference'`).

Architecture doc (`docs/architecture.md:107`) states which are waterfalls vs serial: `agent/pre-step`, `agent/request`, `llm/stream`, and the three `tools/*` events are waterfalls; `agent/turn-stopping` is serial.

---

## 6. Config layer: profile / bundle / patch

Composition is layered patches applied to an **empty root entry list**, each layer a list of Cordis loader "rows".

- **Bundle** = distribution format for config rows + the code they mount. Each declares `dsh: { bundle: { patch: "./cordis.patch.yml" } }` in its `package.json`.
- **Profile** = named composition at `$DSH_HOME/profiles/<name>`: `package.json` with `dsh.profile` (`bundles` list + `patchReload`), plus the user's own `cordis.patch.yml`.
- **Patch overlay** = later layer replaces a row's **entire** `config` by `id` (no deep merge) or inserts new rows; applied order: each bundle patch in `dsh.profile.bundles` order, then profile `cordis.patch.yml`, then home-level `$DSH_HOME/cordis.patch.yml`, then `--patch` overlays.

Profile templates — `packages/boot/app-boot/src/profile.ts:138-160`:
```ts
export const PROFILE_TEMPLATES = {
  acp:       { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'], patchReload: 'startup' },
  web:       { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' },
  headless:  { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'], patchReload: 'startup' },
  sdk:       { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'], patchReload: 'startup' },
  'sdk-minimal': { bundles: ['@deepseek-ai/dsh-sdk-minimal'], patchReload: 'startup' },
}
```

Bundle `<name>` patch (a real one) — `packages/bundle/base/cordis.patch.yml:15-34` (excerpt; base applies as ONE insert over the empty root):
```yaml
- insert:
    - id: timer
      name: '@deepseek-ai/cordis-plugin-timer'
    - id: hmr
      name: '@deepseek-ai/cordis-plugin-hmr'
      disabled: true
      config:
        root: ['.']
    - id: llm
      name: '@deepseek-ai/dsh-llm'
    - id: session
      name: '@deepseek-ai/dsh-session'
```
And an overlay **targeting a row by id** — `packages/bundle/headless/cordis.patch.yml:9-18` (replaces `system-prompt`/`tools` whole config; no merge):
```yaml
- id: system-prompt
  config:
    personaSuffix: Your working directory is {{cwd}}.
    personaPrefix: >-
      You are a coding agent powered by the {{model}} model.
- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE
- insert:
    - id: headless-startup
      name: '@deepseek-ai/dsh-headless/startup'
```
Indicates interpolation: YAML config values may be `!!js <expression>` evaluated in Loader context (docs: `applyEntryPatches` keeps `!!js` and resolves lazily; `dsh --dump-config` prints them verbatim).

An example *user* overlay (`--patch`) illustrating group + isolate + dynamic config — `apps/cli/config/examples/github-review/cordis.yml:17-27`:
```yaml
- id: github-webhook-ingress
  name: cordis:group
  group: true
  isolate:
    webServer: true
  config:
    - id: github-webhook-server
      name: '@deepseek-ai/dsh-host-webserver'
      config:
        host: '127.0.0.1'
        port: !!js Number(process.env.DSH_GITHUB_WEBHOOK_PORT ?? 3081)
```

Composition function — `packages/boot/app-boot/src/profile.ts:933-940` uses the exact include algorithm:
```ts
export function composeEntries(layers, warn = () => {}) {
  return applyEntryPatches([], structuredClone(layers.flat()), (message, ...args) => {...})
}
```

`--dump-config`/`--dump-default-config` — `apps/cli/src/dump-config.ts:31-58`: pushes each bundle patch layer (+ profile patch, home patch, `--patch` overlays unless `defaultOnly`) into `ConfigDumpLayer`s and prints via `renderConfigDump`; `apps/cli/src/bin.ts:48-49` routes mode `'dump-config'` to `runDumpConfig`. `docs/architecture.md:31-38` documents `dsh --profile web --dump-config`. (There is no `build-config`/`resolveConfig` app for this; the "resolve" is `composeEntries` + `applyEntryPatches`.)

---

## 7. Isolation & scoping

- **`ctx.isolate(realm?)`** — creates a fresh fiber/context so services provided inside don't leak to the parent. Real use: `packages/experimental/inspector/tests/cordis-tree.host.spec.ts:244` `outerFiber.ctx.isolate('nested').plugin({ name: 'inner', apply() {} })`, and `:159` `root.isolate('probe')`. Concretely in config land, `cordis:group` rows carry `isolate: { webServer: true }` (`github-review/cordis.yml:20-21`) to keep a second webserver's exposure separate from the UI API.
- **`ctx.extend(additional?)`** — shallow-scoped child sharing the parent's services/events but adding scope keys. Real production use: `packages/core/scope/src/index.ts:140` `const scoped: Context = fiber.ctx.extend({ [kScope]: key })` (the per-agent scoped-registration primitive); consumer `packages/client/ui-user-questions/tests/browser-plugin.client.spec.ts:48` `const agent = ctx.extend({ [SESSION_SCOPE]: SESSION_ID })`; and scope resolver `packages/api/session-controller/src/client/scope.ts:58` `const scoped = fiber.ctx.extend({...})`. Used heavily to give an agent its own capability set.
- **`ctx.intercept(...)`** — the Cordis context interceptor; only the *name* is exercised in repo tests (`packages/extensions/cordis-host-runner/tests/sandbox-context.spec.ts:33` lists `ctx.intercept('x', {})` as a forbidden sandbox API). No production package calls `ctx.intercept(` directly; the `connection.rpc.intercept(...)` matches (`apps/../packages/api/gateway/src/index.ts:199`, `packages/client/connection/tests/node-half.host.spec.ts:339`) are the *Typert typed-RPC* interceptor, a different mechanism, not the Cordis context interceptor.

So the transferable scoping trio is `isolate` (new world), `extend` (child scope), and — for RPC-only hosts — Typert's `rpc.intercept`.

---

## 8. Desktop / native / sidecar / socket / webview

- **Tauri: absent.** `tauri` matches none across `packages/` or `apps/`.
- **webview: absent** as a named/runtime concept (only Electron's internal renderer; the exposed protocol is `dsh-app://`).
- **Desktop:** an **Electron** app, not Tauri.
  - `apps/desktop/package.json:43-44` → `"electron": "^44.0.0"`, `"electron-builder": "^26.15.3"` (also `electron-updater`, `@electron/notarize`).
  - `apps/desktop/src/main.ts`, `preload.ts`, `preload-app.ts` (`import { contextBridge, ipcRenderer } from 'electron'`).
  - `apps/desktop-host/` = a private process that loads the bundled dsh backend + client graph.
  - `docs/architecture.md:51-53` (Desktop application): "Electron starts the private Desktop Host package under its bundled upstream Node.js process; ... Unary RPC, Remote streams, and version-matched client assets cross versioned framed byte pipes with Node IPC reserved for lifecycle control, then reach the renderer through the secure `dsh-app://` protocol; the desktop composition opens no Web server or loopback port."
- **Native:** `native/system/` = the Landlock launcher (`bin/landlock-run`, static-musl C that self-restricts-then-execs) + POSIX `flock` Node-API addon, distributed as per-platform packages; Windows keeps its existing semaphore (`native/system/docs/support-matrix.md:14`). This is a **subprocess-confinement launcher**, not a sidecar app.
- **sidecar:** the word appears in two unrelated senses: (1) test-fixture "snapshot sidecar" files (`packages/test-support/session-snapshot/...`), and (2) the pkg single-file runtime's `-rg` ripgrep sidecar binary (`packages/fs/tool-fs-search/src/search-core.ts:162`, `rg-sidecar.spec.ts`). No Tauri-style sidecar process.
- **socket:** the desktop deliberately opens no listening socket; the Node pipe (`node-pty`) and Electron IPC are the process boundaries.

---

## 9. Printed guidance (docs/architecture.md)

- "Cordis is the framework under dsh" — `docs/architecture.md:11`:
  > "[Cordis](cordis-primer.md) is the framework under dsh: plugins contribute services, typed events, and reversible effects to a shared context. Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the agent loop itself, so each is replaceable from configuration."

- "No privileged core" — `docs/architecture.md:13`:
  > "There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads."

- Three-role "capability seam" model — `docs/architecture.md:129`:
  > "A **seam** is a swappable capability with three roles: a **Service Definition** declaring the interface, a **Service Provider** implementing it, and a **Consumer** using it, commonly a model-facing tool. A package may combine roles, but one role alone is not a seam; adding a capability means designing all three ([capability graph](capability-seams.md))."

- Seam payoff — `docs/architecture.md:131`: swapping one provider changes the whole product (filesystem/subprocess providers share one execution world; remote sandbox moves Bash/PTY/LSP with them).

---

## Reusable pattern: what a new project should copy

1. **Vendor the framework as a scoped, pinned copy.** Don't depend on Cordis from npm under its own name; vendor source under `vendor/`, rescope to your namespace (`@you/cordis`), and keep an auditable local-modification log (`vendor/README.md` manifest table). Your `pnpm-workspace.yaml` `overrides` should pin the foundation libs to your vendored copy.
2. **Everything is a plugin with `inject` + `Config` + `apply`.** Export `inject = ['k1','k2']` (dependency keys), `export const Config: z<Config> = z.object({...})` (schemastery/zod schema — validate at load), and `export function apply(ctx, config): void` whose registrations are effects. Services declare dependencies via `static inject = [...]`.
3. **Services are named `super(ctx, 'key')` Service subclasses** augmented onto the context through `declare module '@deepseek-ai/cordis' { interface Context { key: MyService } }`. Consumers use `ctx.inject(['key'], (scoped) => ...)` for lazy wiring instead of direct imports.
4. **Type events by augmentation and tag the dispatch mode.** `declare module '@deepseek-ai/cordis' { interface Events { 'ns/event'(...): ... } }` with `@mode waterfall|emit|parallel|serial|bail`. Pick the mode by semantics (waterfall = chain with `next()`, emit = all listeners, bail = stop-on-true) and document it in JSDoc.
5. **Composable config as layered patches over an empty root.** Ship "bundle" packages (each with `dsh.bundle.patch` in its own manifest) and let "profiles" stack them; a later patch row replaces a whole `config` by `id` (no merge) or inserts new rows. Keep the composition algorithm exported and reuse it for a `--dump-config` printer so config tooling never drifts from the mount path.
6. **`!!js` config expressions, kept unevaluated.** Let loader config interpolate environment/context values (`!!js process.env.X`, `!!js ctx.someService.field`) and have dumps print them verbatim; only evaluate lazily at the point of use.
7. **Isolation/seams over privileged core.** Use `ctx.isolate(realm)` to give a subsystem a private world and `ctx.extend(scopeKey)` for per-agent capability sets. Model every swappable capability as a **Service Definition / Service Provider / Consumer** seam so one provider swap moves every dependent behavior.
8. **Use scoped events for agent/flows.** Re-export a scope-aware `actx` (`actx.bail(actx, evt, payload)` / `actx.emit(actx, ...)`) and a `serial('agent/created', ...)` pattern when work must initialize in a defined order before queued work starts.