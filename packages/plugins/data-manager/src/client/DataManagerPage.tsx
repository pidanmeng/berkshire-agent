/**
 * 数据管理页（`data.management` 槽，插件自声明路由 `/data` 的页面内容）。
 *
 * 页面**不自连桥**：宿主把 `DataManagementApi` 句柄经槽 context 注入（对齐 `root` 槽注入
 * storage/titleBar 的姿势），本页只消费契约——拉主快照、按数据集切换 provider（偏好路由）、
 * 扶摇 API Key「探测」（**只探不存**，对齐凭据红线）、DuckDB 本地库表 + 采集（sync，整表替换语义）。
 *
 * 诚实边界（页面展示即当前真实能力）：
 * - 数据缺口/桥断一律 fail-closed：快照失败显示错误横幅，不显示「看似合理」的空态；
 * - `minute` 数据集声明但**未落地**（不可选、不可采集），页面如实展示；
 * - 采集参数（symbols/start/end）仅对扶摇 daily/financial/adj_factor 有意义，其余透传被忽略；
 * - 单写者：采集只经 `api.sync`（→ sidecar `ctx.database` exec），页面无任何裸写 DB 路径。
 */
import { useCallback, useEffect, useState } from "react"
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@berkshire/ui"
import type {
  DataManagementApi,
  DataManagementDatasetDto,
  DataManagementSnapshotDto,
} from "@berkshire/ui-slots"
import { dataManager as styles } from "./styles.generated"

export interface DataManagerPageProps {
  context: { api: DataManagementApi }
}

