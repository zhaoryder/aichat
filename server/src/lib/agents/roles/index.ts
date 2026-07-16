// =====================================================================
// AI Teamwork 角色索引（Batch C - C3）
// ---------------------------------------------------------------------
// 统一导出 6 个内置角色：
//   - leader：拆解任务、分配、汇总
//   - planner：细化步骤
//   - coder：写代码
//   - executor：跑测试、捕获错误
//   - reviewer：代码审查、评分
//   - reporter：汇报阶段进度
// =====================================================================

export {
  LEADER_SYSTEM_PROMPT,
  leaderTools,
  runLeader,
  type LeaderDecision,
} from './leader'

export {
  PLANNER_SYSTEM_PROMPT,
  runPlanner,
  generatePlan,
  type TeamPlanStep,
} from './planner'

export {
  CODER_SYSTEM_PROMPT,
  coderTools,
  runCoder,
} from './coder'

export {
  EXECUTOR_SYSTEM_PROMPT,
  executorTools,
  runExecutor,
} from './executor'

export {
  REVIEWER_SYSTEM_PROMPT,
  runReviewer,
} from './reviewer'

export {
  REPORTER_SYSTEM_PROMPT,
  runReporter,
} from './reporter'
