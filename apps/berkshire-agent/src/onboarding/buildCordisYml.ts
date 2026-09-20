/**
 * 从勾选态构建要写入 `$BK_HOME/cordis.yml` 的完整 YAML 文本（顶层插件条目列表）。
 *
 * 词法安全：插件名/描述都是**编译期常量**（见 defaultOptions.ts），不接收用户自由输入——首启
 * 阶段没有可注入点；后续迈向 v2 的「任意 config 编辑」前需引入 YAML 序列化与校验（目标态）。
 * 这里用单引号对 `name` 做引号包裹并转义内部单引号，防御未来接入自由输入时的注入回归。
 */
import { DEFAULT_PLUGIN_OPTIONS, REQUIRED_PLUGIN } from "./defaultOptions";

/** 单引号包裹 + 转义，作为 YAML 字符串的保守序列化。 */
function yamlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildCordisYml(selected: Record<string, boolean>): string {
  const lines: string[] = [
    "# 由 Berkshire Agent 首次启动向导生成（用户选择）：只由 $BK_HOME/cordis.yml 驱动装载。",
    "# 增删插件 = 增删行；插件的运行时依赖需在 $BK_HOME/node_modules（v1 dev 走 workspace 解析）。",
  ];
  // 必装：core 核心脊。
  lines.push(`- id: ${yamlStr(REQUIRED_PLUGIN.id)}`);
  lines.push(`  name: ${yamlStr(REQUIRED_PLUGIN.name)}`);
  // 用户勾选的可选项。
  for (const opt of DEFAULT_PLUGIN_OPTIONS) {
    if (!selected[opt.id]) continue;
    lines.push(`- id: ${yamlStr(opt.id)}`);
    lines.push(`  name: ${yamlStr(opt.name)}`);
  }
  return `${lines.join("\n")}\n`;
}