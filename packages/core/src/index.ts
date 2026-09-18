// 类型化事件/服务增强（declare module 'cordis'）——仅导入即生效
import './events'

export * from './brand'
export * from './types'

export * from './services/log'
export * from './services/capabilities'
export * from './seams/notify'

// core 脊装配插件（装载即提供核心服务）
export * from './core'