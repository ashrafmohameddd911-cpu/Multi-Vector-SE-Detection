import { promises as dns } from 'dns'

export type SpfPolicy = 'strict' | 'softfail' | 'neutral' | 'pass-all' | 'unknown'
export type DmarcPolicy = 'none' | 'quarantine' | 'reject' | 'unknown'

export interface DomainAuth {
  hasSpf: boolean
  spfPolicy: SpfPolicy
  hasDmarc: boolean
  dmarcPolicy: DmarcPolicy
}

interface CacheEntry {
  value: DomainAuth
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_MAX = 1000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('DNS timeout')), ms)
    ),
  ])
}

export async function checkDomainAuth(domain: string): Promise<DomainAuth> {
  const now = Date.now()
  const cached = cache.get(domain)
  if (cached && cached.expiresAt > now) {
    console.log(`[domain-auth] Cache hit for ${domain}`)
    return cached.value
  }

  const result: DomainAuth = {
    hasSpf: false,
    spfPolicy: 'unknown',
    hasDmarc: false,
    dmarcPolicy: 'unknown',
  }

  try {
    const spfTxts = await withTimeout(dns.resolveTxt(domain), 500).catch(() => [])
    for (const txt of spfTxts) {
      const joined = txt.join('')
      if (joined.startsWith('v=spf1')) {
        result.hasSpf = true
        if (joined.includes('-all')) result.spfPolicy = 'strict'
        else if (joined.includes('~all')) result.spfPolicy = 'softfail'
        else if (joined.includes('?all')) result.spfPolicy = 'neutral'
        else if (joined.includes('+all')) result.spfPolicy = 'pass-all'
        break
      }
    }
  } catch {
    // hasSpf remains false, policy remains unknown
  }

  try {
    const dmarcDomain = `_dmarc.${domain}`
    const dmarcTxts = await withTimeout(dns.resolveTxt(dmarcDomain), 500).catch(() => [])
    for (const txt of dmarcTxts) {
      const joined = txt.join('')
      if (joined.startsWith('v=DMARC1')) {
        result.hasDmarc = true
        if (joined.includes('p=reject')) result.dmarcPolicy = 'reject'
        else if (joined.includes('p=quarantine')) result.dmarcPolicy = 'quarantine'
        else if (joined.includes('p=none')) result.dmarcPolicy = 'none'
        else result.dmarcPolicy = 'unknown'
        break
      }
    }
  } catch {
    // hasDmarc remains false, policy remains unknown
  }

  const entry: CacheEntry = { value: result, expiresAt: now + CACHE_TTL }
  if (cache.size >= CACHE_MAX) {
    let oldest: string | null = null
    let oldestExp = Infinity
    for (const [key, val] of cache) {
      if (val.expiresAt < oldestExp) {
        oldestExp = val.expiresAt
        oldest = key
      }
    }
    if (oldest) cache.delete(oldest)
  }
  cache.set(domain, entry)

  return result
}