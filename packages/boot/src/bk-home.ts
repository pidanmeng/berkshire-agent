/**
 * BK 配置 home（`BK_HOME`）解析（docs/config.md 目标态，本轮由用户拍板落地）。
 *
 * 平台默认（目录同名 `.bk`，macOS 遵平台惯例放 Application Support）：
 * - Windows: `%APPDATA%\.bk`
 * - macOS:   `~/Library/Application Support/.bk`
 * - Linux:   `~/.bk`
 *
 * 任何平台都可用环境变量 `BK_HOME` 覆盖。本模块只负责“算出 home 在哪”，不读内容；
 * 装载/装配读取由 boot 侧 `readCordisYml` + `importPlugin(nodeModulesDir)` 承担。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const BK_HOME_ENV = 'BK_HOME'
export const BK_HOME_DIR_NAME = '.bk'
export const CORDIS_YML = 'cordis.yml'

/** 解析 `$BK_HOME`：优先环境变量，否则按平台默认。 */
export function defaultBkHome(): string {
  const fromEnv = process.env[BK_HOME_ENV]
  if (fromEnv) return fromEnv
  if (process.platform === 'win32') {
    return join(process.env['APPDATA'] ?? homedir(), BK_HOME_DIR_NAME)
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', BK_HOME_DIR_NAME)
  }
  return join(homedir(), BK_HOME_DIR_NAME)
}

/** 顶层装配文件路径：`$BK_HOME/cordis.yml`。 */
export function cordisYmlPath(bkHome = defaultBkHome()): string {
  return join(bkHome, CORDIS_YML)
}

/** 下载的 npm 插件目录：`$BK_HOME/node_modules`（用包管理器 `bun add` 安装即落于此）。 */
export function nodeModulesDir(bkHome = defaultBkHome()): string {
  return join(bkHome, 'node_modules')
}

/** 供外部注入时，把 `BK_HOME` 显式写回进程环境（测试/夹具用）。 */
export function setBkHome(bkHome: string): void {
  process.env[BK_HOME_ENV] = bkHome
}