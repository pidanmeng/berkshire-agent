/**
 * 强制 Agent Note 的生命周期/分类路径与带日期文件名。结构规则与 `agent-note-tree.ts`
 * 共享；封闭的分类规则见 `.agents/notes/README.md`。
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { walkAgentNoteTree } from './agent-note-tree.ts'

const { notes, errors } = walkAgentNoteTree()

// 让旧的家目录不再可用，新记录不会静默逃出本目录树。
for (const legacyRoot of ['docs/rfc', 'docs/rfcs']) {
  if (existsSync(resolve(import.meta.dirname, '..', legacyRoot))) {
    errors.push(`legacy-path: ${legacyRoot}/ is forbidden — put Agent Notes under .agents/notes/`)
  }
}

if (errors.length === 0) {
  console.log(`verify-agent-note-classification: ${notes.length} Agent Note(s) checked, structure consistent.`)
  process.exit(0)
}

console.error('verify-agent-note-classification: violations found:')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)