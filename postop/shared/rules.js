/**
 * 术后跟诊 · 问卷定义 + 红黄绿分级规则
 *
 * 设计原则（来自宠物医生的原话）：
 *   「轻微红肿 AI 不一定判断得准」→ 所以判断主体是家长勾选的结构化选项，不是 AI。
 *   「有问题医生就可以直接看到」→ 所以每一项都要能映射到红/黄/绿，医生看板按此排序。
 *
 * 物种（猫/狗）只影响体温阈值和少量文案，不影响问卷主体。
 * 真正决定问哪些题的是「术式」（procedure），不是物种。
 *
 * 前端这套规则给家长**即时反馈**用；医生看板以服务端判定为准（服务端应复用同一份规则）。
 */

var LEVEL = {
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red',
  NONE: 'none', // 未测/跳过，不参与判定
}

var LEVEL_META = {
  green: { label: '正常', color: '#35A96B', short: '好' },
  yellow: { label: '需关注', color: '#E8A13A', short: '关注' },
  red: { label: '异常', color: '#E05B4C', short: '异常' },
  none: { label: '未填', color: '#9AA8A5', short: '—' },
}

// ── 体温阈值（摄氏度）──
var TEMP_RANGE = {
  cat: { low: 38.0, high: 39.2, redLow: 37.8, redHigh: 39.5 },
  dog: { low: 37.5, high: 39.2, redLow: 37.2, redHigh: 39.5 },
}

/**
 * 问卷条目。
 * group: wound 伤口 / systemic 全身 / care 护理
 * critical: true 表示这是伤口主线项，单独一个 yellow 就足以让整体变黄
 */
var ITEMS = {
  swelling: {
    key: 'swelling', group: 'wound', critical: true,
    title: '伤口周围有没有红肿？',
    hint: '和昨天比，不用和刚做完手术时比',
    options: [
      { value: 'none', label: '没有，皮肤颜色正常', level: LEVEL.GREEN },
      { value: 'mild', label: '轻微发红 / 有点鼓起', level: LEVEL.YELLOW },
      { value: 'obvious', label: '明显肿胀 / 发紫发黑', level: LEVEL.RED },
    ],
  },
  discharge: {
    key: 'discharge', group: 'wound', critical: true,
    title: '伤口有没有渗出物？',
    hint: '看纱布或伤口表面有没有湿的痕迹',
    options: [
      { value: 'none', label: '干燥，没有渗出', level: LEVEL.GREEN },
      { value: 'clear', label: '少量清亮 / 淡粉色', level: LEVEL.YELLOW },
      { value: 'blood', label: '一直在渗血', level: LEVEL.RED },
      { value: 'pus', label: '黄绿色脓液 / 有臭味', level: LEVEL.RED },
    ],
  },
  wound_state: {
    key: 'wound_state', group: 'wound', critical: true,
    title: '伤口本身的状态？',
    options: [
      { value: 'closed', label: '闭合完好', level: LEVEL.GREEN },
      { value: 'suture_loose', label: '线头松了 / 结痂掉了', level: LEVEL.YELLOW },
      { value: 'open', label: '有裂开，能看到皮下', level: LEVEL.RED },
    ],
  },
  licking: {
    key: 'licking', group: 'wound', critical: true,
    title: '有没有舔舐或抓挠伤口？',
    options: [
      { value: 'none', label: '没有', level: LEVEL.GREEN },
      { value: 'sometimes', label: '偶尔，能制止', level: LEVEL.YELLOW },
      { value: 'often', label: '很频繁，拦不住', level: LEVEL.RED },
    ],
  },

  appetite: {
    key: 'appetite', group: 'systemic',
    title: '今天的食欲怎么样？',
    hint: '和术前的日常饭量比',
    options: [
      { value: 'normal', label: '和平时差不多', level: LEVEL.GREEN },
      { value: 'half', label: '吃了一半左右', level: LEVEL.YELLOW },
      { value: 'little', label: '几乎不吃', level: LEVEL.RED },
    ],
  },
  spirit: {
    key: 'spirit', group: 'systemic',
    title: '精神状态？',
    options: [
      { value: 'normal', label: '正常，会走动、有反应', level: LEVEL.GREEN },
      { value: 'low', label: '有点蔫，愿意一直趴着', level: LEVEL.YELLOW },
      { value: 'bad', label: '明显萎靡，叫不太应', level: LEVEL.RED },
    ],
  },
  temperature: {
    key: 'temperature', group: 'systemic',
    type: 'temperature',
    title: '体温（如果测了）',
    hint: '没有体温计可以跳过，不影响提交',
    skippable: true,
  },
  excretion: {
    key: 'excretion', group: 'systemic',
    title: '大小便正常吗？',
    options: [
      { value: 'normal', label: '正常', level: LEVEL.GREEN },
      { value: 'abnormal', label: '变稀 / 带血 / 很费劲', level: LEVEL.YELLOW },
      { value: 'none', label: '超过 24 小时没有排', level: LEVEL.RED },
    ],
  },
  vomit: {
    key: 'vomit', group: 'systemic',
    title: '有没有呕吐？',
    options: [
      { value: 'none', label: '没有', level: LEVEL.GREEN },
      { value: 'once', label: '吐了 1 次', level: LEVEL.YELLOW },
      { value: 'multi', label: '吐了 2 次以上', level: LEVEL.RED },
    ],
  },

  medication: {
    key: 'medication', group: 'care',
    title: '今天的药按医嘱吃了吗？',
    options: [
      { value: 'yes', label: '都按时吃了', level: LEVEL.GREEN },
      { value: 'partial', label: '漏了一次', level: LEVEL.YELLOW },
      { value: 'no', label: '没吃 / 喂不进去', level: LEVEL.YELLOW },
      { value: 'none_prescribed', label: '医生没开药', level: LEVEL.GREEN },
    ],
  },
  collar: {
    key: 'collar', group: 'care',
    title: '伊丽莎白圈 / 术后服戴着吗？',
    options: [
      { value: 'always', label: '一直戴着', level: LEVEL.GREEN },
      { value: 'sometimes', label: '偶尔摘下来', level: LEVEL.YELLOW },
      { value: 'never', label: '没戴', level: LEVEL.YELLOW },
    ],
  },

  // ── 术式专属 ──
  limb_use: {
    key: 'limb_use', group: 'systemic', critical: true,
    title: '手术那条腿敢用吗？',
    options: [
      { value: 'weight', label: '敢落地承重', level: LEVEL.GREEN },
      { value: 'touch', label: '只轻轻点一下地', level: LEVEL.YELLOW },
      { value: 'none', label: '完全不敢用 / 一直提着', level: LEVEL.RED },
    ],
  },
  drool: {
    key: 'drool', group: 'wound', critical: true,
    title: '有没有流口水？',
    options: [
      { value: 'none', label: '没有', level: LEVEL.GREEN },
      { value: 'clear', label: '有清口水', level: LEVEL.YELLOW },
      { value: 'blood', label: '口水带血 / 有臭味', level: LEVEL.RED },
    ],
  },
  eating_soft: {
    key: 'eating_soft', group: 'systemic',
    title: '能吃软食吗？',
    options: [
      { value: 'yes', label: '能正常吃软食', level: LEVEL.GREEN },
      { value: 'hard', label: '想吃但嚼着费劲', level: LEVEL.YELLOW },
      { value: 'no', label: '完全不肯吃', level: LEVEL.RED },
    ],
  },
}

