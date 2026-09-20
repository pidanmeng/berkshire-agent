// 证明「随处定义随处消费」在当前 cordis/code 下原生成立：
// 一个【非 core】插件用 Cordis 正规姿势(new FixtureService(ctx) → super(ctx,'fixture') 自注册)
// 提供新服务 ctx.fixture;另一个插件 inject:['fixture'] 消费;且【消费者先装、提供者后装】——
// 依赖缺位时消费者不装载,提供者一出现 notify 就唤醒它,这是 Cordis 的响应式依赖解析,
// 不需要手工排序、不经过 core.ts / sidecar.ts。
// 真实场景:提供者就是 packages/plugins/<x>/src/index.ts。
// 用法: bun run packages/boot/examples/define-anywhere.ts
import { Context, Service, type Plugin } from '@berkshire/cordis'

// —— 服务提供插件(在 core 之外): Service 子类,构造即自注册成 ctx.fixture,挂在本插件 fiber 上。
class FixtureService extends Service {
  greet = '来自插件包的服务'
  constructor(ctx: Context) {
    super(ctx, 'fixture') // 与 DSH 的 TimerService 完全同形
  }
}
const providerPlugin: Plugin = {
  name: 'fixture-provider',
  apply(ctx: Context) {
    new FixtureService(ctx)
  },
}

// —— 服务消费插件: inject 声明依赖,读 ctx.fixture(类型增强可经 declare module,此处用 as 简化)
const consumerPlugin: Plugin = {
  name: 'fixture-consumer',
  inject: ['fixture'] as string[],
  apply(ctx: Context) {
    const cast = ctx as unknown as Context & { fixture: FixtureService }
    console.log('consumer 读到:', cast.fixture.greet)
  },
}

async function main() {
  const ctx = new Context()
  // 故意【先装消费者,后装提供者】,证明响应式依赖解析(非手工排序、不经核心)。
  await ctx.plugin(consumerPlugin, {})
  await ctx.plugin(providerPlugin, {})
  console.log('断言: consumer 已消费到插件包定义的服务')
}

void main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})