// Mock data for SIEM Dashboard

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'DISMISSED'
export type Vector = 'email' | 'sms' | 'call'
export type Verdict = 'ATTACK' | 'LEGIT' | 'UNCLASSIFIED'

export interface Alert {
  id: string
  groupId: string
  severity: Severity
  campaignType: string
  vectors: Vector[]
  entity: string
  victim: string
  cgScore: number
  s1Score: number
  s2Score: number
  s3Score: number
  s4Score: number
  timestamp: Date
  messages: Message[]
}

export interface Message {
  id: string
  vector: Vector
  sender: string
  recipient: string
  content: string
  snippet: string
  timestamp: Date
  spf: 'pass' | 'fail'
  dkim: 'pass' | 'fail'
  dmarc: 'pass' | 'fail'
  domainAge: number
  vtScore: number
  urgencyScore: number
  rulesHit: string[]
}

export interface Rule {
  id: string
  name: string
  severity: Severity
  weight: number
  hitCount: number
  lastTriggered: Date
  active: boolean
  description: string
  groupsTriggered: string[]
}

export interface ThreatLocation {
  id: string
  lat: number
  lng: number
  severity: Severity
  campaignType: string
}

export interface ReputationSignal {
  name: string
  status: boolean
  description: string
}

// Generate random date within last 24 hours
const randomRecentDate = () => {
  const now = new Date()
  return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000)
}

// Generate random date within last 7 days
const randomWeekDate = () => {
  const now = new Date()
  return new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000)
}

const campaignTypes = [
  'CEO Fraud',
  'Invoice Scam',
  'Password Reset',
  'Package Delivery',
  'Bank Alert',
  'Tech Support',
  'Lottery Scam',
  'Romance Scam',
  'Job Offer',
  'Tax Refund'
]

const entities = [
  'National Bank of Egypt',
  'Vodafone Egypt',
  'Orange Egypt',
  'Etisalat',
  'CIB Bank',
  'QNB Alahli',
  'Amazon Egypt',
  'Jumia',
  'Souq',
  'Ministry of Finance'
]

const victims = [
  'ahmed.hassan@company.eg',
  'mohamed.ali@enterprise.eg',
  'sarah.omar@corp.eg',
  'fatima.mahmoud@business.eg',
  'karim.ahmed@org.eg',
  'nour.ibrahim@firm.eg',
  'omar.khaled@company.eg',
  'layla.youssef@enterprise.eg',
  'youssef.mohamed@corp.eg',
  'mona.farid@business.eg'
]

const senders = [
  'security@nat1onalbank.eg',
  'support@vod4fone-eg.com',
  'alert@0range-egypt.net',
  'verify@et1salat.com',
  'urgent@c1b-bank.eg',
  'noreply@qnb-a1ahli.com',
  'delivery@amaz0n-eg.com',
  'support@jum1a.eg',
  '+201000000001',
  '+201000000002'
]

const messageContents = [
  'Urgent: Your account has been compromised. Click here to verify your identity immediately.',
  'Your package delivery failed. Pay $2.99 to reschedule: [malicious-link]',
  'You have won $1,000,000! Claim your prize now by providing your bank details.',
  'This is the IT department. We need your password to fix a critical security issue.',
  'Your invoice #INV-2024-001 is overdue. Pay immediately to avoid legal action.',
  'CEO here. I need you to purchase gift cards for a client meeting. This is urgent.',
  'Your tax refund of $5,432 is pending. Click to claim within 24 hours.',
  'We detected suspicious activity on your account. Verify now or account will be locked.',
  'Congratulations! You have been selected for a remote job paying $5000/week.',
  'Your subscription will expire. Update payment method to avoid service interruption.'
]

const ruleNames = [
  'Urgency Language Detected',
  'Suspicious Domain Age',
  'SPF Failure',
  'DKIM Failure',
  'Known Phishing Pattern',
  'Impersonation Detected',
  'Malicious URL',
  'Authority Figure Claim',
  'Financial Request',
  'Time Pressure Tactics',
  'Brand Impersonation',
  'Suspicious Sender Domain',
  'Reply-To Mismatch',
  'Attachment Analysis Failed',
  'Link Shortener Detected'
]

