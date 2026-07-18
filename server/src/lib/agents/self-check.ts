// =====================================================================
// 开发完整性自检模块（Development Self-Check）
// ---------------------------------------------------------------------
// 在代码生成完成后自动执行一系列静态检查：
//   1. HTML 结构完整性（<html>/<head>/<body>/</html>）
//   2. 必要的 meta 标签（viewport / charset）
//   3. CSS 样式是否存在（<link rel="stylesheet"> 或 <style>）
//   4. JavaScript 是否存在（可选，不阻塞）
//   5. 标签闭合平衡（div/span/p/section 等常用标签）
//   6. 代码长度是否过短（可能被截断）
//
// 可选地通过 onToken 回调让 AI 流式输出自然语言自检报告。
// AI 报告失败不影响自检结果本身（仅静默告警）。
// =====================================================================

import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const modelName = process.env.AGNES_MODEL || 'agnes-2.0-flash'

export interface SelfCheckResult {
  passed: boolean
  checks: Array<{
    name: string
    passed: boolean
    message: string
  }>
  summary: string
}

/**
 * 开发完整性自检
 *
 * @param code 待检查的代码（通常是 Coder 刚 writeFile 的 HTML 内容）
 * @param onToken 可选，AI 流式自检报告的 token 回调
 * @returns SelfCheckResult
 */
export async function runSelfCheck(
  code: string,
  onToken?: (token: string) => void,
): Promise<SelfCheckResult> {
  const checks: SelfCheckResult['checks'] = []

  // 检查 1：HTML 结构
  const hasHtmlTag = /<html[\s>]/i.test(code)
  const hasHeadTag = /<head[\s>]/i.test(code)
  const hasBodyTag = /<body[\s>]/i.test(code)
  const hasClosingHtml = /<\/html>/i.test(code)
  checks.push({
    name: 'HTML 结构',
    passed: hasHtmlTag && hasHeadTag && hasBodyTag && hasClosingHtml,
    message:
      hasHtmlTag && hasHeadTag && hasBodyTag && hasClosingHtml
        ? 'HTML 结构完整'
        : `缺失：${[
            !hasHtmlTag && '<html>',
            !hasHeadTag && '<head>',
            !hasBodyTag && '<body>',
            !hasClosingHtml && '</html>',
          ]
            .filter(Boolean)
            .join(', ')}`,
  })

  // 检查 2：必要的 meta 标签
  const hasViewport = /<meta[^>]*viewport/i.test(code)
  const hasCharset = /<meta[^>]*charset/i.test(code)
  checks.push({
    name: 'Meta 标签',
    passed: hasViewport && hasCharset,
    message:
      hasViewport && hasCharset
        ? 'viewport 和 charset 已设置'
        : `缺失：${[!hasViewport && 'viewport', !hasCharset && 'charset']
            .filter(Boolean)
            .join(', ')}`,
  })

  // 检查 3：CSS 引用
  const cssLinks = code.match(/<link[^>]*\.css[^>]*>/gi) || []
  const styleTags = code.match(/<style[\s>]/gi) || []
  const hasCss = cssLinks.length > 0 || styleTags.length > 0
  checks.push({
    name: 'CSS 样式',
    passed: hasCss,
    message: hasCss
      ? `找到 ${cssLinks.length} 个外部 CSS + ${styleTags.length} 个内联样式`
      : '未找到任何 CSS 样式定义',
  })

  // 检查 4：JavaScript
  const scriptTags = code.match(/<script[\s>]/gi) || []
  const hasJs = scriptTags.length > 0
  checks.push({
    name: 'JavaScript',
    passed: true, // JS 是可选的，不阻塞
    message: hasJs
      ? `找到 ${scriptTags.length} 个 script 标签`
      : '无 JavaScript（纯静态页面）',
  })

  // 检查 5：标签闭合平衡
  const unclosedTags = (
    code.match(
      /<(div|span|p|ul|ol|li|section|article|header|footer|nav|main|aside)(\s[^>]*)?>/gi,
    ) || []
  ).length
  const closingTags = (
    code.match(
      /<\/(div|span|p|ul|ol|li|section|article|header|footer|nav|main|aside)>/gi,
    ) || []
  ).length
  const tagBalance = unclosedTags - closingTags
  checks.push({
    name: '标签闭合',
    passed: Math.abs(tagBalance) <= 2, // 允许 2 个误差（void 元素等）
    message:
      tagBalance === 0
        ? '所有标签正确闭合'
        : `标签不平衡：未闭合 ${tagBalance > 0 ? '+' : ''}${tagBalance}`,
  })

  // 检查 6：代码长度
  const codeLength = code.length
  checks.push({
    name: '代码完整度',
    passed: codeLength > 200,
    message:
      codeLength > 200
        ? `代码长度 ${codeLength} 字符`
        : `代码过短（${codeLength} 字符），可能不完整`,
  })

  const passed = checks.every((c) => c.passed)
  const summary = passed
    ? '✅ 所有自检通过'
    : `⚠️ ${checks.filter((c) => !c.passed).length} 项检查未通过`

  // 用 AI 流式输出自检报告（失败静默处理，不影响结果）
  if (onToken) {
    try {
      const openai = createOpenAI({
        apiKey: process.env.AGNES_API_KEY!,
        baseURL: process.env.AGNES_API_BASE!,
      })
      const result = streamText({
        model: openai.chat(modelName),
        system:
          '你是代码审查员，根据自检结果输出简洁的中文报告。格式：\n## 自检报告\n- ✅/❌ 检查项：结果\n\n总结：是否通过',
        prompt: `代码片段（前 1000 字符）：\n${code.slice(0, 1000)}\n\n自检结果：\n${JSON.stringify(checks, null, 2)}`,
      })

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta' && part.text) {
          onToken(part.text)
        }
      }
    } catch (err) {
      console.error('[self-check] AI report failed:', err)
    }
  }

  return { passed, checks, summary }
}
