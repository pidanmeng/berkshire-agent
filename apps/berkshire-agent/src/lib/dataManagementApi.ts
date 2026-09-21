/**
 * 宿主侧数据管理 API 实现（`@berkshire/ui-slots` 的 `DataManagementApi` 契约实现，
 * 随 `data.management` 槽 context 注入插件数据管理页）。
 *
 * 把 webview 薄客户端 `lib/api.ts` 的 `data-sources/*` / `database/*` 命令 + 事件，适配成
 * `DataManagementApi` 契约：快照（一次拉齐 providers/datasets/路由/本地库表/Key 配置态）、
 * 偏好路由切换、凭据探测（**只探不存**——对齐 AGENTS.md 凭据红线，不落盘明文密钥）、
 * 采集（sync）与落库事件订阅。页面不自连桥，只消费本句柄。
 *
 * 统一走既有管线：Tauri command → Rust bridge → sidecar 协议层 → core 服务 → DuckDB/storage。
 */
import type { DataManagementApi, DataManagementSnapshotDto } from "@berkshire/ui-slots";
import {
  databaseTables,
  dataSourcesList,
  dataSourcesProbe,
  dataSourcesSetPreference,
  dataSourcesSync,
  onDatabaseUpdated,
} from "./api";

/** 构造宿主 `DataManagementApi`（单例化使用：`useMemo` 外包，避免每帧重建/重复订阅）。 */
export function createDataManagementApi(): DataManagementApi {
  return {
    async snapshot(): Promise<DataManagementSnapshotDto> {
      const snap = await dataSourcesList();
      const tables = await databaseTables();
      // 扶摇 Key 配置态 = 该 provider 当前是否「可用」（可用性由 provider 按环境变量求值）→
      // 任一只 dataset 可用即视为已配置；绝不从 storage 读 Key（不落盘明文）。
      const fuyao = snap.providers.find((p) => p.id === "fuyao");
      const apiKeyConfigured = fuyao
        ? Object.values(fuyao.datasets).some((a) => a.available)
        : false;
      return {
        providers: snap.providers,
        datasets: snap.datasets,
        resolved: snap.resolved,
        tables,
        apiKeyConfigured,
      };
    },

    async setPreference(dataset, provider) {
      await dataSourcesSetPreference(dataset, provider);
    },

    async probe(providerId, apiKey) {
      return dataSourcesProbe(providerId, apiKey);
    },

    async sync(dataset, params) {
      return dataSourcesSync(dataset, params);
    },

    async tables() {
      return databaseTables();
    },

    onDatabaseUpdated(cb) {
      let unlisten: (() => void) | undefined;
      let disposed = false;
      onDatabaseUpdated(cb).then((u) => {
        unlisten = u;
        if (disposed) u(); // listen 就绪前已退订 → 立即补退订，避免泄漏
      });
      return () => {
        disposed = true;
        unlisten?.();
      };
    },
  };
}
