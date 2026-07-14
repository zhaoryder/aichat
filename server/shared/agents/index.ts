import type { AgentConfig, AgentCategory } from './types'
import { historyAgents } from './history'
import { literatureAgents } from './literature'
import { scienceAgents } from './science'
import { artAgents } from './art'
import { animeGameAgents } from './anime-game'
import { worklifeAgents } from './worklife'
import { funAgents } from './fun'
import { sportsAgents } from './sports'
import { musicAgents } from './music'
import { movieTvAgents } from './movie-tv'

export * from './types'

/** 给每个智能体打上分类标签（不修改原数组，返回新数组） */
function tagCategory(list: AgentConfig[], category: AgentCategory): AgentConfig[] {
  return list.map((a) => ({ ...a, category }))
}

export const agents: AgentConfig[] = [
  ...tagCategory(historyAgents, 'history'),
  ...tagCategory(literatureAgents, 'literature'),
  ...tagCategory(scienceAgents, 'science'),
  ...tagCategory(artAgents, 'art'),
  ...tagCategory(animeGameAgents, 'anime-game'),
  ...tagCategory(worklifeAgents, 'worklife'),
  ...tagCategory(funAgents, 'fun'),
  ...tagCategory(sportsAgents, 'sports'),
  ...tagCategory(musicAgents, 'music'),
  ...tagCategory(movieTvAgents, 'movie-tv'),
]

/** 根据 id 查找官方智能体配置 */
export function getAgentById(id: string): AgentConfig | undefined {
  return agents.find((agent) => agent.id === id)
}
