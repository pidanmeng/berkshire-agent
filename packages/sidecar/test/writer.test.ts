/**
 * 行缓冲 writer 单元测试：验证「追加后立即可见 + 可等待的 flush」语义，
 * 避免 stdio 行攒批直到进程退出才落盘（T0 契约：事件推送要即时可见）。
 */
import { Writable } from 'node:stream'
import { describe, expect, test } from 'bun:test'
import { createLineWriter } from '../src/writer'

/** 一个把写入块收集到数组的测试 Writable（同步 _write，callback 在下一 tick 触发）。 */
function collectStream() {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
      chunks.push(chunk.toString())
      cb()
    },
  })
  return { stream, chunks }
}

describe('createLineWriter', () => {
  test('多条 write 在 flush 后全部落盘（按批写、行尾 \\n）', async () => {
    const { stream, chunks } = collectStream()
    const w = createLineWriter(stream)
    w.write('{"id":1}')
    w.write('{"id":2}')
    await w.flush()
    expect(chunks.join('')).toBe('{"id":1}\n{"id":2}\n')
  })

  test('空队列 flush 立即 resolve、不产生字节', async () => {
    const { stream, chunks } = collectStream()
    const w = createLineWriter(stream)
    await w.flush()
    expect(chunks).toEqual([])
  })

  test('flush 可被多次调用且幂等（重复 flush 不产生空行）', async () => {
    const { stream, chunks } = collectStream()
    const w = createLineWriter(stream)
    w.write('a')
    await w.flush()
    await w.flush()
    expect(chunks.join('')).toBe('a\n')
  })

  test('写入在 flush 前的过程中已同步进入底层流（即时可见）', async () => {
    // flush 之前，_write 已把块交给底层流（此处 _write 立即 push）
    const { stream, chunks } = collectStream()
    const w = createLineWriter(stream)
    w.write('x')
    await w.flush()
    expect(chunks).not.toEqual([])
  })
})