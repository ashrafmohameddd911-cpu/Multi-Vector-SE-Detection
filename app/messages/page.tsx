'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { EmailForm } from '@/components/dashboard/email-form'
import { SMSForm } from '@/components/dashboard/sms-form'
import { CallForm } from '@/components/dashboard/call-form'
import { Mail, MessageCircle, Phone } from 'lucide-react'

export default function MessagesPage() {
  const [activeTab, setActiveTab] = useState('email')

  const tabs = [
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'sms', label: 'SMS', icon: MessageCircle },
    { id: 'call', label: 'Call', icon: Phone }
  ]

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Add Messages
            </h1>
            <p className="text-slate-400">
              Insert emails, SMS, or calls for analysis
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mb-8 border-b border-slate-800">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'border-b-2 border-cyan-400 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="max-w-2xl">
            {activeTab === 'email' && <EmailForm />}
            {activeTab === 'sms' && <SMSForm />}
            {activeTab === 'call' && <CallForm />}
          </div>
        </div>
      </MainContent>
    </div>
  )
}
