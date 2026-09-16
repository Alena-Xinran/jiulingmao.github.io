/**
 * 术后跟诊工作台
 *
 * 核心不是「展示所有病例」，是**分类管理**：
 * 30 个术后病人里，医生只需要知道哪 3 个要叫回来。
 * 所以默认视图只显示需要处理的，恢复正常的折起来不占注意力。
 *
 * 分级规则来自 shared/ai.js + shared/rules.js —— 和宠主端小程序是同一份，
 * 保证家长看到的结论和医生看到的一致。
 */
(function () {
  var RULES = window.PostopRules
  var AI = window.PostopAI

  var $ = function (id) { return document.getElementById(id) }

  var state = {
    data: null,
    filter: 'todo',     // todo | yellow | silent | green | done | all
    keyword: '',
    currentId: null,
    overrideLevel: '',
    // 本次会话里新约出去的号，叠加在排班的基础占用之上（演示模式）
    bookings: [],
    recall: { date: '', slot: 'am', bring: {}, care: {} },
    calDoctor: '',
    session: null,
    // 真后端模式：医生自己的排班和已约号，来自服务端
    profile: null,
    realSlots: [],
    realBookings: [],
  }

  // ────────────────── 真后端 ──────────────────
  // 演示模式和真登录是两条路：演示用 demo-cast 的假数据，真登录才打 cat_server。

  // ?api=http://127.0.0.1:8005 可临时指到本地后端（记在 sessionStorage，关标签页即失效）
  var API_BASE = (function () {
    var m = /[?&]api=([^&]+)/.exec(location.search)
    try {
      if (m) sessionStorage.setItem('postop_api_base', decodeURIComponent(m[1]))
      var saved = sessionStorage.getItem('postop_api_base')
      if (saved) return saved.replace(/\/$/, '')
    } catch (e) {}
    return (window.POSTOP_API_BASE || 'https://api.jiulingmao.com').replace(/\/$/, '')
  })()
  var P = '/api/v1/postop'

  function isReal() { return !!(state.session && state.session.mode === 'real') }

  function api(path, method, body) {
    var token = state.session && state.session.token
    return fetch(API_BASE + path, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (data) {
        if (res.status === 401) {
          var e = new Error(data.detail || '登录已过期，请重新登录')
          e.auth = true
          throw e
        }
        if (!res.ok) throw new Error(data.detail || data.message || ('请求失败 ' + res.status))
        return data
      })
    }, function () {
      throw new Error('连不上服务器 ' + API_BASE)
    })
  }

  /** 服务端的 ai_report 是模型原始输出，转成页面认识的形状（和家长端同一份 mapRecord） */
  function mapServerReport(r) {
    var raw = r.ai_report
    r.ai_raw = raw || null
    r.ai_status = raw && raw.status ? raw.status : (raw ? 'completed' : 'none')
    r.ai_report = (raw && (!raw.status || raw.status === 'completed'))
      ? AI.mapRecord({ status: 'done', raw_report: raw }).report
      : null
    r.has_photo = !!(r.photos && r.photos.length)
    r.replied = !!r.doctor_reply
    r.answers = r.answers || {}
    return r
  }

  /** decorate() 出来的病例 → 看板要的字段。缺的补上，别让渲染层到处判空 */
  function mapServerCase(c) {
    var prof = state.profile || {}
    c.owner_name = c.owner_name || '家长'
    c.breed = c.breed || ''
    c.doctor_id = c.staff_id
    c.doctor_name = c.doctor_name || prof.name || ''
    c.doctor_phone = c.doctor_phone || prof.phone || ''
    c.hospital_name = c.hospital_name || prof.clinic_name || ''
    c.reports = (c.reports || []).map(mapServerReport)
    c.latest = c.reports.length ? c.reports[0] : null
    return c
  }

  function loadReal() {
    return Promise.all([
      api(P + '/clinic/profile'),
      api(P + '/clinic/board'),
      api(P + '/clinic/schedule').catch(function () { return { slots: [] } }),
      api(P + '/clinic/bookings').catch(function () { return { bookings: [] } }),
    ]).then(function (res) {
      state.profile = res[0].profile || {}
      state.realSlots = res[2].slots || []
      state.realBookings = res[3].bookings || []
      var me = state.profile
      state.data = {
        hospital: me.clinic_name || '',
        doctorList: [{ id: me.id, name: me.name, title: me.title || '', phone: me.phone }],
        doctors: [me.name],
        owners: [],
        cases: (res[1].cases || []).map(mapServerCase),
      }
    })
  }

  function reloadRealCase(id) {
    return api(P + '/clinic/cases/' + id).then(function (res) {
      var fresh = mapServerCase(res.case)
      state.data.cases = state.data.cases.map(function (c) { return c.id === id ? fresh : c })
      return fresh
    })
  }

  function handleApiError(err) {
    if (err && err.auth) {
      writeSession(null)
      state.session = null
      showGate()
      var el = $('gate-err')
      el.textContent = err.message
      el.hidden = false
      return
    }
    toast(err && err.message ? err.message : '出错了')
  }

  /**
   * 真后端模式的排班：形状和 shared/schedule.js 一样（calendar / daySlots / firstOpen），
   * 数据换成服务端 postop_doctor_slots + postop_bookings，医生和家长看到的余量才是同一份。
   */
  function makeRealSched() {
    var byKey = {}
    state.realSlots.forEach(function (s) { byKey[s.date + '|' + s.slot] = s })
    function bookedCount(key, slot, extra) {
      var n = 0
      state.realBookings.forEach(function (b) {
        if (b.date === key && b.slot === slot && (b.status || 'booked') === 'booked') n++
      })
      ;(extra || []).forEach(function (b) { if (b.date === key && b.slot === slot) n++ })
      return n
    }
    function daySlots(_doc, key, extra) {
      return SCH.SLOT_ORDER.filter(function (s) {
        var cfg = byKey[key + '|' + s]
        return cfg && cfg.capacity > 0
      }).map(function (s) {
        var cfg = byKey[key + '|' + s]
        var meta = SCH.SLOTS[s]
        var booked = Math.min(cfg.capacity, bookedCount(key, s, extra))
        return { slot: s, label: meta.label, time: meta.time, capacity: cfg.capacity,
          booked: booked, left: cfg.capacity - booked, full: booked >= cfg.capacity }
      })
    }
    function dayStatus(doc, key, extra) {
      var slots = daySlots(doc, key, extra)
      if (!slots.length) return { key: key, state: 'closed', left: 0, slots: [] }
      var left = slots.reduce(function (n, s) { return n + s.left }, 0)
      return { key: key, state: left === 0 ? 'full' : (left <= 2 ? 'tight' : 'open'), left: left, slots: slots }
    }
    function calendar(doc, days, extra, fromKey) {
      var out = []
      for (var i = 0; i < (days || 14); i++) {
        var key = SCH.toKey(SCH.addDays(i, fromKey))
        var st = dayStatus(doc, key, extra)
        out.push({ key: key, label: SCH.labelOf(key), week: SCH.weekOf(key), text: SCH.dateText(key),
          isToday: i === 0 && !fromKey, isWeekend: [0, 6].indexOf(SCH.parseKey(key).getDay()) >= 0,
          state: st.state, left: st.left, slots: st.slots })
      }
      return out
    }
    function firstOpen(doc, extra, opts) {
      opts = opts || {}
      var cal = calendar(doc, opts.days || 14, extra)
      for (var i = 0; i < cal.length; i++) {
        if (opts.skipToday && cal[i].isToday) continue
        for (var j = 0; j < cal[i].slots.length; j++) {
          if (!cal[i].slots[j].full) return { date: cal[i].key, slot: cal[i].slots[j].slot }
        }
      }
      return null
    }
    return { SLOTS: SCH.SLOTS, SLOT_ORDER: SCH.SLOT_ORDER, todayKey: SCH.todayKey, dateText: SCH.dateText,
      toKey: SCH.toKey, parseKey: SCH.parseKey, addDays: SCH.addDays, labelOf: SCH.labelOf, weekOf: SCH.weekOf,
      daySlots: daySlots, dayStatus: dayStatus, calendar: calendar, firstOpen: firstOpen }
  }

  function sched() { return isReal() ? makeRealSched() : SCH }

  // ── 分桶 ──
  // silent（漏报）单独成一档：医生说的是「每天上报」，没报本身就是信号，
  // 混进绿色里就等于把失联的病人当成康复的。
  var BUCKETS = [
    { key: 'todo', label: '需处理', hint: '红：建议今天联系', cls: 'red' },
    { key: 'ask', label: '待回复', hint: '家长提了问题', cls: 'ask' },
    { key: 'yellow', label: '观察中', hint: '黄：盯着变化趋势', cls: 'yellow' },
    { key: 'silent', label: '失联', hint: '连续 2 天以上没上报', cls: 'silent' },
    { key: 'green', label: '恢复正常', hint: '不用管，折起来', cls: 'green' },
    { key: 'done', label: '已结束', hint: '跟诊周期已满', cls: 'done' },
  ]

  /**
   * 分桶。红色永远优先——问题再要紧也没有伤口要紧。
   *
   * 但「待回复」必须排在黄色之前，而且要能从绿色里捞出来：
   * 恢复得好、只是想问个事的家长，如果落进绿色被折叠，那条问题就石沉大海了。
   * 医生说的是「他提的问题医生看到之后回答他一下」——看不到就无从回答。
   */
  /** 某个病例当前还没回复的提问。家长一天可以问很多条，这里全都要拿到 */
  function openQs(c) {
    if (!c) return []
    if (c.open_questions) return c.open_questions
    return (c.questions || []).filter(function (q) { return !q.answer })
  }

  function bucketOf(c) {
    if (c.finished) return 'done'
    if (c.level === 'red') return 'todo'
    if (c.needs_reply) return 'ask'
    if (c.missed_days >= 2) return 'silent'
    if (c.level === 'yellow') return 'yellow'
    return 'green'
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    })
  }

  function toast(msg) {
    var el = $('toast')
    el.textContent = msg
    el.hidden = false
    clearTimeout(el._t)
    el._t = setTimeout(function () { el.hidden = true }, 2000)
  }

  function speciesText(s) { return s === 'dog' ? '犬' : '猫' }

  // ────────────────── 渲染：统计 ──────────────────

  function renderStats() {
    var counts = {}
    BUCKETS.forEach(function (b) { counts[b.key] = 0 })
    state.data.cases.forEach(function (c) { counts[bucketOf(c)]++ })

    $('stats').innerHTML = BUCKETS.map(function (b) {
      return '<div class="stat ' + b.cls + (state.filter === b.key ? ' on' : '') +
        '" data-bucket="' + b.key + '">' +
        '<div class="stat-num">' + counts[b.key] + '</div>' +
        '<div class="stat-label">' + b.label + '</div>' +
        '<div class="stat-hint">' + b.hint + '</div>' +
        '</div>'
    }).join('')

    $('filters').innerHTML = BUCKETS.map(function (b) {
      return '<button class="filter' + (state.filter === b.key ? ' on' : '') +
        '" data-bucket="' + b.key + '">' + b.label + '</button>'
    }).join('') +
      '<button class="filter' + (state.filter === 'all' ? ' on' : '') + '" data-bucket="all">全部</button>'
  }

  // ────────────────── 渲染：列表 ──────────────────

  function visibleCases() {
    var kw = state.keyword.trim().toLowerCase()
    return state.data.cases.filter(function (c) {
      if (state.filter !== 'all' && bucketOf(c) !== state.filter) return false
      if (!kw) return true
      return (c.pet_name + c.owner_name + c.procedure_label + c.breed).toLowerCase().indexOf(kw) >= 0
    }).sort(function (a, b) {
      return b.sort_key - a.sort_key || a.day - b.day
    })
  }

  function rowHtml(c) {
    var bucket = bucketOf(c)
    var lvClass = bucket === 'silent' ? 'lv-silent' : 'lv-' + c.level
    var latest = c.latest
    var ai = latest && latest.ai_report

    var flags = []
    if (c.missed_days >= 2) {
      flags.push('<span class="tag tag-grey">' + c.missed_days + ' 天未上报</span>')
    }
    // 当天之内变差过 —— 整块看板里信号最强的一个，必须排在其它标签前面。
    // 「状态在往坏里走」比任何单点状态都值得医生先看一眼。
    if (openQs(c).length) {
      var qn = openQs(c).length
      flags.push('<span class="tag tag-ask">家长提问' + (qn > 1 ? ' ' + qn : '') + '</span>')
    }
    if (latest && latest.escalated_today) {
      flags.push('<span class="tag tag-escalate">今天变差</span>')
    } else if (latest && latest.is_supplement) {
      flags.push('<span class="tag tag-grey">当天补报</span>')
    }
    if (latest) {
      (latest.reds || []).slice(0, 2).forEach(function (k) {
        var it = RULES.ITEMS[k]
        if (it) flags.push('<span class="tag tag-red">' + esc(RULES.shortLabel(k)) + '</span>')
      })
      if (!latest.reds || !latest.reds.length) {
        (latest.yellows || []).slice(0, 2).forEach(function (k) {
          var it = RULES.ITEMS[k]
          if (it) flags.push('<span class="tag tag-yellow">' + esc(RULES.shortLabel(k)) + '</span>')
        })
      }
    }

    var trendHtml = ''
    if (ai && ai.has_trend) {
      trendHtml = '<span class="trend-chip ' + ai.trend_tone + '">' +
        ai.trend_arrow + ' ' + esc(ai.trend_short) + '</span>'
    }

    return '<div class="row ' + lvClass + (state.currentId === c.id ? ' on' : '') +
      '" data-id="' + c.id + '">' +
      '<div class="row-main">' +
        '<div class="row-top">' +
          '<span class="row-name">' + esc(c.pet_name) + '</span>' +
          '<span class="row-meta">' + speciesText(c.species) + ' · ' + esc(c.breed) + '</span>' +
        '</div>' +
        '<div class="row-sub">' + esc(c.procedure_label) + ' · 术后第 ' + c.day + ' 天 · ' + esc(c.owner_name) + '</div>' +
        (flags.length ? '<div class="row-flags">' + flags.join('') + '</div>' : '') +
      '</div>' +
      '<div class="row-side">' +
        '<span class="day-badge">Day ' + c.day + '/' + c.days + '</span>' +
        trendHtml +
      '</div>' +
    '</div>'
  }

  function renderList() {
    var list = visibleCases()
    $('list').innerHTML = list.map(rowHtml).join('')
    $('list-empty').hidden = list.length > 0
  }

  // ────────────────── 渲染：详情 ──────────────────

  var LV_ORDER = { green: 0, yellow: 1, red: 2 }

  /**
   * 取某一天该显示的那条记录。
   *
   * 一天可能有多条（每日打卡 + 补报）。这里取**当天最重**的那条，不是最新也不是最早：
   * 「早上绿、下午红、晚上又报个绿」如果显示最新就变成绿的，看板会告诉医生这只没事。
   * reports 是倒序的，直接 byDay[r.day] = r 会取到当天最早的一条，同样是错的。
   */
  function dayPeak(c, day) {
    var hit = null
    var count = 0
    c.reports.forEach(function (r) {
      if (r.day !== day) return
      count++
      if (!hit || LV_ORDER[r.level] > LV_ORDER[hit.level]) hit = r
    })
    return hit ? { report: hit, count: count } : null
  }

  function findCase(id) {
    var hit = null
    state.data.cases.forEach(function (c) { if (c.id === id) hit = c })
    return hit
  }

  function timelineHtml(c) {
    var cells = []
    for (var d = 0; d <= c.day; d++) {
      var hit = dayPeak(c, d)
      var cls = hit ? 'lv-' + hit.report.level : 'miss'
      var title = hit
        ? '第 ' + d + ' 天' + (hit.count > 1 ? '（当天 ' + hit.count + ' 次，取最重）' : '')
        : '第 ' + d + ' 天未上报'
      cells.push('<div class="tl-cell ' + cls + '" data-day="' + d + '" title="' + title + '">' +
        '<div class="tl-bar">' + (hit && hit.count > 1 ? '<i class="tl-multi"></i>' : '') + '</div>' +
        '<div class="tl-lab">' + d + '</div></div>')
    }
    return '<div class="timeline">' + cells.join('') + '</div>'
  }

  function compareHtml(c) {
    // 逐日照片时间线（photo-history.js）：每天最新一张做封面，点开看当天全部
    if (window.PostopPhotoHistory) return window.PostopPhotoHistory.render(c, c.reports)
    var withPhoto = c.reports.filter(function (r) { return r.has_photo })
    var today = withPhoto[0]
    var prev = withPhoto[1]
    function cell(r, cap) {
      if (!r) {
        return '<div class="cmp-item"><div class="cmp-ph">暂无照片</div>' +
          '<div class="cmp-cap">' + cap + '</div></div>'
      }
      var url = r.photos && r.photos[0] && r.photos[0].url
      if (url) {
        return '<div class="cmp-item"><img class="cmp-img" src="' + esc(url) + '" alt="第 ' + r.day + ' 天">' +
          '<div class="cmp-cap">' + cap + '</div></div>'
      }
      // demo 没有真图，用占位块表达「这里是同角度对比」
      var target = c.photo_target || '伤口'
      return '<div class="cmp-item"><div class="cmp-ph">第 ' + r.day + ' 天' +
        (r.is_supplement ? ' 补报' : '') + '<br>' + esc(target) + '</div>' +
        '<div class="cmp-cap">' + cap + '</div></div>'
    }
    // 同一天的两条（打卡 + 补报）要能分清，否则两张都写「第 5 天」看不出比的是什么
    function cap(r, prefix) {
      if (!r) return ''
      var sameDay = prev && today && prev.day === today.day
      if (sameDay) return prefix + '（第 ' + r.day + ' 天 第 ' + (r.seq || 1) + ' 次）'
      return prefix + '（第 ' + r.day + ' 天）'
    }
    return '<div class="compare">' +
      cell(prev, prev ? cap(prev, '上一次') : '暂无历史') +
      cell(today, today ? cap(today, '最新') : '今天未上报') +
      '</div>'
  }

  function aiHtml(r) {
    var ai = r && r.ai_report
    if (!ai) {
      var why = '这次没有照片或分析未完成。'
      if (r && r.ai_raw) {
        if (r.ai_status === 'pending' || r.ai_status === 'running') why = 'AI 正在分析照片，稍后刷新。'
        else if (r.ai_raw.message) why = r.ai_raw.message
      }
      return '<div class="sec"><div class="sec-title">AI 初筛</div>' +
        '<div class="ai-pending">' + esc(why) + '</div></div>'
    }
    var obs = ai.observations.map(function (o) {
      return '<div class="kv"><span class="kv-k">' + esc(o.label) + '</span>' +
        '<span class="kv-v">' + esc(o.text) + '</span></div>'
    }).join('')

    var adv = ai.advice.length
      ? '<div class="sec-title" style="margin-top:16px">给家长的建议</div><ol class="adv-list">' +
        ai.advice.map(function (a) { return '<li>' + esc(a) + '</li>' }).join('') + '</ol>'
      : ''

    var recheck = ai.recheck_interval
      ? '<div class="kv" style="margin-top:8px"><span class="kv-k">复查</span>' +
        '<span class="kv-v"><b>' + esc(ai.recheck_interval) + '</b></span></div>'
      : ''

    var escalation = ai.escalation_triggers.length
      ? '<div class="esc"><b>出现以下情况需立即到院</b><ul>' +
        ai.escalation_triggers.map(function (t) { return '<li>' + esc(t) + '</li>' }).join('') +
        '</ul></div>'
      : ''

    var warn = ai.low_confidence
      ? '<div class="warn">照片可评估性低' +
        (ai.confidence_reason ? '：' + esc(ai.confidence_reason) : '') +
        '。系统已按规则拒绝判绿，需要人工看一眼。</div>'
      : ''

    var reason = ai.escalation_reason
      ? '<div class="kv" style="margin-top:8px"><span class="kv-k">升级依据</span>' +
        '<span class="kv-v">' + esc(ai.escalation_reason) + '</span></div>'
      : ''

    return '<div class="sec">' +
      '<div class="sec-title">AI 初筛 <span class="sec-sub">基于照片 + 家长上报</span></div>' +
      '<div class="ai-head">' +
        '<span class="ai-sev lv-' + ai.level + '">' + esc(ai.severity_label) + '</span>' +
        '<span class="ai-conf">可信度 ' + esc(ai.confidence_label || '—') +
          (ai.has_trend ? ' · <b class="trend-chip ' + ai.trend_tone + '">' +
            ai.trend_arrow + ' ' + esc(ai.trend_label) + '</b>' : '') +
        '</span>' +
      '</div>' +
      (ai.diagnosis ? '<div class="ai-diag">' + esc(ai.diagnosis) + '</div>' : '') +
      (ai.wound_assessment ? '<div class="ai-assess">' + esc(ai.wound_assessment) + '</div>' : '') +
      (obs ? '<div class="kv-grid">' + obs + '</div>' : '') +
      reason + recheck + warn + adv + escalation +
      '</div>'
  }

  function answersHtml(c, r) {
    if (!r) return ''
    var groups = RULES.groupQuestionnaire(c.procedure)
    return groups.map(function (g) {
      var rows = g.items.map(function (item) {
        var v = r.answers[item.key]
        var lv = RULES.gradeAnswer(item.key, v, c.species)
        var text = item.type === 'temperature'
          ? RULES.temperatureText(v, c.species)
          : (RULES.optionLabel(item.key, v) || '未填')
        return '<div class="ans"><span class="ans-k">' +
          esc(item.title.replace(/[？?]$/, '')) + '</span>' +
          '<span class="ans-v lv-' + (lv === 'none' ? 'none' : lv) + '">' + esc(text) + '</span></div>'
      }).join('')
      return '<div class="sec"><div class="sec-title">' + esc(g.label) +
        '</div><div class="ans-grid">' + rows + '</div></div>'
    }).join('')
  }

  function renderDetail() {
    var c = findCase(state.currentId)
    if (!c) {
      $('detail').hidden = true
      $('detail-empty').hidden = false
      return
    }
    $('detail-empty').hidden = true
    $('detail').hidden = false

    var r = state.selectedReport || c.latest
    var bucket = bucketOf(c)
    var lvClass = bucket === 'silent' ? 'lv-silent' : 'lv-' + c.level

    var verdictTitle = bucket === 'silent'
      ? '已连续 ' + c.missed_days + ' 天没有上报'
      : (c.level === 'red' ? '建议今天联系家长'
        : c.level === 'yellow' ? '继续观察，留意变化趋势'
        : '恢复情况正常')

    var reasons = (c.classify_reasons || []).map(function (x) {
      return '<span class="dv-chip">' + esc(x) + '</span>'
    }).join('')

    var html =
      '<div class="dt-head">' +
        '<div>' +
          '<div class="dt-name">' + esc(c.pet_name) +
            ' <span class="tag tag-plain">' + speciesText(c.species) + ' · ' + esc(c.breed) + '</span></div>' +
          '<div class="dt-meta">' + esc(c.procedure_label) + ' · ' + esc(c.surgery_date) +
            ' 手术 · 术后第 ' + c.day + ' 天 / 共 ' + c.days + ' 天</div>' +
          '<div class="dt-owner">' + esc(c.owner_name) + ' · ' + esc(c.owner_phone) +
            ' · 主治 ' + esc(c.doctor_name) + '</div>' +
        '</div>' +
        '<div class="dt-actions">' +
          '<button class="btn-primary" data-act="reply">回复家长</button>' +
          '<button class="btn-plain" data-act="recall">通知来院</button>' +
          '<button class="btn-plain" data-act="override">' + (c.override ? '已改判 · 调整' : '调整分级') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="dt-verdict ' + lvClass + '">' +
        '<div class="dv-title">' + verdictTitle + '</div>' +
        (reasons ? '<div class="dv-reasons">' + reasons + '</div>' : '') +
      '</div>' +

      (openQs(c).length
        ? '<div class="sec">' +
            '<div class="askbox">' +
              '<div class="ask-h">家长想问' +
                (openQs(c).length > 1 ? '（' + openQs(c).length + ' 条）' : '') +
              '</div>' +
              openQs(c).map(function (q) {
                return '<div class="ask-one">' +
                  '<div class="ask-when">第 ' + q.day + ' 天 · ' + q.date + '</div>' +
                  '<div class="ask-q">' + esc(q.text) + '</div>' +
                '</div>'
              }).join('') +
              '<button class="btn-primary ask-btn" data-act="reply">' +
                (openQs(c).length > 1 ? '一起回复' : '回复这条') +
              '</button>' +
            '</div>' +
          '</div>'
        : '') +

      '<div class="sec">' +
        '<div class="sec-title">逐日趋势 <span class="sec-sub">点一天看当天记录；斜纹格是没上报</span></div>' +
        timelineHtml(c) +
      '</div>'

    if (r) {
      html +=
        '<div class="sec">' +
          '<div class="sec-title">同角度对比 <span class="sec-sub">' +
            esc(c.photo_target || '伤口') + ' · 轻微红肿靠这个看趋势</span></div>' +
          compareHtml(c) +
        '</div>' +
        aiHtml(r) +
        answersHtml(c, r)

      if (r.photos && r.photos.length > 1 && r.photos[1].url) {
        html += '<div class="sec"><div class="sec-title">这次的其它照片</div><div class="compare">' +
          r.photos.slice(1).map(function (p) {
            return '<div class="cmp-item"><img class="cmp-img" src="' + esc(p.url) + '" alt=""></div>'
          }).join('') + '</div></div>'
      }
      if (r.note) {
        html += '<div class="sec"><div class="sec-title">家长补充</div>' +
          '<div class="note-box">' + esc(r.note) + '</div></div>'
      }
      if (r.doctor_reply) {
        html += '<div class="sec"><div class="sec-title">已回复</div>' +
          '<div class="reply-box">' + esc(r.doctor_reply.content) +
          '<div class="reply-by">— ' + esc(r.doctor_reply.doctor_name) + '</div></div></div>'
      }
    } else {
      html += '<div class="sec"><div class="sec-title">还没有上报记录</div>' +
        '<div style="color:var(--text-mute);font-size:13px">家长认领了病例但一次都没打卡，建议电话提醒。</div></div>'
    }

    if (isReal()) {
      html += '<div class="sec" id="records-sec"><div class="sec-title">宠物病历 <span class="sec-sub">同一只宠物历次治疗共用；AI 读图时会参考摘要</span></div>' +
        '<div class="ai-pending">读取中…</div></div>'
    }

    $('detail').innerHTML = html
    if (isReal()) loadRecords(c)
  }

  // ────────────────── 病历（真实模式） ──────────────────

  var WOUND_TYPES = {
    surgical_incision_closed: '闭合手术切口', open_wound: '开放创面', puncture_or_bite: '穿刺 / 咬伤',
    abscess_suspected: '疑似脓肿', avulsion_degloving: '撕脱伤', burn: '烧烫伤',
    contusion_closed: '闭合挫伤', undetermined: '待判定',
  }

  function loadRecords(c) {
    api(P + '/clinic/cases/' + c.id + '/medical-records').then(function (res) {
      var box = $('records-sec')
      if (!box || state.currentId !== c.id) return
      var list = (res.records || []).map(function (r) {
        return '<div class="rec-item"><span class="rec-title">' + esc(r.title) + '</span>' +
          '<span class="rec-meta">' + esc(r.record_date) + '</span>' +
          (r.url ? ' <a href="' + esc(r.url) + '" target="_blank" rel="noopener">附件</a>' : '') +
          (r.summary ? '<div class="rec-sum">' + esc(r.summary) + '</div>' : '') + '</div>'
      }).join('') || '<div class="ai-pending">还没有病历。</div>'
      box.innerHTML = '<div class="sec-title">宠物病历 <span class="sec-sub">同一只宠物历次治疗共用；AI 读图时会参考摘要</span></div>' +
        list +
        '<form class="rec-form fm-grid" id="rec-form" data-case="' + esc(c.id) + '">' +
          '<label class="fm-field">标题<input name="title" required maxlength="100" placeholder="如：绝育术后出院小结"></label>' +
          '<label class="fm-field">日期<input name="record_date" type="date" value="' + SCH.todayKey() + '" required></label>' +
          '<label class="fm-field fm-full">摘要（供 AI 和历史对比参考）<textarea name="summary" maxlength="10000"></textarea></label>' +
          '<label class="fm-field fm-full">附件（图片或 PDF，可不传）<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>' +
          '<div class="fm-full"><button type="submit" class="btn-plain">保存病历</button></div>' +
        '</form>'
      $('rec-form').addEventListener('submit', function (e) {
        e.preventDefault()
        var f = e.target
        var body = new FormData(f)
        if (!body.get('file') || !body.get('file').size) body.delete('file')
        if (!String(body.get('title') || '').trim()) { toast('病历标题不能为空'); return }
        var btn = f.querySelector('button')
        btn.disabled = true
        apiForm(P + '/clinic/cases/' + c.id + '/medical-records', body).then(function () {
          toast('病历已保存')
          loadRecords(c)
        }).catch(function (err) { btn.disabled = false; handleApiError(err) })
      })
    }).catch(function (err) {
      var box = $('records-sec')
      if (box) box.innerHTML = '<div class="sec-title">宠物病历</div><div class="ai-pending">' + esc(err.message) + '</div>'
    })
  }

  /** multipart 上传（病历附件）。和 api() 一样处理 401 / 错误文案 */
  function apiForm(path, formData) {
    var token = state.session && state.session.token
    return fetch(API_BASE + path, {
      method: 'POST', body: formData,
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (data) {
        if (res.status === 401) { var e = new Error(data.detail || '登录已过期'); e.auth = true; throw e }
        if (!res.ok) throw new Error(data.detail || '请求失败 ' + res.status)
        return data
      })
    }, function () { throw new Error('连不上服务器 ' + API_BASE) })
  }

  // ────────────────── 通用表单弹窗：注册 / 新建病例 / 医生简介 ──────────────────

  var formState = { onSave: null }

  function field(label, name, opts) {
    opts = opts || {}
    var attrs = ' name="' + name + '"' + (opts.required ? ' required' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.attrs || '')
    var inner
    if (opts.options) {
      inner = '<select' + attrs + '>' + Object.keys(opts.options).map(function (k) {
        return '<option value="' + esc(k) + '"' + (opts.value === k ? ' selected' : '') + '>' + esc(opts.options[k]) + '</option>'
      }).join('') + '</select>'
    } else if (opts.textarea) {
      inner = '<textarea' + attrs + '>' + esc(opts.value || '') + '</textarea>'
    } else {
      inner = '<input type="' + (opts.type || 'text') + '"' + attrs + ' value="' + esc(opts.value || '') + '">'
    }
    return '<label class="fm-field' + (opts.full ? ' fm-full' : '') + '">' + esc(label) + inner + '</label>'
  }

  function openForm(title, sub, bodyHtml, saveText, onSave) {
    $('form-title').textContent = title
    $('form-sub').textContent = sub || ''
    $('form-body').innerHTML = '<div class="fm-grid">' + bodyHtml + '</div>'
    $('form-err').hidden = true
    $('form-save').textContent = saveText || '保存'
    $('form-save').disabled = false
    formState.onSave = onSave
    $('form-mask').hidden = false
  }

  function formValues() {
    var out = {}
    new FormData($('form-body')).forEach(function (v, k) { out[k] = typeof v === 'string' ? v.trim() : v })
    return out
  }

  function submitForm() {
    if (!formState.onSave) return
    if (!$('form-body').reportValidity()) return
    var btn = $('form-save')
    btn.disabled = true
    $('form-err').hidden = true
    Promise.resolve(formState.onSave(formValues())).then(function () {
      btn.disabled = false
      $('form-mask').hidden = true
    }).catch(function (err) {
      btn.disabled = false
      if (err && err.auth) { $('form-mask').hidden = true; handleApiError(err); return }
      $('form-err').textContent = (err && err.message) || '保存失败'
      $('form-err').hidden = false
    })
  }

  function openRegister() {
    openForm('注册医生账号', '需要管理员发的邀请码。注册后你就是本院的管理员账号。',
      field('邀请码', 'registration_code', { type: 'password', required: true }) +
      field('手机号（登录用）', 'phone', { type: 'tel', required: true, attrs: ' pattern="1[3-9][0-9]{9}"' }) +
      field('医生姓名', 'name', { required: true }) +
      field('医院 / 诊所名称', 'clinic_name', { required: true }) +
      field('密码（至少 10 位）', 'password', { type: 'password', required: true, attrs: ' minlength="10"', full: true }),
      '注册并登录',
      function (v) {
        return api(P + '/clinic/register', 'POST', v).then(function (res) {
          enterApp({ mode: 'real', token: res.token, staff: res.staff || {}, name: (res.staff || {}).name })
        })
      })
  }

  function openNewCase() {
    var procs = {}
    Object.keys(RULES.PROCEDURES || {}).forEach(function (k) { procs[k] = RULES.PROCEDURES[k].label })
    var pets = {}
    ;(state.data.cases || []).forEach(function (c) { if (c.pet_id) pets[c.pet_id] = c })
    var petOpts = { '': '新宠物' }
    Object.keys(pets).forEach(function (id) { petOpts[id] = pets[id].pet_name + ' · ' + pets[id].owner_phone })
    openForm('新建跟诊病例', '出院时开单。家长手机号是认领的钥匙，必须是家长本人在用的那个。',
      field('已有宠物（同一只再次治疗）', 'pet_id', { options: petOpts, full: true }) +
      field('家长手机号', 'owner_phone', { type: 'tel', required: true, attrs: ' pattern="1[3-9][0-9]{9}"' }) +
      field('宠物名', 'pet_name', { required: true }) +
      field('物种', 'species', { options: { cat: '猫', dog: '犬' } }) +
      field('品种', 'breed') +
      field('手术 / 跟诊类型', 'procedure', { options: procs }) +
      field('伤口类型', 'wound_type', { options: WOUND_TYPES, value: 'surgical_incision_closed' }) +
      field('伤口部位', 'wound_site', { placeholder: '如：腹中线' }) +
      field('手术 / 受伤日期', 'surgery_date', { type: 'date', value: SCH.todayKey(), required: true }) +
      field('跟诊天数', 'days', { type: 'number', value: '14', attrs: ' min="1" max="365"', required: true }) +
      field('医嘱备注（家长看不到，AI 读图会参考）', 'doctor_note', { textarea: true, full: true }),
      '开单',
      function (v) {
        v.days = parseInt(v.days, 10)
        if (!v.pet_id) delete v.pet_id
        return api(P + '/clinic/cases', 'POST', v).then(function (res) {
          var c = res.case
          toast(c.owner_id ? '已开单，家长已自动绑定' : '已开单。让家长在小程序授权手机号即可认领；兜底认领码 ' + c.claim_code)
          state.currentId = c.id
          state.filter = 'all'
          return loadReal().then(afterLoad)
        })
      })
    // 选已有宠物时带出资料
    var sel = $('form-body').querySelector('[name=pet_id]')
    var proc = $('form-body').querySelector('[name=procedure]')
    sel.addEventListener('change', function () {
      var c = pets[sel.value]
      if (!c) return
      ;['owner_phone', 'pet_name', 'species', 'breed'].forEach(function (k) {
        var el = $('form-body').querySelector('[name=' + k + ']')
        if (el) el.value = c[k] || ''
      })
    })
    proc.addEventListener('change', function () {
      var p = RULES.PROCEDURES[proc.value]
      if (p && p.days) $('form-body').querySelector('[name=days]').value = p.days
    })
  }

  function openProfile() {
    var p = state.profile || {}
    openForm('医生简介', '家长在小程序里看到的就是这些。',
      field('姓名', 'name', { value: p.name, required: true }) +
      field('职称', 'title', { value: p.title }) +
      field('简介', 'bio', { textarea: true, value: p.bio, full: true }),
      '保存',
      function (v) {
        return api(P + '/clinic/profile', 'PUT', v).then(function (res) {
          state.profile = res.profile || state.profile
          toast('已保存')
          afterLoad()
        })
      })
  }

  function renderAll() {
    renderStats()
    renderList()
    renderDetail()
  }

  // ────────────────── 交互 ──────────────────

  var QUICK_REPLIES = [
    '照片看着没问题，继续保持干燥，按时戴圈就好。',
    '发红范围明天再拍一张对比，如果扩大了随时联系我。',
    '这个情况建议今天带过来看一下，我在院里。',
    '药按医嘱吃完，不要提前停。',
  ]

  function bindEvents() {
    // 统计卡 / 筛选
    document.addEventListener('click', function (e) {
      var stat = e.target.closest('.stat, .filter')
      if (stat && stat.dataset.bucket) {
        state.filter = stat.dataset.bucket
        state.selectedReport = null
        renderAll()
        return
      }

      var row = e.target.closest('.row')
      if (row && row.dataset.id) {
        state.currentId = row.dataset.id
        state.selectedReport = null
        renderList()
        renderDetail()
        return
      }

      var cell = e.target.closest('.tl-cell')
      if (cell) {
        var c = findCase(state.currentId)
        var day = Number(cell.dataset.day)
        var hit = null
        var pk = dayPeak(c, day)
        hit = pk ? pk.report : null
        state.selectedReport = hit
        renderDetail()
        if (!hit) toast('第 ' + day + ' 天没有上报')
        return
      }

      var act = e.target.closest('[data-act]')
      if (act) {
        onAction(act.dataset.act)
        return
      }

      var img = e.target.closest('.cmp-img')
      if (img && img.src) {
        $('lightbox-img').src = img.src
        $('lightbox').hidden = false
        return
      }

      if (e.target.id === 'lightbox' || e.target.closest('#lightbox')) {
        $('lightbox').hidden = true
      }
    })

    $('search').addEventListener('input', function (e) {
      state.keyword = e.target.value
      renderList()
    })

    $('btn-refresh').addEventListener('click', function () {
      boot()
      toast(isReal() ? '已刷新' : '已重新生成演示数据')
    })

    $('btn-logout').addEventListener('click', function () {
      writeSession(null)
      state.session = null
      state.data = null
      showGate()
    })

    $('cal-save').addEventListener('click', saveSchedule)
    $('btn-new-case').addEventListener('click', openNewCase)
    $('btn-profile').addEventListener('click', openProfile)
    $('form-cancel').addEventListener('click', function () { $('form-mask').hidden = true })
    $('form-save').addEventListener('click', submitForm)
    $('form-body').addEventListener('submit', function (e) { e.preventDefault(); submitForm() })

    // 改判
    $('override-cancel').addEventListener('click', function () { $('override-mask').hidden = true })
    $('override-save').addEventListener('click', function () { saveOverride(false) })
    $('override-clear').addEventListener('click', function () { saveOverride(true) })
    $('override-levels').addEventListener('click', function (e) {
      var b = e.target.closest('.lv-opt')
      if (!b) return
      state.overrideLevel = b.dataset.level
      renderOverrideLevels()
    })

    // 回复
    $('reply-cancel').addEventListener('click', function () { $('reply-mask').hidden = true })
    $('reply-save').addEventListener('click', saveReply)

    $('btn-calendar').addEventListener('click', openCalendar)
    $('cal-close').addEventListener('click', function () { $('cal-mask').hidden = true })
    $('cal-doctors').addEventListener('click', function (e) {
      var b = e.target.closest('[data-doc]')
      if (!b) return
      state.calDoctor = b.dataset.doc
      renderCalendar()
    })

    $('recall-cancel').addEventListener('click', function () { $('recall-mask').hidden = true })
    $('recall-save').addEventListener('click', saveRecall)
    $('recall-note').addEventListener('input', function () {
      $('recall-preview').textContent = recallMessage()
    })
    $('recall-when').addEventListener('click', function (e) {
      var b = e.target.closest('[data-date]')
      if (!b || b.disabled) return
      state.recall.date = b.dataset.date
      renderRecall()
    })
    $('recall-slot').addEventListener('click', function (e) {
      var b = e.target.closest('[data-slot]')
      if (!b || b.disabled) return
      state.recall.slot = b.dataset.slot
      renderRecall()
    })
    document.addEventListener('click', function (e) {
      var box = e.target.closest('.check[data-group]')
      if (!box) return
      e.preventDefault()
      var g = box.dataset.group, k = box.dataset.key
      state.recall[g][k] = !state.recall[g][k]
      renderRecall()
    })
    $('reply-quick').addEventListener('click', function (e) {
      var b = e.target.closest('button')
      if (b) $('reply-text').value = b.textContent
    })
  }


  // ────────────────── 通知来院 ──────────────────

  var SCH = window.PostopSchedule

  /**
   * 预设项。医生在诊间点这个的时候通常很赶，不该让他从零打字。
   * pre() 返回 true 的项会**按这个病例的实际情况预先勾上**——
   * 比如家长报了没戴伊丽莎白圈，那「戴好防舔护具」就该默认勾上。
   */
  var RECALL_BRING = [
    { key: 'record', label: '出院单 / 病历本', pre: function () { return true } },
    { key: 'meds', label: '正在吃的药（连包装一起）', pre: function (c, r) {
      return !!r && ['partial', 'no'].indexOf(r.answers.medication) >= 0
    } },
    { key: 'collar', label: '伊丽莎白圈 / 术后服', pre: function (c, r) {
      return !!r && ['sometimes', 'never'].indexOf(r.answers.collar) >= 0
    } },
    { key: 'food', label: '平时吃的粮（可能要留院观察）', pre: function (c) {
      return c.level === 'red'
    } },
    { key: 'photo', label: '手机里之前拍的伤口照片', pre: function () { return false } },
  ]

  var RECALL_CARE = [
    { key: 'nolick', label: '路上别让它舔伤口', pre: function (c, r) {
      return !!r && ['sometimes', 'often'].indexOf(r.answers.licking) >= 0
    } },
    { key: 'fast', label: '先别喂食（可能需要麻醉或超声）', pre: function (c) {
      return c.level === 'red'
    } },
    { key: 'carrier', label: '用航空箱 / 牵引绳，别让它跳', pre: function (c) {
      return c.procedure === 'orthopedic'
    } },
    { key: 'dry', label: '伤口别沾水', pre: function () { return true } },
    { key: 'warm', label: '路上注意保暖', pre: function () { return false } },
  ]

  function openRecall(c) {
    var r = state.selectedReport || c.latest
    // 红色病例默认排今天（挤也要挤进去），其余从明天起找第一个收得下的
    var S = sched()
    var pick = S.firstOpen(c.doctor_id, state.bookings, { skipToday: c.level !== 'red' })
      || S.firstOpen(c.doctor_id, state.bookings)
    state.recall = {
      date: pick ? pick.date : S.todayKey(),
      slot: pick ? pick.slot : 'am',
      bring: {},
      care: {},
    }
    RECALL_BRING.forEach(function (o) { state.recall.bring[o.key] = !!o.pre(c, r) })
    RECALL_CARE.forEach(function (o) { state.recall.care[o.key] = !!o.pre(c, r) })

    $('recall-sub').textContent =
      c.pet_name + ' · ' + c.owner_name + ' · ' + c.owner_phone +
      '（' + c.procedure_label + '，术后第 ' + c.day + ' 天）'
    $('recall-note').value = ''
    renderRecall()
    $('recall-mask').hidden = false
  }

  function renderRecall() {
    var c0 = findCase(state.currentId)
    var S = sched()
    var cal = S.calendar(c0.doctor_id, 14, state.bookings)

    // 日期条：不出诊的也画出来（灰掉），否则医生会以为是系统漏了那天
    $('recall-when').innerHTML =
      '<div class="daystrip">' + cal.map(function (d) {
        var dis = d.state === 'closed' || d.state === 'full'
        return '<button class="daybtn s-' + d.state + (state.recall.date === d.key ? ' on' : '') +
          (dis ? ' dis' : '') + '" data-date="' + d.key + '"' + (dis ? ' disabled' : '') + '>' +
          '<span class="d-week">' + d.week + '</span>' +
          '<span class="d-lab">' + d.label + '</span>' +
          '<span class="d-left">' + (d.state === 'closed' ? '休' :
            d.state === 'full' ? '满' : '余' + d.left) + '</span>' +
        '</button>'
      }).join('') + '</div>'

    // 选中那天的时段
    var slots = S.daySlots(c0.doctor_id, state.recall.date, state.bookings)
    if (slots.length && !slots.some(function (x) { return x.slot === state.recall.slot && !x.full })) {
      var free = slots.filter(function (x) { return !x.full })[0]
      state.recall.slot = free ? free.slot : slots[0].slot
    }
    $('recall-slot').innerHTML = slots.length
      ? slots.map(function (x) {
          return '<button class="chip' + (state.recall.slot === x.slot ? ' on' : '') +
            (x.full ? ' dis' : '') + '" data-slot="' + x.slot + '"' + (x.full ? ' disabled' : '') + '>' +
            x.label + ' <span class="chip-sub">' + x.time + ' · ' +
            (x.full ? '已满' : '余 ' + x.left) + '</span></button>'
        }).join('')
      : '<div class="slot-none">' + (isReal() && !state.realSlots.length
          ? '还没有设置出诊排班。先在右上角「我的日历」里填每个半天收几个。'
          : '这天不出诊，换一天') + '</div>'

    function checks(list, group) {
      return list.map(function (o) {
        var on = state.recall[group][o.key]
        return '<label class="check' + (on ? ' on' : '') + '" data-group="' + group +
          '" data-key="' + o.key + '"><i></i>' + esc(o.label) + '</label>'
      }).join('')
    }
    $('recall-bring').innerHTML = checks(RECALL_BRING, 'bring')
    $('recall-care').innerHTML = checks(RECALL_CARE, 'care')
    $('recall-preview').textContent = recallMessage()
  }

  /** 拼出家长真正会收到的那条消息——医生发之前要能看见它长什么样 */
  function recallMessage() {
    var c = findCase(state.currentId)
    if (!c) return ''
    var st = state.recall
    var slotMeta = SCH.SLOTS[st.slot] || SCH.SLOTS.am
    var when = sched().dateText(st.date) + ' ' + slotMeta.label + '（' + slotMeta.time + '）'

    function picked(list, group) {
      var out = []
      list.forEach(function (o) { if (st[group][o.key]) out.push(o.label) })
      return out
    }
    var bring = picked(RECALL_BRING, 'bring')
    var care = picked(RECALL_CARE, 'care')
    var note = ($('recall-note').value || '').trim()

    var lines = []
    lines.push('【' + c.hospital_name + '】' + c.doctor_name +
      '请你带' + c.pet_name + '来院复查。')
    lines.push('')
    lines.push('时间：' + when)
    if (bring.length) lines.push('需要带：' + bring.join('、'))
    if (care.length) lines.push('路上注意：' + care.join('；'))
    if (note) { lines.push(''); lines.push(note) }
    lines.push('')
    lines.push('路上如果情况变差，直接打 ' + c.doctor_phone + '，不用等回复。')
    return lines.join('\n')
  }

  function saveRecall() {
    var c = findCase(state.currentId)
    if (!c) return
    if (isReal()) {
      var msg = recallMessage()
      var btn = $('recall-save')
      btn.disabled = true
      api(P + '/clinic/cases/' + c.id + '/bookings', 'POST',
        { date: state.recall.date, slot: state.recall.slot, note: msg }
      ).then(function (res) {
        btn.disabled = false
        // 家长可能之前自己约过，服务端已把旧的作废；本地同步一下
        state.realBookings = state.realBookings.filter(function (b) { return b.case_id !== c.id })
        state.realBookings.push(Object.assign({ pet_name: c.pet_name, owner_phone: c.owner_phone, status: 'booked' }, res.booking))
        c.recall_sent = { date: state.recall.date, slot: state.recall.slot, message: msg }
        $('recall-mask').hidden = true
        toast('已约 ' + SCH.dateText(state.recall.date) + ' ' +
          (SCH.SLOTS[state.recall.slot] || {}).label + '，家长小程序首页会看到')
      }).catch(function (err) { btn.disabled = false; handleApiError(err) })
      return
    }
    // 占掉一个名额：医生刚约出去的，家长端和这块看板都要立刻看到少了一个
    state.bookings.push({
      doctor_id: c.doctor_id, date: state.recall.date, slot: state.recall.slot,
      case_id: c.id, pet_name: c.pet_name, owner_name: c.owner_name,
    })
    c.recall_sent = {
      date: state.recall.date, slot: state.recall.slot, message: recallMessage(),
    }
    $('recall-mask').hidden = true
    toast('已约 ' + SCH.dateText(state.recall.date) + ' ' +
      (SCH.SLOTS[state.recall.slot] || {}).label + '，已通知 ' + c.owner_name)
  }


  // ────────────────── 我的日历 ──────────────────

  function openCalendar() {
    if (!state.calDoctor || (isReal() && state.profile)) {
      state.calDoctor = (state.data.doctorList && state.data.doctorList[0].id) || 'doc_wang'
    }
    renderCalendar()
    $('cal-mask').hidden = false
  }

  /** 真后端模式：日历里直接改每个半天的容量，0 = 不出诊。保存后家长端立刻按这个放号 */
  function renderCalendarEditable() {
    var days = []
    for (var i = 0; i < 14; i++) {
      var key = SCH.toKey(SCH.addDays(i))
      days.push(key)
    }
    var byKey = {}
    state.realSlots.forEach(function (s) { byKey[s.date + '|' + s.slot] = s })
    $('cal-hint').hidden = false
    $('cal-hint').textContent = '每个半天填能收几个复查（0 = 不出诊）。已约数按家长和你约的号实时算。'
    $('cal-save').hidden = false
    return days.map(function (key, i) {
      var mine = state.realBookings.filter(function (b) { return b.date === key && (b.status || 'booked') === 'booked' })
      return '<div class="calrow' + (i === 0 ? ' today' : '') + '">' +
        '<div class="cal-date"><b>' + SCH.labelOf(key) + '</b><span>' + SCH.weekOf(key) + '</span></div>' +
        '<div class="cal-slots">' +
          SCH.SLOT_ORDER.map(function (s) {
            var cfg = byKey[key + '|' + s]
            var cap = cfg ? cfg.capacity : 0
            var booked = mine.filter(function (b) { return b.slot === s }).length
            return '<div class="cal-slot' + (cap && booked >= cap ? ' full' : '') + '">' +
              '<div class="cs-head"><span>' + SCH.SLOTS[s].label + '</span>' +
              '<span class="cs-num">' + booked + '/' + cap + '</span></div>' +
              '<div class="cap-row">收 <input class="cap-in" type="number" min="0" max="100" value="' + cap +
                '" data-date="' + key + '" data-slot="' + s + '"> 个</div>' +
            '</div>'
          }).join('') +
          (mine.length
            ? '<div class="cal-mine">复查：' + mine.map(function (b) {
                return esc(b.pet_name || b.case_id) + (b.owner_phone ? '（' + esc(b.owner_phone) + '）' : '')
              }).join('、') + '</div>'
            : '') +
        '</div></div>'
    }).join('')
  }

  function saveSchedule() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('#cal-body .cap-in'))
    var slots = inputs.map(function (el) {
      var n = parseInt(el.value, 10)
      return { date: el.dataset.date, slot: el.dataset.slot, capacity: isNaN(n) ? 0 : Math.max(0, Math.min(100, n)) }
    })
    var btn = $('cal-save')
    btn.disabled = true
    api(P + '/clinic/schedule', 'PUT', { slots: slots }).then(function (res) {
      btn.disabled = false
      state.realSlots = res.slots || []
      renderCalendar()
      toast('排班已保存')
    }).catch(function (err) { btn.disabled = false; handleApiError(err) })
  }

  function renderCalendar() {
    var docs = state.data.doctorList || []
    $('cal-doctors').innerHTML = docs.map(function (d) {
      return '<button class="chip' + (state.calDoctor === d.id ? ' on' : '') +
        '" data-doc="' + d.id + '">' + esc(d.name) +
        ' <span class="chip-sub">' + esc(d.title) + '</span></button>'
    }).join('')

    if (isReal()) {
      $('cal-body').innerHTML = renderCalendarEditable()
      return
    }
    $('cal-hint').hidden = true
    $('cal-save').hidden = true

    var cal = SCH.calendar(state.calDoctor, 14, state.bookings)
    $('cal-body').innerHTML = cal.map(function (d) {
      // 不出诊的日子也列出来。医生要一眼看到自己哪天休、哪天是手术日，
      // 而不是在一串日期里数哪天不见了。
      if (d.state === 'closed') {
        return '<div class="calrow off">' +
          '<div class="cal-date"><b>' + d.label + '</b><span>' + d.week + '</span></div>' +
          '<div class="cal-slots"><span class="cal-off">不出诊</span></div></div>'
      }
      var mine = state.bookings.filter(function (b) {
        return b.doctor_id === state.calDoctor && b.date === d.key
      })
      return '<div class="calrow' + (d.isToday ? ' today' : '') + '">' +
        '<div class="cal-date"><b>' + d.label + '</b><span>' + d.week + '</span></div>' +
        '<div class="cal-slots">' +
          d.slots.map(function (x) {
            var pct = Math.round((x.booked / x.capacity) * 100)
            return '<div class="cal-slot' + (x.full ? ' full' : '') + '">' +
              '<div class="cs-head"><span>' + x.label + '</span>' +
              '<span class="cs-num">' + x.booked + '/' + x.capacity + '</span></div>' +
              '<div class="cs-bar"><i style="width:' + pct + '%"></i></div>' +
            '</div>'
          }).join('') +
          (mine.length
            ? '<div class="cal-mine">复查：' + mine.map(function (b) {
                return esc(b.pet_name) + '（' + esc(b.owner_name) + '）'
              }).join('、') + '</div>'
            : '') +
        '</div>' +
      '</div>'
    }).join('')
  }

  function onAction(act) {
    var c = findCase(state.currentId)
    if (!c) return

    if (act === 'reply') {
      // 家长有问题就把原话摆在弹窗里——医生要针对它回，不能凭记忆
      var qb = $('reply-question')
      var qs = openQs(c)
      if (isReal() && !qs.length) {
        toast('家长现在没有提问。要联系家长请用「通知来院」或直接打电话。')
        return
      }
      if (qs.length) {
        qb.innerHTML =
          '<div class="rq-h">家长问' + (qs.length > 1 ? '了 ' + qs.length + ' 条，一次回完就行' : '：') + '</div>' +
          qs.map(function (q) {
            return '<div class="rq-t">' +
              (qs.length > 1 ? '<span class="rq-when">第 ' + q.day + ' 天 · ' + q.date + '</span>' : '') +
              esc(q.text) + '</div>'
          }).join('')
        qb.hidden = false
      } else {
        qb.hidden = true
      }
      $('reply-sub').textContent = c.pet_name + ' · ' + c.owner_name
      $('reply-text').value = ''
      $('reply-quick').innerHTML = QUICK_REPLIES.map(function (q) {
        return '<button type="button">' + esc(q) + '</button>'
      }).join('')
      $('reply-mask').hidden = false
      return
    }

    if (act === 'recall') {
      openRecall(c)
      return
    }

    if (act === 'override') {
      state.overrideLevel = c.level
      var LV = { red: '需处理', yellow: '观察中', green: '正常' }
      $('override-sub').textContent = c.pet_name + ' 当前为' + (LV[c.level] || '未分类') +
        (c.override && c.system_level ? '（系统判定：' + (LV[c.system_level] || c.system_level) + '）' : '') +
        '。改判挂在这次上报上，家长再报一次就按系统重新判；每次改判都会记下来用于校准规则。'
      $('override-clear').hidden = !(isReal() && c.override)
      $('override-note').value = (c.override && c.override.note) || ''
      renderOverrideLevels()
      $('override-mask').hidden = false
    }
  }

  function renderOverrideLevels() {
    var opts = [
      { key: 'green', label: '正常' },
      { key: 'yellow', label: '观察中' },
      { key: 'red', label: '需处理' },
    ]
    $('override-levels').innerHTML = opts.map(function (o) {
      return '<button type="button" class="lv-opt ' + o.key +
        (state.overrideLevel === o.key ? ' on' : '') +
        '" data-level="' + o.key + '">' + o.label + '</button>'
    }).join('')
  }

  function saveOverride(clear) {
    var c = findCase(state.currentId)
    if (!c) return
    if (isReal()) {
      var level = clear ? '' : (state.overrideLevel || c.level)
      var btn = $('override-save')
      btn.disabled = true
      api(P + '/clinic/cases/' + c.id + '/override', 'POST', { level: level, note: $('override-note').value.trim() })
        .then(function () { return reloadRealCase(c.id) })
        .then(function (fresh) {
          btn.disabled = false
          $('override-mask').hidden = true
          renderAll()
          toast(clear ? '已恢复系统判定' : '已调整为' + ({ red: '需处理', yellow: '观察中', green: '正常' }[fresh.level]))
        })
        .catch(function (err) { btn.disabled = false; handleApiError(err) })
      return
    }
    var was = c.level
    c.level = state.overrideLevel || c.level
    c.classify_reasons = ['医生改判（原：' + ({ red: '需处理', yellow: '观察中', green: '正常' }[was] || was) + '）']
    var note = $('override-note').value.trim()
    if (note) c.classify_reasons.push(note)
    var ORDER = { green: 0, yellow: 1, red: 2 }
    c.sort_key = ORDER[c.level] * 100
    $('override-mask').hidden = true
    renderAll()
    toast('已调整为' + ({ red: '需处理', yellow: '观察中', green: '正常' }[c.level]))
  }

  function saveReply() {
    var c = findCase(state.currentId)
    var text = $('reply-text').value.trim()
    // 先校验再改状态。写空了直接 return，不能把「待回复」标记也一并清掉。
    if (!c || !text) { toast('还没写内容'); return }

    if (isReal()) {
      var ids = openQs(c).map(function (q) { return q.id })
      var btn = $('reply-save')
      btn.disabled = true
      api(P + '/clinic/cases/' + c.id + '/answers', 'POST', { content: text, question_ids: ids })
        .then(function () { return reloadRealCase(c.id) })
        .then(function () {
          btn.disabled = false
          $('reply-mask').hidden = true
          $('reply-text').value = ''
          state.selectedReport = null
          renderAll()
          toast(ids.length > 1 ? '已一并回复 ' + ids.length + ' 条，家长会在小程序看到' : '已回复，家长会在小程序看到')
        })
        .catch(function (err) {
          btn.disabled = false
          handleApiError(err)
          if (/刷新|已回复/.test(err.message || '')) reloadRealCase(c.id).then(renderAll)
        })
      return
    }

    // 一条回复结清当前所有待回复的提问——家长可能一天问了好几条，
    // 医生看到的是一组，回一次就应该全部结清。
    var qs = openQs(c)
    var answer = { doctor_name: c.doctor_name, content: text, replied_at: Date.now() }
    qs.forEach(function (q) { q.answer = answer })

    // 提问如果是从打卡里勾出来的，同一条也挂到那次记录上，详情页看得到
    var touched = {}
    qs.forEach(function (q) {
      if (!q.from_report_id || touched[q.from_report_id]) return
      touched[q.from_report_id] = 1
      c.reports.forEach(function (r) {
        if (r.id !== q.from_report_id) return
        r.doctor_reply = answer
        r.replied = true
      })
    })
    if (!qs.length) {
      var target = state.selectedReport || c.latest
      if (target) { target.doctor_reply = answer; target.replied = true }
    }

    // 问题结清：从「待回复」档里摘掉
    if (qs.length) {
      c.open_questions = []
      c.open_question_count = 0
      c.needs_reply = false
      c.question = null
      c.sort_key = Math.max(0, (c.sort_key || 0) - 15)
    }

    $('reply-mask').hidden = true
    $('reply-text').value = ''
    // 看板计数和分档都要跟着变，只重绘详情不够
    renderAll()
    toast(qs.length > 1 ? '已一并回复 ' + qs.length + ' 条' : '已回复 ' + c.owner_name)
  }

  // ────────────────── 启动 ──────────────────


  // ────────────────── 登录门 ──────────────────

  var SESSION_KEY = 'postop_doctor_session'

  /**
   * 这块看板上有家长姓名、手机号、宠物病历，不能对着公网敞开。
   *
   * 演示模式和真登录是**两条路**：演示进来的是 demo-cast 的假数据，
   * 真登录才会去后端拉本院的真实病例。混在一起早晚会有人拿演示入口看到真数据。
   */
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch (e) { return null }
  }

  function writeSession(v) {
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v))
      else sessionStorage.removeItem(SESSION_KEY)
    } catch (e) {}
  }

  function showGate() {
    $('gate').hidden = false
    $('app').hidden = true
  }

  function enterApp(session) {
    state.session = session
    writeSession(session)
    $('gate').hidden = true
    $('app').hidden = false
    boot()
  }


  /**
   * 深链：?case=<id> 直接打开某个病例，&act=recall 顺带展开「通知来院」，
   * ?view=calendar 直接开日历。医生之间转发病例、或者从消息通知点进来时用。
   */
  function applyDeepLink() {
    var q = {}
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=')
      if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1))
    })

    if (q.view === 'calendar') { openCalendar(); return }
    if (!q.case) return

    var hit = findCase(q.case)
    if (!hit) return
    state.filter = 'all'
    state.currentId = hit.id
    renderAll()
    if (q.act === 'recall') openRecall(hit)
    if (q.act === 'reply') onAction('reply')
    if (q.act === 'calendar') openCalendar()
  }

  function bindGate() {
    $('gate-demo').addEventListener('click', function () {
      enterApp({ mode: 'demo', name: '演示医生' })
    })
    $('gate-register').addEventListener('click', openRegister)

    $('gate-form').addEventListener('submit', function (e) {
      e.preventDefault()
      var user = $('gate-user').value.trim()
      var pass = $('gate-pass').value
      var err = $('gate-err')

      if (!user || !pass) {
        err.textContent = '请填写手机号和密码'
        err.hidden = false
        return
      }
      err.hidden = true
      var btn = $('gate-submit')
      btn.disabled = true
      btn.textContent = '登录中…'
      state.session = null
      api(P + '/clinic/login', 'POST', { phone: user, password: pass }).then(function (res) {
        btn.disabled = false
        btn.textContent = '登 录'
        $('gate-pass').value = ''
        enterApp({ mode: 'real', token: res.token, staff: res.staff || {}, name: (res.staff || {}).name })
      }).catch(function (e2) {
        btn.disabled = false
        btn.textContent = '登 录'
        err.textContent = e2.message || '登录失败'
        err.hidden = false
      })
    })

    // ?demo=1 直接进演示：给医生发链接时不用教他点按钮，
    // 也方便截图。真数据仍然要过登录。
    if (/[?&]demo=1\b/.test(location.search)) {
      enterApp({ mode: 'demo', name: '演示医生' })
      applyDeepLink()
      return
    }
    var s = readSession()
    if (s) enterApp(s)
    else showGate()
  }

  function afterLoad() {
    state.selectedReport = null
    var tag = $('mode-tag')
    Array.prototype.forEach.call(document.querySelectorAll('.real-only'), function (el) { el.hidden = !isReal() })
    if (isReal()) {
      tag.textContent = '已连接 · ' + (state.profile.name || '') + (state.profile.title ? ' ' + state.profile.title : '')
      tag.classList.add('real')
    } else {
      tag.textContent = '演示数据 · 不写服务器'
      tag.classList.remove('real')
    }
    $('brand-sub').textContent = state.data.hospital + ' · 共 ' + state.data.cases.length + ' 个跟诊中病例'

    // 默认选中第一个需处理的——医生打开就该看到最该看的那个
    var keep = state.currentId && findCase(state.currentId)
    if (!keep) {
      var todo = state.data.cases.filter(function (c) { return bucketOf(c) === 'todo' })
        .sort(function (a, b) { return b.sort_key - a.sort_key })
      // 没有红色时选最该看的那个（提问 / 失联排在前面），而不是列表第一个
      var ranked = state.data.cases.slice().sort(function (a, b) { return b.sort_key - a.sort_key })
      state.currentId = todo.length ? todo[0].id : (ranked[0] ? ranked[0].id : null)
      if (todo.length === 0 && state.filter === 'todo') state.filter = 'all'
    }
    renderAll()
  }

  function boot() {
    if (isReal()) {
      $('brand-sub').textContent = '正在从服务器读取病例…'
      loadReal().then(function () {
        afterLoad()
        applyDeepLink()
      }).catch(handleApiError)
      return
    }
    state.data = window.PostopDemo.build()
    afterLoad()
  }

  bindEvents()
  bindGate()
})()
