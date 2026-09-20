/**
 * OnboardingGate —— 首启引导全屏（宿主侧，`$BK_HOME/cordis.yml` 落盘前显示）。
 *
 * 诚实标注：首启发生在 cordis.yml **之前**，故这不是 cordis.yml 装载的插件，而是宿主侧的
 * pre-config 引导；它通过 `steps.ts` 的类型化 `STEPS` seam 预留多步扩展（目标态：Cordis 插件
 * 可贡献步骤）。用户提交后由 Rust 单写者写盘并重启 sidecar；本组件经 `onDone`（宿主 useAppPhase
 * 的 refresh）在轮询切到 ready 前保持忙碌态。
 */
import { useCallback, useState } from "react";
import { provisionBkHome } from "../lib/api";
import { STEPS } from "./steps";
import { defaultSelection } from "./defaultOptions";
import styles from "./Onboarding.module.css";

export function OnboardingGate({ onDone }: { onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>(defaultSelection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex] ?? STEPS[0];

  const provision = useCallback(
    async (cordisYml: string) => {
      setBusy(true);
      setError(null);
      try {
        await provisionBkHome(cordisYml);
        // 写盘+重启已发出：让宿主轮询切 ready；若只有一步则直接收尾。
        if (STEPS.length <= 1) {
          onDone();
        } else {
          setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const StepComponent = step.component;

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Berkshire Agent · 首次启动</h1>
        <h2 className={styles.stepTitle}>{step.title}</h2>
        {step.description && <p className={styles.hint}>{step.description}</p>}

        <StepComponent
          selected={selected}
          onSelectedChange={setSelected}
          provision={provision}
          busy={busy}
          error={error}
        />
      </div>
    </div>
  );
}

export default OnboardingGate;