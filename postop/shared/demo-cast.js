/**
 * 术后跟诊 · 演示剧本（宠主端和医生端共用同一批人）
 *
 * 两端必须是同一份数据，演示时才能「主人端填一条 → 医生端立刻看到这只」。
 * 各自造数据的话，现场一对不上就穿帮了。
 *
 * 剧本是刻意设计的，一屏里要能同时看到：
 *   该叫回来的 / 该盯着的 / 可以放心的 / 失联的 / 当天变差的 / 补报过的
 * 否则看不出分类管理的价值。
 *
 * 用法：
 *   小程序   require('./demo-cast')  → seedCases() 灌进 mock DB
 *   医生端   <script src="shared/demo-cast.js">  → window.PostopCast.build()
 */
;(function (root, factory) {
  var API = factory(
    typeof require === 'function' ? require('./rules') : root.PostopRules,
    typeof require === 'function' ? require('./ai') : root.PostopAI
  )
  if (typeof module !== 'undefined' && module.exports) module.exports = API
  if (typeof window !== 'undefined') window.PostopCast = API
})(typeof window !== 'undefined' ? window : this, function (RULES, AI) {

  var HOSPITAL = '示例宠物医院'

  var DOCTORS = [
    { id: 'doc_wang', name: '王医生', title: '外科主治', phone: '400-820-1120' },
    { id: 'doc_chen', name: '陈医生', title: '骨科专科', phone: '400-820-1121' },
  ]

  var OWNERS = [
    { id: 'own_zhang', name: '张女士', phone: '138****2041' },
    { id: 'own_li', name: '李先生', phone: '139****7735' },
    { id: 'own_wang', name: '王先生', phone: '136****5182' },
  ]

  /**
   * 7 只宠物 / 3 个主人（都养多只）/ 2 个医生 / 4 种术式。
   * script 决定这只的恢复走向，见下面的 dayPlan。
   */
  var PETS = [
    // 张女士家：一猫术后恶化，一猫顺利
    { id: 'c_juzi', code: 'JZ7K2M', owner: 'own_zhang', doctor: 'doc_wang',
      name: '橘子', species: 'cat', breed: '中华田园猫', gender: '女生', weight: 3.8,
      procedure: 'neuter', day: 2, script: 'worsening' },
    { id: 'c_zhima', code: 'ZM4P9X', owner: 'own_zhang', doctor: 'doc_chen',
      name: '芝麻', species: 'cat', breed: '英国短毛猫', gender: '男生', weight: 5.2,
      procedure: 'dental', day: 4, script: 'smooth' },

    // 李先生家：一狗有波折（含当天补报升级），一猫已经好转
    { id: 'c_doudou', code: 'DD3H8N', owner: 'own_li', doctor: 'doc_wang',
      name: '豆豆', species: 'dog', breed: '柯基', gender: '男生', weight: 11.2,
      procedure: 'neuter', day: 5, script: 'bumpy' },
    { id: 'c_buding', code: 'BD6R1T', owner: 'own_li', doctor: 'doc_wang',
      name: '布丁', species: 'cat', breed: '布偶猫', gender: '女生', weight: 4.5,
      procedure: 'soft_tissue', day: 8, script: 'recovering' },

    // 王先生家：三只狗，一只恢复慢、一只失联、一只顺利
    { id: 'c_dahuang', code: 'DH2F5L', owner: 'own_wang', doctor: 'doc_chen',
      name: '大黄', species: 'dog', breed: '金毛', gender: '男生', weight: 28.5,
      procedure: 'orthopedic', day: 6, script: 'slow' },
    { id: 'c_kele', code: 'KL9B4V', owner: 'own_wang', doctor: 'doc_wang',
      name: '可乐', species: 'dog', breed: '法国斗牛犬', gender: '男生', weight: 13.0,
      procedure: 'soft_tissue', day: 4, script: 'ghosted' },
    { id: 'c_shandian', code: 'SD5Q7W', owner: 'own_wang', doctor: 'doc_chen',
      name: '闪电', species: 'dog', breed: '边境牧羊犬', gender: '女生', weight: 18.0,
      procedure: 'wound_care', day: 11, script: 'smooth' },
  ]

  // ── 答案模板 ──
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
      appetite: 'little', spirit: 'bad', excretion: 'normal', vomit: 'once',
      medication: 'partial', collar: 'never', limb_use: 'none',
      drool: 'blood', eating_soft: 'no',
    },
    // 骨科专用：伤口没事，但腿一直不敢用
    limp: {
      swelling: 'none', discharge: 'none', wound_state: 'closed', licking: 'none',
      appetite: 'normal', spirit: 'normal', excretion: 'normal', vomit: 'none',
      medication: 'yes', collar: 'always', limb_use: 'touch',
      drool: 'none', eating_soft: 'yes',
    },
  }

  /**
   * 某一天的剧本。返回 null 表示那天没上报（漏报）。
   * a = 问卷答案模板；s = AI severity；t = 趋势；c = 可信度
   */
  function dayPlan(script, day, total) {
    switch (script) {
      case 'smooth':          // 一路顺利
        if (day === 0) return { a: 'yellow', s: 'observe', t: 'not_applicable', c: 'high' }
        if (day === 1) return { a: 'green', s: 'good', t: 'improving', c: 'high' }
        return { a: 'green', s: 'good', t: 'stable', c: 'high' }

      // 一天比一天差 → 今天该叫回来。黄 → 黄 → 红，中间不跳级，
      // 这样医生在趋势条上能看出「不是突然坏的，是一路滑下去的」
      case 'worsening':
        if (day === 0) return { a: 'yellow', s: 'observe', t: 'not_applicable', c: 'medium' }
        if (day === 1) return { a: 'yellow2', s: 'observe', t: 'stable', c: 'medium' }
        return { a: 'red', s: 'vet', t: 'worsening', c: 'medium' }

      // 一路还行，今天下午突然变差 → 演示「当天升级」。
      // 今天第一条必须是绿的，否则补报那条和它同级，escalated_today 就出不来。
      case 'bumpy':
        if (day === 0) return { a: 'yellow', s: 'observe', t: 'not_applicable', c: 'high' }
        if (day === 1) return { a: 'green', s: 'good', t: 'improving', c: 'high' }
        if (day === 2) return null                       // 漏了一天
        return { a: 'green', s: 'good', t: 'stable', c: 'high' }

      case 'recovering':      // 前期黄，后期转绿
        if (day <= 1) return { a: 'yellow2', s: 'observe', t: day === 0 ? 'not_applicable' : 'stable', c: 'medium' }
        if (day <= 3) return { a: 'yellow', s: 'observe', t: 'improving', c: 'high' }
        if (day === 5) return null                       // 漏了一天
        return { a: 'green', s: 'good', t: 'improving', c: 'high' }

      case 'slow':            // 伤口没事，但腿迟迟不敢用（骨科典型）
        if (day === 0) return { a: 'yellow', s: 'observe', t: 'not_applicable', c: 'high' }
        return { a: 'limp', s: 'good', t: 'stable', c: 'high' }

      case 'ghosted':         // 前两天报了，之后失联
        if (day === 0) return { a: 'yellow', s: 'observe', t: 'not_applicable', c: 'medium' }
        if (day === 1) return { a: 'yellow', s: 'observe', t: 'stable', c: 'medium' }
        return null                                       // 之后一直没报
    }
    return { a: 'green', s: 'good', t: 'stable', c: 'high' }
  }

  /** 当天的补报：返回 null 表示没有补报 */
  function supplementPlan(script, day, isToday) {
    // 豆豆：今天早上报绿，下午变差补报一次 —— 演示「当天升级」
    if (script === 'bumpy' && isToday) {
      return { a: 'yellow2', s: 'observe', t: 'worsening', c: 'medium',
        note: '下午开始一直舔，拦不住，伤口比早上红了一圈' }
    }
    return null
  }

  /** 主人写的备注 */
  function noteFor(script, day, isToday) {
    if (script === 'worsening' && isToday) return '今天下午开始一直躲在床底下不出来，叫也不理'
    if (script === 'slow' && day === 3) return '别的都挺好，就是那条腿一直提着不肯落地'
    if (script === 'recovering' && day === 2) return '结痂掉了一小块，不知道要不要紧'
    return ''
  }

  /** 医生回复 */
  function replyFor(script, day, doctorName) {
    if (script === 'worsening' && day === 1) {
      return { doctor_name: doctorName, content: '看照片周围发红范围有扩大。今天先按医嘱把药喂上，明早再拍一张对比。如果开始有黄绿色渗出或者不吃东西，随时打电话，不用等。', replied_at: 0 }
    }
    if (script === 'recovering' && day === 2) {
      return { doctor_name: doctorName, content: '结痂自然脱落是正常的，不用处理，保持干燥就行。继续戴好圈别让它舔。', replied_at: 0 }
    }
    if (script === 'slow' && day === 3) {
      return { doctor_name: doctorName, content: '术后一周内不敢完全负重是常见的，先别强迫它走。每天短时间牵引散步 5 分钟，两周复查时我再看。', replied_at: 0 }
    }
    return null
  }

  // ── AI 报告文案（按 severity 取）──
  var AI_TEXT = {
    good: {
      diagnosis: '切口对合整齐，缝线在位，周围皮肤颜色均匀，未见渗出或肿胀。',
      wound_assessment: '切口线性闭合，边缘贴合无分离，周围 1cm 内无充血带。表面干燥，无结痂脱落。',
      healing_stage: '炎症期末 / 增生期早期',
      observations: { tissue: '切口边缘组织色泽正常，无坏死迹象', inflammation: '周围皮肤无明显充血', moisture: '表面干燥，无渗出', edges: '边缘对合整齐，缝线张力均匀' },
      advice: ['继续保持伤口干燥清洁，每天同一时间拍照记录', '防舔护具全天佩戴，直到拆线为止', '限制跳跃和剧烈活动'],
      recheck_interval: '', escalation_triggers: [],
    },
    observe: {
      diagnosis: '切口周围可见轻度充血带，范围局限，未见明显渗出物或裂开。',
      wound_assessment: '切口闭合，边缘基本贴合。周围皮肤发红，边界较清晰，未见提示积液的波动感。',
      healing_stage: '炎症期',
      observations: { tissue: '切口边缘组织完整，无坏死', inflammation: '局限性充血，范围约 1cm', moisture: '表面基本干燥', edges: '边缘贴合，局部略有分离趋势' },
      advice: ['每天同一角度、同一距离拍照，重点看发红范围是否扩大', '确保防舔护具不摘，舔舐会让局部充血迅速加重', '保持干燥，不要自行涂抹任何药膏或消毒液', '按医嘱继续用药，不要提前停药'],
      recheck_interval: '24 小时后复看，48 小时无改善需联系医院',
      escalation_triggers: ['发红范围较今天扩大，或颜色转深转紫', '出现黄绿色渗出物或异味', '触碰时明显疼痛、躲避或哈气', '体温超过 39.5℃'],
    },
    vet: {
      diagnosis: '切口区域外观异常，结合主人上报的情况，符合需要尽快由兽医处理的表现。',
      wound_assessment: '切口周围充血范围较广，局部可见渗出与结痂混杂，边缘贴合不良。图像与主人报告的红旗项一致。',
      healing_stage: '炎症期，存在延迟愈合迹象',
      observations: { tissue: '切口周围组织色泽不均，局部可疑失活', inflammation: '充血范围超过 2cm，边界不清', moisture: '可见渗出物附着', edges: '边缘贴合不良，存在分离' },
      advice: ['尽快联系主治医生，携带这份记录和照片到院', '路上给防舔护具戴好，不要让它继续舔舐', '不要自行清创、挤压或使用任何外用药', '记录最后一次进食和排便时间，到院时告诉医生'],
      recheck_interval: '建议今日内到院',
      escalation_triggers: ['精神萎靡、叫不应', '持续呕吐或完全拒食', '伤口大量出血'],
    },
  }

  /**
   * 口腔专用文案。通用那套写的是「切口对合整齐、周围皮肤颜色均匀」——
   * 牙龈没有皮肤，拿去演示医生一眼就看出是套模板。
   */
  var AI_TEXT_ORAL = {
    good: {
      diagnosis: '拔牙创面愈合中，牙龈缝线在位，未见活动性出血或明显红肿。',
      wound_assessment: '创面表面覆盖正常凝血，牙龈边缘贴合，未见食物嵌塞或缝线撕脱。邻牙牙龈色泽正常。',
      healing_stage: '软组织愈合早期',
      observations: {
        tissue: '牙龈组织色泽正常，未见坏死或苍白',
        inflammation: '创缘无明显充血肿胀',
        moisture: '无活动性渗血，唾液清亮',
        edges: '缝线在位，牙龈边缘对合良好',
      },
      advice: [
        '继续喂软食或泡软的粮，两周内不要给硬物和啃咬玩具',
        '不要自行掀嘴检查过频，每天拍一次就够',
        '按医嘱用药，口服抗生素不要提前停',
      ],
      recheck_interval: '', escalation_triggers: [],
    },
    observe: {
      diagnosis: '拔牙创面周围牙龈轻度充血，伴少量渗血，缝线在位。',
      wound_assessment: '创面凝血尚可，牙龈边缘轻度红肿，未见脓性分泌物。可能与进食摩擦或轻度刺激有关。',
      healing_stage: '软组织愈合早期，伴局部炎症',
      observations: {
        tissue: '牙龈组织完整，无坏死',
        inflammation: '创缘轻度充血，范围局限',
        moisture: '少量渗血，口水略带粉色',
        edges: '缝线在位，局部略有松动趋势',
      },
      advice: [
        '改喂流质或泥状食物，避免任何需要咀嚼的东西',
        '每天同一侧、同一角度拍一张，重点看红肿范围和出血量',
        '不要用棉签或纱布去擦创面，会把凝血块弄掉',
        '按医嘱继续用药',
      ],
      recheck_interval: '24 小时后复看，出血不减少需当天联系医院',
      escalation_triggers: [
        '出血变多，或口水持续带血',
        '口腔明显异味加重',
        '完全不肯进食超过 12 小时',
        '单侧脸颊肿起来',
      ],
    },
    vet: {
      diagnosis: '拔牙创面表现异常，结合主人上报的情况，符合需要尽快由兽医处理的表现。',
      wound_assessment: '创面可见持续渗血或脓性分泌物，牙龈红肿明显，缝线可能已撕脱。图像与主人报告的红旗项一致。',
      healing_stage: '愈合受阻，需排查感染或创面裂开',
      observations: {
        tissue: '牙龈组织色泽不均，创缘可疑失活',
        inflammation: '牙龈明显红肿，波及邻牙',
        moisture: '可见活动性渗血或脓性分泌物',
        edges: '缝线撕脱或创面裂开',
      },
      advice: [
        '尽快联系主治医生到院处理',
        '路上不要给任何食物和水，可能需要麻醉下重新处理',
        '不要自行冲洗口腔或掰开嘴查看',
        '记录最后一次进食时间，到院时告诉医生',
      ],
      recheck_interval: '建议今日内到院',
      escalation_triggers: ['大量出血不止', '精神萎靡', '单侧面部肿胀迅速加重'],
    },
  }

  function buildAiReport(severity, trend, confidence, procKey) {
    // 口腔和体表是两套解剖语言，共用一套文案会露馅
    var pool = procKey === 'dental' ? AI_TEXT_ORAL : AI_TEXT
    var t = pool[severity] || pool.good
    return AI.mapRecord({
      pain_level: severity,
      raw_report: JSON.stringify({
        detector: 'demo_postop_v2',
        result_json: {
          valid_input: true,
          assessability: {
            wound_bed: 'assessable', wound_edges: 'assessable',
            periwound: severity === 'good' ? 'assessable' : 'partial',
            limiting_factors: [], size_measurable: false,
          },
          wound_type: procKey === 'dental' ? 'open_wound' : 'surgical_incision_closed',
          contamination_class: severity === 'vet' ? 'contaminated' : 'clean',
          observations: t.observations,
          healing_stage: t.healing_stage,
          trend: trend,
          wound_assessment: t.wound_assessment,
          severity_level: severity,
          escalation_reason: severity === 'vet' ? '图像表现与主人上报的红旗项一致，取更保守结论' : '',
          confidence: confidence,
          confidence_reason: '',
          impression: t.diagnosis,
          diagnosis: t.diagnosis,
          advice: t.advice,
          recheck_interval: t.recheck_interval,
          escalation_triggers: t.escalation_triggers,
        },
      }),
    }).report
  }

  // ── 组装 ──

  function dateStr(daysAgo) {
    var d = new Date()
    d.setDate(d.getDate() - daysAgo)
    var m = d.getMonth() + 1, dd = d.getDate()
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd)
  }

  function findDoctor(id) {
    var hit = DOCTORS[0]
    DOCTORS.forEach(function (d) { if (d.id === id) hit = d })
    return hit
  }

  function findOwner(id) {
    var hit = OWNERS[0]
    OWNERS.forEach(function (o) { if (o.id === id) hit = o })
    return hit
  }

  function build() {
    var cases = []

    PETS.forEach(function (p) {
      var proc = RULES.getProcedure(p.procedure)
      var doctor = findDoctor(p.doctor)
      var owner = findOwner(p.owner)
      var reports = []

      for (var d = 0; d <= p.day; d++) {
        var isToday = d === p.day
        var entries = []

        var plan = dayPlan(p.script, d, proc.days)
        if (plan) entries.push({ plan: plan, note: noteFor(p.script, d, isToday) })

        var sup = supplementPlan(p.script, d, isToday)
        if (sup && plan) entries.push({ plan: sup, note: sup.note, supplement: true })

        entries.forEach(function (entry, idx) {
          var src = ANSWER_SETS[entry.plan.a]
          var answers = {}
          proc.items.forEach(function (k) {
            if (src[k] !== undefined) answers[k] = src[k]
          })

          var qResult = RULES.evaluate(answers, p.procedure, p.species)
          var aiReport = proc.photo ? buildAiReport(entry.plan.s, entry.plan.t, entry.plan.c, p.procedure) : null
          var cls = AI.classify(qResult.level, aiReport, {})

          var prevToday = entries[idx - 1]
          var prevLevel = ''
          if (prevToday) {
            var psrc = ANSWER_SETS[prevToday.plan.a]
            var pans = {}
            proc.items.forEach(function (k) { if (psrc[k] !== undefined) pans[k] = psrc[k] })
            var pai = proc.photo ? buildAiReport(prevToday.plan.s, prevToday.plan.t, prevToday.plan.c, p.procedure) : null
            prevLevel = AI.classify(RULES.evaluate(pans, p.procedure, p.species).level, pai, {}).level
          }
          var ORDER = { green: 0, yellow: 1, red: 2 }

          reports.push({
            id: p.id + '_d' + d + '_' + (idx + 1),
            case_id: p.id,
            day: d,
            date: dateStr(p.day - d),
            seq: idx + 1,
            is_supplement: idx > 0,
            escalated_today: !!prevLevel && ORDER[cls.level] > ORDER[prevLevel],
            prev_level_today: prevLevel,
            answers: answers,
            level: cls.level,
            questionnaire_level: qResult.level,
            ai_level: aiReport ? aiReport.level : '',
            classify_reasons: cls.reasons,
            reds: qResult.reds,
            yellows: qResult.yellows,
            ai_report: aiReport,
            note: entry.note || '',
            has_photo: proc.photo,
            photos: proc.photo ? [{ url: '', path: '', qc: null }] : [],
            doctor_reply: idx === 0 ? replyFor(p.script, d, doctor.name) : null,
            handled: false,
            created_at: Date.now() - (p.day - d) * 86400000 + idx * 21600000,
          })
        })
      }

      reports.reverse()   // 最新在前

      // 漏报天数：从今天往回数，连续几天没有记录
      var reported = {}
      reports.forEach(function (r) { reported[r.day] = true })
      var missedDays = 0
      for (var k = p.day; k >= 0; k--) {
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
        id: p.id,
        claim_code: p.code,
        pet_name: p.name,
        species: p.species,
        breed: p.breed,
        gender: p.gender,
        weight: p.weight,
        procedure: p.procedure,
        procedure_label: proc.label,
        photo_required: proc.photo,
        photo_target: proc.photo_target,
        photo_tips: proc.photo_tips,
        wound_context: proc.wound_context,
        surgery_date: dateStr(p.day),
        day: p.day,
        days: proc.days,
        finished: p.day >= proc.days,
        owner_id: owner.id,
        owner_name: owner.name,
        owner_phone: owner.phone,
        hospital_name: HOSPITAL,
        doctor_id: doctor.id,
        doctor_name: doctor.name,
        doctor_title: doctor.title,
        doctor_phone: doctor.phone,
        doctor_note: '每天同一时间打卡，伤口保持干燥，' + Math.min(7, proc.days) + ' 天后回院复查。',
        status: 'active',
        reports: reports,
        latest: latest,
        missed_days: missedDays,
        level: cls2.level,
        classify_reasons: cls2.reasons,
        sort_key: cls2.sort_key,
        script: p.script,
        created_at: Date.now(),
      })
    })

    return { hospital: HOSPITAL, doctors: DOCTORS, owners: OWNERS, cases: cases }
  }

  return {
    HOSPITAL: HOSPITAL,
    DOCTORS: DOCTORS,
    OWNERS: OWNERS,
    PETS: PETS,
    build: build,
    dateStr: dateStr,
  }
})
