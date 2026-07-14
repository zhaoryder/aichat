// =====================================================================
// assistant-ui 基础配置
// ---------------------------------------------------------------------
// 提供 AssistantRuntimeProvider 和 useChatRuntime 的封装。
// 后续 Task 3.4 重构 ChatWindow 时将使用此配置接入 assistant-ui Thread。
// =====================================================================

import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ReactNode } from 'react'

export { AssistantRuntimeProvider, useExternalStoreRuntime }

/**
 * 包装 AssistantRuntimeProvider 的便捷组件。
 * 在 App.tsx 顶层使用，为所有子组件提供 assistant-ui 运行时。
 *
 * 注意：当前阶段（Task 3.1）仅安装依赖和基础配置。
 * 实际 Thread 集成在 Task 3.4 ChatWindow 重构时完成。
 */
export function AssistantUIProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
