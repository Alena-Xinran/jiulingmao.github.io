/**
 * 术后跟诊工作台 · 演示数据
 *
 * 全部在浏览器里生成，不连后端——给医生看 demo 用。
 * 病例分布是刻意设计的：一屏里要能同时看到「该叫回来的」「该盯着的」「可以放心的」「失联的」，
 * 否则看不出分类管理的价值。
 */
(function (global) {
  var AI = global.PostopAI
  var RULES = global.PostopRules

  var HOSPITAL = '示例宠物医院'
  var DOCTORS = ['王医生', '李医生']

  var PETS = [
    ['橘子', 'cat', '中华田园猫', 'neuter'],
    ['豆豆', 'dog', '柯基', 'neuter'],
    ['奶昔', 'cat', '英短', 'dental'],
    ['大黄', 'dog', '金毛', 'orthopedic'],
    ['布丁', 'cat', '布偶', 'neuter'],
    ['可乐', 'dog', '法斗', 'soft_tissue'],
    ['芝麻', 'cat', '美短', 'neuter'],
    ['球球', 'dog', '比熊', 'neuter'],
    ['雪球', 'cat', '暹罗', 'wound_care'],
    ['阿福', 'dog', '中华田园犬', 'orthopedic'],
    ['喵喵', 'cat', '狸花', 'neuter'],
    ['旺财', 'dog', '边牧', 'soft_tissue'],
    ['小灰', 'cat', '俄蓝', 'neuter'],
    ['花卷', 'dog', '泰迪', 'dental'],
    ['汤圆', 'cat', '加菲', 'neuter'],
    ['黑妞', 'dog', '拉布拉多', 'wound_care'],
    ['奶糖', 'cat', 'banana', 'neuter'],
    ['虎子', 'dog', '柴犬', 'neuter'],
    ['米粒', 'cat', '中华田园猫', 'soft_tissue'],
    ['胖胖', 'dog', '萨摩耶', 'orthopedic'],
    ['乐乐', 'cat', '银渐层', 'neuter'],
    ['豆浆', 'dog', '雪纳瑞', 'dental'],
    ['小七', 'cat', '奶牛猫', 'neuter'],
    ['大壮', 'dog', '阿拉斯加', 'soft_tissue'],
  ]
  PETS[16][2] = '布偶'   // 上面占位用的，改回来

  // 答案模板：绿 / 轻黄 / 重黄 / 红
  var ANSWER_SETS = {
    green: {
      swelling: 'none', discharge: 'none', wound_state: 'closed', licking: 'none',
      appetite: 'normal', spirit: 'normal', excretion: 'normal', vomit: 'none',
      medication: 'yes', collar: 'always', limb_use: 'weight',
      drool: 'none', eating_soft: 'yes',
    },
    yellow: {
      swelling: 'mild', discharge: 'none', wound_state: 'closed', licking: 'sometimes',
      appetite: 'normal', spirit: 'normal', excretion: 'normal', vomit: 'none',
      medication: 'yes', collar: 'sometimes', limb_use: 'weight',
      drool: 'clear', eating_soft: 'yes',
    },
    yellow2: {
      swelling: 'mild', discharge: 'clear', wound_state: 'suture_loose', licking: 'sometimes',
      appetite: 'half', spirit: 'low', excretion: 'normal', vomit: 'none',
      medication: 'partial', collar: 'sometimes', limb_use: 'touch',
      drool: 'clear', eating_soft: 'hard',
    },
    red: {
      swelling: 'obvious', discharge: 'pus', wound_state: 'closed', licking: 'often',
      appetite: 'little', spirit: 'low', excretion: 'normal', vomit: 'once',
      medication: 'yes', collar: 'never', limb_use: 'none',
      drool: 'blood', eating_soft: 'no',
    },
  }

  var AI_SEEDS = {
    good: {
      diagnosis: '切口对合整齐，缝线在位，周围皮肤颜色均匀，未见渗出或肿胀。',
      wound_assessment: '切口线性闭合，边缘贴合无分离，周围 1cm 内无充血带。表面干燥。',
      healing_stage: '增生期早期',
      observations: {
        tissue: '边缘组织色泽正常，无坏死',
        inflammation: '无明显充血',
        moisture: '表面干燥',
        edges: '对合整齐，张力均匀',
      },
      advice: ['保持干燥清洁，每天同一时间拍照', '护具全天佩戴至拆线', '限制跳跃与剧烈活动'],
      recheck_interval: '',
      escalation_triggers: [],
      confidence: 'high',
    },
    observe: {
      diagnosis: '切口周围可见局限性充血带，范围约 1cm，未见明显渗出或裂开。',
      wound_assessment: '切口闭合，边缘基本贴合。周围皮肤发红，边界较清晰，未见提示积液的波动感。',
      healing_stage: '炎症期',
      observations: {
        tissue: '边缘组织完整，无坏死',
        inflammation: '局限性充血，范围约 1cm',
        moisture: '表面基本干燥',
        edges: '贴合，局部略有分离趋势',
      },
      advice: [
        '每天同角度同距离拍照，重点看发红范围是否扩大',
        '确保防舔护具不摘，舔舐会让局部充血迅速加重',
        '保持干燥，不要自行涂抹药膏或消毒液',
      ],
      recheck_interval: '24 小时后复看，48 小时无改善需到院',
      escalation_triggers: ['发红范围扩大或转深转紫', '出现黄绿色渗出或异味', '触碰明显疼痛躲避', '体温超过 39.5℃'],
      confidence: 'medium',
    },
    vet: {
      diagnosis: '切口区域外观异常，充血范围较广并见渗出物附着，边缘贴合不良。',
      wound_assessment: '周围充血超过 2cm 且边界不清，可见渗出与结痂混杂。图像表现与主人上报的红旗项一致。',
      healing_stage: '炎症期，存在延迟愈合迹象',
      observations: {
        tissue: '周围组织色泽不均，局部可疑失活',
        inflammation: '充血范围超过 2cm，边界不清',
        moisture: '可见渗出物附着',
        edges: '贴合不良，存在分离',
      },
      advice: [
        '尽快到院处理，携带跟诊记录与照片',
        '路上戴好防舔护具，避免继续舔舐',
        '不要自行清创、挤压或使用外用药',
      ],
      recheck_interval: '建议今日内到院',
      escalation_triggers: ['精神萎靡、叫不应', '持续呕吐或完全拒食', '伤口大量出血'],
      confidence: 'medium',
    },
  }

  function buildAiReport(severity, trend, confidence) {
    var seed = AI_SEEDS[severity]
    var raw = {
      valid_input: true,
      assessability: {
        wound_bed: 'assessable',
        wound_edges: 'assessable',
        periwound: confidence === 'low' ? 'not_assessable' : (severity === 'good' ? 'assessable' : 'partial'),
        limiting_factors: confidence === 'low' ? ['fur_occlusion'] : [],
        size_measurable: false,
      },
      wound_type: 'surgical_incision_closed',
      contamination_class: severity === 'vet' ? 'contaminated' : 'clean',
      observations: seed.observations,
      healing_stage: seed.healing_stage,
      trend: trend,
      wound_assessment: seed.wound_assessment,
      severity_level: severity,
      escalation_reason: severity === 'vet' ? '图像表现与主人上报的红旗项一致，取更保守结论' : '',
      confidence: confidence || seed.confidence,
      confidence_reason: confidence === 'low' ? '毛发遮挡，周围皮肤无法评估' : '',
      impression: seed.diagnosis,
      diagnosis: seed.diagnosis,
      advice: seed.advice,
      recheck_interval: seed.recheck_interval,
      escalation_triggers: seed.escalation_triggers,
    }
    return AI.mapRecord({
      pain_level: severity,
      raw_report: JSON.stringify({ detector: 'demo_postop_v2', result_json: raw }),
    }).report
  }

  function dateStr(daysAgo) {
    var d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2)
  }

  /**
   * 每个病例的剧本：决定它每天是什么状态。
   * kind:
   *   recovering  一路好转（大多数术后就是这样，看板上应该占多数）
   *   watch       持续轻度异常，需要盯着
   *   worsening   一天比一天差 —— 这类是产品真正要抓的
   *   silent      前几天正常，然后失联
   *   fresh       刚认领，只有 0~1 天记录
   *   lowconf     照片一直拍不清楚
   */
  var SCRIPTS = [
    'worsening', 'worsening', 'watch', 'watch', 'watch', 'silent', 'silent',
    'lowconf', 'fresh', 'fresh',
    'recovering', 'recovering', 'recovering', 'recovering', 'recovering', 'recovering',
    'recovering', 'recovering', 'recovering', 'recovering', 'recovering', 'recovering',
    'recovering', 'recovering',
  ]

  function dayPlan(kind, day, totalDays) {
    // 返回 {answers, severity, trend, confidence} 或 null 表示这天没上报
    if (kind === 'silent' && day >= 2) return null
    if (kind === 'fresh' && day >= 1) return null

    if (kind === 'worsening') {
      if (day >= 3) return { a: 'red', s: 'vet', t: 'worsening', c: 'medium' }
      if (day === 2) return { a: 'yellow2', s: 'observe', t: 'worsening', c: 'medium' }
      return { a: 'yellow', s: 'observe', t: day === 0 ? 'not_applicable' : 'stable', c: 'medium' }
    }
    if (kind === 'watch') {
      return { a: 'yellow', s: 'observe', t: day === 0 ? 'not_applicable' : 'stable', c: 'medium' }
    }
    if (kind === 'lowconf') {
      return { a: 'green', s: 'good', t: day === 0 ? 'not_applicable' : 'stable', c: 'low' }
    }
    // recovering / silent 的前几天 / fresh 的第 0 天
    var t = day === 0 ? 'not_applicable' : (day <= 2 ? 'improving' : 'improving')
    var a = day === 0 ? 'yellow' : 'green'
    var s = day === 0 ? 'observe' : 'good'
    return { a: a, s: s, t: t, c: 'high' }
  }

  function build() {
    var cases = []

    PETS.forEach(function (p, i) {
      var name = p[0], species = p[1], breed = p[2], procKey = p[3]
      var proc = RULES.getProcedure(procKey)
      var kind = SCRIPTS[i % SCRIPTS.length]

      // 术后天数：fresh 的很新，其余散布在跟诊周期内
      var day = kind === 'fresh' ? (i % 2) : (2 + (i * 3) % Math.max(3, proc.days - 2))
      var reports = []
      var missedDays = 0

      for (var d = 0; d <= day; d++) {
        var plan = dayPlan(kind, d, proc.days)
        if (!plan) continue
        var answers = {}
        var src = ANSWER_SETS[plan.a]
        proc.items.forEach(function (k) {
          if (src[k] !== undefined) answers[k] = src[k]
        })
        var qResult = RULES.evaluate(answers, procKey, species)
        var aiReport = proc.photo ? buildAiReport(plan.s, plan.t, plan.c) : null
        var cls = AI.classify(qResult.level, aiReport, {})

        reports.push({
          id: 'rep_' + i + '_' + d,
          day: d,
          date: dateStr(day - d),
          answers: answers,
          level: cls.level,
          questionnaire_level: qResult.level,
          ai_level: aiReport ? aiReport.level : '',
          classify_reasons: cls.reasons,
          reds: qResult.reds,
          yellows: qResult.yellows,
          ai_report: aiReport,
          note: d === day && kind === 'worsening' ? '今天下午开始一直躲在床底下不出来' : '',
          has_photo: proc.photo,
          doctor_reply: null,
          handled: false,
        })
      }

      reports.reverse()   // 最新在前

      // 漏报天数：从今天往回数，连续几天没有记录
      var reported = {}
      reports.forEach(function (r) { reported[r.day] = true })
      for (var k = day; k >= 0; k--) {
        if (reported[k]) break
        missedDays++
      }

      var latest = reports[0] || null
      var cls2 = AI.classify(
        latest ? latest.questionnaire_level : 'green',
        latest ? latest.ai_report : null,
        { missedDays: missedDays }
      )

      cases.push({
        id: 'case_' + i,
        pet_name: name,
        species: species,
        breed: breed,
        procedure: procKey,
        procedure_label: proc.label,
        photo_required: proc.photo,
        surgery_date: dateStr(day),
        day: day,
        days: proc.days,
        finished: day >= proc.days,
        owner_name: ['张', '李', '王', '刘', '陈', '杨', '赵', '周'][i % 8] + '女士',
        owner_phone: '138****' + (1000 + i * 37).toString().slice(-4),
        hospital_name: HOSPITAL,
        doctor_name: DOCTORS[i % DOCTORS.length],
        reports: reports,
        latest: latest,
        missed_days: missedDays,
        level: cls2.level,
        classify_reasons: cls2.reasons,
        sort_key: cls2.sort_key,
        script: kind,
      })
    })

    return { hospital: HOSPITAL, doctors: DOCTORS, cases: cases }
  }

  global.PostopDemo = { build: build, dateStr: dateStr }
})(window)
