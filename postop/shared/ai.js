/**
 * 术后跟诊 · AI 结果映射层
 *
 * 对接 cat_server 的 postop 检测（scan_model/gemini_api/detect_postop.py）。
 * 那边的 prompt v2 输出很完整，之前只取了 impression 一个字段，等于浪费了九成。
 * 现在全量映射，用于三件事：
 *
 *   1. 初筛结论 —— severity + diagnosis + advice，按九龄猫报告页的规格展示
 *   2. 变化分析 —— trend（好转/持平/恶化），模型在多图 timeline 模式下自己算
 *   3. 分类管理 —— severity + trend + confidence 合成病例级分类，喂给医生看板
 *
 * 边界仍然守住：AI 出的是**初筛**，不是确诊。
 * detect_postop 的 prompt 第七节已经写死了「不给出确定疾病名、不做安抚性保证」，
 * 这里不再叠加免责话术，只在报告底部留一行。
 */

// ── 标签表（与 detect_postop.py 的枚举一一对应）──

var SEVERITY = {
  good: { label: '未见明显异常', short: '正常', level: 'green', order: 0 },
  observe: { label: '需要继续观察', short: '观察', level: 'yellow', order: 1 },
  vet: { label: '建议就医处理', short: '就医', level: 'red', order: 2 },
}

var TREND = {
  improving: { label: '较上次好转', short: '好转', tone: 'good', arrow: '↑' },
  stable: { label: '与上次持平', short: '持平', tone: 'flat', arrow: '→' },
  worsening: { label: '较上次加重', short: '加重', tone: 'bad', arrow: '↓' },
  not_applicable: { label: '首次评估，暂无对比', short: '首次', tone: 'flat', arrow: '·' },
}

var CONFIDENCE = {
  high: { label: '高', hint: '三个区域都能看清，判断依据充分' },
  medium: { label: '中', hint: '部分区域看不全，或缺少关键背景信息' },
  low: { label: '低', hint: '多处无法评估，这次结论仅供参考，建议重拍' },
}

var OBSERVATION_LABELS = {
  tissue: '组织',
  inflammation: '炎症反应',
  moisture: '渗出情况',
  edges: '伤口边缘',
}

var WOUND_TYPE = {
  surgical_incision_closed: '手术切口（已闭合）',
  open_wound: '开放性伤口',
  puncture_or_bite: '穿刺伤 / 咬伤',
  abscess_suspected: '疑似脓肿',
  avulsion_degloving: '撕脱伤',
  burn: '烧烫伤',
  contusion_closed: '闭合性挫伤',
  undetermined: '类型待定',
}

var CONTAMINATION = {
  clean: '清洁',
  clean_contaminated: '清洁-污染',
  contaminated: '污染',
  dirty_infected: '污染/感染',
  unknown: '未知',
}

var ASSESSABILITY = {
  assessable: '可评估',
  partial: '部分可评估',
  not_assessable: '无法评估',
}

/** limiting_factors → 重拍指引。key 来自 detect_postop.py 的可用限制标签 */
var FACTOR_TIPS = {
  blur: { text: '照片有点糊，手扶稳一点再拍一张', retake: true },
  too_far: { text: '离得太远了，凑近到 20–30cm 拍特写', retake: true },
  lighting: { text: '光线不太够，换个亮一些的地方拍', retake: true },
  fur_occlusion: { text: '毛挡住伤口了，轻轻拨开再拍', retake: true },
  dressing_or_cone: { text: '纱布或头套挡住了伤口，换个角度避开', retake: true },
  angle: { text: '角度有点偏，尽量正对着伤口拍', retake: false },
  dark_coat: { text: '毛色偏深不太容易看清，补点光会更好', retake: false },
  wet_matted_fur: { text: '毛是湿的、打绺了，擦干后再拍更清楚', retake: false },
}

// ── 工具 ──

function pick(map, key, fallback) {
  var k = String(key || '').trim()
  return map[k] || fallback || null
}

function strList(v) {
  if (!v) return []
  if (Array.isArray(v)) {
    return v.map(function (x) { return String(x || '').trim() }).filter(Boolean)
  }
  var s = String(v).trim()
  return s ? [s] : []
}

function parseRaw(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    var obj = JSON.parse(raw)
    // worker 落库的是 { detector, result_json: {...} } 这种壳
    if (obj && obj.result_json) {
      return typeof obj.result_json === 'string' ? JSON.parse(obj.result_json) : obj.result_json
    }
    return obj || {}
  } catch (e) {
    return {}
  }
}

// ── 主映射 ──

/**
 * scan_records 一行 → { qc, report }
 * report 为 null 表示这次没拿到有效结论（门禁没过 / 分析失败）
 */