var BASE_SET = [
  'swelling', 'discharge', 'wound_state', 'licking',
  'appetite', 'spirit', 'temperature', 'excretion', 'vomit',
  'medication', 'collar',
]

/**
 * 术式模板。跟诊的主轴是术式，不是猫还是狗。
 *
 * 每种术式都要拍照——**伤口在嘴里也是伤口**，而且拔牙创面的出血和牙龈红肿
 * 恰恰最需要看每天的变化趋势。差别不在拍不拍，在拍哪里、怎么拍。
 *
 * photo_target: 拍摄部位，写进页面标题和 AI 的上下文
 * photo_tips:   这个部位特有的拍摄要领
 * wound_context: 传给 detect_postop 的 wound_type，让它知道在看什么
 */
var PROCEDURES = {
  neuter: {
    key: 'neuter', label: '绝育', days: 10, photo: true,
    items: BASE_SET,
    photo_target: '腹部或阴囊的切口',
    photo_tips: '让它侧躺或仰躺，光线充足，距离 20–30cm 把整条切口拍进去，不要开闪光灯。',
    wound_context: '绝育手术切口',
  },
  soft_tissue: {
    key: 'soft_tissue', label: '软组织手术', days: 14, photo: true,
    items: BASE_SET,
    photo_target: '手术切口',
    photo_tips: '距离 20–30cm 正对切口，把整条缝线和周围 2cm 皮肤都拍进去。',
    wound_context: '软组织手术切口',
  },
  orthopedic: {
    key: 'orthopedic', label: '骨科手术', days: 21, photo: true,
    items: BASE_SET.concat(['limb_use']),
    photo_target: '术侧肢体的切口',
    photo_tips: '拍切口的同时尽量把整条腿带进画面，医生要看肿胀有没有往下蔓延。别硬掰它的腿。',
    wound_context: '骨科手术切口',
  },
  dental: {
    key: 'dental', label: '口腔 / 牙科手术', days: 7, photo: true,
    items: ['drool', 'eating_soft', 'appetite', 'spirit', 'temperature', 'medication'],
    photo_target: '拔牙创面 / 牙龈缝合处',
    photo_tips: '轻轻掀开嘴唇拍患侧牙龈就行，不用掰开嘴。拍不清楚也别硬来，拍到侧面牙龈也有参考价值。',
    wound_context: '口腔内拔牙创面 / 牙龈缝合处',
  },
  wound_care: {
    key: 'wound_care', label: '外伤 / 换药', days: 14, photo: true,
    items: BASE_SET,
    photo_target: '伤口',
    photo_tips: '换药前拍，把创面和周围皮肤一起拍进去。有渗出就先别擦掉，医生要看性状。',
    wound_context: '外伤创面',
  },
  other: {
    key: 'other', label: '其他手术', days: 14, photo: true,
    items: BASE_SET,
    photo_target: '手术部位',
    photo_tips: '光线充足、距离 20–30cm，每天用同样的角度拍。',
    wound_context: '手术切口',
  },
}

