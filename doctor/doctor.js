(function () {
  "use strict";

  var API_BASE = "https://catapi.jiulingmao.com";
  var TOKEN_KEY = "jiulingmao_doctor_token";
  var INFO_KEY = "jiulingmao_doctor_info";
  var DAY_OPTIONS = ["1", "2", "3", "5", "7"];
  var FGS_DIMS = [
    ["ear_position", "耳朵"],
    ["orbital_tightening", "眼部"],
    ["muzzle_tension", "口鼻"],
    ["whiskers_change", "胡须"],
    ["head_position", "头肩"],
    ["body_shape", "体型"],
    ["fur_condition", "毛发"],
    ["posture", "姿态"],
    ["eye_spirit", "眼神"]
  ];
  var CTX_LABELS = {
    photo_state: "拍照时状态",
    appetite: "食欲",
    water: "饮水",
    activity: "活动量",
    stool: "便便",
    abnormal: "异常表现",
    vomit_event_type: "事件类型",
    wound_type: "伤口来源",
    postop_day: "术后第几天",
    surgery_type: "手术类型",
    surgery_name: "具体手术",
    injury_detail: "受伤经过"
  };
  var CTX_ORDER = [
    "photo_state", "vomit_event_type", "wound_type", "postop_day",
    "surgery_type", "surgery_name", "injury_detail",
    "appetite", "water", "activity", "stool", "abnormal"
  ];
  var LEVEL_LINES = {
    green: "🟢 先在家观察,暂时不用去医院",
    red: "🔴 建议今天就去"
  };
  var EMPTY_REPLY = { level: "", yellowDays: "2", action: "", note: "" };
  var DEMO_NOW = Math.floor(Date.now() / 1000);

  var state = {
    doctor: null,
    section: "clients",
    scope: "mine",
    filter: "pending",
    records: [],
    pendingCount: 0,
    loading: false,
    current: null,
    history: [],
    historyLoading: false,
    historyOpen: {},
    reply: Object.assign({}, EMPTY_REPLY),
    submitting: false,
    quickReplies: [],
    profile: { name: "", title: "", gender: "female", avatar_url: "", city: "", hospital: "" },
    refreshTimer: null,
    clients: [],
    clientCurrent: null,
    clientCat: null,
    clientCatModule: "",
    clientSearch: "",
    clientScanOpen: {},
    historyModule: "",
    aliasEditing: false,
    inboxBuckets: [],
    inboxBucket: "",
    inboxLoading: false,
    fromInbox: false,
    demo: false
  };

  var $ = function (id) { return document.getElementById(id); };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function networkMessage(err, fallback) {
    var msg = (err && err.message) || fallback || "请求失败";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return "无法连接服务器。请确认网络正常，且后端已允许官网跨域。";
    }
    return msg;
  }

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function uploadUrl(path) {
    if (!path) return "";
    var p = String(path).trim();
    if (!p) return "";
    var base = API_BASE.replace(/\/$/, "");
    var idx = p.toLowerCase().indexOf("/uploads/");
    if (idx >= 0) return base + p.slice(idx);
    if (/^https?:\/\//i.test(p)) return p;
    p = p.replace(/^uploads\//i, "");
    if (p.charAt(0) === "/") return base + p;
    return base + "/uploads/" + p;
  }

  function photoSrc(path) {
    var p = String(path || "");
    if (!p) return "";
    if (/^(https?:|data:|\.\.?\/|\/)/i.test(p)) return p;
    return uploadUrl(p);
  }

  function demoPhoto(file, when, hoursAgo) {
    return {
      path: "../" + file,
      created_at: DEMO_NOW - Math.round((hoursAgo || 0) * 3600),
      when: when
    };
  }

  var DEMO = {
    doctor: {
      id: "demo-doc",
      name: "李医生",
      city: "上海",
      hospital: "爱心宠物医院",
      title: "猫内科",
      gender: "female",
      referral_code: "DEMO01",
      referral_url: "https://www.jiulingmao.com/join/?code=DEMO01",
      client_count: 3
    },
    clients: [
      { user_id: "demo-lixinran", alias: "李欣然", nickname: "Xinran (Alena)", avatar_url: "", cat_count: 4, cat_names: "团团、邦邦、ab、a", pending_count: 1, bound_at: DEMO_NOW - 3600 },
      { user_id: "demo-wang", alias: "王女士", nickname: "wang", avatar_url: "", cat_count: 1, cat_names: "年糕", pending_count: 0, bound_at: DEMO_NOW - 86400 * 12 },
      { user_id: "demo-chen", alias: "陈妈妈", nickname: "小陈", avatar_url: "", cat_count: 1, cat_names: "咪咪", pending_count: 1, bound_at: DEMO_NOW - 86400 * 20 }
    ]
  };
  DEMO.inbox = {
    pending_count: 1,
    buckets: [
      {
        key: "ok", color: "green", owner_count: 7, sub: "测完绿档，已安抚", action: "无需回复",
        cards: [
          {
            id: "demo-tuantuan-stool", user_id: "demo-lixinran", owner_alias: "李欣然",
            cat_name: "团团", module: "stool", module_label: "便便记录", tier: "good",
            photos: [demoPhoto("bangbang/2026-7-12.png", "今天 09:12", 10), demoPhoto("bangbang/2026-6-25.png", "昨天", 30), demoPhoto("bangbang/2026-6-2.png", "5 天前", 120)],
            badge: "今天 · 绿档 普瑞纳 3/7", summary: "近 30 天便便 8 次，间隔较稳 · 便便 2-3 分正常"
          },
          {
            id: "demo-bangbang-fgs", user_id: "demo-lixinran", owner_alias: "李欣然",
            cat_name: "邦邦", module: "fgs", module_label: "面部测痛记录", tier: "good",
            photos: [demoPhoto("assets/scan1.png", "今天 08:02", 12), demoPhoto("assets/scan2.png", "3 天前", 72)],
            badge: "今天 · 绿档 疼痛 3/18", summary: "近 30 天面部测痛 4 次，间隔在拉长"
          },
          {
            id: "demo-ab-teeth", user_id: "demo-lixinran", owner_alias: "李欣然",
            cat_name: "ab", module: "teeth", module_label: "牙齿记录", tier: "good",
            photos: [demoPhoto("example/3.png", "2 天前", 50)],
            badge: "2 天前 · 绿档 GI 0/3", summary: "近 30 天牙齿 1 次"
          }
        ]
      },
      {
        key: "urgent", color: "red", owner_count: 1, sub: "疑似尿闭，已提示急诊", action: "直接到院",
        cards: [
          {
            id: "demo-niangao-stool", user_id: "demo-wang", owner_alias: "王女士",
            cat_name: "年糕", module: "stool", module_label: "便便记录", tier: "vet",
            photos: [demoPhoto("example/1.png", "今天 07:40", 14), demoPhoto("example/2.png", "今天 06:15", 16)],
            badge: "今天 · 红档 几乎无尿", summary: "近 24 小时反复蹲盆 · 已提示直接到院"
          }
        ]
      },
      {
        key: "ask", color: "yellow", owner_count: 1, sub: "拿不准，留言问您", action: "明早回也行",
        cards: [
          {
            id: "demo-ask-mimi", user_id: "demo-chen", owner_alias: "陈妈妈",
            cat_name: "咪咪", module: "vomit", module_label: "呕吐记录",
            consultation_id: "demo-ask-mimi", consultation_status: "pending", tier: "observe",
            photos: [
              demoPhoto("bangbang/2026-4-26.png", "今天 21:03", 1),
              demoPhoto("bangbang/2026-4-20.png", "今天 08:40", 12),
              demoPhoto("bangbang/2026-3.png", "3 天前", 72)
            ],
            badge: "今晚 · 黄档 毛球混食物",
            summary: "近 30 天呕吐 3 次，间隔在拉长 · 便便 2-3 分正常"
          }
        ]
      }
    ]
  };
  DEMO.consult = {
    id: "demo-ask-mimi",
    user_id: "demo-chen",
    scan_id: "demo-scan-mimi",
    status: "pending",
    created_at: DEMO_NOW - 3600,
    owner_nickname: "小陈",
    owner_alias: "陈妈妈",
    cat_count: 1,
    cat: { name: "咪咪", breed: "英短", gender: "female", birth_date: "2022-04-01", weight: 4.2, neutered: 1, avatar_url: "" },
    scan: {
      module: "vomit",
      pain_level: "observe",
      diagnosis: "更像毛球混食物，今晚这一口偏黄，先观察精神食欲。",
      advice: "今晚先停零食，看会不会再吐。若 24 小时内再吐两次，或精神变差，建议就医。",
      image_path: "../bangbang/2026-4-26.png",
      fecal_score: 0,
      total_score: 0,
      cat_context: JSON.stringify({ appetite: "略差", water: "正常", vomit_event_type: "更像呕吐" })
    }
  };
  DEMO.history = [
    { id: "demo-scan-mimi", module: "vomit", created_at: DEMO_NOW - 3600, image_path: "../bangbang/2026-4-26.png", pain_level: "observe", diagnosis: "毛球混食物", is_current: true },
    { id: "demo-scan-mimi-2", module: "vomit", created_at: DEMO_NOW - 12 * 3600, image_path: "../bangbang/2026-4-20.png", pain_level: "observe", diagnosis: "未消化猫粮" },
    { id: "demo-scan-mimi-3", module: "vomit", created_at: DEMO_NOW - 72 * 3600, image_path: "../bangbang/2026-3.png", pain_level: "good", diagnosis: "少量毛团" },
    { id: "demo-scan-stool", module: "stool", created_at: DEMO_NOW - 86400, image_path: "../example/4.png", fecal_score: 3, diagnosis: "成型偏软" }
  ];
  DEMO.clientDetails = {
    "demo-lixinran": {
      cat_count: 4,
      user: { id: "demo-lixinran", nickname: "Xinran (Alena)", alias: "李欣然", display_name: "李欣然", avatar_url: "", bound_at: DEMO_NOW - 3600 },
      cats: [
        { id: "c-tuantuan", name: "团团", breed: "英短", gender: "female", neutered: 1, scan_count: 49, modules: { fgs: { count: 12, last: { module: "fgs", total_score: 3 } }, stool: { count: 20, last: { module: "stool", fecal_score: 3 } }, vomit: { count: 8, last: { module: "vomit" } }, teeth: { count: 6, last: { module: "teeth", fecal_score: 0 } }, postop: { count: 3, last: { module: "postop", pain_level: "良好" } } } },
        { id: "c-bangbang", name: "邦邦", breed: "英短", gender: "male", neutered: 1, scan_count: 12, modules: { fgs: { count: 8, last: { module: "fgs", total_score: 4 } }, stool: { count: 2, last: { module: "stool", fecal_score: 3 } }, vomit: { count: 1, last: {} }, teeth: { count: 1, last: {} }, postop: { count: 0, last: null } } },
        { id: "c-ab", name: "ab", breed: "", gender: "", neutered: 0, scan_count: 2, modules: { fgs: { count: 0, last: null }, stool: { count: 0, last: null }, vomit: { count: 0, last: null }, teeth: { count: 2, last: { module: "teeth" } }, postop: { count: 0, last: null } } },
        { id: "c-a", name: "a", breed: "", gender: "", neutered: 0, scan_count: 1, modules: { fgs: { count: 1, last: { module: "fgs", total_score: 2 } }, stool: { count: 0, last: null }, vomit: { count: 0, last: null }, teeth: { count: 0, last: null }, postop: { count: 0, last: null } } }
      ],
      consultations: [{ id: "demo-ask-old", status: "pending", module: "teeth", created_at: DEMO_NOW - 86400 * 6, cat_name: "团团" }]
    },
    "demo-wang": {
      cat_count: 1,
      user: { id: "demo-wang", nickname: "wang", alias: "王女士", display_name: "王女士", avatar_url: "", bound_at: DEMO_NOW - 86400 * 12 },
      cats: [{ id: "c-niangao", name: "年糕", breed: "美短", gender: "male", neutered: 1, scan_count: 6, modules: { fgs: { count: 1, last: {} }, stool: { count: 4, last: { module: "stool", fecal_score: 6 } }, vomit: { count: 1, last: {} }, teeth: { count: 0, last: null }, postop: { count: 0, last: null } } }],
      consultations: []
    },
    "demo-chen": {
      cat_count: 1,
      user: { id: "demo-chen", nickname: "小陈", alias: "陈妈妈", display_name: "陈妈妈", avatar_url: "", bound_at: DEMO_NOW - 86400 * 20 },
      cats: [{ id: "c-mimi", name: "咪咪", breed: "英短", gender: "female", neutered: 1, scan_count: 9, modules: { fgs: { count: 1, last: {} }, stool: { count: 3, last: { module: "stool", fecal_score: 3 } }, vomit: { count: 5, last: { module: "vomit" } }, teeth: { count: 0, last: null }, postop: { count: 0, last: null } } }],
      consultations: [{ id: "demo-ask-mimi", status: "pending", module: "vomit", created_at: DEMO_NOW - 3600, cat_name: "咪咪" }]
    }
  };

  function relativeUploadPath(url) {
    var abs = String(url || "");
    if (abs.indexOf(API_BASE) === 0) return abs.slice(API_BASE.length);
    return abs;
  }

  function avatarFallback(name, kind) {
    var initial = String(name || (kind === "cat" ? "猫" : "医")).slice(0, 1);
    var bg = kind === "cat" ? "#C8A07E" : "#2A5F9E";
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="32" fill="' + bg + '"/>' +
      '<text x="32" y="42" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">' +
      escapeHtml(initial) +
      "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function doctorAvatar(info) {
    info = info || {};
    return info.avatar_url ? uploadUrl(info.avatar_url) : avatarFallback(info.name, "doctor");
  }

  function catAvatar(cat) {
    cat = cat || {};
    return cat.avatar_url ? uploadUrl(cat.avatar_url) : avatarFallback(cat.name, "cat");
  }

  var FIVE_MODULES = [
    { key: "fgs", label: "面部测痛" },
    { key: "stool", label: "便便" },
    { key: "vomit", label: "呕吐物" },
    { key: "teeth", label: "牙齿" },
    { key: "postop", label: "伤口" }
  ];

  function moduleLabel(module) {
    if (module === "stool") return "便便";
    if (module === "vomit") return "呕吐物";
    if (module === "teeth") return "牙齿";
    if (module === "postop") return "伤口";
    if (module === "meow") return "猫语";
    return "面部测痛";
  }

  function scanSummary(scan) {
    scan = scan || {};
    if (scan.module === "fgs") return "疼痛总分 " + (scan.total_score || 0) + "/18 · " + (scan.pain_level || "");
    if (scan.module === "stool") return "普瑞纳评分 " + (scan.fecal_score || 0) + "/7";
    if (scan.module === "teeth") return "GI " + (scan.fecal_score || 0) + "/3 · CI " + (scan.body_score || 0) + "/3";
    if (scan.module === "postop") return "伤口 " + (scan.pain_level || "");
    if (scan.module === "vomit") return "呕吐物记录";
    return moduleLabel(scan.module);
  }

  function historySummary(row) {
    if (row.module === "fgs") return "疼痛 " + (row.total_score || 0) + "/18";
    if (row.module === "stool") return "普瑞纳 " + (row.fecal_score || 0) + "/7";
    if (row.module === "teeth") return "GI " + (row.fecal_score || 0) + "/3 · CI " + (row.body_score || 0) + "/3";
    if (row.module === "postop") return "伤口 " + (row.pain_level || "");
    return "呕吐物记录";
  }

  function groupByModule(rows) {
    var map = {};
    FIVE_MODULES.forEach(function (m) { map[m.key] = []; });
    (rows || []).forEach(function (r) {
      var k = r.module || "fgs";
      if (!map[k]) map[k] = [];
      map[k].push(r);
    });
    return map;
  }

  function moduleCountMap(rows) {
    var grouped = groupByModule(rows);
    var out = {};
    FIVE_MODULES.forEach(function (m) {
      out[m.key] = (grouped[m.key] || []).length;
    });
    return out;
  }

  function lastSummary(last) {
    if (!last) return "还没测过";
    return historySummary(Object.assign({ module: last.module }, last));
  }

  function scanPhotoUrl(s) {
    s = s || {};
    if (s.imageUrl) return s.imageUrl;
    if (s.image_path) return photoSrc(String(s.image_path).split(",")[0]);
    return "";
  }

  function scanResultDetailHtml(s) {
    s = s || {};
    var html = "";
    var photo = scanPhotoUrl(s);
    if (photo) {
      html += '<div class="history-result-photo"><img src="' + escapeHtml(photo) +
        '" alt="检测照片" data-preview="' + escapeHtml(photo) + '"></div>';
    }
    var chips = [];
    if (s.module === "fgs") {
      chips.push("疼痛总分 " + (s.total_score || 0) + "/18");
      if (s.pain_level) chips.push(String(s.pain_level));
    } else if (s.module === "stool") {
      chips.push("普瑞纳 " + (s.fecal_score || 0) + "/7");
    } else if (s.module === "teeth") {
      chips.push("牙龈炎 GI " + (s.fecal_score || 0) + "/3");
      chips.push("牙结石 CI " + (s.body_score || 0) + "/3");
    } else if (s.module === "postop" && s.pain_level) {
      chips.push("伤口 " + s.pain_level);
    } else if (s.module === "vomit" && s.pain_level) {
      chips.push(String(s.pain_level));
    }
    if (s.confidence) chips.push("置信 " + s.confidence);
    if (chips.length) {
      html += '<div class="history-score-chips">' + chips.map(function (c) {
        return '<span class="history-score-chip">' + escapeHtml(c) + "</span>";
      }).join("") + "</div>";
    }
    if (s.module === "fgs") {
      html += '<div class="history-dim-grid">' + FGS_DIMS.map(function (pair) {
        return '<div class="history-dim"><span>' + pair[1] + "</span><strong>" +
          escapeHtml(s[pair[0]] || 0) + "/2</strong></div>";
      }).join("") + "</div>";
    }
    if (s.diagnosis) {
      html += '<div><div class="answered-label">测出来的大概结果</div><div class="answered-text">' +
        escapeHtml(s.diagnosis) + "</div></div>";
    }
    if (s.advice) {
      html += '<div><div class="answered-label">AI 建议</div><div class="answered-text">' +
        escapeHtml(s.advice) + "</div></div>";
    }
    var ctx = s.catContextItems || parseCatContext(s.cat_context);
    if (ctx && ctx.length) {
      html += '<div><div class="answered-label">用户填写的情况</div>' + ctxListHtml(ctx) + "</div>";
    }
    if (!html) {
      html = '<p class="doc-empty">这条记录没有更细的文字结果</p>';
    }
    return html;
  }

  function scanRecordCardHtml(s) {
    var open = !!state.clientScanOpen[s.id];
    var photo = scanPhotoUrl(s);
    var img = photo
      ? '<img class="history-thumb" src="' + escapeHtml(photo) + '" alt="">'
      : '<div class="history-thumb"></div>';
    var inner = '<button type="button" class="history-card-head" data-toggle-client-scan="' + escapeHtml(s.id) + '">' +
      img +
      '<div class="history-meta"><span class="history-summary">' + escapeHtml(historySummary(s)) + "</span>" +
      '<span class="history-date">' + escapeHtml(formatTime(s.created_at)) + "</span></div>" +
      '<span class="history-open-hint">' + (open ? "收起" : "点开看结果") + "</span>" +
      '<span class="history-arrow">›</span></button>';
    if (open) {
      inner += '<div class="history-detail">' + scanResultDetailHtml(s) + "</div>";
    }
    return '<div class="history-card' + (open ? " is-open" : "") + '">' + inner + "</div>";
  }

  function formatTime(ts) {
    if (!ts) return "";
    var d = new Date(Number(ts) * 1000);
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
  }

  function catAgeText(birth) {
    if (!birth) return "";
    var d = new Date(String(birth).replace(/-/g, "/"));
    if (isNaN(d.getTime())) return String(birth);
    var now = new Date();
    var months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months -= 1;
    if (months < 0) return "";
    if (months < 12) return months + "个月";
    var y = Math.floor(months / 12);
    var m = months % 12;
    return m ? y + "岁" + m + "个月" : y + "岁";
  }

  function genderText(g) {
    if (g === "male") return "公";
    if (g === "female") return "母";
    return "未知";
  }

  function parseCatContext(raw) {
    if (!raw) return [];
    var obj = null;
    try { obj = JSON.parse(raw); } catch (e) {}
    if (!obj || typeof obj !== "object") {
      return [{ label: "用户备注", value: String(raw) }];
    }
    var items = [];
    var seen = {};
    CTX_ORDER.forEach(function (k) {
      var v = obj[k];
      if (v && String(v).trim()) {
        items.push({ label: CTX_LABELS[k] || k, value: String(v).trim() });
        seen[k] = true;
      }
    });
    Object.keys(obj).forEach(function (k) {
      if (seen[k]) return;
      var v = obj[k];
      if (v && String(v).trim()) {
        items.push({ label: CTX_LABELS[k] || k, value: String(v).trim() });
      }
    });
    return items;
  }

  function yellowJudgmentLine(days) {
    return "🟡 建议 " + days + " 天内去医院";
  }

  function composeDoctorComment(form) {
    var judgment = "";
    if (form.level === "green") judgment = LEVEL_LINES.green;
    else if (form.level === "red") judgment = LEVEL_LINES.red;
    else if (form.level === "yellow") judgment = yellowJudgmentLine(form.yellowDays || "2");
    else return "";
    var lines = ["我的判断:", judgment, "", "观察什么 / 去医院做什么:", (form.action || "").trim()];
    var note = (form.note || "").trim();
    if (note) lines.push("", "补充:", note);
    return lines.join("\n");
  }

  function parseDoctorComment(text) {
    var raw = String(text || "").trim();
    if (!raw || raw.indexOf("我的判断") < 0) return null;
    var judgment = "";
    var action = "";
    var note = "";
    var level = "";
    var jMatch = raw.match(/我的判断[:：]\s*\n?\s*([^\n]+)/);
    if (jMatch) {
      judgment = jMatch[1].trim();
      if (judgment.indexOf("🟢") >= 0) level = "green";
      else if (judgment.indexOf("🟡") >= 0) level = "yellow";
      else if (judgment.indexOf("🔴") >= 0) level = "red";
    }
    var aMatch = raw.match(/观察什么\s*\/\s*去医院做什么[:：]\s*\n?([\s\S]*?)(?=\n\s*补充[:：]|$)/);
    if (aMatch) action = aMatch[1].trim();
    var nMatch = raw.match(/\n\s*补充[:：]\s*\n?([\s\S]*)$/);
    if (nMatch) note = nMatch[1].trim();
    if (!judgment) return null;
    return { judgment: judgment, action: action, note: note, level: level };
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function saveSession(data) {
    if (data && data.token) localStorage.setItem(TOKEN_KEY, data.token);
    if (data && data.doctor) {
      localStorage.setItem(INFO_KEY, JSON.stringify(data.doctor));
      state.doctor = data.doctor;
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(INFO_KEY);
    state.doctor = null;
  }

  function api(path, method, body) {
    var headers = { Accept: "application/json" };
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    var opts = { method: method || "GET", headers: headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(API_BASE + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          var err = new Error((data && data.detail) || "医生登录已过期");
          err.code = 401;
          throw err;
        }
        if (!res.ok) {
          throw new Error((data && data.detail) || "请求失败");
        }
        return data;
      });
    });
  }

  function handleAuthError(err) {
    if (err && err.code === 401) {
      clearSession();
      showLogin();
      toast("登录已过期，请重新登录");
      return true;
    }
    return false;
  }

  function showLogin() {
    $("view-login").hidden = false;
    $("view-work").hidden = true;
    var banner = $("demo-banner");
    if (banner) banner.hidden = true;
    stopRefresh();
  }

  function showSection(section) {
    state.section = section;
    if (section === "clients") {
      state.scope = "mine";
    } else if (section === "consult-mine") {
      state.scope = "mine";
    } else {
      state.scope = "platform";
    }
    document.querySelectorAll(".doc-main-tabs .doc-tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-section") === section);
    });
    $("pane-clients").hidden = section !== "clients";
    $("pane-consult").hidden = section === "clients";
    var mine = section === "consult-mine";
    $("consult-platform-tabs").hidden = section !== "consult-platform";
    $("inbox-cats").hidden = !mine;
    $("consult-list").hidden = mine;
    if (!mine) {
      $("inbox-board").hidden = true;
      var emptyP = $("detail-empty");
      if (emptyP) {
        var p = emptyP.querySelector("p");
        var span = emptyP.querySelector("span");
        if (p) p.textContent = "从左侧选择一条咨询";
        if (span) span.textContent = "诊所客户能看到全家猫档案；平台问诊仍只看这一条。";
      }
    }
    if (section === "clients") {
      loadClients();
    } else if (mine) {
      closeDetail();
      loadInbox();
    } else {
      closeDetail();
      loadList();
    }
  }

  function loadClients() {
    if (state.demo) {
      $("client-loading").hidden = true;
      var q = (state.clientSearch || "").trim();
      state.clients = DEMO.clients.filter(function (c) {
        if (!q) return true;
        return (c.alias + c.nickname + c.cat_names).indexOf(q) >= 0;
      });
      renderClients();
      return;
    }
    $("client-loading").hidden = false;
    $("client-empty").hidden = true;
    var q = state.clientSearch ? ("?q=" + encodeURIComponent(state.clientSearch)) : "";
    return api("/api/v1/doctor/clients" + q).then(function (res) {
      state.clients = (res && res.records) || [];
      $("client-loading").hidden = true;
      renderClients();
    }).catch(function (err) {
      $("client-loading").hidden = true;
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "加载客户失败"));
    });
  }

  function loadInbox() {
    if (state.demo) {
      state.inboxLoading = false;
      $("list-loading").hidden = true;
      $("list-empty").hidden = true;
      state.inboxBuckets = DEMO.inbox.buckets;
      state.pendingCount = DEMO.inbox.pending_count;
      if (!state.inboxBucket) state.inboxBucket = "ask";
      renderInbox();
      return;
    }
    state.inboxLoading = true;
    $("list-loading").hidden = false;
    $("list-empty").hidden = true;
    $("inbox-board").hidden = true;
    return api("/api/v1/doctor/inbox").then(function (res) {
      state.inboxBuckets = (res && res.buckets) || [];
      state.pendingCount = Number((res && res.pending_count) || 0);
      state.inboxLoading = false;
      $("list-loading").hidden = true;
      if (!state.inboxBucket && state.inboxBuckets.length) {
        var pick = state.inboxBuckets.find(function (b) { return b.owner_count > 0 && b.key !== "ok"; })
          || state.inboxBuckets.find(function (b) { return b.owner_count > 0; });
        state.inboxBucket = pick ? pick.key : (state.inboxBuckets[0] && state.inboxBuckets[0].key) || "";
      }
      renderInbox();
    }).catch(function (err) {
      state.inboxLoading = false;
      $("list-loading").hidden = true;
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "加载问诊失败"));
    });
  }

  function currentInboxBucket() {
    return (state.inboxBuckets || []).find(function (b) { return b.key === state.inboxBucket; }) || null;
  }

  function renderInbox() {
    var countEl = $("pending-count");
    if (state.pendingCount > 0) {
      countEl.hidden = false;
      countEl.textContent = String(state.pendingCount);
    } else {
      countEl.hidden = true;
    }
    var list = $("inbox-cats");
    list.innerHTML = (state.inboxBuckets || []).map(function (b) {
      var active = state.inboxBucket === b.key ? " is-active" : "";
      var emptyCls = (b.owner_count ? "" : " is-empty");
      return '<button type="button" class="inbox-cat' + active + emptyCls + '" data-inbox="' + escapeHtml(b.key) + '">' +
        '<span class="inbox-dot is-' + escapeHtml(b.color) + '"></span>' +
        '<span class="inbox-cat-text"><strong>' + escapeHtml(String(b.owner_count || 0)) + " 位主人</strong>" +
        "<span>" + escapeHtml(b.sub || "") + "</span></span>" +
        '<span class="inbox-cat-action">' + escapeHtml(b.action || "") + "</span></button>";
    }).join("");
    $("list-empty").hidden = true;
    if (state.current) return;
    renderInboxBoard();
  }

  function evidenceCardHtml(card) {
    var photos = (card.photos || []).slice(0, 3);
    var cols = Math.min(3, Math.max(1, photos.length));
    var photoHtml = photos.length
      ? '<div class="evidence-photos" style="grid-template-columns:repeat(' + cols + ',1fr)">' + photos.map(function (p) {
          var src = photoSrc(p.path);
          return '<div class="evidence-photo" data-preview="' + escapeHtml(src) + '"><img src="' + escapeHtml(src) + '" alt="" data-preview="' + escapeHtml(src) + '">' +
            '<span class="evidence-photo-when">' + escapeHtml(p.when || "") + "</span></div>";
        }).join("") + "</div>"
      : "";
    var owner = card.owner_alias || card.owner_nickname || "";
    return '<button type="button" class="evidence-card" data-inbox-card="' + escapeHtml(card.id) + '">' +
      '<div class="evidence-head">' + escapeHtml((card.cat_name || "猫咪") + " · " + (card.module_label || "检测记录")) + "</div>" +
      photoHtml +
      '<div class="evidence-body">' +
      '<span class="evidence-badge is-' + escapeHtml(card.tier || "") + '">' + escapeHtml(card.badge || "") + "</span>" +
      '<div class="evidence-summary">' + escapeHtml(card.summary || "") + "</div>" +
      (owner ? '<div class="evidence-owner">主人 ' + escapeHtml(owner) + "</div>" : "") +
      "</div></button>";
  }

  function renderInboxBoard() {
    var board = $("inbox-board");
    var empty = $("detail-empty");
    var body = $("detail-body");
    var pane = $("detail-pane");
    body.hidden = true;
    var bucket = currentInboxBucket();
    if (!bucket) {
      board.hidden = true;
      empty.hidden = false;
      empty.querySelector("p").textContent = "从左侧选择一类情况";
      empty.querySelector("span").textContent = "绿档不用回，红档已提示到院，黄档是主人专门问你的。";
      pane.classList.remove("is-open");
      $("list-empty").hidden = true;
      return;
    }
    var cards = bucket.cards || [];
    if (!cards.length) {
      board.hidden = true;
      empty.hidden = false;
      empty.querySelector("p").textContent = "这一类暂时没有记录";
      empty.querySelector("span").textContent = bucket.action || "";
      pane.classList.remove("is-open");
      return;
    }
    empty.hidden = true;
    board.hidden = false;
    board.innerHTML = '<div class="inbox-board">' + cards.map(evidenceCardHtml).join("") + "</div>";
    pane.classList.add("is-open");
    $("list-empty").hidden = true;
  }

  function openInboxCard(cardId) {
    var bucket = currentInboxBucket();
    if (!bucket) return;
    var card = (bucket.cards || []).find(function (c) { return String(c.id) === String(cardId); });
    if (!card) return;
    if (card.consultation_id) {
      state.fromInbox = true;
      if (state.demo) {
        state.current = decorateRecord(JSON.parse(JSON.stringify(DEMO.consult)));
        state.reply = Object.assign({}, EMPTY_REPLY);
        state.history = [];
        state.historyOpen = {};
        state.historyModule = "vomit";
        $("inbox-board").hidden = true;
        renderDetail();
        loadHistory(DEMO.consult.id);
        return;
      }
      api("/api/v1/doctor/consultations/" + encodeURIComponent(card.consultation_id)).then(function (rec) {
        state.current = decorateRecord(rec);
        state.reply = Object.assign({}, EMPTY_REPLY);
        state.history = [];
        state.historyOpen = {};
        state.historyModule = (rec.scan && rec.scan.module) || "fgs";
        $("inbox-board").hidden = true;
        renderDetail();
        loadHistory(rec.id);
      }).catch(function (err) {
        if (handleAuthError(err)) return;
        toast(networkMessage(err, "加载问诊失败"));
      });
      return;
    }
    if (card.user_id) {
      showSection("clients");
      openClient(card.user_id);
    }
  }

  function renderClients() {
    var list = $("client-list");
    var empty = $("client-empty");
    if (!state.clients.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = state.clientSearch ? "没有匹配的客户" : "还没有诊所客户。把上面的推荐码发给家长即可。";
      return;
    }
    empty.hidden = true;
    list.innerHTML = state.clients.map(function (c) {
      var active = state.clientCurrent && state.clientCurrent.user && state.clientCurrent.user.id === c.user_id ? " is-active" : "";
      var title = c.alias || c.nickname || "用户";
      var sub = (c.alias && c.nickname ? c.nickname + " · " : "") +
        (c.cat_count ? c.cat_count + " 只猫" : "还没建档") +
        (c.cat_names ? " · " + c.cat_names : "");
      return (
        '<button type="button" class="doc-card' + active + '" data-user="' + escapeHtml(c.user_id) + '">' +
          '<div class="doc-card-head">' +
            '<img class="card-avatar" src="' + escapeHtml(c.avatar_url ? uploadUrl(c.avatar_url) : avatarFallback(title, "doctor")) + '" alt="">' +
            '<div class="doc-card-names"><strong>' + escapeHtml(title) + "</strong>" +
            '<span>' + escapeHtml(sub) + "</span></div>" +
            (c.pending_count ? '<span class="doc-module-tag">待回复 ' + c.pending_count + "</span>" : "") +
          "</div></button>"
      );
    }).join("");
  }

  function openClient(userId) {
    state.aliasEditing = false;
    if (state.demo) {
      state.clientCurrent = JSON.parse(JSON.stringify(DEMO.clientDetails[userId] || DEMO.clientDetails["demo-lixinran"]));
      state.clientCat = null;
      state.clientCatModule = "";
      renderClients();
      renderClientDetail();
      return;
    }
    api("/api/v1/doctor/clients/" + encodeURIComponent(userId)).then(function (res) {
      state.clientCurrent = res;
      state.clientCat = null;
      state.clientCatModule = "";
      renderClients();
      renderClientDetail();
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "加载客户失败"));
    });
  }

  function renderClientDetail() {
    var empty = $("client-detail-empty");
    var body = $("client-detail-body");
    var pane = $("client-detail-pane");
    if (!state.clientCurrent) {
      empty.hidden = false;
      body.hidden = true;
      pane.classList.remove("is-open");
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    pane.classList.add("is-open");
    var u = state.clientCurrent.user || {};
    var cats = state.clientCurrent.cats || [];
    var displayName = u.display_name || u.nickname || "用户";
    var nameHtml = state.aliasEditing
      ? '<input id="client-alias" class="alias-inline-input" maxlength="20" value="' +
        escapeHtml(u.alias || u.nickname || "") + '" placeholder="备注名，只给你看">'
      : '<div class="detail-cat-name" id="btn-edit-alias">' + escapeHtml(displayName) + "</div>" +
        '<button type="button" class="alias-pencil" id="btn-edit-alias-icon" title="改备注名" aria-label="改备注名">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>';
    var html = '<div class="detail-close-bar"><strong>客户档案</strong>' +
      '<button type="button" class="doc-btn-ghost" id="btn-close-client">关闭</button></div>' +
      '<div class="doc-detail"><div class="detail-head">' +
      '<img class="detail-cat-avatar" src="' + escapeHtml(u.avatar_url ? uploadUrl(u.avatar_url) : avatarFallback(displayName, "doctor")) + '" alt="">' +
      "<div><div class=\"detail-cat-name-row\">" + nameHtml + "</div>" +
      '<div class="detail-cat-meta">家长 ' + escapeHtml(u.nickname || "") +
      " · 名下 " + (state.clientCurrent.cat_count || 0) + " 只猫 · 绑定于 " + escapeHtml(formatTime(u.bound_at)) +
      "</div></div></div>";
    html += '<section class="detail-section"><h3>每只猫的五大检测</h3>';
    if (!cats.length) {
      html += '<p class="doc-empty">这位家长还没建猫咪档案</p>';
    } else {
      html += cats.map(function (cat) {
        var selected = state.clientCat && state.clientCat.cat && state.clientCat.cat.id === cat.id;
        var meta = [cat.breed || "品种未填", cat.gender === "male" ? "公" : cat.gender === "female" ? "母" : "", cat.neutered ? "已绝育" : "未绝育"].filter(Boolean).join(" · ");
        var tiles = FIVE_MODULES.map(function (m) {
          var st = (cat.modules && cat.modules[m.key]) || { count: 0, last: null };
          var count = Number(st.count || 0);
          var focus = selected && state.clientCatModule === m.key;
          return '<button type="button" class="module-tile' + (focus ? " is-active" : "") + (count ? "" : " is-empty") +
            '" data-cat="' + escapeHtml(cat.id) + '" data-module="' + m.key + '">' +
            "<strong>" + m.label + "</strong>" +
            "<span>" + (count ? count + " 条" : "未测") + "</span>" +
            "<em>" + escapeHtml(count ? lastSummary(st.last) : "还没测过") + "</em></button>";
        }).join("");
        var panels = "";
        if (selected) {
          var grouped = groupByModule(state.clientCat.scans || []);
          var focusMod = state.clientCatModule || "";
          var list = grouped[focusMod] || [];
          var label = (FIVE_MODULES.find(function (m) { return m.key === focusMod; }) || {}).label || "检测";
          panels = '<div class="module-panel">' +
            "<h4>" + escapeHtml((state.clientCat.cat && state.clientCat.cat.name) || cat.name) + " · " + label +
            " · " + list.length + " 条</h4>";
          if (cat.medical_history) {
            panels += '<div class="detail-text">病史：' + escapeHtml(cat.medical_history) + "</div>";
          }
          if (!list.length) {
            panels += '<p class="doc-empty">这只猫还没有' + label + "检测</p>";
          } else {
            panels += '<div class="history-list">' + list.map(scanRecordCardHtml).join("") + "</div>";
          }
          panels += "</div>";
        }
        return '<article class="cat-board' + (selected ? " is-open" : "") + '">' +
          '<button type="button" class="cat-board-head" data-cat="' + escapeHtml(cat.id) + '">' +
          "<strong>" + escapeHtml(cat.name) + "</strong>" +
          '<span class="client-meta">' + escapeHtml(meta) + "</span></button>" +
          '<div class="module-tiles">' + tiles + "</div>" + panels + "</article>";
      }).join("");
    }
    html += "</section>";
    var consults = state.clientCurrent.consultations || [];
    if (consults.length) {
      html += '<section class="detail-section"><h3>问诊记录</h3>';
      var byCat = {};
      consults.forEach(function (c) {
        var name = c.cat_name || "未归档";
        if (!byCat[name]) byCat[name] = [];
        byCat[name].push(c);
      });
      Object.keys(byCat).forEach(function (name) {
        html += '<div class="consult-cat-group"><div class="consult-cat-label">' + escapeHtml(name) + "</div>";
        html += byCat[name].map(function (c) {
          return '<div class="ctx-item"><span class="ctx-item-label">' + escapeHtml(c.status === "pending" ? "待回复" : "已回复") +
            "</span><span class=\"ctx-item-value\">" + escapeHtml(moduleLabel(c.module) + " · " + formatTime(c.created_at)) +
            "</span></div>";
        }).join("");
        html += "</div>";
      });
      html += "</section>";
    }
    html += "</div>";
    body.innerHTML = html;
    if (state.aliasEditing) {
      var input = $("client-alias");
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function saveClientAlias(alias) {
    var uid = state.clientCurrent && state.clientCurrent.user && state.clientCurrent.user.id;
    if (!uid) return;
    var next = String(alias || "").trim();
    var cur = (state.clientCurrent.user.alias || "").trim();
    state.aliasEditing = false;
    if (next === cur) {
      renderClientDetail();
      return;
    }
    if (state.demo) {
      state.clientCurrent.user.alias = next;
      state.clientCurrent.user.display_name = next || state.clientCurrent.user.nickname;
      DEMO.clients.forEach(function (c) {
        if (c.user_id === uid) c.alias = next;
      });
      toast("示例里已改名（不会保存到服务器）");
      renderClients();
      renderClientDetail();
      return;
    }
    api("/api/v1/doctor/clients/" + encodeURIComponent(uid), "PATCH", { alias: next }).then(function () {
      toast("备注已保存");
      openClient(uid);
    }).catch(function (err) {
      toast(networkMessage(err, "保存失败"));
      renderClientDetail();
    });
  }

  function copyText(text, okMsg) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }).catch(function () {
        window.prompt("复制：", text);
      });
    } else {
      window.prompt("复制：", text);
    }
  }

  function showWork() {
    $("view-login").hidden = true;
    $("view-work").hidden = false;
    var banner = $("demo-banner");
    if (banner) banner.hidden = !state.demo;
    renderToolbar();
    if (!state.demo) startRefresh();
    showSection(state.section || "clients");
  }

  function enterDemo() {
    state.demo = true;
    state.doctor = DEMO.doctor;
    state.section = "consult-mine";
    state.inboxBucket = "ask";
    state.current = null;
    state.clientCurrent = null;
    showWork();
  }

  function doctorIntro(info) {
    info = info || {};
    var name = String(info.name || "医生").trim() || "医生";
    var city = String(info.city || "").trim();
    var hospital = String(info.hospital || "").trim();
    var title = String(info.title || "").trim();
    var place = [city, hospital].filter(Boolean).join(" · ");
    return {
      headline: place ? (place + "的" + name) : name,
      place: place || "未填写城市和医院",
      specialty: title || "未填写专业",
      name: name
    };
  }

  function renderToolbar() {
    var info = state.doctor || {};
    var intro = doctorIntro(info);
    $("toolbar-name").textContent = intro.headline;
    $("toolbar-place").textContent = intro.place;
    $("toolbar-title").textContent = intro.specialty;
    var img = $("toolbar-avatar");
    img.src = doctorAvatar(info);
    img.alt = intro.name;
    var code = info.referral_code || "";
    $("referral-bar").hidden = !code;
    $("referral-code").textContent = code || "————";
    var n = Number(info.client_count || 0);
    $("referral-count").textContent = n ? ("已绑定 " + n + " 位诊所客户") : "还没有绑定客户";
    var cc = $("client-count");
    if (n > 0) {
      cc.hidden = false;
      cc.textContent = String(n);
    } else {
      cc.hidden = true;
    }
  }

  function decorateRecord(r) {
    r.timeText = formatTime(r.created_at);
    r.answeredTimeText = r.answered_at ? formatTime(r.answered_at) : "";
    r.imageUrl = r.scan && r.scan.image_path ? photoSrc(String(r.scan.image_path).split(",")[0]) : "";
    r.catContextItems = parseCatContext(r.scan && r.scan.cat_context);
    r.parsedComment = parseDoctorComment(r.doctor_comment);
    r.doctor_avatar_url = r.doctor_avatar ? uploadUrl(r.doctor_avatar) : "";
    if (r.status === "answered" && !(r.doctor_name && String(r.doctor_name).trim())) {
      var myId = String((state.doctor && state.doctor.id) || "");
      if (myId && String(r.doctor_id || "") === myId && state.doctor && state.doctor.name) {
        r.doctor_name = String(state.doctor.name).trim();
      }
    }
    return r;
  }

  function loadList() {
    if (state.demo) {
      state.loading = false;
      $("list-loading").hidden = true;
      state.records = state.filter === "pending" ? [decorateRecord(JSON.parse(JSON.stringify(DEMO.consult)))] : [];
      state.pendingCount = 1;
      renderList();
      return;
    }
    state.loading = true;
    $("list-loading").hidden = false;
    $("list-empty").hidden = true;
    var q = "/api/v1/doctor/consultations?status=" + encodeURIComponent(state.filter) +
      "&scope=" + encodeURIComponent(state.scope);
    var listP = api(q);
    var countP = state.filter === "pending"
      ? Promise.resolve(null)
      : api("/api/v1/doctor/consultations?status=pending&scope=" + encodeURIComponent(state.scope));
    return Promise.all([listP, countP]).then(function (results) {
      var list = results[0] || {};
      state.records = (list.records || []).map(decorateRecord);
      if (state.filter === "pending") {
        state.pendingCount = state.records.length;
      } else if (results[1] && results[1].records) {
        state.pendingCount = results[1].records.length;
      }
      state.loading = false;
      renderList();
    }).catch(function (err) {
      state.loading = false;
      $("list-loading").hidden = true;
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "加载失败"));
    });
  }

  function renderList() {
    $("list-loading").hidden = true;
    var countEl = $("pending-count");
    if (state.pendingCount > 0) {
      countEl.hidden = false;
      countEl.textContent = String(state.pendingCount);
    } else {
      countEl.hidden = true;
    }
    var empty = $("list-empty");
    var list = $("consult-list");
    if (!state.records.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = state.filter === "pending"
        ? (state.scope === "mine" ? "暂无诊所客户的待回复" : "暂无平台待回复")
        : "还没有已回复的记录";
      return;
    }
    empty.hidden = true;
    list.innerHTML = state.records.map(function (item) {
      var active = state.current && state.current.id === item.id ? " is-active" : "";
      var cta = state.filter === "pending" ? "回复 ›" : "已回复 ✓";
      var doctorLine = state.filter === "answered" && item.doctor_name
        ? '<div>' + escapeHtml(item.doctor_name) + (item.doctor_title ? " · " + escapeHtml(item.doctor_title) : "") + "</div>"
        : "";
      var scan = item.scan || {};
      return (
        '<button type="button" class="doc-card' + active + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="doc-card-head">' +
            '<img class="card-avatar" src="' + escapeHtml(catAvatar(item.cat)) + '" alt="">' +
            '<div class="doc-card-names">' +
              "<strong>" + escapeHtml((item.cat && item.cat.name) || "猫咪") + "</strong>" +
              "<span>来自 " + escapeHtml(item.owner_alias || item.owner_nickname || "用户") +
              (item.cat_count ? " · 名下 " + item.cat_count + " 只猫" : "") + "</span>" +
            "</div>" +
            '<span class="doc-module-tag">' + escapeHtml(moduleLabel(scan.module)) + "</span>" +
          "</div>" +
          '<div class="doc-card-body">' +
            '<div class="doc-card-summary">' + escapeHtml(scanSummary(scan)) + "</div>" +
            (scan.diagnosis ? '<div class="doc-card-diag">' + escapeHtml(scan.diagnosis) + "</div>" : "") +
          "</div>" +
          '<div class="doc-card-foot">' +
            "<div>" + escapeHtml(item.timeText) + doctorLine + "</div>" +
            '<span class="doc-card-cta">' + cta + "</span>" +
          "</div>" +
        "</button>"
      );
    }).join("");
  }

  function ctxListHtml(items) {
    if (!items || !items.length) return "";
    return '<div class="ctx-list">' + items.map(function (it) {
      return '<div class="ctx-item"><span class="ctx-item-label">' + escapeHtml(it.label) +
        '</span><span class="ctx-item-value">' + escapeHtml(it.value) + "</span></div>";
    }).join("") + "</div>";
  }

  function fgsRowsHtml(scan) {
    return FGS_DIMS.map(function (pair) {
      return '<div class="dim-row"><span class="dim-name">' + pair[1] +
        '</span><span class="dim-val">' + escapeHtml(scan[pair[0]] || 0) + "/2</span></div>";
    }).join("");
  }

  function actionPlaceholder() {
    if (state.reply.level === "green") return "例如：留意精神、食欲、饮水是否正常";
    if (state.reply.level === "yellow" || state.reply.level === "red") {
      return "例如：建议查血常规 / 带上近期检测记录面诊";
    }
    return "一句话说明观察重点或就医事项";
  }

  function renderDetail() {
    var empty = $("detail-empty");
    var body = $("detail-body");
    var pane = $("detail-pane");
    if (!state.current) {
      body.hidden = true;
      if (state.section === "consult-mine") {
        renderInboxBoard();
        return;
      }
      empty.hidden = false;
      pane.classList.remove("is-open");
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    pane.classList.add("is-open");
    if ($("inbox-board")) $("inbox-board").hidden = true;
    var rec = state.current;
    var scan = rec.scan || {};
    var cat = rec.cat || {};
    var age = catAgeText(cat.birth_date);
    var meta = [
      cat.breed || "品种未填",
      genderText(cat.gender),
      cat.neutered ? "已绝育" : "未绝育"
    ];
    if (age) meta.push(age);
    if (cat.weight) meta.push(cat.weight + " kg");

    var html = '<div class="detail-close-bar' + (state.fromInbox ? " is-from-inbox" : "") + '">' +
      "<strong>" + (state.fromInbox ? "问诊详情" : "咨询详情") + "</strong>" +
      '<button type="button" class="doc-btn-ghost" id="btn-close-detail">' +
      (state.fromInbox ? "返回记录" : "关闭") + "</button>" +
      "</div><div class=\"doc-detail\">";

    html += '<div class="detail-head">' +
      '<img class="detail-cat-avatar" src="' + escapeHtml(catAvatar(cat)) + '" alt="">' +
      "<div><div class=\"detail-cat-name\">" + escapeHtml(cat.name || "猫咪") + "</div>" +
      '<div class="detail-cat-meta">' + escapeHtml(meta.join(" · ")) + "</div></div></div>";

    if (rec.imageUrl) {
      html += '<div class="detail-photo"><img src="' + escapeHtml(rec.imageUrl) +
        '" alt="检测照片" data-preview="' + escapeHtml(rec.imageUrl) + '"></div>';
    }

    if (scan.module === "fgs") {
      html += '<section class="detail-section"><h3>疼痛评分 ' +
        escapeHtml(scan.total_score || 0) + "/18</h3>" + fgsRowsHtml(scan) + "</section>";
    }

    if (scan.diagnosis) {
      html += '<section class="detail-section"><h3>AI 初判</h3><div class="detail-text">' +
        escapeHtml(scan.diagnosis) + "</div></section>";
    }
    if (scan.advice) {
      html += '<section class="detail-section"><h3>AI 建议</h3><div class="detail-text">' +
        escapeHtml(scan.advice) + "</div></section>";
    }
    if (rec.catContextItems && rec.catContextItems.length) {
      html += '<section class="detail-section"><h3>用户填写的情况</h3>' +
        ctxListHtml(rec.catContextItems) + "</section>";
    }

    html += '<section class="detail-section"><div class="history-head"><h3>这只猫的五大检测</h3></div>';
    if (state.historyLoading) {
      html += '<p class="doc-empty">正在加载...</p>';
    } else {
      var counts = moduleCountMap(state.history);
      var histMod = state.historyModule || (scan.module || "fgs");
      html += '<div class="module-tiles module-tiles-compact">' + FIVE_MODULES.map(function (m) {
        var n = counts[m.key] || 0;
        return '<button type="button" class="module-tile' + (histMod === m.key ? " is-active" : "") + (n ? "" : " is-empty") +
          '" data-history-module="' + m.key + '"><strong>' + m.label + "</strong><span>" +
          (n ? n + " 条" : "未测") + "</span></button>";
      }).join("") + "</div>";
      var histList = groupByModule(state.history)[histMod] || [];
      var histLabel = (FIVE_MODULES.find(function (m) { return m.key === histMod; }) || {}).label || "检测";
      html += '<div class="module-panel"><h4>' + histLabel + " · " + histList.length + " 条</h4>";
      if (!histList.length) {
        html += '<p class="doc-empty">这只猫还没有' + histLabel + "记录</p>";
      } else {
        html += '<div class="history-list">' + histList.map(function (item) {
          var open = !!state.historyOpen[item.id];
          var cls = "history-card" + (item.is_current ? " is-current" : "") + (open ? " is-open" : "");
          var inner = '<button type="button" class="history-card-head" data-toggle-history="' + escapeHtml(item.id) + '">' +
            (item.imageUrl
              ? '<img class="history-thumb" src="' + escapeHtml(item.imageUrl) + '" alt="">'
              : '<div class="history-thumb"></div>') +
            '<div class="history-meta"><div class="history-meta-row">' +
            (item.is_current ? '<span class="history-current-tag">本次</span>' : "") +
            '</div><span class="history-summary">' + escapeHtml(item.summary) + "</span>" +
            '<span class="history-date">' + escapeHtml(item.dateText) + "</span></div>" +
            '<span class="history-open-hint">' + (open ? "收起" : "点开看结果") + "</span>" +
            '<span class="history-arrow">›</span></button>';
          if (open) {
            inner += '<div class="history-detail">' + scanResultDetailHtml(item) + "</div>";
          }
          return '<div class="' + cls + '">' + inner + "</div>";
        }).join("") + "</div>";
      }
      html += "</div>";
    }
    html += "</section>";

    if (rec.status === "pending") {
      var form = state.reply;
      html += '<section class="reply-section"><h3>给用户的回复</h3>';
      html += '<div class="reply-field"><div class="reply-field-head"><span class="reply-req">必选</span>' +
        '<span class="reply-field-label">我的判断</span></div><div class="level-list">';
      html += '<button type="button" class="level-item' + (form.level === "green" ? " is-green" : "") +
        '" data-level="green"><span>🟢</span><span>先在家观察,暂时不用去医院</span></button>';
      html += '<button type="button" class="level-item' + (form.level === "yellow" ? " is-yellow" : "") +
        '" data-level="yellow"><span>🟡</span><span>建议 __ 天内去医院</span></button>';
      html += '<button type="button" class="level-item' + (form.level === "red" ? " is-red" : "") +
        '" data-level="red"><span>🔴</span><span>建议今天就去</span></button></div>';
      if (form.level === "yellow") {
        html += '<div class="days-row"><span class="days-label">几天内就医</span><div class="days-chips">';
        html += DAY_OPTIONS.map(function (d) {
          return '<button type="button" class="days-chip' + (form.yellowDays === d ? " is-active" : "") +
            '" data-days="' + d + '">' + d + "天</button>";
        }).join("") + "</div></div>";
      }
      html += "</div>";

      html += '<div class="reply-field"><div class="reply-field-head"><span class="reply-req">必选</span>' +
        '<span class="reply-field-label">观察什么 / 去医院做什么</span></div>';
      if (state.quickReplies.length) {
        html += '<div class="quick-chips">' + state.quickReplies.map(function (line, i) {
          return '<button type="button" class="quick-chip" data-quick="' + i + '">' + escapeHtml(line) + "</button>";
        }).join("") + "</div>";
      }
      html += '<textarea class="reply-input" id="reply-action" maxlength="120" placeholder="' +
        escapeHtml(actionPlaceholder()) + '">' + escapeHtml(form.action) + "</textarea></div>";

      html += '<div class="reply-field"><div class="reply-field-head"><span class="reply-opt">可选</span>' +
        '<span class="reply-field-label">补充</span></div>' +
        '<textarea class="reply-input" id="reply-note" maxlength="300" placeholder="可补充更细节的建议，最多 300 字">' +
        escapeHtml(form.note) + "</textarea></div>";

      html += '<button type="button" class="doc-btn-primary reply-submit" id="btn-submit-reply"' +
        (state.submitting ? " disabled" : "") + ">" +
        (state.submitting ? "提交中..." : "提交回复") + "</button></section>";
    } else {
      var parsed = rec.parsedComment;
      var who = String(rec.doctor_id || "") === String((state.doctor && state.doctor.id) || "")
        ? "你的回复"
        : (rec.doctor_name ? rec.doctor_name + " 的回复" : "医生回复");
      html += '<section class="reply-section"><h3>' + escapeHtml(who) + "</h3>";
      html += '<div class="answered-doctor-row">' +
        (rec.doctor_avatar_url ? '<img class="answered-doc-avatar" src="' + escapeHtml(rec.doctor_avatar_url) + '" alt="">' : "") +
        "<div><strong>" + escapeHtml(rec.doctor_name || "未知医生") +
        (rec.doctor_title ? " · " + escapeHtml(rec.doctor_title) : "") + "</strong>" +
        (rec.answeredTimeText ? '<div class="history-date">回复于 ' + escapeHtml(rec.answeredTimeText) + "</div>" : "") +
        "</div></div>";
      if (parsed) {
        html += '<div class="answered-card"><div class="answered-block"><span class="answered-label">我的判断</span>' +
          '<div class="answered-judgment is-' + escapeHtml(parsed.level) + '">' + escapeHtml(parsed.judgment) + "</div></div>";
        if (parsed.action) {
          html += '<div class="answered-block"><span class="answered-label">观察什么 / 去医院做什么</span>' +
            '<div class="answered-text">' + escapeHtml(parsed.action) + "</div></div>";
        }
        if (parsed.note) {
          html += '<div class="answered-block"><span class="answered-label">补充</span>' +
            '<div class="answered-text">' + escapeHtml(parsed.note) + "</div></div>";
        }
        html += "</div>";
      } else {
        html += '<div class="answered-card"><div class="answered-text">' + escapeHtml(rec.doctor_comment || "") + "</div></div>";
      }
      html += "</section>";
    }

    html += "</div>";
    body.innerHTML = html;
  }

  function openDetail(id) {
    var rec = state.records.find(function (r) { return r.id === id; });
    if (!rec) return;
    state.current = rec;
    state.reply = Object.assign({}, EMPTY_REPLY);
    state.history = [];
    state.historyOpen = {};
    state.historyModule = (rec.scan && rec.scan.module) || "fgs";
    renderList();
    renderDetail();
    loadHistory(rec.id);
  }

  function closeDetail() {
    state.current = null;
    state.reply = Object.assign({}, EMPTY_REPLY);
    state.history = [];
    state.historyOpen = {};
    state.historyModule = "";
    if (state.section === "consult-mine") {
      state.fromInbox = false;
      renderInbox();
      return;
    }
    state.fromInbox = false;
    renderList();
    renderDetail();
  }

  function loadHistory(cid) {
    if (state.demo) {
      state.historyLoading = false;
      state.history = DEMO.history.map(function (r) {
        var row = JSON.parse(JSON.stringify(r));
        row.dateText = formatTime(row.created_at);
        row.imageUrl = photoSrc(String(row.image_path || "").split(",")[0]);
        row.moduleLabel = moduleLabel(row.module);
        row.summary = historySummary(row);
        row.catContextItems = [];
        return row;
      });
      renderDetail();
      return;
    }
    state.historyLoading = true;
    renderDetail();
    api("/api/v1/doctor/consultations/" + encodeURIComponent(cid) + "/cat-scans").then(function (res) {
      state.history = ((res && res.records) || []).map(function (r) {
        r.dateText = formatTime(r.created_at);
        r.imageUrl = r.image_path ? uploadUrl(String(r.image_path).split(",")[0]) : "";
        r.moduleLabel = moduleLabel(r.module);
        r.summary = historySummary(r);
        r.catContextItems = parseCatContext(r.cat_context);
        return r;
      });
      state.historyLoading = false;
      renderDetail();
    }).catch(function () {
      state.historyLoading = false;
      renderDetail();
    });
  }

  function submitReply() {
    if (state.submitting || !state.current) return;
    var form = state.reply;
    if (!form.level) return toast("请先选择判断");
    if (form.level === "yellow") {
      var days = parseInt(form.yellowDays, 10);
      if (!days || days < 1 || days > 30) return toast("请选择建议就医天数");
    }
    if (!(form.action || "").trim()) return toast("请填写观察/就医事项");
    var comment = composeDoctorComment(form);
    if (!comment) return toast("回复内容不能为空");
    if (comment.length > 500) return toast("回复内容超过 500 字");
    if (state.demo) {
      toast("示例模式不会真的发出回复");
      closeDetail();
      return;
    }
    state.submitting = true;
    renderDetail();
    api("/api/v1/doctor/consultations/" + encodeURIComponent(state.current.id) + "/reply", "POST", { comment: comment })
      .then(function () {
        state.submitting = false;
        toast("回复已发送");
        closeDetail();
        if (state.section === "consult-mine") loadInbox();
        else loadList();
      })
      .catch(function (err) {
        state.submitting = false;
        renderDetail();
        if (handleAuthError(err)) return;
        toast(networkMessage(err, "提交失败"));
      });
  }

  function loadMe() {
    if (state.demo) return Promise.resolve();
    return api("/api/v1/doctor/me").then(function (res) {
      if (res && res.doctor) {
        localStorage.setItem(INFO_KEY, JSON.stringify(res.doctor));
        state.doctor = res.doctor;
        renderToolbar();
      }
    }).catch(function (err) {
      if (handleAuthError(err)) return;
    });
  }

  function loadQuickReplies() {
    if (state.demo) {
      state.quickReplies = ["留意精神食欲", "带上近期检测记录面诊", "先禁食观察"];
      return;
    }
    api("/api/v1/doctor/quick-replies").then(function (res) {
      state.quickReplies = (res && res.replies) || [];
    }).catch(function () {});
  }

  function startRefresh() {
    stopRefresh();
    if (state.demo) return;
    state.refreshTimer = setInterval(function () {
      if (document.hidden || $("view-work").hidden) return;
      if (state.section === "clients") loadClients();
      else if (state.section === "consult-mine") loadInbox();
      else loadList();
    }, 45000);
  }

  function stopRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  function openProfile() {
    var info = state.doctor || {};
    state.profile = {
      name: info.name || "",
      title: info.title || "",
      gender: info.gender || "female",
      avatar_url: info.avatar_url ? uploadUrl(info.avatar_url) : "",
      city: info.city || "",
      hospital: info.hospital || ""
    };
    $("profile-name").value = state.profile.name;
    $("profile-city").value = state.profile.city;
    $("profile-hospital").value = state.profile.hospital;
    $("profile-title").value = state.profile.title;
    $("profile-avatar").src = state.profile.avatar_url || avatarFallback(state.profile.name, "doctor");
    document.querySelectorAll("#profile-gender .doc-chip").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-g") === state.profile.gender);
    });
    $("profile-mask").hidden = false;
  }

  function closeProfile() {
    $("profile-mask").hidden = true;
  }

  function saveProfile() {
    var name = ($("profile-name").value || "").trim();
    if (!name) return toast("姓名不能为空");
    var payload = {
      name: name,
      city: ($("profile-city").value || "").trim(),
      hospital: ($("profile-hospital").value || "").trim(),
      title: ($("profile-title").value || "").trim(),
      gender: state.profile.gender || "female",
      avatar_url: relativeUploadPath(state.profile.avatar_url || "")
    };
    api("/api/v1/doctor/me", "PATCH", payload).then(function (res) {
      var info = (res && res.doctor) ? res.doctor : Object.assign({}, state.doctor, payload);
      localStorage.setItem(INFO_KEY, JSON.stringify(info));
      state.doctor = info;
      renderToolbar();
      closeProfile();
      toast("已保存");
    }).catch(function (err) {
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "保存失败"));
    });
  }

  function uploadAvatar(file) {
    if (!file) return;
    var fd = new FormData();
    fd.append("image", file);
    var headers = { Authorization: "Bearer " + token() };
    fetch(API_BASE + "/api/v1/doctor/avatar", { method: "POST", headers: headers, body: fd })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401) {
            var err = new Error((data && data.detail) || "医生登录已过期");
            err.code = 401;
            throw err;
          }
          if (!res.ok || !data.avatar_url) throw new Error((data && data.detail) || "上传失败");
          return data;
        });
      })
      .then(function (data) {
        state.profile.avatar_url = uploadUrl(data.avatar_url);
        $("profile-avatar").src = state.profile.avatar_url;
      })
      .catch(function (err) {
        if (handleAuthError(err)) return;
        toast(networkMessage(err, "上传失败"));
      });
  }

  function openLightbox(url) {
    if (!url) return;
    $("lightbox-img").src = url;
    $("lightbox").hidden = false;
  }

  function bindEvents() {
    $("btn-demo").addEventListener("click", enterDemo);
    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var loginName = ($("login-name").value || "").trim();
      var password = $("login-password").value || "";
      if (!loginName || !password) return toast("请输入账号和密码");
      var btn = $("login-submit");
      btn.disabled = true;
      btn.textContent = "登录中...";
      api("/api/v1/doctor/login", "POST", { login_name: loginName, password: password })
        .then(function (data) {
          saveSession(data);
          showWork();
          loadMe();
          loadQuickReplies();
        })
        .catch(function (err) {
          toast(networkMessage(err, "登录失败"));
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "登 录";
        });
    });

    document.querySelectorAll(".doc-main-tabs .doc-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var section = tab.getAttribute("data-section");
        if (!section || section === state.section) return;
        showSection(section);
      });
    });

    document.querySelectorAll(".doc-sub-tabs .doc-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var filter = tab.getAttribute("data-filter");
        if (!filter || filter === state.filter) return;
        state.filter = filter;
        document.querySelectorAll(".doc-sub-tabs .doc-tab").forEach(function (t) {
          t.classList.toggle("is-active", t === tab);
        });
        closeDetail();
        loadList();
      });
    });

    $("consult-list").addEventListener("click", function (e) {
      var card = e.target.closest(".doc-card");
      if (!card) return;
      openDetail(card.getAttribute("data-id"));
    });

    $("inbox-cats").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-inbox]");
      if (!btn) return;
      state.inboxBucket = btn.getAttribute("data-inbox") || "";
      state.current = null;
      state.fromInbox = false;
      renderInbox();
    });

    $("inbox-board").addEventListener("click", function (e) {
      var preview = e.target.getAttribute("data-preview");
      if (preview) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(preview);
        return;
      }
      var card = e.target.closest("[data-inbox-card]");
      if (!card) return;
      openInboxCard(card.getAttribute("data-inbox-card"));
    });

    $("detail-body").addEventListener("click", function (e) {
      var preview = e.target.getAttribute("data-preview");
      if (preview) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(preview);
        return;
      }
      if (e.target.id === "btn-close-detail") {
        closeDetail();
        return;
      }
      var levelBtn = e.target.closest("[data-level]");
      if (levelBtn) {
        state.reply.level = levelBtn.getAttribute("data-level");
        renderDetail();
        return;
      }
      var dayBtn = e.target.closest("[data-days]");
      if (dayBtn) {
        state.reply.yellowDays = dayBtn.getAttribute("data-days");
        renderDetail();
        return;
      }
      var quick = e.target.closest("[data-quick]");
      if (quick) {
        var idx = Number(quick.getAttribute("data-quick"));
        state.reply.action = state.quickReplies[idx] || state.reply.action;
        renderDetail();
        return;
      }
      var histMod = e.target.closest("[data-history-module]");
      if (histMod) {
        state.historyModule = histMod.getAttribute("data-history-module") || "fgs";
        renderDetail();
        return;
      }
      var hist = e.target.closest("[data-toggle-history]");
      if (hist) {
        var hid = hist.getAttribute("data-toggle-history");
        state.historyOpen[hid] = !state.historyOpen[hid];
        renderDetail();
        return;
      }
      if (e.target.id === "btn-submit-reply") submitReply();
    });

    $("detail-body").addEventListener("input", function (e) {
      if (e.target.id === "reply-action") state.reply.action = e.target.value;
      if (e.target.id === "reply-note") state.reply.note = e.target.value;
    });

    $("btn-refresh").addEventListener("click", function () {
      if (state.section === "clients") loadClients();
      else if (state.section === "consult-mine") loadInbox();
      else loadList();
    });
    $("btn-copy-code").addEventListener("click", function () {
      copyText((state.doctor && state.doctor.referral_code) || "", "推荐码已复制");
    });
    $("btn-copy-link").addEventListener("click", function () {
      copyText((state.doctor && state.doctor.referral_url) || "", "链接已复制，发给诊所客户");
    });
    $("client-search").addEventListener("input", function (e) {
      state.clientSearch = e.target.value || "";
      clearTimeout(loadClients._t);
      loadClients._t = setTimeout(loadClients, 280);
    });
    $("client-list").addEventListener("click", function (e) {
      var card = e.target.closest("[data-user]");
      if (!card) return;
      openClient(card.getAttribute("data-user"));
    });
    $("client-detail-body").addEventListener("click", function (e) {
      var preview = e.target.getAttribute("data-preview");
      if (preview) {
        openLightbox(preview);
        return;
      }
      if (e.target.id === "btn-close-client") {
        state.clientCurrent = null;
        state.clientCat = null;
        state.clientCatModule = "";
        state.clientScanOpen = {};
        state.aliasEditing = false;
        renderClients();
        renderClientDetail();
        return;
      }
      if (e.target.id === "btn-edit-alias" || e.target.closest("#btn-edit-alias-icon") || e.target.id === "btn-edit-alias-icon") {
        state.aliasEditing = true;
        renderClientDetail();
        return;
      }
      var clientScan = e.target.closest("[data-toggle-client-scan]");
      if (clientScan) {
        var sid = clientScan.getAttribute("data-toggle-client-scan");
        state.clientScanOpen[sid] = !state.clientScanOpen[sid];
        renderClientDetail();
        return;
      }
      var catBtn = e.target.closest("[data-cat]");
      if (catBtn && state.clientCurrent && state.clientCurrent.user) {
        var uid2 = state.clientCurrent.user.id;
        var catId = catBtn.getAttribute("data-cat");
        var wantMod = catBtn.getAttribute("data-module") || "";
        if (state.clientCat && state.clientCat.cat && state.clientCat.cat.id === catId) {
          if (wantMod) state.clientCatModule = wantMod;
          renderClientDetail();
          return;
        }
        if (state.demo) {
          var cat = (state.clientCurrent.cats || []).find(function (c) { return c.id === catId; }) || { id: catId, name: "猫咪" };
          state.clientCat = {
            cat: cat,
            scans: DEMO.history.map(function (r) {
              var row = JSON.parse(JSON.stringify(r));
              row.image_path = row.image_path || "";
              return row;
            })
          };
          state.clientCatModule = wantMod || (catId === "c-mimi" ? "vomit" : "stool");
          renderClientDetail();
          return;
        }
        api("/api/v1/doctor/clients/" + encodeURIComponent(uid2) + "/cats/" + encodeURIComponent(catId))
          .then(function (res) {
            state.clientCat = res;
            if (wantMod) {
              state.clientCatModule = wantMod;
            } else {
              var grouped = groupByModule((res && res.scans) || []);
              var pick = "fgs";
              FIVE_MODULES.forEach(function (m) {
                if ((grouped[m.key] || []).length && pick === "fgs" && !(grouped.fgs || []).length) pick = m.key;
                if ((grouped[m.key] || []).length) pick = m.key;
              });
              // prefer module with most recent scan
              var latest = 0;
              FIVE_MODULES.forEach(function (m) {
                var list = grouped[m.key] || [];
                if (list[0] && (list[0].created_at || 0) >= latest) {
                  latest = list[0].created_at || 0;
                  pick = m.key;
                }
              });
              state.clientCatModule = pick;
            }
            renderClientDetail();
          })
          .catch(function (err) {
            toast(networkMessage(err, "加载失败"));
          });
      }
    });
    $("client-detail-body").addEventListener("keydown", function (e) {
      if (e.target.id !== "client-alias") return;
      if (e.key === "Enter") {
        e.preventDefault();
        saveClientAlias(e.target.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        state.aliasEditing = false;
        renderClientDetail();
      }
    });
    $("client-detail-body").addEventListener("focusout", function (e) {
      if (e.target.id !== "client-alias" || !state.aliasEditing) return;
      saveClientAlias(e.target.value);
    });
    $("btn-edit-profile").addEventListener("click", openProfile);
    $("btn-toolbar-avatar").addEventListener("click", openProfile);
    $("btn-logout").addEventListener("click", function () {
      var msg = state.demo ? "退出示例界面？" : "退出登录？会返回登录页";
      if (window.confirm(msg)) {
        state.demo = false;
        state.section = "clients";
        state.inboxBucket = "";
        clearSession();
        showLogin();
      }
    });
    $("btn-profile-cancel").addEventListener("click", closeProfile);
    $("profile-mask").addEventListener("click", function (e) {
      if (e.target === $("profile-mask")) closeProfile();
    });
    $("btn-profile-save").addEventListener("click", saveProfile);
    $("profile-avatar-file").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      uploadAvatar(file);
    });
    $("btn-clear-avatar").addEventListener("click", function () {
      state.profile.avatar_url = "";
      $("profile-avatar").src = avatarFallback($("profile-name").value, "doctor");
    });
    $("profile-gender").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-g]");
      if (!btn) return;
      state.profile.gender = btn.getAttribute("data-g");
      document.querySelectorAll("#profile-gender .doc-chip").forEach(function (el) {
        el.classList.toggle("is-active", el === btn);
      });
    });
    $("lightbox").addEventListener("click", function () { $("lightbox").hidden = true; });
    $("lightbox").querySelector(".doc-lightbox-close").addEventListener("click", function () {
      $("lightbox").hidden = true;
    });
    document.addEventListener("error", function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || img.dataset.fallback) return;
      img.dataset.fallback = "1";
      var kind = img.classList.contains("card-avatar") || img.classList.contains("detail-cat-avatar") ? "cat" : "doctor";
      img.src = avatarFallback(kind === "cat" ? "猫" : "医", kind);
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        $("lightbox").hidden = true;
        if (!$("profile-mask").hidden) closeProfile();
        else if (state.current && window.matchMedia("(max-width: 860px)").matches) closeDetail();
      }
    });
  }

  function boot() {
    bindEvents();
    if (/[?&]demo=1(?:&|$)/.test(location.search) || location.hash === "#demo") {
      enterDemo();
      return;
    }
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(INFO_KEY) || "null"); } catch (e) {}
    if (token()) {
      state.doctor = saved || {};
      showWork();
      loadMe();
      loadQuickReplies();
    } else {
      showLogin();
    }
  }

  boot();
})();
