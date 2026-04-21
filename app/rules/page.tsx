'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { MainContent } from '@/components/dashboard/main-content'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { SeverityBadge } from '@/components/dashboard/severity-badge'
import { rules, type Rule } from '@/lib/mock-data'
import { formatDistanceToNow, format } from 'date-fns'
import { Settings2, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default function RulesManagerPage() {
  const [rulesState, setRulesState] = useState<Rule[]>(rules)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const handleToggleRule = (ruleId: string) => {
    setRulesState((prev) =>
      prev.map((rule) =>
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule
      )
    )
  }

  const handleViewRule = (rule: Rule) => {
    setSelectedRule(rule)
    setSheetOpen(true)
  }

  const activeRules = rulesState.filter((r) => r.active).length
  const totalHits = rulesState.reduce((acc, r) => acc + r.hitCount, 0)

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MainContent>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Rules Manager</h1>
            <p className="text-sm text-slate-400">
              Configure and manage detection rules
            </p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Total Rules</p>
              <p className="text-2xl font-bold text-white">{rulesState.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Active Rules</p>
              <p className="text-2xl font-bold text-green-400">{activeRules}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#1E293B] border-slate-700">
            <CardContent className="p-4">
              <p className="text-sm text-slate-400">Total Hits</p>
              <p className="text-2xl font-bold text-blue-400">{totalHits.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Rules Table */}
        <Card className="bg-[#1E293B] border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Detection Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Rule Name</TableHead>
                    <TableHead className="text-slate-400">Severity</TableHead>
                    <TableHead className="text-slate-400 text-right">Weight</TableHead>
                    <TableHead className="text-slate-400 text-right">Hit Count</TableHead>
                    <TableHead className="text-slate-400">Last Triggered</TableHead>
                    <TableHead className="text-slate-400 text-center">Active</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesState.map((rule) => (
                    <TableRow
                      key={rule.id}
                      className="border-slate-700 hover:bg-slate-800/50"
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-white">{rule.name}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            {rule.id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={rule.severity} />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-slate-300">
                          {rule.weight.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium text-white">
                          {rule.hitCount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-slate-400 text-sm">
                          {formatDistanceToNow(rule.lastTriggered, {
                            addSuffix: true
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={rule.active}
                          onCheckedChange={() => handleToggleRule(rule.id)}
                          className="data-[state=checked]:bg-green-500"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
                          onClick={() => handleViewRule(rule)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Rule Details Sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent className="bg-[#1E293B] border-slate-700 w-[500px] sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle className="text-white">{selectedRule?.name}</SheetTitle>
              <SheetDescription className="text-slate-400">
                {selectedRule?.description}
              </SheetDescription>
            </SheetHeader>

            {selectedRule && (
              <div className="mt-6 space-y-6">
                {/* Rule Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-slate-500">Severity</p>
                    <div className="mt-1">
                      <SeverityBadge severity={selectedRule.severity} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-slate-500">Weight</p>
                    <p className="mt-1 text-lg font-bold text-white">
                      {selectedRule.weight.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-slate-500">Hit Count</p>
                    <p className="mt-1 text-lg font-bold text-blue-400">
                      {selectedRule.hitCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <p className="text-xs text-slate-500">Status</p>
                    <Badge
                      className={`mt-1 ${
                        selectedRule.active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {selectedRule.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {/* Last Triggered */}
                <div className="rounded-lg bg-slate-800/50 p-3">
                  <p className="text-xs text-slate-500">Last Triggered</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {format(selectedRule.lastTriggered, 'PPpp')}
                  </p>
                </div>

                {/* Groups Triggered */}
                <div>
                  <p className="text-sm font-medium text-slate-400 mb-2">
                    Groups Triggered ({selectedRule.groupsTriggered.length})
                  </p>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {selectedRule.groupsTriggered.map((groupId) => (
                        <Link
                          key={groupId}
                          href={`/investigation?group=${groupId}`}
                          className="flex items-center justify-between rounded-lg bg-slate-800/50 p-3 hover:bg-slate-800 transition-colors"
                        >
                          <span className="font-mono text-sm text-slate-300">
                            {groupId}
                          </span>
                          <ExternalLink className="h-4 w-4 text-slate-500" />
                        </Link>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </MainContent>
    </div>
  )
}
