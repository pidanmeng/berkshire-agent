/**
 * SettingsDialog —— 设置弹窗（WP-6，base-ui 壳插件）：设置不再是 `/settings` 路由页，
 * 而是点「设置」弹出的 `@berkshire/ui` `Modal`。
 *
 * 结构（左分组 + 右表单）：
 * - 弹窗面板内是 **grid 两栏**：左侧分组列表、右侧当前分组表单。
 * - 左侧分组（可排序、可扩展）：
 *   - 通用设置 `general`（壳自有表单 `GeneralSettingsForm`）；
 *   - 模型设置 `model`（壳自有表单 `ModelSettingsForm`）；
 *   - 插件设置 `plugins`（**设置 Seam**：`settings.section` 槽宿主——插件贡献的设置表单面板，
 *     每个包 `ExtensionBoundary`；另保留既有 `settings.cards` 槽在此聚合展示）。
 * - 分组顺序：通用/模型按 `DEFAULT_SETTINGS_GROUPS`（`order` 升序）在前，`plugins` 组固定居后
 *   （分组「加/排序可扩展」即让插件把更多面板挂进 `plugins` 组；插件自定义顶层分组 v-next）。
 *
 * 持久化（WP-7，接入既有持久化管线）：
 * - 宿主把 `StorageHandle`（包装 `lib/api` storage* + `storage/changed`，经 root 槽注入）传给壳，
 *   本弹窗把它透传给自有表单，并随 `settings.section`/`settings.cards` 槽 context 分发给各插件面板。
 * - **每个表单项对应一个 KV**（`$BK_HOME/state/<ns>/<key>.json`）：通用/模型字段落在壳的
 *   `settings` 命名空间（key 见函数内常量）；字段变更即写入（经 `usePersistedField`，可选 loud-fail
 *   校验拒写）。无论表单项来自壳自带表单还是其它 provider 经 `settings.section` 贡献的面板，
 *   都走同一持久化句柄——"每个表单项一个 KV"。
 * - 模型 Key 字段**只存环境变量/引用名，绝不落明文**；引用名非法即 loud-fail 不写盘。
 */
import { useState, type ReactNode } from "react"
import { Button, Input, Select, Modal } from "@berkshire/ui"
import { ExtensionSlot, usePersistedField, type StorageHandle, type StorageNamespaceId } from "@berkshire/ui-slots"
import { DEFAULT_SETTINGS_GROUPS } from "./settingsGroups"
import styles from "./SettingsDialog.module.css"

/** 壳自带设置的持久化命名空间（`$BK_HOME/state/settings/`）。 */
const SETTINGS_NS = "settings" as StorageNamespaceId

/** 设置弹窗的左侧分组 id（壳自有两个 + 固定「插件设置」组）。 */
type SettingsGroupId = "general" | "model" | "plugins"

interface SettingsDialogProps {
  /** 弹窗打开状态。 */
  open: boolean
  /** 关闭回调（ESC/遮罩/关闭按钮）。 */
  onClose: () => void
  /** 持久化句柄（宿主经 root 槽注入）：自有表单落 KV + 分发给插件设置面板。 */
  storage: StorageHandle
}

/** 左侧分组列表：通用 / 模型（order 来自 `DEFAULT_SETTINGS_GROUPS`）+ 固定「插件设置」。 */
const GROUPS: { id: SettingsGroupId; label: string; hint: string }[] = [
  ...DEFAULT_SETTINGS_GROUPS.map((g) => ({ id: g.id as SettingsGroupId, label: g.label, hint: g.description ?? "" })),
  { id: "plugins", label: "插件设置", hint: "由插件贡献的设置表单（settings.section 槽）" },
]

