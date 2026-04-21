'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function EmailForm() {
  const [formData, setFormData] = useState({
    header: '',
    subject: '',
    sender_email: '',
    receiver_email: '',
    text_content: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage({ type: '', text: '' })

    try {
      // Ingest + score in a single transactional call
      const processResponse = await fetch('/api/process-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          sender: formData.sender_email,
          receiver: formData.receiver_email,
          content: formData.text_content,
          subject: formData.subject,
          header: formData.header
        })
      })

      if (!processResponse.ok) {
        const error = await processResponse.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to save email')
      }

      setMessage({ type: 'success', text: 'Email saved and processed successfully!' })
      setFormData({
        header: '',
        subject: '',
        sender_email: '',
        receiver_email: '',
        text_content: ''
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save email'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-slate-950 border-slate-800">
      <CardHeader>
        <CardTitle className="text-cyan-400">Add Email</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Header
            </label>
            <Input
              name="header"
              value={formData.header}
              onChange={handleChange}
              placeholder="Email header"
              className="bg-slate-900 border-slate-700 text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Subject
            </label>
            <Input
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              placeholder="Email subject"
              className="bg-slate-900 border-slate-700 text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Sender Email
              </label>
              <Input
                name="sender_email"
                type="email"
                value={formData.sender_email}
                onChange={handleChange}
                placeholder="sender@example.com"
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Receiver Email
              </label>
              <Input
                name="receiver_email"
                type="email"
                value={formData.receiver_email}
                onChange={handleChange}
                placeholder="receiver@example.com"
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Email Text
            </label>
            <Textarea
              name="text_content"
              value={formData.text_content}
              onChange={handleChange}
              placeholder="Enter email content"
              className="bg-slate-900 border-slate-700 text-white min-h-32"
              required
            />
          </div>

          {message.text && (
            <div
              className={`p-3 rounded text-sm ${
                message.type === 'success'
                  ? 'bg-green-900/30 text-green-400 border border-green-700'
                  : 'bg-red-900/30 text-red-400 border border-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            {isLoading ? 'Saving...' : 'Save Email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
