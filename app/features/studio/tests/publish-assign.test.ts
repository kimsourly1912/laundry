import { describe, expect, it, vi } from 'vitest'
import { publishAndAssign } from '../utils/publish-assign'

describe('Publish and assign (pilot plan §2)', () => {
  it('succeeds only after the published version is attached', async () => {
    const calls: string[] = []
    const result = await publishAndAssign({
      publish: async () => (calls.push('publish'), 3),
      attach: async () => calls.push('attach'),
    })
    expect(result).toEqual({ status: 'assigned', number: 3 })
    expect(calls).toEqual(['publish', 'attach'])
  })

  it('doesn\'t attach when the publish fails', async () => {
    const attach = vi.fn()
    const error = new Error('checks failed')
    expect(await publishAndAssign({ publish: () => Promise.reject(error), attach })).toEqual({ status: 'publishFailed', error })
    expect(attach).not.toHaveBeenCalled()
  })

  it('keeps the published version when the attach fails, and a retry attaches it without publishing again', async () => {
    const publish = vi.fn(async () => 1)
    const attach = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([])
    const first = await publishAndAssign({ publish, attach })
    expect(first).toMatchObject({ status: 'assignFailed', number: 1 })
    // Retry assignment: the same version, only the attach.
    const retry = await publishAndAssign({ number: first.status === 'assignFailed' ? first.number : undefined, attach })
    expect(retry).toEqual({ status: 'assigned', number: 1 })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(attach).toHaveBeenCalledTimes(2)
  })

  it('needs a version to assign', async () => {
    await expect(publishAndAssign({ attach: vi.fn() })).rejects.toThrow()
  })
})
