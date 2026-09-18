import type { Writable } from 'node:stream'

export interface LineWriter {
  /** 追加一条 ndjson 行（内部按批写，保持即时可见）。 */
  write(line: string): void
  /** 等待所有已排队的 write 落盘（供 shutdown 前确保响应已送达）。 */
  flush(): Promise<void>
}

/** 把 ndjson 行写入一个 Writable：批处理 + 可等待的 flush。 */
export function createLineWriter(stream: Writable): LineWriter {
  const pending: string[] = []
  let active = 0
  let onIdle: (() => void) | null = null

  const drain = () => {
    if (active > 0) return
    if (pending.length > 0) {
      const chunk = `${pending.splice(0, pending.length).join('\n')}\n`
      active += 1
      stream.write(chunk, () => {
        active -= 1
        drain()
        if (active === 0 && onIdle) {
          const cb = onIdle
          onIdle = null
          cb()
        }
      })
    }
  }

  return {
    write(line: string) {
      pending.push(line)
      drain()
    },
    flush() {
      if (active === 0 && pending.length === 0) return Promise.resolve()
      return new Promise<void>((resolveFlush) => {
        onIdle = () => resolveFlush()
        drain()
      })
    },
  }
}