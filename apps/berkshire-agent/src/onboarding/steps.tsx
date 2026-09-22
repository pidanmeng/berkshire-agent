/**
 * 内置步骤「选择默认配置」（步骤缝 v1 的唯一实现，见 types.ts）。
 *
 * 用户体验：一屏列出必装 `@berkshire/core`（锁定）+ 可勾选插件，点「初始化并启动」→ 生成默认
 * cordis.yml 文本 → provision（写 $BK_HOME + 重启 sidecar）。扩展步骤 = 往 `STEPS` 数组加项
 * （含组件的多步向导），v1 只有这一步。
 */
import { useCallback } from "react";
import { BASE_DATA_PLUGINS, DEFAULT_PLUGIN_OPTIONS, REQUIRED_PLUGIN } from "./defaultOptions";
import { buildCordisYml } from "./buildCordisYml";
import type { OnboardingStep, OnboardingStepProps } from "./types";
import styles from "./Onboarding.module.css";

/** 锁定项渲染（readOnly 展示当前的必装/基座项，不进入用户勾选态）。 */
function LockedOption({
  label,
  name,
  description,
}: {
  label: string;
  name: string;
  description: string;
}) {
  return (
    <label className={`${styles.option} ${styles.optionDisabled}`}>
      <input type="checkbox" checked readOnly disabled />
      <span className={styles.optionBody}>
        <strong>{label}</strong>
        <small>{description}</small>
        <code>{name}</code>
      </span>
    </label>
  );
}

/** 默认步骤：勾选默认插件，提交时生成默认 cordis.yml 并写盘+重启。 */
function DefaultCordisStep({
  selected,
  onSelectedChange,
  provision,
  busy,
  error,
}: OnboardingStepProps) {
  const toggle = useCallback(
    (id: string) => {
      onSelectedChange({ ...selected, [id]: !selected[id] });
    },
    [selected, onSelectedChange],
  );

  const submit = useCallback(() => {
    void provision(buildCordisYml(selected));
  }, [provision, selected]);

  return (
    <div className={styles.step}>
      <p className={styles.hint}>
        首次启动：选择要装载的默认插件。已选插件会写入 <code>$BK_HOME/cordis.yml</code>，随后自动
        装配并上线（此步可扩展为多步向导，v1 默认只此一步）。
      </p>

      {/* 必装：core 核心脊（锁定不可关）。 */}
      <LockedOption
        label={REQUIRED_PLUGIN.name}
        name={REQUIRED_PLUGIN.name}
        description="核心脊（能力缝 Definition 与事件桩）——必装，提供 ctx 能力面。"
      />

      {/* 数据基座（always-on，升权对齐 base-ui）：sidecar 无条件常驻，锁死不可裁剪。 */}
      <h4 className={styles.groupTitle}>数据基座（宿主常驻，不可裁剪）</h4>
      {BASE_DATA_PLUGINS.map((opt) => (
        <LockedOption
          key={opt.id}
          label={opt.label}
          name={opt.name}
          description={opt.description}
        />
      ))}

      {/* 可选项。 */}
      <h4 className={styles.groupTitle}>可装配插件</h4>
      {DEFAULT_PLUGIN_OPTIONS.map((opt) => (
        <label key={opt.id} className={styles.option}>
          <input
            type="checkbox"
            checked={!!selected[opt.id]}
            onChange={() => toggle(opt.id)}
          />
          <span className={styles.optionBody}>
            <strong>{opt.label}</strong>
            <small>{opt.description}</small>
            <code>{opt.name}</code>
          </span>
        </label>
      ))}

      {error && (
        <div className={styles.error} role="alert">
          ⚠ {error}
        </div>
      )}

      <button
        type="button"
        className={styles.primary}
        onClick={submit}
        disabled={busy}
      >
        {busy ? "初始化中…" : "初始化并启动"}
      </button>
    </div>
  );
}

/** 步骤缝的当前列表。v1 单一内置步骤；多步向导 = 在此追加（目标态：让 Cordis 插件可贡献）。 */
export const STEPS: readonly OnboardingStep[] = [
  {
    id: "default-cordis",
    title: "选择默认配置",
    description: "勾选要装载的默认插件。",
    component: DefaultCordisStep,
  },
];