/**
 * 术后跟诊 · 排班与预约（宠主端 / 医生端共用）
 *
 * 医生端发「通知来院」时要能选具体日期，家长端要能看到这位医生哪天有空。
 * 两边看到的余量必须是同一份，否则医生说「周四上午来」、家长打开发现周四已满，
 * 这个功能就不如不做。
 *
 * 排班模型故意做得很轻：
 *   周模板（医生每周几出诊、上午还是下午）+ 每个时段一个容量 + 已约数
 * 没有做「精确到分钟的号源」——术后复查是插在正常门诊里的，
 * 医院真实的排班系统在 HIS 里，这里只需要知道「这个半天还收不收得下」。
 */
;(function (root, factory) {
  var API = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = API
  if (typeof window !== 'undefined') window.PostopSchedule = API
})(typeof window !== 'undefined' ? window : this, function () {

  var SLOTS = {
    am: { key: 'am', label: '上午', time: '09:00–12:00', capacity: 6 },
    pm: { key: 'pm', label: '下午', time: '14:00–18:00', capacity: 8 },
  }
  var SLOT_ORDER = ['am', 'pm']

  /**
   * 周排班模板。0 = 周日。
   * 空数组 = 那天不出诊（休息 / 手术日）。
   */
  var SHIFTS = {
    doc_wang: {
      0: [],                 // 周日休
      1: ['am', 'pm'],
      2: ['am', 'pm'],
      3: ['am'],             // 周三下午是手术日
      4: ['am', 'pm'],
      5: ['am', 'pm'],
      6: ['am'],
    },
    doc_chen: {
      0: ['am'],
      1: ['pm'],             // 周一上午手术
      2: ['am', 'pm'],
      3: ['am', 'pm'],
      4: [],                 // 周四休
      5: ['am', 'pm'],
      6: ['am', 'pm'],
    },
  }

  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

  // ── 日期工具（不依赖小程序 / 浏览器差异）──

  function pad2(n) { return n < 10 ? '0' + n : '' + n }

  function toKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
  }

  function parseKey(key) {
    var p = String(key || '').split('-')
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1)
  }

  function addDays(n, from) {
    var d = from ? parseKey(from) : new Date()
    d.setDate(d.getDate() + n)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function todayKey() { return toKey(new Date()) }

  function labelOf(key) {
    var d = parseKey(key)
    var diff = Math.round((d - parseKey(todayKey())) / 86400000)
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff === 2) return '后天'
    return (d.getMonth() + 1) + '/' + d.getDate()
  }

  function weekOf(key) { return '周' + WEEK_CN[parseKey(key).getDay()] }

  function dateText(key) {
    var d = parseKey(key)
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekOf(key)
  }

  // ── 已约数 ──

  /** 稳定伪随机：同一天重开 demo 排班一致，不会每次刷新都变 */
  function hash(str) {
    var h = 2166136261
    var s = String(str || '')
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = (h * 16777619) >>> 0
    }
    return h % 100
  }

  /**
   * 演示用的基础占用：模拟这个半天已经有多少常规门诊。
   * 越近的日子约得越满——真实门诊就是这样，所以家长会自然被推向后面几天，
   * 而医生仍然能把红色病例硬塞进今天。
   */
  function baseBooked(doctorId, key, slot) {
    var cap = SLOTS[slot].capacity
    var diff = Math.round((parseKey(key) - parseKey(todayKey())) / 86400000)
    var pressure = diff <= 0 ? 0.92 : diff === 1 ? 0.75 : diff <= 3 ? 0.55 : 0.3
    var jitter = (hash(doctorId + '|' + key + '|' + slot) % 30) / 100 - 0.15
    var n = Math.round(cap * (pressure + jitter))
    return Math.max(0, Math.min(cap, n))
  }

  /**
   * 某位医生某天的时段可用情况。
   * extraBookings: [{doctor_id, date, slot}]，本次会话里新约的，叠加在基础占用之上。
   */
  function daySlots(doctorId, key, extraBookings) {
    var shift = SHIFTS[doctorId] || SHIFTS.doc_wang
    var wd = parseKey(key).getDay()
    var open = shift[wd] || []
    var extras = extraBookings || []

    return SLOT_ORDER.filter(function (s) { return open.indexOf(s) >= 0 })
      .map(function (s) {
        var meta = SLOTS[s]
        var booked = baseBooked(doctorId, key, s)
        extras.forEach(function (b) {
          if (b.doctor_id === doctorId && b.date === key && b.slot === s) booked++
        })
        booked = Math.min(meta.capacity, booked)
        return {
          slot: s,
          label: meta.label,
          time: meta.time,
          capacity: meta.capacity,
          booked: booked,
          left: meta.capacity - booked,
          full: booked >= meta.capacity,
        }
      })
  }

  /** 某天整体状态：closed 不出诊 / full 约满 / tight 紧张 / open 有空 */
  function dayStatus(doctorId, key, extraBookings) {
    var slots = daySlots(doctorId, key, extraBookings)
    if (!slots.length) return { key: key, state: 'closed', left: 0, slots: [] }
    var left = slots.reduce(function (n, s) { return n + s.left }, 0)
    var state = left === 0 ? 'full' : (left <= 2 ? 'tight' : 'open')
    return { key: key, state: state, left: left, slots: slots }
  }

  /**
   * 未来 days 天的日历。
   * 医生端用它排自己的班表，家长端用它挑空闲日——同一个函数，两边不会打架。
   */
  function calendar(doctorId, days, extraBookings, fromKey) {
    var out = []
    var n = days || 14
    for (var i = 0; i < n; i++) {
      var key = toKey(addDays(i, fromKey))
      var st = dayStatus(doctorId, key, extraBookings)
      out.push({
        key: key,
        label: labelOf(key),
        week: weekOf(key),
        text: dateText(key),
        isToday: i === 0 && !fromKey,
        isWeekend: [0, 6].indexOf(parseKey(key).getDay()) >= 0,
        state: st.state,
        left: st.left,
        slots: st.slots,
      })
    }
    return out
  }

  /** 最近一个还收得下的时段——医生端默认选它，省一次点击 */
  function firstOpen(doctorId, extraBookings, opts) {
    opts = opts || {}
    var cal = calendar(doctorId, opts.days || 14, extraBookings)
    for (var i = 0; i < cal.length; i++) {
      var d = cal[i]
      if (opts.skipToday && d.isToday) continue
      for (var j = 0; j < d.slots.length; j++) {
        if (!d.slots[j].full) return { date: d.key, slot: d.slots[j].slot }
      }
    }
    return null
  }

  var STATE_TEXT = {
    open: '有空',
    tight: '快满了',
    full: '已约满',
    closed: '不出诊',
  }

  return {
    SLOTS: SLOTS,
    SLOT_ORDER: SLOT_ORDER,
    SHIFTS: SHIFTS,
    STATE_TEXT: STATE_TEXT,
    toKey: toKey,
    parseKey: parseKey,
    addDays: addDays,
    todayKey: todayKey,
    labelOf: labelOf,
    weekOf: weekOf,
    dateText: dateText,
    daySlots: daySlots,
    dayStatus: dayStatus,
    calendar: calendar,
    firstOpen: firstOpen,
  }
})
