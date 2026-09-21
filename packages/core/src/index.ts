// 类型化事件/服务增强（declare module '@berkshire/cordis'）——仅导入即生效。
// 各服务/事件的增强已 co-locate 到各自文件（services/*.ts、seams/notify.ts、events.ts），
// 本入口只是把它们全部带入，使得 `import '@berkshire/core'` 一次性激活全部增强；
// 需要单服务粒度的可按子路径导入（见 package.json exports）。
import './events'

export * from './brand'
export * from './types'

export * from './services/log'
export * from './services/capabilities'
export * from './seams/notify'
export * from './seams/storage'
export * from './services/slots'
export * from './services/clientModules'
export * from './services/datasets'
export * from './seams/dataSources'
export * from './services/database'
export * from './services/marketTime'
export * from './services/indicators'
export * from './indicators'
export * from './dataContract'

// core 脊装配插件（装载即提供核心服务）
export * from './core'
