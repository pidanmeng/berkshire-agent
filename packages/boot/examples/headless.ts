import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import * as core from '@berkshire/core'
import * as notify from '@berkshire/plugin-notify-console'
import { Boot } from '../src/index'
import type { PatchOverlay } from '../src/index'

/**
 * headless 最小落样例入口：`bun run packages/boot/examples/headless.ts`（从仓库根运行）。
 *
 * 演示「装一个插件 → 声明依赖 → 触发 typed 事件 → 插件响应 → 优雅卸除（逆序清理）」，
 * 以及「bundle 配置 enable/disable」对最终插件树的影响。
 *
 * 依赖解析器把 bundle 里的插件名映射到真实插件对象（目标态会由 loader/HMR 完成）。
 */
const resolver = (name: string) =>
  ({
    '@berkshire/core': core,
    '@berkshire/plugin-notify-console': notify,
  })[name]

/** 读取某 bundle 的真实 cordis.patch.yml（从仓库根 cwd 解析）。 */
function readPatch(rel: string): PatchOverlay {
  return parse(readFileSync(rel, 'utf8')) as PatchOverlay
}

async function scenario(title: string, layers: PatchOverlay[]) {
  const boot = new Boot()
  await boot.mountFromLayers(layers, resolver)
  console.log(`\n=== ${title} ===`)

  const matrix = boot.ctx.capabilities.matrix()
  const caps = matrix.map((c) => `${c.id}(${boot.ctx.capabilities.usable(c.id)})`).join(', ')
  console.log('capabilities:', caps || '(none)')

  if (boot.ctx.notifier.available) {
    const delivered = await boot.ctx.notifier.send({
      message: '交易日 09:30 数据已更新',
      level: 'info',
    })
    console.log('delivered to:', delivered.join(', '))
    const log = boot.ctx.log.filter('notify/request').map((e) => e.data)
    console.log('log snapshot:', JSON.stringify(log))
  } else {
    try {
      await boot.ctx.notifier.send({ message: 'should never deliver' })
    } catch (err) {
      console.log('send fail-closed →', (err as Error).message)
    }
  }

  const order = await boot.dispose()
  console.log('dispose order:', order.join(' -> '), '(后装先卸 · 逆序清理)')
}

async function main() {
  // 从仓库根运行：`bun run packages/boot/examples/headless.ts`
  const base = readPatch('packages/bundle/base/cordis.patch.yml')
  const headless = readPatch('packages/bundle/headless/cordis.patch.yml')

  await scenario('headless · notify-console 启用', [base])
  await scenario('headless · notify-console 禁用（headless 覆盖启用）', [base, headless])
}

await main()