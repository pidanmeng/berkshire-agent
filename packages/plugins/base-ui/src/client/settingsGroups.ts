/**
 * 设置分组占位契约（WP-3，应用壳）——「分组 id / label / 顺序」的唯一承载。
 *
 * 契约类型 `SettingsGroup` 定义在共享缝 `@berkshire/ui-slots`（`settings.cards` 槽的上下文），
 * 本文件给出**缺省分组骨架**（`通用设置` / `模型设置`），并随 `settings.cards` 槽 context 透传给
 * 插件卡片（见 `SettingsDialog`）。
 *
 * 诚实标注：这里是**占位 Seam**，不是已渲染的设置弹窗。「通用设置 / 模型设置」的分组上半身
 * （分组 UI、表单条目、弹窗本体）由 **WP-6** 消费并落地，本包只定义契约并渲染一个占位骨架；
 * 在 WP-6 落地前，设置分组 UI 一律标「待实现」（不当作已存在而消费）。
 */
import type { SettingsGroup } from "@berkshire/ui-slots"

/** 缺省设置分组（占位契约；WP-6 弹窗按此编排，label/order 可视产品调整）。 */
export const DEFAULT_SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: "general", label: "通用设置", order: 10, description: "数据目录、样例行、行为偏好等通用项" },
  { id: "model", label: "模型设置", order: 20, description: "AI 适配器 / Keys / 默认模型等" },
] as const

/** 缺省分组 id 集合（弹窗只渲染存在于此且被启用者）。 */
export const DEFAULT_SETTINGS_GROUP_IDS = DEFAULT_SETTINGS_GROUPS.map((g) => g.id)