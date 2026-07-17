import { useMemo, useState } from "react"
import hljs from "highlight.js"
import { toast } from "sonner"
import { AlignLeft, Columns2, Copy } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface DiffViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  oldCode: string
  newCode: string
  oldLabel?: string
  newLabel?: string
  language?: string
}

type DiffOp =
  | { type: "equal"; oldNo: number; newNo: number }
  | { type: "delete"; oldNo: number }
  | { type: "insert"; newNo: number }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function splitLines(code: string): string[] {
  if (!code) return []
  return code.split("\n")
}

/**
 * 将整段代码高亮后按行拆分，保持每行 span 平衡，
 * 这样跨行的高亮 span 不会破坏逐行渲染。
 */
function highlightToLines(code: string, language: string): string[] {
  if (!code) return []
  let html: string
  try {
    const lang = hljs.getLanguage(language) ? language : "plaintext"
    html = hljs.highlight(code, { language: lang }).value
  } catch {
    html = escapeHtml(code)
  }

  const SPAN_OPEN = '<span class="'
  const SPAN_CLOSE = "</span>"
  const lines: string[] = []
  const openStack: string[] = []
  let current = ""
  let i = 0

  while (i < html.length) {
    if (html.startsWith(SPAN_OPEN, i)) {
      const start = i + SPAN_OPEN.length
      const end = html.indexOf('">', start)
      if (end === -1) {
        current += html[i]
        i++
        continue
      }
      openStack.push(html.slice(start, end))
      current += html.slice(i, end + 2)
      i = end + 2
    } else if (html.startsWith(SPAN_CLOSE, i)) {
      openStack.pop()
      current += SPAN_CLOSE
      i += SPAN_CLOSE.length
    } else if (html[i] === "\n") {
      current += SPAN_CLOSE.repeat(openStack.length)
      lines.push(current)
      current = openStack.map((c) => `<span class="${c}">`).join("")
      i++
    } else {
      current += html[i]
      i++
    }
  }
  current += SPAN_CLOSE.repeat(openStack.length)
  lines.push(current)
  return lines
}

/** 超过该行数则降级为“全删 + 全增”，避免 O(m*n) 内存爆炸 */
const DIFF_LINE_LIMIT = 5000

function computeDiff(oldCode: string, newCode: string): DiffOp[] {
  const oldLines = splitLines(oldCode)
  const newLines = splitLines(newCode)
  const m = oldLines.length
  const n = newLines.length

  if (m > DIFF_LINE_LIMIT || n > DIFF_LINE_LIMIT) {
    const ops: DiffOp[] = []
    for (let i = 0; i < m; i++) ops.push({ type: "delete", oldNo: i + 1 })
    for (let j = 0; j < n; j++) ops.push({ type: "insert", newNo: j + 1 })
    return ops
  }

  // LCS 动态规划（从后向前填充）
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: "equal", oldNo, newNo })
      i++
      j++
      oldNo++
      newNo++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "delete", oldNo })
      i++
      oldNo++
    } else {
      ops.push({ type: "insert", newNo })
      j++
      newNo++
    }
  }
  while (i < m) {
    ops.push({ type: "delete", oldNo })
    i++
    oldNo++
  }
  while (j < n) {
    ops.push({ type: "insert", newNo })
    j++
    newNo++
  }
  return ops
}

