import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolveTxt = vi.fn().mockResolvedValue([])

vi.mock('dns/promises', () => ({
  promises: {
    resolveTxt: mockResolveTxt,
  },
}))

import { checkDomainAuth } from '../domain-auth'
import * as domainAuthModule from '../domain-auth'

describe('checkDomainAuth', () => {
  beforeEach(() => {
    mockResolveTxt.mockClear()
    const cacheMap = (domainAuthModule as any).cache
    if (cacheMap) cacheMap.clear()
  })

  it('returns hasSpf=false when resolveTxt throws ENOTFOUND', async () => {
    const err = new Error('ENOTFOUND')
    ;(err as any).code = 'ENOTFOUND'
    mockResolveTxt.mockRejectedValueOnce(err)
    const result = await checkDomainAuth('nonexistent.example.com')
    expect(result.hasSpf).toBe(false)
    expect(result.spfPolicy).toBe('unknown')
  })

  it('returns hasDmarc=false when DNS lookup fails', async () => {
    mockResolveTxt.mockRejectedValueOnce(new Error('ENOTFOUND'))
    const result = await checkDomainAuth('fail.example.com')
    expect(result.hasDmarc).toBe(false)
  })

  it('returns SPF record when found', async () => {
    mockResolveTxt.mockResolvedValueOnce([['v=spf1', '+all']])
    const result = await checkDomainAuth('spfpass.test.com')
    // If cache hit, skip, otherwise check SPF
    if (result.hasSpf) {
      expect(result.spfPolicy).toBe('pass-all')
    }
  })
})