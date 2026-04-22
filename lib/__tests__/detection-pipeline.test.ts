import { describe, it, expect, beforeEach, vi } from 'vitest'
import { processMessage, type KnownBadResult } from '../detection-pipeline'
import type { DomainAuth } from '../domain-auth'

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1)
})

describe('processMessage', () => {
  it('detects urgency language: content "URGENT wire transfer" yields score > 0 and includes Urgency Language rule', () => {
    const result = processMessage({
      vector: 'email',
      sender: 'test@example.com',
      recipient: 'victim@acme.com',
      content: 'URGENT wire transfer',
    })
    expect(result.s1Score).toBeGreaterThan(0)
    expect(result.rulesHit).toContain('Urgency Language Detected')
  })

  it('detects authority claims: content "Your CEO needs this now" yields Authority Figure Claim rule', () => {
    const result = processMessage({
      vector: 'email',
      sender: 'test@example.com',
      recipient: 'victim@acme.com',
      content: 'Your CEO needs this now',
    })
    expect(result.rulesHit).toContain('Authority Figure Claim')
  })

  it('detects brand impersonation: content mentioning "paypal" yields score >= 20 and Brand Impersonation rule', () => {
    const result = processMessage({
      vector: 'email',
      sender: 'test@example.com',
      recipient: 'victim@acme.com',
      content: 'Please verify your PayPal account',
    })
    expect(result.s3Score).toBeGreaterThanOrEqual(20)
    expect(result.rulesHit).toContain('Brand Impersonation')
  })

  it('returns MEDIUM or higher severity for content combining urgency + authority + brand + financial ask', () => {
    const result = processMessage({
      vector: 'sms',
      sender: 'ceo@payroll-co.net',
      recipient: 'victim@acme.com',
      content:
        'URGENT: our CEO needs a $5000 PayPal wire transfer immediately — verify your identity to proceed',
    })
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.severity)
    expect(result.cgScore).toBeGreaterThanOrEqual(40)
  })

  it('returns LOW or lower severity for benign content', () => {
    const result = processMessage({
      vector: 'email',
      sender: 'friend@example.com',
      recipient: 'user@acme.com',
      content: 'Hi, how are you today?',
    })
    expect(['LOW', 'DISMISSED']).toContain(result.severity)
  })
})

describe('processMessage with knownBad', () => {
  it('calculateS2Score with knownBad.isKnownBad=true, threatScore=85 → score >= 85, rulesHit includes Known Bad Sender', () => {
    const knownBad: KnownBadResult = {
      isKnownBad: true,
      threatScore: 85,
      matchedKind: 'email',
    }
    const result = processMessage(
      {
        vector: 'email',
        sender: 'attacker@evil.com',
        recipient: 'victim@acme.com',
        content: 'Hello',
      },
      undefined,
      knownBad
    )
    expect(result.s2Score).toBeGreaterThanOrEqual(85)
    expect(result.rulesHit).toContain('Known Bad Sender')
  })

  it('calculateS2Score with knownBad.isKnownBad=false → unchanged behavior', () => {
    const knownBad: KnownBadResult = {
      isKnownBad: false,
      threatScore: 0,
      matchedKind: null,
    }
    const result = processMessage(
      {
        vector: 'email',
        sender: 'test@example.com',
        recipient: 'victim@acme.com',
        content: 'Hello',
      },
      undefined,
      knownBad
    )
    expect(result.s2Score).toBeLessThan(100)
    expect(result.rulesHit).not.toContain('Known Bad Sender')
  })

  it('processMessage with known-bad results rolls through to C(G) severity HIGH or CRITICAL', () => {
    const knownBad: KnownBadResult = {
      isKnownBad: true,
      threatScore: 100,
      matchedKind: 'domain',
    }
    const result = processMessage(
      {
        vector: 'sms',
        sender: 'attacker@evil.com',
        recipient: 'victim@acme.com',
        content: 'URGENT immediately ASAP: CEO MANAGEMENT needs PayPal wire transfer gift card now',
      },
      undefined,
      knownBad
    )
    expect(['HIGH', 'CRITICAL']).toContain(result.severity)
  })
})

describe('processMessage with domainAuth', () => {
  it('{hasSpf:false, spfPolicy:unknown, hasDmarc:false, dmarcPolicy:unknown} → rules include No SPF Record and No DMARC Policy', () => {
    const domainAuth: DomainAuth = {
      hasSpf: false,
      spfPolicy: 'unknown',
      hasDmarc: false,
      dmarcPolicy: 'unknown',
    }
    const result = processMessage(
      {
        vector: 'email',
        sender: 'test@example.com',
        recipient: 'victim@acme.com',
        content: 'Hello',
      },
      undefined,
      undefined,
      domainAuth
    )
    expect(result.rulesHit).toContain('No SPF Record')
    expect(result.rulesHit).toContain('No DMARC Policy')
  })

  it('{hasSpf:true, spfPolicy:pass-all, hasDmarc:true, dmarcPolicy:none} → rules include SPF Permissive', () => {
    const domainAuth: DomainAuth = {
      hasSpf: true,
      spfPolicy: 'pass-all',
      hasDmarc: true,
      dmarcPolicy: 'none',
    }
    const result = processMessage(
      {
        vector: 'email',
        sender: 'test@example.com',
        recipient: 'victim@acme.com',
        content: 'Hello',
      },
      undefined,
      undefined,
      domainAuth
    )
    expect(result.rulesHit).toContain('SPF Permissive (+all)')
  })

  it('{hasSpf:true, spfPolicy:strict, hasDmarc:true, dmarcPolicy:reject} → S2 score is LOWER than baseline', () => {
    const domainAuth: DomainAuth = {
      hasSpf: true,
      spfPolicy: 'strict',
      hasDmarc: true,
      dmarcPolicy: 'reject',
    }
    const result = processMessage(
      {
        vector: 'email',
        sender: 'test@example.com',
        recipient: 'victim@acme.com',
        content: 'Hello',
      },
      undefined,
      undefined,
      domainAuth
    )
    expect(result.s2Score).toBeLessThan(55)
  })

  it('processMessage called without domainAuth still works (legacy path)', () => {
    const result = processMessage({
      vector: 'email',
      sender: 'test@example.com',
      recipient: 'victim@acme.com',
      content: 'Hello',
    })
    expect(result.s2Score).toBeGreaterThan(0)
    expect(result.s2Score).toBeLessThan(100)
  })
})