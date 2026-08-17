/**
 * 术后跟诊工作台
 *
 * 核心不是「展示所有病例」，是**分类管理**：
 * 30 个术后病人里，医生只需要知道哪 3 个要叫回来。
 * 所以默认视图只显示需要处理的，恢复正常的折起来不占注意力。
 *
 * 分级规则来自 shared/ai.js + shared/rules.js —— 和宠主端小程序是同一份，
 * 保证主人看到的结论和医生看到的一致。
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
  }

  // ── 分桶 ──
  // silent（漏报）单独成一档：医生说的是「每天上报」，没报本身就是信号，
  // 混进绿色里就等于把失联的病人当成康复的。
  var BUCKETS = [
    { key: 'todo', label: '需处理', hint: '红：建议今天联系', cls: 'red' },
    { key: 'yellow', label: '观察中', hint: '黄：盯着变化趋势', cls: 'yellow' },
    { key: 'silent', label: '失联', hint: '连续 2 天以上没上报', cls: 'silent' },
    { key: 'green', label: '恢复正常', hint: '不用管，折起来', cls: 'green' },
    { key: 'done', label: '已结束', hint: '跟诊周期已满', cls: 'done' },
  ]

  function bucketOf(c) {
    if (c.finished) return 'done'
    if (c.missed_days >= 2) return 'silent'
    if (c.level === 'red') return 'todo'
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

  function findCase(id) {
    var hit = null
    state.data.cases.forEach(function (c) { if (c.id === id) hit = c })
    return hit
  }

  function timelineHtml(c) {
    var byDay = {}
    c.reports.forEach(function (r) { byDay[r.day] = r })
    var cells = []
    for (var d = 0; d <= c.day; d++) {
      var r = byDay[d]
      var cls = r ? 'lv-' + r.level : 'miss'
      cells.push('<div class="tl-cell ' + cls + '" data-day="' + d + '" title="' +
        (r ? '第 ' + d + ' 天' : '第 ' + d + ' 天未上报') + '">' +
        '<div class="tl-bar"></div><div class="tl-lab">' + d + '</div></div>')
    }
    return '<div class="timeline">' + cells.join('') + '</div>'
  }

  function compareHtml(c) {
    if (!c.photo_required) {
      return '<div class="kv-v" style="color:var(--text-mute);font-size:13px">' +
        '口腔类手术不要求拍照，以问卷为准。</div>'
    }
    var withPhoto = c.reports.filter(function (r) { return r.has_photo })
    var today = withPhoto[0]
    var prev = withPhoto[1]
    function cell(r, cap) {
      if (!r) {
        return '<div class="cmp-item"><div class="cmp-ph">暂无照片</div>' +
          '<div class="cmp-cap">' + cap + '</div></div>'
      }
      // demo 没有真图，用占位块表达「这里是同角度对比」
      return '<div class="cmp-item"><div class="cmp-ph">第 ' + r.day + ' 天<br>伤口照片</div>' +
        '<div class="cmp-cap">' + cap + '</div></div>'
    }
    return '<div class="compare">' +
      cell(prev, prev ? '上一次（第 ' + prev.day + ' 天）' : '暂无历史') +
      cell(today, today ? '最新（第 ' + today.day + ' 天）' : '今天未上报') +
      '</div>'
  }

  function aiHtml(r) {
    var ai = r && r.ai_report
    if (!ai) {
      return '<div class="sec"><div class="sec-title">AI 初筛</div>' +
        '<div style="color:var(--text-mute);font-size:13px">这次没有照片或分析未完成。</div></div>'
    }
    var obs = ai.observations.map(function (o) {
      return '<div class="kv"><span class="kv-k">' + esc(o.label) + '</span>' +
        '<span class="kv-v">' + esc(o.text) + '</span></div>'
    }).join('')

    var adv = ai.advice.length
      ? '<div class="sec-title" style="margin-top:16px">给主人的建议</div><ol class="adv-list">' +
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
      '<div class="sec-title">AI 初筛 <span class="sec-sub">基于照片 + 主人上报</span></div>' +
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
      : (c.level === 'red' ? '建议今天联系主人'
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
          '<button class="btn-primary" data-act="reply">回复主人</button>' +
          '<button class="btn-plain" data-act="recall">通知来院</button>' +
          '<button class="btn-plain" data-act="override">调整分级</button>' +
        '</div>' +
      '</div>' +

      '<div class="dt-verdict ' + lvClass + '">' +
        '<div class="dv-title">' + verdictTitle + '</div>' +
        (reasons ? '<div class="dv-reasons">' + reasons + '</div>' : '') +
      '</div>' +

      '<div class="sec">' +
        '<div class="sec-title">逐日趋势 <span class="sec-sub">点一天看当天记录；斜纹格是没上报</span></div>' +
        timelineHtml(c) +
      '</div>'

    if (r) {
      html +=
        '<div class="sec">' +
          '<div class="sec-title">同角度对比 <span class="sec-sub">轻微红肿靠这个看趋势</span></div>' +
          compareHtml(c) +
        '</div>' +
        aiHtml(r) +
        answersHtml(c, r)

      if (r.note) {
        html += '<div class="sec"><div class="sec-title">主人补充</div>' +
          '<div class="note-box">' + esc(r.note) + '</div></div>'
      }
      if (r.doctor_reply) {
        html += '<div class="sec"><div class="sec-title">已回复</div>' +
          '<div class="reply-box">' + esc(r.doctor_reply.content) +
          '<div class="reply-by">— ' + esc(r.doctor_reply.doctor_name) + '</div></div></div>'
      }
    } else {
      html += '<div class="sec"><div class="sec-title">还没有上报记录</div>' +
        '<div style="color:var(--text-mute);font-size:13px">主人认领了病例但一次都没打卡，建议电话提醒。</div></div>'
    }

    $('detail').innerHTML = html
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
        c.reports.forEach(function (rr) { if (rr.day === day) hit = rr })
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
      toast('已重新生成演示数据')
    })

    // 改判
    $('override-cancel').addEventListener('click', function () { $('override-mask').hidden = true })
    $('override-save').addEventListener('click', saveOverride)
    $('override-levels').addEventListener('click', function (e) {
      var b = e.target.closest('.lv-opt')
      if (!b) return
      state.overrideLevel = b.dataset.level
      renderOverrideLevels()
    })

    // 回复
    $('reply-cancel').addEventListener('click', function () { $('reply-mask').hidden = true })
    $('reply-save').addEventListener('click', saveReply)
    $('reply-quick').addEventListener('click', function (e) {
      var b = e.target.closest('button')
      if (b) $('reply-text').value = b.textContent
    })
  }

  function onAction(act) {
    var c = findCase(state.currentId)
    if (!c) return

    if (act === 'reply') {
      $('reply-sub').textContent = c.pet_name + ' · ' + c.owner_name
      $('reply-text').value = ''
      $('reply-quick').innerHTML = QUICK_REPLIES.map(function (q) {
        return '<button type="button">' + esc(q) + '</button>'
      }).join('')
      $('reply-mask').hidden = false
      return
    }

    if (act === 'recall') {
      toast('已通知 ' + c.owner_name + '：请尽快带 ' + c.pet_name + ' 到院复查')
      return
    }

    if (act === 'override') {
      state.overrideLevel = c.level
      $('override-sub').textContent = c.pet_name + ' 当前为' +
        ({ red: '需处理', yellow: '观察中', green: '正常' }[c.level] || '未分类') +
        '。改判会记进病例，也用来校准规则。'
      $('override-note').value = ''
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

  function saveOverride() {
    var c = findCase(state.currentId)
    if (!c) return
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
    if (!c || !text) { toast('还没写内容'); return }
    var r = state.selectedReport || c.latest
    if (r) r.doctor_reply = { doctor_name: c.doctor_name, content: text, replied_at: Date.now() }
    $('reply-mask').hidden = true
    renderDetail()
    toast('已发送给 ' + c.owner_name)
  }

  // ────────────────── 启动 ──────────────────

  function boot() {
    state.data = window.PostopDemo.build()
    state.selectedReport = null
    $('brand-sub').textContent = state.data.hospital + ' · 共 ' + state.data.cases.length + ' 个跟诊中病例'

    // 默认选中第一个需处理的——医生打开就该看到最该看的那个
    var todo = state.data.cases.filter(function (c) { return bucketOf(c) === 'todo' })
      .sort(function (a, b) { return b.sort_key - a.sort_key })
    state.currentId = todo.length ? todo[0].id : null
    renderAll()
  }

  bindEvents()
  boot()
})()