var GROUP_META = {
  wound: { key: 'wound', label: '伤口', order: 1 },
  systemic: { key: 'systemic', label: '全身状态', order: 2 },
  care: { key: 'care', label: '护理配合', order: 3 },
}

// ────────────────────────────────────────────────────────────

/**
 * 短标签。问卷的 title 是完整问句（「伤口周围有没有红肿？」），
 * 适合逐条问，不适合当标签——医生扫 24 行病例时要的是两三个字。
 */
var SHORT_LABELS = {
  swelling: '红肿',
  discharge: '渗出物',
  wound_state: '伤口闭合',
  licking: '舔舐',
  appetite: '食欲',
  spirit: '精神',
  temperature: '体温',
  excretion: '排泄',
  vomit: '呕吐',
  medication: '用药',
  collar: '防舔护具',
  limb_use: '患肢',
  drool: '流口水',
  eating_soft: '进食',
}

/** 取短标签；没定义就退回去掉问号的 title */
function shortLabel(key) {
  if (SHORT_LABELS[key]) return SHORT_LABELS[key]
  var item = ITEMS[key]
  return item ? item.title.replace(/[？?]$/, '') : key
}

function getProcedure(key) {
  return PROCEDURES[key] || PROCEDURES.other
}

function speciesLabel(species) {
  return species === 'dog' ? '狗狗' : '猫咪'
}

/** 按术式取问卷条目（已按分组排序），并附带该题的默认状态 */
function buildQuestionnaire(procedureKey) {
  var proc = getProcedure(procedureKey)
  var list = []
  proc.items.forEach(function (key) {
    var item = ITEMS[key]
    if (item) list.push(item)
  })
  list.sort(function (a, b) {
    return GROUP_META[a.group].order - GROUP_META[b.group].order
  })
  return list
}

/** 把问卷条目按分组切成 [{key,label,items:[]}]，页面直接渲染 */
function groupQuestionnaire(procedureKey) {
  var list = buildQuestionnaire(procedureKey)
  var buckets = {}
  var order = []
  list.forEach(function (item) {
    if (!buckets[item.group]) {
      buckets[item.group] = { key: item.group, label: GROUP_META[item.group].label, items: [] }
      order.push(item.group)
    }
    buckets[item.group].items.push(item)
  })
  return order.map(function (k) { return buckets[k] })
}

/** 体温判级。没填返回 none，不参与判定。 */
function gradeTemperature(value, species) {
  var t = parseFloat(value)
  if (!value && value !== 0) return LEVEL.NONE
  if (isNaN(t) || t <= 0) return LEVEL.NONE
  var range = TEMP_RANGE[species === 'dog' ? 'dog' : 'cat']
  if (t >= range.redHigh || t <= range.redLow) return LEVEL.RED
  if (t > range.high || t < range.low) return LEVEL.YELLOW
  return LEVEL.GREEN
}

function temperatureText(value, species) {
  var t = parseFloat(value)
  if (isNaN(t) || t <= 0) return '未测'
  var range = TEMP_RANGE[species === 'dog' ? 'dog' : 'cat']
  var level = gradeTemperature(value, species)
  if (level === LEVEL.GREEN) return t.toFixed(1) + '℃ 正常'
  if (t > range.high) return t.toFixed(1) + '℃ 偏高'
  return t.toFixed(1) + '℃ 偏低'
}