/** 默认可采集标的（示例；空串 = 不传 symbols，realtime 忽略、daily 等跳过）。 */
const DEFAULT_SYMBOLS = "600000.SH,000001.SZ"

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export default function DataManagerPage({ context }: DataManagerPageProps) {
  const { api } = context

  const [snap, setSnap] = useState<DataManagementSnapshotDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [probeMsg, setProbeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [probing, setProbing] = useState(false)
  const [syncBusy, setSyncBusy] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const refresh = useCallback(async () => {
    try {
      setSnap(await api.snapshot())
      setError(null)
    } catch (e) {
      setError(`桥接/快照失败（fail-closed）：${errText(e)}`)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 落库事件（database/dataset-updated）→ 自动刷新本地库表与行数。
  useEffect(() => api.onDatabaseUpdated(() => void refresh()), [api, refresh])

  async function onPreference(dataset: string, provider: string) {
    try {
      await api.setPreference(dataset, provider)
      setError(null)
      await refresh()
    } catch (e) {
      setError(`切换路由失败：${errText(e)}`)
    }
  }

  async function onProbeSave() {
    const key = keyInput.trim()
    if (!key) {
      setProbeMsg({ ok: false, text: "先输入 API Key 再探测" })
      return
    }
    setProbing(true)
    try {
      const r = await api.probe("fuyao", key)
      if (r.ok) {
        setProbeMsg({ ok: true, text: "探测通过（只探不存；provider 只读环境变量 FUYAO_API_KEY）" })
        await refresh()
      } else {
        setProbeMsg({ ok: false, text: `探测失败：${r.reason ?? "未知原因"}` })
      }
    } catch (e) {
      setProbeMsg({ ok: false, text: `探测出错：${errText(e)}` })
    } finally {
      setProbing(false)
    }
  }

  async function onSync(dataset: string) {
    setSyncBusy(dataset)
    const params: Record<string, unknown> = {}
    if (symbols.trim() !== "") params["symbols"] = symbols.trim()
    if (start.trim() !== "") params["start"] = start.trim()
    if (end.trim() !== "") params["end"] = end.trim()
    try {
      const r = await api.sync(dataset, params)
      setSyncMsg({ ok: true, text: `「${dataset}」采集完成：${r.rows} 行（整表替换）` })
    } catch (e) {
      setSyncMsg({ ok: false, text: `「${dataset}」采集失败：${errText(e)}` })
    } finally {
      setSyncBusy(null)
    }
  }

  return (
    <div className={styles.classNames.page}>
      <h2 className={styles.classNames.sectionTitle}>数据管理</h2>
      <p className={styles.classNames.sectionHint}>
        数据源按功能分类（数据集）独立路由——每个接口（数据集）都可由不同 provider 提供；
        凭据只探不存（provider 运行期只读环境变量），DuckDB 本地库单写者采集。
      </p>

      {error && (
        <div className={`${styles.classNames.syncMsg} ${styles.classNames.syncBad}`}>{error}</div>
      )}

      {snap ? (
        <>
          <ProvidersSection snap={snap} />
          <RoutingSection snap={snap} onPreference={onPreference} />
          <ApiKeySection
            configured={snap.apiKeyConfigured}
            value={keyInput}
            onChange={setKeyInput}
            probing={probing}
            msg={probeMsg}
            onProbeSave={onProbeSave}
          />
          <LocalDbSection
            snap={snap}
            syncBusy={syncBusy}
            syncMsg={syncMsg}
            symbols={symbols}
            setSymbols={setSymbols}
            start={start}
            setStart={setStart}
            end={end}
            setEnd={setEnd}
            onSync={onSync}
            onRefresh={refresh}
          />
        </>
      ) : (
        <EmptyState title="加载中…" description="正在拉取数据源快照" />
      )}
    </div>
  )
}

// ---- 区段 ----

function ProvidersSection({ snap }: { snap: DataManagementSnapshotDto }) {
  return (
    <section className={styles.classNames.section}>
      <h3 className={styles.classNames.sectionTitle}>数据源（Providers）</h3>
      <p className={styles.classNames.sectionHint}>
        已注册的数据源 provider 与它们能服务的数据集（当前可用性）。
      </p>
      {snap.providers.length === 0 && (
        <EmptyState title="无数据源 provider" description="尚未注册任何 provider（fuyao / csv）。" />
      )}
      {snap.providers.map((p) => (
        <div key={p.id} className={styles.classNames.providerRow}>
          <span className={styles.classNames.providerId}>{p.id}</span>
          <span className={styles.classNames.datasetChips}>
            {Object.entries(p.datasets).map(([ds, a]) => (
              <span key={ds} title={a.available ? undefined : a.reason}>
                <Badge kind={a.available ? "success" : "danger"} variant="soft">
                  {ds} {a.available ? "✓" : "✗"}
                </Badge>
              </span>
            ))}
          </span>
        </div>
      ))}
    </section>
  )
}

function RoutingSection({
  snap,
  onPreference,
}: {
  snap: DataManagementSnapshotDto
  onPreference: (dataset: string, provider: string) => Promise<void>
}) {
  return (
    <section className={styles.classNames.section}>
      <h3 className={styles.classNames.sectionTitle}>数据集路由</h3>
      <p className={styles.classNames.sectionHint}>
        每个数据集独立路由到候选 provider（偏好优先，缺省回退声明 defaultSource 或首候选）。
      </p>
      {snap.datasets.map((d) => (
        <DatasetRouteRow key={d.id} d={d} snap={snap} onPreference={onPreference} />
      ))}
    </section>
  )
}

function DatasetRouteRow({
  d,
  snap,
  onPreference,
}: {
  d: DataManagementDatasetDto
  snap: DataManagementSnapshotDto
  onPreference: (dataset: string, provider: string) => Promise<void>
}) {
  const current = snap.resolved[String(d.id)] ?? null
  const all = snap.providers.flatMap((p) =>
    p.datasets[String(d.id)] !== undefined ? [{ provider: p, avail: p.datasets[String(d.id)]! }] : [],
  )
  const candidates = all.filter((x) => x.avail.available)
  const options = [
    ...candidates.map((x) => ({ value: x.provider.id, label: x.provider.label })),
    ...all
      .filter((x) => !x.avail.available)
      .map((x) => ({
        value: x.provider.id,
        label: `${x.provider.label}（不可用：${x.avail.reason ?? "?"}）`,
        disabled: true,
      })),
  ]
  return (
    <div className={styles.classNames.routeRow}>
      <span className={styles.classNames.routeLabel}>{d.label}</span>
      <Select
        className={styles.classNames.routeSelect}
        aria-label={`${d.label} 的数据源`}
        value={current ?? ""}
        options={options}
        onChange={(e) => void onPreference(String(d.id), e.target.value)}
        hint={current ? `当前：${current}` : undefined}
      />
      {candidates.length === 0 && (
        <span className={`${styles.classNames.syncMsg} ${styles.classNames.syncBad}`}>
          无可用候选源（缺 Key / 缺文件）
        </span>
      )}
    </div>
  )
}

function ApiKeySection({
  configured,
  value,
  onChange,
  probing,
  msg,
  onProbeSave,
}: {
  configured: boolean
  value: string
  onChange: (v: string) => void
  probing: boolean
  msg: { ok: boolean; text: string } | null
  onProbeSave: () => Promise<void>
}) {
  return (
    <section className={styles.classNames.section}>
      <h3 className={styles.classNames.sectionTitle}>扶摇 API Key</h3>
      <p className={styles.classNames.sectionHint}>
        只探不存：粘贴 Key 实探验证（调扶摇快照接口）；探测通过后，请在环境变量
        `FUYAO_API_KEY` 配置以让 provider 运行期取值（**不落盘明文、不打印**）。
      </p>
      <div className={styles.classNames.statusRow}>
        <span
          className={`${styles.classNames.statusDot} ${configured ? styles.classNames.statusOk : styles.classNames.statusBad}`}
        />
        <span className={styles.classNames.statusText}>
          {configured ? "已配置（环境变量 FUYAO_API_KEY）" : "未配置"}
        </span>
      </div>
      <div className={styles.classNames.keyRow}>
        <Input
          className={styles.classNames.keyInput}
          type="password"
          label="API Key"
          placeholder="粘贴待验证的 Key"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button loading={probing} onClick={() => void onProbeSave()}>
          探测验证
        </Button>
      </div>
      {msg && (
        <span className={`${styles.classNames.probeMsg} ${msg.ok ? styles.classNames.probeOk : styles.classNames.probeBad}`}>
          {msg.text}
        </span>
      )}
    </section>
  )
}

function LocalDbSection({
  snap,
  syncBusy,
  syncMsg,
  symbols,
  setSymbols,
  start,
  setStart,
  end,
  setEnd,
  onSync,
  onRefresh,
}: {
  snap: DataManagementSnapshotDto
  syncBusy: string | null
  syncMsg: { ok: boolean; text: string } | null
  symbols: string
  setSymbols: (v: string) => void
  start: string
  setStart: (v: string) => void
  end: string
  setEnd: (v: string) => void
  onSync: (dataset: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  return (
    <section className={styles.classNames.section}>
      <div className={styles.classNames.tablesRow}>
        <h3 className={styles.classNames.sectionTitle}>本地库（DuckDB，单写者）</h3>
        <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
          刷新
        </Button>
      </div>
      <p className={styles.classNames.sectionHint}>
        内嵌表清单与行数；「采集」= 经 sync 编排取数 → 整表替换（重复采集不累积）。
      </p>
      {snap.tables.length === 0 ? (
        <EmptyState title="本地库为空" description="还没有任何内嵌表，先对某数据集执行一次采集。" />
      ) : (
        <div className={styles.classNames.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>表名</TableHead>
                <TableHead>行数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snap.tables.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className={styles.classNames.tableName}>{t.name}</TableCell>
                  <TableCell className={styles.classNames.tableCount}>{t.rowCount} 行</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className={styles.classNames.syncControls}>
        <Input
          className={styles.classNames.syncParams}
          label="标的（逗号分隔，daily/adj_factor/financial 用）"
          placeholder={DEFAULT_SYMBOLS}
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
        />
        <Input label="start（yyyy-mm-dd）" placeholder="可选" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input label="end（yyyy-mm-dd）" placeholder="可选" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className={styles.classNames.datasetChips}>
        {snap.datasets.map((d) => (
          <Button
            key={d.id}
            size="sm"
            variant="ghost"
            loading={syncBusy === String(d.id)}
            disabled={!snap.resolved[String(d.id)]}
            onClick={() => void onSync(String(d.id))}
          >
            采集 {d.label}
          </Button>
        ))}
      </div>
      {syncMsg && (
        <span className={`${styles.classNames.syncMsg} ${syncMsg.ok ? styles.classNames.syncOk : styles.classNames.syncBad}`}>
          {syncMsg.text}
        </span>
      )}
    </section>
  )
}