export const generateAlerts = (count: number): Alert[] => {
  return Array.from({ length: count }, (_, i) => {
    const vectors: Vector[] = []
    if (Math.random() > 0.3) vectors.push('email')
    if (Math.random() > 0.5) vectors.push('sms')
    if (Math.random() > 0.7) vectors.push('call')
    if (vectors.length === 0) vectors.push('email')

    const s1 = Math.random() * 100
    const s2 = Math.random() * 100
    const s3 = Math.random() * 100
    const s4 = Math.random() * 100
    const cgScore = s1 * 0.2 + s2 * 0.3 + s3 * 0.3 + s4 * 0.2

    let severity: Severity
    if (cgScore >= 80) severity = 'CRITICAL'
    else if (cgScore >= 60) severity = 'HIGH'
    else if (cgScore >= 40) severity = 'MEDIUM'
    else if (cgScore >= 20) severity = 'LOW'
    else severity = 'DISMISSED'

    const messages: Message[] = vectors.map((vector, j) => ({
      id: `MSG-${i}-${j}`,
      vector,
      sender: senders[Math.floor(Math.random() * senders.length)],
      recipient: victims[Math.floor(Math.random() * victims.length)],
      content: messageContents[Math.floor(Math.random() * messageContents.length)],
      snippet: messageContents[Math.floor(Math.random() * messageContents.length)].slice(0, 50) + '...',
      timestamp: randomRecentDate(),
      spf: Math.random() > 0.5 ? 'pass' : 'fail',
      dkim: Math.random() > 0.5 ? 'pass' : 'fail',
      dmarc: Math.random() > 0.5 ? 'pass' : 'fail',
      domainAge: Math.floor(Math.random() * 365),
      vtScore: Math.floor(Math.random() * 20),
      urgencyScore: Math.floor(Math.random() * 100),
      rulesHit: ruleNames.slice(0, Math.floor(Math.random() * 5) + 1)
    }))

    return {
      id: `ALERT-${String(i + 1).padStart(4, '0')}`,
      groupId: `GRP-${String(Math.floor(i / 3) + 1).padStart(3, '0')}`,
      severity,
      campaignType: campaignTypes[Math.floor(Math.random() * campaignTypes.length)],
      vectors,
      entity: entities[Math.floor(Math.random() * entities.length)],
      victim: victims[Math.floor(Math.random() * victims.length)],
      cgScore: Math.round(cgScore * 10) / 10,
      s1Score: Math.round(s1 * 10) / 10,
      s2Score: Math.round(s2 * 10) / 10,
      s3Score: Math.round(s3 * 10) / 10,
      s4Score: Math.round(s4 * 10) / 10,
      timestamp: randomRecentDate(),
      messages
    }
  }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export const generateRules = (): Rule[] => {
  return ruleNames.map((name, i) => ({
    id: `RULE-${String(i + 1).padStart(3, '0')}`,
    name,
    severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[])[Math.floor(Math.random() * 4)],
    weight: Math.round((Math.random() * 0.3 + 0.1) * 100) / 100,
    hitCount: Math.floor(Math.random() * 500),
    lastTriggered: randomWeekDate(),
    active: Math.random() > 0.2,
    description: `Detects ${name.toLowerCase()} patterns in incoming messages.`,
    groupsTriggered: Array.from({ length: Math.floor(Math.random() * 10) + 1 }, (_, j) => `GRP-${String(j + 1).padStart(3, '0')}`)
  }))
}

export const generateThreatLocations = (): ThreatLocation[] => {
  // Egypt coordinates roughly: lat 22-32, lng 25-35
  return Array.from({ length: 15 }, (_, i) => ({
    id: `LOC-${i + 1}`,
    lat: 24 + Math.random() * 8,
    lng: 26 + Math.random() * 8,
    severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[])[Math.floor(Math.random() * 4)],
    campaignType: campaignTypes[Math.floor(Math.random() * campaignTypes.length)]
  }))
}

export const reputationSignals: ReputationSignal[] = [
  { name: 'Domain registered > 30 days', status: false, description: 'Domain was registered recently' },
  { name: 'SPF record valid', status: true, description: 'SPF authentication passed' },
  { name: 'DKIM signature valid', status: false, description: 'DKIM signature invalid or missing' },
  { name: 'DMARC policy enforced', status: false, description: 'No DMARC policy found' },
  { name: 'SSL certificate valid', status: true, description: 'SSL certificate is valid' },
  { name: 'No VirusTotal detections', status: false, description: '3 engines detected malicious content' },
  { name: 'Sender in whitelist', status: false, description: 'Sender not in trusted whitelist' },
  { name: 'No suspicious attachments', status: true, description: 'No malicious attachments found' },
  { name: 'Content analysis passed', status: false, description: 'Urgency language detected' },
  { name: 'Link reputation clean', status: false, description: 'Suspicious links detected' }
]

export const attacksPerHour = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  attacks: Math.floor(Math.random() * 50) + 10
}))

export const vectorDistribution = [
  { name: 'Email', value: 65, color: '#3B82F6' },
  { name: 'SMS', value: 25, color: '#22C55E' },
  { name: 'Call', value: 10, color: '#F97316' }
]

export const topBrands = [
  { name: 'National Bank', count: 156 },
  { name: 'Vodafone', count: 134 },
  { name: 'Orange', count: 98 },
  { name: 'CIB Bank', count: 87 },
  { name: 'Amazon', count: 76 }
]

export const layerContributions = [
  { layer: 'S1 (Lexical)', weight: 0.2, avgScore: 72.4 },
  { layer: 'S2 (Behavioral)', weight: 0.3, avgScore: 68.9 },
  { layer: 'S3 (Reputation)', weight: 0.3, avgScore: 81.2 },
  { layer: 'S4 (Network)', weight: 0.2, avgScore: 65.7 }
]

export const severityDistribution = [
  { name: 'Critical', value: 12, color: '#EF4444' },
  { name: 'High', value: 28, color: '#F97316' },
  { name: 'Medium', value: 45, color: '#EAB308' },
  { name: 'Low', value: 35, color: '#3B82F6' }
]

export const campaignsDetected = [
  { month: 'Jan', detected: 145, missed: 8 },
  { month: 'Feb', detected: 167, missed: 5 },
  { month: 'Mar', detected: 189, missed: 7 },
  { month: 'Apr', detected: 203, missed: 3 },
  { month: 'May', detected: 221, missed: 4 },
  { month: 'Jun', detected: 198, missed: 6 }
]

export const scoreDistribution = Array.from({ length: 20 }, (_, i) => ({
  score: i * 5,
  attack: Math.floor(Math.random() * 30) + (i > 10 ? 20 : 5),
  legit: Math.floor(Math.random() * 30) + (i < 10 ? 20 : 5)
}))

// Pre-generated alerts for consistent data
export const alerts = generateAlerts(50)
export const rules = generateRules()
export const threatLocations = generateThreatLocations()