export function SettingsDialog({ open, onClose, storage }: SettingsDialogProps): ReactNode {
  const [active, setActive] = useState<SettingsGroupId>("general")

  return (
    <Modal open={open} onClose={onClose} ariaLabel="设置" className={styles.dialog}>
      <header className={styles.header}>
        <h1 className={styles.title}>设置</h1>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭设置" className={styles.close}>
          关闭
        </Button>
      </header>

      <div className={styles.body}>
        {/* 左：分组列表（可排序；通用/模型走 order，插件设固定居后）。 */}
        <nav className={styles.sidebar} aria-label="设置分组">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-current={active === g.id ? "page" : undefined}
              className={styles.groupItem + (active === g.id ? " " + styles.groupItemActive : "")}
              onClick={() => setActive(g.id)}
            >
              <span className={styles.groupItemLabel}>{g.label}</span>
              {g.hint && <span className={styles.groupItemHint}>{g.hint}</span>}
            </button>
          ))}
        </nav>

        {/* 右栏：当前分组表单（独立纵向滚动）+ 底部 action bar。 */}
        <div className={styles.content}>
          <div className={styles.panel} role="tabpanel">
            {active === "general" && <GeneralSettingsForm storage={storage} />}
            {active === "model" && <ModelSettingsForm storage={storage} />}
            {active === "plugins" && <PluginsSettingsPanel storage={storage} />}
          </div>
          <footer className={styles.actionBar}>
            <span className={styles.actionNote} role="status">
              改动项逐项写入 $BK_HOME/state（每个字段对应一个 KV）；字段变更即持久化，重启后保留。
            </span>
            <Button variant="primary" onClick={onClose}>
              完成
            </Button>
          </footer>
        </div>
      </div>
    </Modal>
  )
}

/** 通用设置表单（主题/语言/时区/数字格式）：每个字段一个 KV，落在 `settings` 命名空间。 */
function GeneralSettingsForm({ storage }: { storage: StorageHandle }): ReactNode {
  const theme = usePersistedField(storage, SETTINGS_NS, "theme", { defaultValue: "dark" })
  const language = usePersistedField(storage, SETTINGS_NS, "language", { defaultValue: "zh-CN" })
  const timezone = usePersistedField(storage, SETTINGS_NS, "timezone", { defaultValue: "Asia/Shanghai" })
  const numFormat = usePersistedField(storage, SETTINGS_NS, "numFormat", { defaultValue: "zh_CN" })
  return (
    <FormShell title="通用设置" desc="主题、语言、时区与数字格式等通用项（字段变更即持久化到 settings/<key>）。">
      <Select
        label="主题"
        value={theme.value}
        onChange={(e) => theme.set(e.target.value)}
        options={[
          { value: "dark", label: "暗色（默认）" },
          { value: "light", label: "亮色" },
          { value: "system", label: "跟随系统" },
        ]}
      />
      <Select
        label="语言"
        value={language.value}
        onChange={(e) => language.set(e.target.value)}
        options={[
          { value: "zh-CN", label: "简体中文" },
          { value: "en", label: "English" },
        ]}
      />
      <Select
        label="时区"
        value={timezone.value}
        onChange={(e) => timezone.set(e.target.value)}
        options={[
          { value: "Asia/Shanghai", label: "Asia/Shanghai (UTC+8) · 北京" },
          { value: "UTC", label: "UTC" },
        ]}
      />
      <Select
        label="数字格式"
        value={numFormat.value}
        onChange={(e) => numFormat.set(e.target.value)}
        options={[
          { value: "zh_CN", label: "千分位 + 2 位小数" },
          { value: "en", label: "1,234.56" },
        ]}
      />
    </FormShell>
  )
}

/** 模型设置表单（模型选择 / API 基址 / Key 引用名——只存环境变量引用名，绝不落明文）。
 *  每个字段一个 KV（settings 命名空间）；Key 引用名非法时 loud-fail 拒写。 */