export function DiffViewerDialog({
  open,
  onOpenChange,
  oldCode,
  newCode,
  oldLabel,
  newLabel,
  language = "html",
}: DiffViewerDialogProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split")

  const ops = useMemo(() => computeDiff(oldCode, newCode), [oldCode, newCode])

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    let unchanged = 0
    for (const op of ops) {
      if (op.type === "insert") added++
      else if (op.type === "delete") removed++
      else unchanged++
    }
    return { added, removed, unchanged }
  }, [ops])

  const oldHighlighted = useMemo(
    () => highlightToLines(oldCode, language),
    [oldCode, language]
  )
  const newHighlighted = useMemo(
    () => highlightToLines(newCode, language),
    [newCode, language]
  )

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已复制${label}`)
    } catch {
      toast.error("复制失败")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-6xl flex-col gap-3 p-4">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">代码对比</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {oldLabel ?? "旧代码"}
            </span>
            <span>→</span>
            <span className="font-medium text-foreground">
              {newLabel ?? "新代码"}
            </span>
          </div>
        </DialogHeader>

        {/* 工具栏：视图切换 + 统计 + 复制按钮 */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-2">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as "split" | "unified")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="split" className="gap-1 px-2 text-xs">
                <Columns2 className="h-3.5 w-3.5" />
                分屏
              </TabsTrigger>
              <TabsTrigger value="unified" className="gap-1 px-2 text-xs">
                <AlignLeft className="h-3.5 w-3.5" />
                合并
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
              +{stats.added} added
            </span>
            <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              -{stats.removed} removed
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
              {stats.unchanged} unchanged
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => copy(oldCode, "旧代码")}
            >
              <Copy className="h-3.5 w-3.5" />
              复制旧代码
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={() => copy(newCode, "新代码")}
            >
              <Copy className="h-3.5 w-3.5" />
              复制新代码
            </Button>
          </div>
        </div>

        {/* Diff 内容 */}
        <div className="flex-1 overflow-auto rounded border bg-background">
          {ops.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              无内容
            </div>
          ) : viewMode === "split" ? (
            <table className="w-full border-collapse font-mono text-[13px] leading-[1.5]">
              <tbody>
                {ops.map((op, idx) => {
                  if (op.type === "equal") {
                    return (
                      <tr key={idx} className="align-top">
                        <td className="w-10 select-none border-r border-muted/40 bg-muted/30 px-2 text-right text-muted-foreground">
                          {op.oldNo}
                        </td>
                        <td
                          className="whitespace-pre px-2 text-foreground"
                          dangerouslySetInnerHTML={{
                            __html: oldHighlighted[op.oldNo - 1] ?? "",
                          }}
                        />
                        <td className="w-10 select-none border-r border-muted/40 bg-muted/30 px-2 text-right text-muted-foreground">
                          {op.newNo}
                        </td>
                        <td
                          className="whitespace-pre px-2 text-foreground"
                          dangerouslySetInnerHTML={{
                            __html: newHighlighted[op.newNo - 1] ?? "",
                          }}
                        />
                      </tr>
                    )
                  }
                  if (op.type === "delete") {
                    return (
                      <tr
                        key={idx}
                        className="align-top bg-red-50 dark:bg-red-950/30"
                      >
                        <td className="w-10 select-none border-r border-muted/40 px-2 text-right text-red-700/70 dark:text-red-300/70">
                          {op.oldNo}
                        </td>
                        <td
                          className="whitespace-pre px-2 text-red-700 dark:text-red-300"
                          dangerouslySetInnerHTML={{
                            __html: oldHighlighted[op.oldNo - 1] ?? "",
                          }}
                        />
                        <td className="w-10 select-none border-r border-muted/40 px-2" />
                        <td className="whitespace-pre px-2" />
                      </tr>
                    )
                  }
                  return (
                    <tr
                      key={idx}
                      className="align-top bg-green-50 dark:bg-green-950/30"
                    >
                      <td className="w-10 select-none border-r border-muted/40 px-2" />
                      <td className="whitespace-pre px-2" />
                      <td className="w-10 select-none border-r border-muted/40 px-2 text-right text-green-700/70 dark:text-green-300/70">
                        {op.newNo}
                      </td>
                      <td
                        className="whitespace-pre px-2 text-green-700 dark:text-green-300"
                        dangerouslySetInnerHTML={{
                          __html: newHighlighted[op.newNo - 1] ?? "",
                        }}
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse font-mono text-[13px] leading-[1.5]">
              <tbody>
                {ops.map((op, idx) => {
                  if (op.type === "equal") {
                    return (
                      <tr key={idx} className="align-top">
                        <td className="w-10 select-none border-r border-muted/40 bg-muted/30 px-2 text-right text-muted-foreground">
                          {op.oldNo}
                        </td>
                        <td className="w-10 select-none border-r border-muted/40 bg-muted/30 px-2 text-right text-muted-foreground">
                          {op.newNo}
                        </td>
                        <td className="w-5 select-none px-1 text-center text-muted-foreground">
                          {" "}
                        </td>
                        <td
                          className="whitespace-pre px-2 text-foreground"
                          dangerouslySetInnerHTML={{
                            __html: oldHighlighted[op.oldNo - 1] ?? "",
                          }}
                        />
                      </tr>
                    )
                  }
                  if (op.type === "delete") {
                    return (
                      <tr
                        key={idx}
                        className="align-top bg-red-50 dark:bg-red-950/30"
                      >
                        <td className="w-10 select-none border-r border-muted/40 px-2 text-right text-red-700/70 dark:text-red-300/70">
                          {op.oldNo}
                        </td>
                        <td className="w-10 select-none border-r border-muted/40 px-2" />
                        <td className="w-5 select-none px-1 text-center text-red-700 dark:text-red-300">
                          -
                        </td>
                        <td
                          className="whitespace-pre px-2 text-red-700 dark:text-red-300"
                          dangerouslySetInnerHTML={{
                            __html: oldHighlighted[op.oldNo - 1] ?? "",
                          }}
                        />
                      </tr>
                    )
                  }
                  return (
                    <tr
                      key={idx}
                      className="align-top bg-green-50 dark:bg-green-950/30"
                    >
                      <td className="w-10 select-none border-r border-muted/40 px-2" />
                      <td className="w-10 select-none border-r border-muted/40 px-2 text-right text-green-700/70 dark:text-green-300/70">
                        {op.newNo}
                      </td>
                      <td className="w-5 select-none px-1 text-center text-green-700 dark:text-green-300">
                        +
                      </td>
                      <td
                        className="whitespace-pre px-2 text-green-700 dark:text-green-300"
                        dangerouslySetInnerHTML={{
                          __html: newHighlighted[op.newNo - 1] ?? "",
                        }}
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DiffViewerDialog
