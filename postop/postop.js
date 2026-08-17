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
    // 当天之内变差过 —— 整块看板里信号最强的一个，必须排在其它标签前面。
    // 「状态在往坏里走」比任何单点状态都值得医生先看一眼。
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
      return '<div class="cmp-item"><div class="cmp-ph">第 ' + r.day + ' 天' +
        (r.is_supplement ? ' 补报' : '') + '<br>伤口照片</div>' +
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

    $('recall-cancel').addEventListener('click', function () { $('recall-mask').hidden = true })
    $('recall-save').addEventListener('click', saveRecall)
    $('recall-note').addEventListener('input', function () {
      $('recall-preview').textContent = recallMessage()
    })
    $('recall-when').addEventListener('click', function (e) {
      var b = e.target.closest('[data-when]')
      if (!b) return
      state.recall.when = b.dataset.when
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

  var RECALL_WHEN = [
    { key: 'now', label: '尽快，今天内' },
    { key: 'am', label: '明天上午' },
    { key: 'pm', label: '明天下午' },
    { key: 'plan', label: '按原定复查日' },
  ]

  /**
   * 预设项。医生在诊间点这个的时候通常很赶，不该让他从零打字。
   * pre() 返回 true 的项会**按这个病例的实际情况预先勾上**——
   * 比如主人报了没戴伊丽莎白圈，那「戴好防舔护具」就该默认勾上。
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
    state.recall = {
      when: c.level === 'red' ? 'now' : 'am',
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
    $('recall-when').innerHTML = RECALL_WHEN.map(function (o) {
      return '<button class="chip' + (state.recall.when === o.key ? ' on' : '') +
        '" data-when="' + o.key + '">' + o.label + '</button>'
    }).join('')

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

  /** 拼出主人真正会收到的那条消息——医生发之前要能看见它长什么样 */
  function recallMessage() {
    var c = findCase(state.currentId)
    if (!c) return ''
    var st = state.recall
    var when = ''
    RECALL_WHEN.forEach(function (o) { if (o.key === st.when) when = o.label })

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
    c.recall_sent = { at: 'now', message: recallMessage() }
    $('recall-mask').hidden = true
    toast('已通知 ' + c.owner_name + '，' + c.pet_name + '的主人会收到服务通知')
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
      openRecall(c)
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