/** 单题判级 */
function gradeAnswer(itemKey, value, species) {
  var item = ITEMS[itemKey]
  if (!item) return LEVEL.NONE
  if (item.type === 'temperature') return gradeTemperature(value, species)
  if (value === undefined || value === null || value === '') return LEVEL.NONE
  var hit = null
  item.options.forEach(function (o) {
    if (o.value === value) hit = o
  })
  return hit ? hit.level : LEVEL.NONE
}

function optionLabel(itemKey, value) {
  var item = ITEMS[itemKey]
  if (!item || !item.options) return ''
  var label = ''
  item.options.forEach(function (o) {
    if (o.value === value) label = o.label
  })
  return label
}

/**
 * 整体分级。
 *   红：任一红旗项
 *   黄：任一「伤口主线项」为黄，或累计 ≥2 个黄
 *   绿：其余
 * 这样「只是漏喂一次药」不会把病例刷成黄色——否则医生看板全是黄，分诊就失效了。
 */
function evaluate(answers, procedureKey, species) {
  answers = answers || {}
  var proc = getProcedure(procedureKey)
  var reds = []
  var yellows = []
  var criticalYellow = false
  var answered = 0

  proc.items.forEach(function (key) {
    var item = ITEMS[key]
    if (!item) return
    var level = gradeAnswer(key, answers[key], species)
    if (level !== LEVEL.NONE) answered++
    if (level === LEVEL.RED) {
      reds.push(key)
    } else if (level === LEVEL.YELLOW) {
      yellows.push(key)
      if (item.critical) criticalYellow = true
    }
  })

  var level = LEVEL.GREEN
  if (reds.length > 0) {
    level = LEVEL.RED
  } else if (criticalYellow || yellows.length >= 2) {
    level = LEVEL.YELLOW
  }

  return {
    level: level,
    reds: reds,
    yellows: yellows,
    answeredCount: answered,
    flagged: reds.concat(yellows),
  }
}

/** 必答项是否填全（体温可跳过） */
function missingRequired(answers, procedureKey) {
  answers = answers || {}
  var proc = getProcedure(procedureKey)
  var missing = []
  proc.items.forEach(function (key) {
    var item = ITEMS[key]
    if (!item || item.skippable) return
    var v = answers[key]
    if (v === undefined || v === null || v === '') missing.push(key)
  })
  return missing
}

/** 给家长看的结论文案。红色必须明确说「现在就联系医生」，不能含糊。 */
function summaryText(result, species) {
  var who = speciesLabel(species)
  if (result.level === LEVEL.RED) {
    return {
      title: '建议现在就联系医生',
      body: '你勾选的情况里有需要尽快处理的项目。已经同步给主治医生，如果 ' + who + '状态明显不好，别等回复，直接打医院电话。',
    }
  }
  if (result.level === LEVEL.YELLOW) {
    return {
      title: '有几项需要留意',
      body: '不是紧急情况，但医生会在工作台上看到这条记录。请按医嘱继续护理，明天再观察一次。',
    }
  }
  return {
    title: '今天恢复得不错',
    body: who + '各项都在正常范围。明天同一时间记得再来打个卡。',
  }
}

/** 红旗项的具体提示，逐条列给家长看 */
function flagNotes(result) {
  var notes = []
  result.reds.forEach(function (key) {
    var item = ITEMS[key]
    if (item) notes.push({ level: LEVEL.RED, text: item.title.replace(/[？?]$/, '') + '：异常' })
  })
  result.yellows.forEach(function (key) {
    var item = ITEMS[key]
    if (item) notes.push({ level: LEVEL.YELLOW, text: item.title.replace(/[？?]$/, '') + '：需留意' })
  })
  return notes
}

var API = {
  LEVEL: LEVEL,
  LEVEL_META: LEVEL_META,
  TEMP_RANGE: TEMP_RANGE,
  ITEMS: ITEMS,
  PROCEDURES: PROCEDURES,
  GROUP_META: GROUP_META,
  SHORT_LABELS: SHORT_LABELS,
  shortLabel: shortLabel,
  getProcedure: getProcedure,
  speciesLabel: speciesLabel,
  buildQuestionnaire: buildQuestionnaire,
  groupQuestionnaire: groupQuestionnaire,
  gradeAnswer: gradeAnswer,
  gradeTemperature: gradeTemperature,
  temperatureText: temperatureText,
  optionLabel: optionLabel,
  evaluate: evaluate,
  missingRequired: missingRequired,
  summaryText: summaryText,
  flagNotes: flagNotes,
}

// 同一份规则要同时给小程序和医生端 H5 用，两边漂移就前功尽弃了
if (typeof module !== 'undefined' && module.exports) module.exports = API
if (typeof window !== 'undefined') window.PostopRules = API
