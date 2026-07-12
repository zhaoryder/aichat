// 预设选项常量

export const SPEAKING_STYLES = [
  '毒舌', '温柔', '中二', '学术', '市井', '哲理', '抽象', '整活',
  '官方', '撒娇', '老干部', '互联网黑话', '翻译腔', '说书人'
] as const

export const PERSONALITIES = [
  '热血', '高冷', '逗比', '文艺', '腹黑', '天然呆', '傲娇',
  '病娇', '三无', '治愈', '电波', '哲学', '乐天派', '悲观主义'
] as const

export const HUMOR_TYPES = [
  '反转', '双关', '夸张', '冷幽默', '谐音梗', '无厘头',
  '黑色幽默', '荒诞', '讽刺', '自嘲', '破壁', '元幽默'
] as const

export const ARTICLE_STYLES = [
  '杂文', '散文', '新闻报道', '学术论文', '诗歌', '小说',
  '剧本', '日记', '檄文', '说明书', '广告文案', '檄文'
] as const

export const SCRIPT_GENRES = [
  '喜剧', '悲剧', '悬疑', '科幻', '爱情', '武侠',
  '都市', '校园', '职场', '家庭', '历史', '奇幻'
] as const

export const IMAGE_STYLES = [
  '写实', '动漫', '油画', '水彩', '素描', '像素风',
  '赛博朋克', '蒸汽朋克', '极简', '超现实', '波普艺术', '中国风'
] as const

export const VIDEO_STYLES = [
  '纪录片', 'MV', '广告', '电影感', 'Vlog', '动画',
  '快剪', '慢动作', '黑白', '复古'
] as const

export const VOICE_TYPES = [
  '成熟男声', '温柔女声', '少年音', '萝莉音', '大叔音',
  '御姐音', '正太音', '机械音', '方言味', '播音腔'
] as const

// 通用预设选项类型
export type PresetOption = string
export type PresetList = readonly PresetOption[]