function ModelSettingsForm({ storage }: { storage: StorageHandle }): ReactNode {
  const provider = usePersistedField(storage, SETTINGS_NS, "provider", { defaultValue: "deepseek" })
  const model = usePersistedField(storage, SETTINGS_NS, "model", { defaultValue: "deepseek-chat" })
  const baseUrl = usePersistedField(storage, SETTINGS_NS, "baseUrl", {
    defaultValue: "https://api.deepseek.com",
  })
  // Key 字段只承载「环境变量/引用名」：写盘只存引用名（如 DEEPSEEK_API_KEY），密钥值本身永不进表单；
  // 非法（小写/空格/特殊字符）→ loud-fail 拒写（commit 门控）。
  const keyRef = usePersistedField(storage, SETTINGS_NS, "keyRef", {
    defaultValue: "DEEPSEEK_API_KEY",
    commit: (next) => {
      const re = /^[A-Z][A-Z0-9_]*$/
      if (!next.trim()) return { ok: false, message: "须填一个环境变量/引用名（如 DEEPSEEK_API_KEY）" }
      if (!re.test(next.trim())) {
        return { ok: false, message: "引用名须为环境变量式（大写字母/数字/下划线），禁止填明文密钥值" }
      }
      return { ok: true }
    },
  })

  return (
    <FormShell title="模型设置" desc="AI 适配器 / Keys / 默认模型（字段变更即持久化到 settings/<key>）。">
      <Select
        label="Provider"
        value={provider.value}
        onChange={(e) => provider.set(e.target.value)}
        options={[
          { value: "deepseek", label: "DeepSeek" },
          { value: "openai", label: "OpenAI 兼容" },
        ]}
      />
      <Select
        label="模型"
        value={model.value}
        onChange={(e) => model.set(e.target.value)}
        options={[
          { value: "deepseek-chat", label: "deepseek-chat" },
          { value: "deepseek-reasoner", label: "deepseek-reasoner" },
        ]}
      />
      <Input
        label="API 基址"
        value={baseUrl.value}
        onChange={(e) => baseUrl.set(e.target.value)}
        placeholder="https://…"
        error={baseUrl.error}
      />
      <Input
        label="Key 引用名（环境变量/引用名）"
        value={keyRef.value}
        onChange={(e) => keyRef.set(e.target.value)}
        error={keyRef.error}
        hint="只存环境变量/引用名（如 DEEPSEEK_API_KEY），绝不落明文密钥；运行期经 ctx.credentials 取值。留空或明文均 loud-fail 拒写。"
      />
      <Note>字段变更即写入 settings/key；Key 引用名校验通过才落盘。</Note>
    </FormShell>
  )
}

/**
 * 插件设置面板（设置 Seam 宿主）：渲染 `settings.section` 槽里插件贡献的设置表单面板（每个包
 * `ExtensionBoundary`，坏插件降级不崩弹窗），并保留 `settings.cards` 槽在此聚合展示旧的设置卡片。
 * 把 `storage` 句柄随两槽 context 注入——插件面板据此把各自表单项落成各自命名空间下的 KV。
 */
function PluginsSettingsPanel({ storage }: { storage: StorageHandle }): ReactNode {
  return (
    <FormShell title="插件设置" desc="由各插件经 settings.section 槽贡献的设置表单面板（装上即出现、卸下即消失）；面板把每项落成 $BK_HOME/state/<插件 ns>/<key>。">
      <div className={styles.sections}>
        <ExtensionSlot name="settings.section" context={{ storage }} />
      </div>
      <div className={styles.cards}>
        <ExtensionSlot name="settings.cards" context={{ settingsGroups: DEFAULT_SETTINGS_GROUPS }} />
      </div>
    </FormShell>
  )
}

/** 一个设置分组的通用外壳（标题 + 说明 + 表单字段堆叠）。 */
function FormShell({ title, desc, children }: { title: string; desc: string; children: ReactNode }): ReactNode {
  return (
    <section className={styles.form}>
      <h2 className={styles.formTitle}>{title}</h2>
      <p className={styles.formDesc}>{desc}</p>
      <div className={styles.fields}>{children}</div>
    </section>
  )
}

/** 统一的「说明/持久化态」灰字提示。 */
function Note({ children }: { children: ReactNode }): ReactNode {
  return <p className={styles.note}>{children}</p>
}