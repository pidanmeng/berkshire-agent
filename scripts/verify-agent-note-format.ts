/**
 * 强制 Agent Note 的头部、生命周期相关章节、以及「曾考虑的替代方案」规则。分类与
 * 文件名归属兄弟门禁 `verify-agent-note-classification`；本脚本只关心文件内格式。
 * 精确格式与取舍约定见 `.agents/notes/README.md`。
 *
 * BK 适应：仓库主语言为中文，Agent Note 为单语中文（无 `.zh.md`/`.i18n.yaml` 三元组，
 * 见 `bk-translate-docs` 技能）。头部令牌 `# Agent Note:` 与 `Status:` 保持英文原样，
 * 结构章节名使用中文规范名。体系自落地之日起新建，故不存在「格式规范前」的历史记录。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agentNoteRoot, walkAgentNoteTree } from './agent-note-tree.ts'

/** 每个生命周期文件夹对应的 Status 行语法。 */
const STATUS: Record<string, RegExp> = {
  proposed: /^Status: proposed$/,
  implemented: /^Status: implemented$/,
  rejected: /^Status: rejected — .+$/,
}

/** 每个生命周期必需的 `##` 章节，除开通用开篇 `## 问题`。 */
const REQUIRED: Record<string, string[]> = {
  proposed: ['## 提案', '## 曾考虑的替代方案', '## 验收标准', '## 风险'],
  implemented: ['## 决策', '## 曾考虑的替代方案', '## 后果'],
  rejected: ['## 提案', '## 曾考虑的替代方案'],
}

/** `implemented/` 中禁止的章节——提案期规格用语。 */
const BANNED_IMPLEMENTED = /^## (?:提案\b|计划\b|迁移计划\b|验收标准\b)/

const { notes, errors } = walkAgentNoteTree()

for (const note of notes) {
  const fail = (msg: string): void => {
    errors.push(`format: ${note.rel} — ${msg}`)
  }
  const lines = readFileSync(resolve(agentNoteRoot, note.rel), 'utf8').split('\n')
  // 围栏示例内的格式令牌不构成文档结构。
  let inFence = false
  const prose = lines.filter((l) => {
    if (l.startsWith('```')) {
      inFence = !inFence
      return false
    }
    return !inFence
  })

  if (!/^# Agent Note: \S/.test(lines[0] ?? '')) fail('line 1 must be `# Agent Note: <title>`')
  if (lines[1] !== '') fail('line 2 must be blank')
  const status = STATUS[note.lifecycle]
  if (status !== undefined && !status.test(lines[2] ?? '')) {
    fail(`line 3 must match the ${note.lifecycle} status grammar (${String(status)})`)
  }
  if (lines[3] !== '') fail('line 4 must be blank')
  const statusLines = prose.filter(l => l.startsWith('Status:') && l !== lines[2])
  if (statusLines.length > 0 || prose.filter(l => l === lines[2]).length > 1) {
    fail('the line-3 `Status:` line must be the only one in the file')
  }

  const h2s = prose.filter(l => l.startsWith('## ')).map(l => l.trimEnd())
  if (h2s[0] !== '## 问题') fail(`the first section must be \`## 问题\` (got ${JSON.stringify(h2s[0] ?? '<none>')})`)
  for (const required of REQUIRED[note.lifecycle] ?? []) {
    if (!h2s.includes(required)) fail(`missing the required \`${required}\` section`)
  }
  if (note.lifecycle === 'implemented') {
    for (const h2 of h2s.filter(h => BANNED_IMPLEMENTED.test(h))) {
      fail(`\`${h2}\` is a proposal-era heading; an implemented Agent Note states what is (fold it into 决策/后果/测试)`)
    }
  }

  if (!h2s.includes('## 曾考虑的替代方案')) {
    fail('missing `## 曾考虑的替代方案` (record what the decision beat)')
  }
}

if (errors.length === 0) {
  console.log(`verify-agent-note-format: ${notes.length} Agent Note(s) checked, all conform to .agents/notes/README.md § 文件格式.`)
  process.exit(0)
}

console.error('verify-agent-note-format: violations found:')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)