function mapRecord(record) {
  record = record || {}
  var r = parseRaw(record.raw_report)

  var assess = r.assessability || {}
  var factors = Array.isArray(assess.limiting_factors) ? assess.limiting_factors : []

  // 门禁没过：根本不是伤口照片
  if (r.valid_input === false) {
    return {
      qc: {
        pass: false,
        retake: true,
        issues: ['invalid_input'],
        tip: String(r.invalid_reason || '').trim() || '这张照片里没看到伤口，请拍伤口部位的特写',
      },
      report: null,
    }
  }

  var tips = []
  var mustRetake = false
  factors.forEach(function (f) {
    var meta = FACTOR_TIPS[f]
    if (!meta) return
    tips.push(meta.text)
    if (meta.retake) mustRetake = true
  })

  var qc = {
    pass: !mustRetake,
    retake: mustRetake,
    issues: factors,
    tip: tips.length ? tips.join('；') : '照片清晰度可以，明天尽量用同一个角度拍。',
  }

  var sevKey = String(record.pain_level || r.severity_level || '').trim()
  if (!SEVERITY[sevKey]) sevKey = ''
  if (!sevKey) return { qc: qc, report: null }

  var sev = SEVERITY[sevKey]
  var trendKey = String(r.trend || 'not_applicable').trim()
  var trend = pick(TREND, trendKey, TREND.not_applicable)
  var confKey = String(r.confidence || '').trim()
  var conf = pick(CONFIDENCE, confKey, null)

  // 逐项观察：只保留模型真写了内容的
  var obs = r.observations || {}
  var observations = []
  Object.keys(OBSERVATION_LABELS).forEach(function (k) {
    var text = String(obs[k] || '').trim()
    if (!text || text === 'unassessable') return
    observations.push({ key: k, label: OBSERVATION_LABELS[k], text: text })
  })

  // 可评估性：低置信度时要让用户知道为什么
  var coverage = []
  var covMap = { wound_bed: '伤口床', wound_edges: '伤口边缘', periwound: '周围皮肤' }
  Object.keys(covMap).forEach(function (k) {
    var v = String(assess[k] || '').trim()
    if (!v || v === 'assessable') return
    coverage.push({ label: covMap[k], text: ASSESSABILITY[v] || v })
  })

  var report = {
    severity: sevKey,
    severity_label: sev.label,
    severity_short: sev.short,
    level: sev.level,           // 直接对应红/黄/绿，页面样式复用

    diagnosis: String(r.diagnosis || r.impression || record.diagnosis || '').trim(),
    impression: String(r.impression || '').trim(),
    wound_assessment: String(r.wound_assessment || '').trim(),
    healing_stage: String(r.healing_stage || '').trim(),

    trend: trendKey,
    trend_label: trend.label,
    trend_short: trend.short,
    trend_tone: trend.tone,
    trend_arrow: trend.arrow,
    has_trend: trendKey !== 'not_applicable',

    observations: observations,

    advice: strList(r.advice),
    recheck_interval: String(r.recheck_interval || '').trim(),
    escalation_triggers: strList(r.escalation_triggers),
    escalation_reason: String(r.escalation_reason || '').trim(),

    wound_type: String(r.wound_type || '').trim(),
    wound_type_label: WOUND_TYPE[String(r.wound_type || '').trim()] || '',
    contamination_label: CONTAMINATION[String(r.contamination_class || '').trim()] || '',

    confidence: confKey,
    confidence_label: conf ? conf.label : '',
    confidence_reason: String(r.confidence_reason || '').trim() || (conf ? conf.hint : ''),
    low_confidence: confKey === 'low',
    coverage: coverage,
  }

  return { qc: qc, report: report }
}

/**
 * 把家长勾的问卷答案翻成 detect_postop 认识的 cat_context。
 * 让 AI 带着家长的自述读图，比盲看一张图准得多。
 *
 * opts.timeline = true 时声明这是同一伤口的时间序列，
 * 模型会走「纵向变化判断」分支并填 trend。
 */
