import { type Vector, type Severity } from './mock-data'

/**
 * Simulates the detection pipeline for incoming messages
 * Calculates threat scores based on various indicators
 */

interface DetectionResult {
  s1Score: number // Urgency & Authority (0-100)
  s2Score: number // Domain & Authentication (0-100)
  s3Score: number // Content Analysis (0-100)
  s4Score: number // Behavioral (0-100)
  cgScore: number // Combined Score (weighted average)
  severity: Severity
  rulesHit: string[]
}

const calculateS1Score = (content: string): { score: number; rulesHit: string[] } => {
  let score = 0
  const rulesHit: string[] = []

  // Check for urgency indicators
  const urgencyPatterns = [
    /urgent/i,
    /immediately/i,
    /act now/i,
    /within 24 hours/i,
    /hurry/i,
    /critical/i,
    /asap/i,
  ]

  urgencyPatterns.forEach((pattern) => {
    if (pattern.test(content)) {
      score += 20
      if (!rulesHit.includes('Urgency Language Detected')) {
        rulesHit.push('Urgency Language Detected')
      }
    }
  })

  // Check for authority claims
  const authorityPatterns = [/ceo/i, /it department/i, /management/i, /director/i, /chief/i]
  if (authorityPatterns.some((p) => p.test(content))) {
    score += 25
    if (!rulesHit.includes('Authority Figure Claim')) {
      rulesHit.push('Authority Figure Claim')
    }
  }

  // Check for financial requests
  if (/\$|gift card|bank details|payment|wire transfer|refund/i.test(content)) {
    score += 20
    if (!rulesHit.includes('Financial Request')) {
      rulesHit.push('Financial Request')
    }
  }

  return { score: Math.min(100, score), rulesHit }
}

const calculateS2Score = (sender: string, domain?: string): { score: number; rulesHit: string[] } => {
  let score = 50 // Base score
  const rulesHit: string[] = []

  // Domain age simulation (assume new domains are suspicious)
  score += Math.random() * 30
  if (!rulesHit.includes('Suspicious Domain Age')) {
    rulesHit.push('Suspicious Domain Age')
  }

  // SPF/DKIM/DMARC failures
  if (Math.random() > 0.5) {
    score += 15
    rulesHit.push('SPF Failure')
  }
  if (Math.random() > 0.5) {
    score += 15
    rulesHit.push('DKIM Failure')
  }

  // Suspicious sender patterns
  if (/[\d]{1,3}[\w]+|[-.]/.test(sender)) {
    score += 10
    if (!rulesHit.includes('Suspicious Sender Domain')) {
      rulesHit.push('Suspicious Sender Domain')
    }
  }

  return { score: Math.min(100, score), rulesHit }
}

const calculateS3Score = (content: string): { score: number; rulesHit: string[] } => {
  let score = 0
  const rulesHit: string[] = []

  // Known phishing patterns
  const phishingPatterns = [
    /verify.*identity/i,
    /confirm.*password/i,
    /update.*payment/i,
    /click.*link/i,
    /won.*prize/i,
    /congratulations/i,
  ]

  phishingPatterns.forEach((pattern) => {
    if (pattern.test(content)) {
      score += 15
    }
  })

  if (score > 0 && !rulesHit.includes('Known Phishing Pattern')) {
    rulesHit.push('Known Phishing Pattern')
  }

  // Brand impersonation
  const brands = [
    'bank',
    'amazon',
    'paypal',
    'apple',
    'microsoft',
    'google',
    'national bank',
  ]
  if (brands.some((b) => content.toLowerCase().includes(b))) {
    score += 20
    if (!rulesHit.includes('Brand Impersonation')) {
      rulesHit.push('Brand Impersonation')
    }
  }

  // Suspicious URLs
  if (/\[.*link.*\]|malicious|click here|http|shortened|tinyurl/i.test(content)) {
    score += 25
    if (!rulesHit.includes('Malicious URL')) {
      rulesHit.push('Malicious URL')
    }
  }

  return { score: Math.min(100, score), rulesHit }
}

const calculateS4Score = (vector: Vector): { score: number; rulesHit: string[] } => {
  let score = 0
  const rulesHit: string[] = []

  // Vector-based risk (SMS/calls are riskier than email)
  if (vector === 'sms') score += 25
  if (vector === 'call') score += 20
  if (vector === 'email') score += 10

  // Time pressure (simulated)
  score += Math.random() * 20

  rulesHit.push('Time Pressure Tactics')

  return { score: Math.min(100, score), rulesHit }
}

export const processMessage = (
  messageData: {
    vector: Vector
    sender: string
    recipient: string
    content: string
  },
  domain?: string
): DetectionResult => {
  const { score: s1Score, rulesHit: s1Rules } = calculateS1Score(messageData.content)
  const { score: s2Score, rulesHit: s2Rules } = calculateS2Score(messageData.sender, domain)
  const { score: s3Score, rulesHit: s3Rules } = calculateS3Score(messageData.content)
  const { score: s4Score, rulesHit: s4Rules } = calculateS4Score(messageData.vector)

  // Combine rules
  const rulesHit = Array.from(new Set([...s1Rules, ...s2Rules, ...s3Rules, ...s4Rules]))

  // Calculate combined score
  const cgScore = s1Score * 0.2 + s2Score * 0.3 + s3Score * 0.3 + s4Score * 0.2

  // Determine severity
  let severity: Severity
  if (cgScore >= 80) severity = 'CRITICAL'
  else if (cgScore >= 60) severity = 'HIGH'
  else if (cgScore >= 40) severity = 'MEDIUM'
  else if (cgScore >= 20) severity = 'LOW'
  else severity = 'DISMISSED'

  return {
    s1Score: Math.round(s1Score * 10) / 10,
    s2Score: Math.round(s2Score * 10) / 10,
    s3Score: Math.round(s3Score * 10) / 10,
    s4Score: Math.round(s4Score * 10) / 10,
    cgScore: Math.round(cgScore * 10) / 10,
    severity,
    rulesHit: rulesHit.slice(0, 5), // Limit to 5 top rules
  }
}
