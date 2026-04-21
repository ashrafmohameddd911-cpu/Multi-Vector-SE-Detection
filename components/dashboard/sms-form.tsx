'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SMSForm() {
  const [formData, setFormData] = useState({
    sender_phone: '',
    receiver_phone: '',
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
          type: 'sms',
          sender: formData.sender_phone,
          receiver: formData.receiver_phone,
          content: formData.text_content
        })
      })

      if (!processResponse.ok) {
        const error = await processResponse.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to save SMS')
      }

      setMessage({ type: 'success', text: 'SMS saved and processed successfully!' })
      setFormData({
        sender_phone: '',
        receiver_phone: '',
        text_content: ''
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save SMS'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-slate-950 border-slate-800">
      <CardHeader>
        <CardTitle className="text-green-400">Add SMS</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Sender Phone
              </label>
              <Input
                name="sender_phone"
                value={formData.sender_phone}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Receiver Phone
              </label>
              <Input
                name="receiver_phone"
                value={formData.receiver_phone}
                onChange={handleChange}
                placeholder="+1 (555) 987-6543"
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              SMS Text
            </label>
            <Textarea
              name="text_content"
              value={formData.text_content}
              onChange={handleChange}
              placeholder="Enter SMS content"
              className="bg-slate-900 border-slate-700 text-white min-h-24"
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
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? 'Saving...' : 'Save SMS'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
