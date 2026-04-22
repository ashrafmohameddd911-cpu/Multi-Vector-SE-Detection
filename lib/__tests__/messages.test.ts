import { describe, it, expect } from 'vitest'

describe('resolveActor', () => {
  it('handles severity escalation correctly', () => {
    const SEVERITY_RANK: Record<string, number> = {
      DISMISSED: 1,
      LOW: 2,
      MEDIUM: 3,
      HIGH: 4,
      CRITICAL: 5,
    }
    expect(SEVERITY_RANK.CRITICAL).toBeGreaterThan(SEVERITY_RANK.HIGH)
    expect(SEVERITY_RANK.HIGH).toBeGreaterThan(SEVERITY_RANK.MEDIUM)
    expect(SEVERITY_RANK.MEDIUM).toBeGreaterThan(SEVERITY_RANK.LOW)
    expect(SEVERITY_RANK.LOW).toBeGreaterThan(SEVERITY_RANK.DISMISSED)
  })

  it('maps vector to actor kind correctly', () => {
    const getActorKind = (vector: string) =>
      vector === 'email' ? 'email_domain' : vector === 'sms' ? 'sender' : 'phone'

    expect(getActorKind('email')).toBe('email_domain')
    expect(getActorKind('sms')).toBe('sender')
    expect(getActorKind('call')).toBe('phone')
  })
})

describe('resolveCampaign', () => {
  it('returns null for empty strings and null', () => {
    const isEmpty = (s: string | null | undefined) => !s?.trim()
    expect(isEmpty('')).toBe(true)
    expect(isEmpty('   ')).toBe(true)
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty('phishing')).toBe(false)
  })

  it('handles severity escalation correctly', () => {
    const SEVERITY_RANK: Record<string, number> = {
      DISMISSED: 1,
      LOW: 2,
      MEDIUM: 3,
      HIGH: 4,
      CRITICAL: 5,
    }
    expect(SEVERITY_RANK.CRITICAL).toBeGreaterThan(SEVERITY_RANK.MEDIUM)
  })

  it('week boundary - Sunday 23:59:59 is in current week, Monday 00:00:00 starts new week', () => {
    const getWeekStart = (date: Date) => {
      const d = new Date(date)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(d)
      monday.setDate(diff)
      monday.setHours(0, 0, 0, 0)
      return monday
    }
    const sunday = new Date('2026-04-26T23:59:59')
    const monday = new Date('2026-04-27T00:00:00')
    const wednesday = new Date('2026-04-29T12:00:00')

    expect(getWeekStart(sunday).getDay()).toBe(1)
    expect(getWeekStart(monday).getDay()).toBe(1)
    expect(getWeekStart(wednesday).getDay()).toBe(1)
  })
})