function buildContext(kase, answers, opts) {
  answers = answers || {}
  opts = opts || {}

  // wound_type 按术式给，别一律写「手术切口」——
  // 口腔的创面在嘴里，AI 拿「手术切口」这个上下文去读会读歪
  var ctx = {
    postop_day: kase.day,
    surgery_type: kase.procedure_label || '',
    surgery_name: kase.procedure_label || '',
    wound_type: kase.wound_context || '手术切口',
  }
  if (opts.timeline) ctx.image_relation = 'same_wound_timeline'

  var appetite = { normal: '正常', half: '减少约一半', little: '几乎不吃' }
  var spirit = { normal: '正常', low: '偏蔫', bad: '明显萎靡' }
  var licking = { none: '否', sometimes: '偶尔', often: '频繁' }

  if (appetite[answers.appetite]) ctx.appetite = appetite[answers.appetite]
  if (spirit[answers.spirit]) ctx.spirit = spirit[answers.spirit]
  if (licking[answers.licking]) ctx.licking = licking[answers.licking]
  if (answers.limb_use && answers.limb_use !== 'weight') ctx.limp = '是'
  if (answers.temperature) ctx.fever = answers.temperature + '℃'
  if (answers.spirit === 'bad' || answers.appetite === 'little') ctx.activity = '明显减少'

  var abnormal = []
  if (answers.discharge === 'pus') abnormal.push('黄绿色脓性渗出')
  else if (answers.discharge === 'blood') abnormal.push('持续渗血')
  if (answers.wound_state === 'open') abnormal.push('伤口裂开')
  if (answers.swelling === 'obvious') abnormal.push('明显肿胀')
  else if (answers.swelling === 'mild') abnormal.push('轻度发红')
  if (answers.vomit === 'multi') abnormal.push('多次呕吐')
  if (abnormal.length) ctx.abnormal = abnormal.join('、')

  return ctx
}

/**
 * 病例级分类 —— 医院看板按这个分桶。
 *
 * 输入是「家长问卷分级」和「AI 初筛结论」两条独立证据，取更保守的一个：
 * 家长看得见 AI 看不见的（食欲、精神、体温），AI 看得见家长看不出的（伤口边缘、渗出性质）。
 * 谁报警都要算数——漏掉一个术后感染的代价，远大于多叫回来一只。
 */
function classify(questionnaireLevel, aiReport, opts) {
  opts = opts || {}
  var ORDER = { green: 0, yellow: 1, red: 2 }
  var qLevel = ORDER[questionnaireLevel] !== undefined ? questionnaireLevel : 'green'
  var aiLevel = aiReport ? aiReport.level : null

  var level = qLevel
  if (aiLevel && ORDER[aiLevel] > ORDER[level]) level = aiLevel

  var reasons = []
  if (ORDER[qLevel] > 0) reasons.push('家长上报有异常项')
  if (aiLevel && ORDER[aiLevel] > 0) reasons.push('AI 初筛：' + aiReport.severity_label)

  // 恶化趋势单独升一级：连续两天都是黄、但一天比一天差，比单点的黄更值得叫回来
  var escalated = false
  if (aiReport && aiReport.trend === 'worsening' && level === 'yellow') {
    level = 'red'
    escalated = true
    reasons.push('较上次加重')
  }

  // 低置信度不允许判绿——照片看不清就不能说没事
  if (aiReport && aiReport.low_confidence && level === 'green') {
    level = 'yellow'
    reasons.push('照片可评估性低，无法确认')
  }

  // 漏报也是信号：医生说的「每天上报」，没报本身就要被看到
  if (opts.missedDays >= 2 && level === 'green') {
    level = 'yellow'
    reasons.push('已连续 ' + opts.missedDays + ' 天未上报')
  }

  // 家长提了问题等着回复。**不改分级**——恢复得好就是绿的，
  // 但医生端要单独成一档，否则「一切正常 + 想问个事」会被折叠掉，问题就石沉大海了。
  if (opts.needsReply) reasons.push('家长有问题等回复')

  return {
    level: level,
    escalated: escalated,
    needs_reply: !!opts.needsReply,
    reasons: reasons,
    // 医生看板排序：红 > 黄 > 漏报 > 绿；同级内恶化趋势排前
    sort_key: (ORDER[level] * 100)
      + (aiReport && aiReport.trend === 'worsening' ? 20 : 0)
      + (opts.needsReply ? 15 : 0)
      + (opts.missedDays ? Math.min(10, opts.missedDays) : 0),
  }
}

var API = {
  SEVERITY: SEVERITY,
  TREND: TREND,
  CONFIDENCE: CONFIDENCE,
  OBSERVATION_LABELS: OBSERVATION_LABELS,
  WOUND_TYPE: WOUND_TYPE,
  FACTOR_TIPS: FACTOR_TIPS,
  mapRecord: mapRecord,
  buildContext: buildContext,
  classify: classify,
  parseRaw: parseRaw,
  strList: strList,
}

// 同一份规则要同时给小程序和医生端 H5 用，两边漂移就前功尽弃了
if (typeof module !== 'undefined' && module.exports) module.exports = API
if (typeof window !== 'undefined') window.PostopAI = API
