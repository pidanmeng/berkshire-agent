/**
 * Agent Note 目录树的结构化事实源。生命周期与分类集合在 `.agents/notes/README.md`
 * 中封闭；导入本模块是纯函数，无副作用。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const agentNoteRoot = resolve(import.meta.dirname, '../.agents/notes')

/** 活跃 Agent Note 生命周期的封闭集合（`.agents/notes/` 下的顶层目录）。 */
const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const

/**
 * Agent Note 分类的封闭集合（每个生命周期下的嵌套目录）。新增分类是有意为之：
 * 必须同时扩展本列表与 README 的「分类」一节。门禁拒绝未列于本处的目录。
 */
export const AGENT_NOTE_CLASSES = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'] as const

/** 历史 implemented 记录位于活跃生命周期目录树之外。 */
const AGENT_NOTE_ARCHIVE = 'archived'

/** 允许直接置于生命周期根部的非 Agent Note Markdown。 */
const ROOT_ALLOWLIST = new Set(['AGENTS.md'])

/** 遍历发现的一条 Agent Note 文件。 */
export interface AgentNote {
  lifecycle: string
  /** 相对 `.agents/notes/` 的路径。 */
  rel: string
  /** 文件名中的 `yyyy-mm-dd`。 */
  date: string
}

/** 在某个生命周期目录下递归收集所有 `*.md` 的相对路径。 */
function walkDir(abs: string, relPrefix: string, out: string[]): void {
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walkDir(join(abs, entry.name), `${relPrefix}/${entry.name}`, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(`${relPrefix}/${entry.name}`)
    }
  }
}

/**
 * 遍历 Agent Note 目录树，强制结构规则。返回每条合法 Agent Note 以及每条违例
 * （未知生命周期/分类目录、深度错误、文件名不合规）对应的一条错误信息。
 * 调用方把非空错误列表视为致命。
 */
export function walkAgentNoteTree(): { notes: AgentNote[]; errors: string[] } {
  const notes: AgentNote[] = []
  const errors: string[] = []
  // 生命周期集合同样封闭：`.agents/notes/` 下任何既非已知生命周期、亦非归档的
  // 目录，都会藏着对上面遍历不可见的 Agent Note。
  for (const entry of readdirSync(agentNoteRoot, { withFileTypes: true })) {
    if (entry.name === 'INDEX.md') {
      errors.push('structure: INDEX.md — centralized Agent Note indexes are forbidden; browse the lifecycle/class tree or search the repository')
      continue
    }
    if (entry.isDirectory()
      && entry.name !== AGENT_NOTE_ARCHIVE
      && !(AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)) {
      errors.push(`structure: ${entry.name}/ — unknown lifecycle folder (allowed: ${AGENT_NOTE_LIFECYCLES.join(', ')}, plus ${AGENT_NOTE_ARCHIVE}/)`)
    }
  }
  const matches: string[] = []
  for (const lifecycle of AGENT_NOTE_LIFECYCLES) {
    // 空生命周期目录可缺省（git 不跟踪空目录）；存在才遍历。
    const dir = join(agentNoteRoot, lifecycle)
    if (!existsSync(dir)) continue
    walkDir(dir, lifecycle, matches)
  }
  for (const match of [...matches].sort()) {
    const segs = match.split('/')
    const lifecycle = segs[0]
    // 允许直接置于生命周期根部的文件（如 implemented/AGENTS.md）。
    if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) continue
    const cls = segs[1]
    const base = segs[2]
    if (segs.length !== 3 || cls === undefined || base === undefined) {
      errors.push(`structure: ${match} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})`)
      continue
    }
    if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
      errors.push(`structure: ${match} — unknown class folder "${cls}" (allowed: ${AGENT_NOTE_CLASSES.join(', ')})`)
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(base)) {
      errors.push(`structure: ${match} — filename must be yyyy-mm-dd-topic.md`)
      continue
    }
    notes.push({ lifecycle, rel: match, date: base.slice(0, 10) })
  }
  return { notes, errors }
}