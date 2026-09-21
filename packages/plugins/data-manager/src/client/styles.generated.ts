/**
 * @generated 由 packages/plugins/data-manager/scripts/compile-styles.ts 生成（插件独立打包阶段，
 * lightningcss 编译 .module.css → 哈希类名 + 注入代码）。**请勿手改。**
 *
 * 供给侧约定：`.tsx` webview 半身 import 本文件的 classNames 拿到哈希类名；
 * sidecar 侧 import 本文件的 css 作为注入代码经 `client/list` 交给 host。
 * host（loader.ts）只把 css 塞进 \`<style data-bk-module>\`，不参与哈希。
 */
export interface CompiledModuleStyle { classNames: Record<string, string>; css: string }

export const dataManager: CompiledModuleStyle = {
  "classNames": {
    "tableItem": "_3zNjIq_tableItem",
    "chip": "_3zNjIq_chip",
    "statusOk": "_3zNjIq_statusOk",
    "routeCurrent": "_3zNjIq_routeCurrent",
    "keyRow": "_3zNjIq_keyRow",
    "routeSelect": "_3zNjIq_routeSelect",
    "section": "_3zNjIq_section",
    "sectionHint": "_3zNjIq_sectionHint",
    "probeOk": "_3zNjIq_probeOk",
    "probeBad": "_3zNjIq_probeBad",
    "datasetChips": "_3zNjIq_datasetChips",
    "tableList": "_3zNjIq_tableList",
    "statusBad": "_3zNjIq_statusBad",
    "probeMsg": "_3zNjIq_probeMsg",
    "chipBad": "_3zNjIq_chipBad",
    "tableCount": "_3zNjIq_tableCount",
    "syncControls": "_3zNjIq_syncControls",
    "syncBad": "_3zNjIq_syncBad",
    "syncParams": "_3zNjIq_syncParams",
    "statusText": "_3zNjIq_statusText",
    "statusDot": "_3zNjIq_statusDot",
    "chipOk": "_3zNjIq_chipOk",
    "syncMsg": "_3zNjIq_syncMsg",
    "keyInput": "_3zNjIq_keyInput",
    "routeLabel": "_3zNjIq_routeLabel",
    "tablesRow": "_3zNjIq_tablesRow",
    "syncOk": "_3zNjIq_syncOk",
    "page": "_3zNjIq_page",
    "providerRow": "_3zNjIq_providerRow",
    "routeRow": "_3zNjIq_routeRow",
    "sectionTitle": "_3zNjIq_sectionTitle",
    "tableName": "_3zNjIq_tableName",
    "statusRow": "_3zNjIq_statusRow",
    "providerId": "_3zNjIq_providerId"
  },
  "css": "._3zNjIq_page{gap:var(--bk-space-4);padding:var(--bk-space-2) 0;flex-direction:column;display:flex}._3zNjIq_section{border:1px solid var(--bk-color-neutral);border-radius:var(--bk-radius-lg);background:var(--bk-color-neutral-soft);padding:var(--bk-space-3) var(--bk-space-4);gap:var(--bk-space-3);flex-direction:column;display:flex}._3zNjIq_sectionTitle{font-size:var(--bk-font-size-lg);color:var(--bk-color-fg);margin:0;font-weight:600}._3zNjIq_sectionHint{font-size:var(--bk-font-size-sm);color:var(--bk-color-fg-muted);margin:0}._3zNjIq_providerRow{align-items:flex-start;gap:var(--bk-space-3);flex-wrap:wrap;display:flex}._3zNjIq_providerId{font-family:var(--bk-font-mono);font-size:var(--bk-font-size-sm);min-width:7rem}._3zNjIq_datasetChips{gap:var(--bk-space-2);flex-wrap:wrap;align-items:center;display:flex}._3zNjIq_chip{align-items:center;gap:var(--bk-space-1);font-size:var(--bk-font-size-sm);padding:var(--bk-space-1) var(--bk-space-2);border-radius:var(--bk-radius-md);border:1px solid var(--bk-color-neutral);color:var(--bk-color-fg-muted);display:inline-flex}._3zNjIq_chipOk{border-color:var(--bk-color-success);color:var(--bk-color-success);background:var(--bk-color-success-soft)}._3zNjIq_chipBad{border-color:var(--bk-color-danger);color:var(--bk-color-danger);background:var(--bk-color-danger-soft);cursor:help}._3zNjIq_routeRow{align-items:center;gap:var(--bk-space-3);flex-wrap:wrap;display:flex}._3zNjIq_routeLabel{min-width:9rem;font-size:var(--bk-font-size-md);color:var(--bk-color-fg)}._3zNjIq_routeCurrent{font-size:var(--bk-font-size-sm);color:var(--bk-color-fg-muted)}._3zNjIq_routeSelect{min-width:12rem}._3zNjIq_keyRow{align-items:flex-end;gap:var(--bk-space-3);flex-wrap:wrap;display:flex}._3zNjIq_keyInput{width:22rem}._3zNjIq_probeMsg{font-size:var(--bk-font-size-sm);color:var(--bk-color-fg-muted)}._3zNjIq_probeOk{color:var(--bk-color-success)}._3zNjIq_probeBad{color:var(--bk-color-danger)}._3zNjIq_tablesRow{justify-content:space-between;align-items:baseline;gap:var(--bk-space-2);flex-wrap:wrap;display:flex}._3zNjIq_tableList{gap:var(--bk-space-1);flex-direction:column;margin:0;padding:0;list-style:none;display:flex}._3zNjIq_tableItem{align-items:baseline;gap:var(--bk-space-2);font-size:var(--bk-font-size-sm);display:flex}._3zNjIq_tableName{font-family:var(--bk-font-mono);color:var(--bk-color-fg)}._3zNjIq_tableCount{color:var(--bk-color-fg-muted)}._3zNjIq_syncControls{align-items:flex-end;gap:var(--bk-space-3);flex-wrap:wrap;display:flex}._3zNjIq_syncParams{width:18rem}._3zNjIq_syncMsg{font-size:var(--bk-font-size-sm);color:var(--bk-color-fg-muted)}._3zNjIq_syncOk{color:var(--bk-color-success)}._3zNjIq_syncBad{color:var(--bk-color-danger)}._3zNjIq_statusRow{align-items:baseline;gap:var(--bk-space-2);flex-wrap:wrap;display:flex}._3zNjIq_statusText{font-size:var(--bk-font-size-sm);color:var(--bk-color-fg-muted)}._3zNjIq_statusDot{background:var(--bk-color-neutral);border-radius:50%;width:.55rem;height:.55rem;display:inline-block}._3zNjIq_statusOk{background:var(--bk-color-success)}._3zNjIq_statusBad{background:var(--bk-color-danger)}"
}
