'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CallForm() {
  const [formData, setFormData] = useState({
    caller_phone: '',
    receiver_phone: '',
    content_text: ''
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
          type: 'call',
          sender: formData.caller_phone,
          receiver: formData.receiver_phone,
          content: formData.content_text
        })
      })

      if (!processResponse.ok) {
        const error = await processResponse.json().catch(() => ({}))
        throw new Error(error.error || 'Failed to save call')
      }

      setMessage({ type: 'success', text: 'Call saved and processed successfully!' })
      setFormData({
        caller_phone: '',
        receiver_phone: '',
        content_text: ''
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save call'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-slate-950 border-slate-800">
      <CardHeader>
        <CardTitle className="text-orange-400">Add Call</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Caller Phone
              </label>
              <Input
                name="caller_phone"
                value={formData.caller_phone}
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
              Call Content
            </label>
            <Textarea
              name="content_text"
              value={formData.content_text}
              onChange={handleChange}
              placeholder="Describe the call content"
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
            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isLoading ? 'Saving...' : 'Save Call'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
