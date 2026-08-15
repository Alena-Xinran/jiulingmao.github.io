(function () {
  "use strict";

  var API_BASE = "https://catapi.jiulingmao.com";
  var TOKEN_KEY = "jiulingmao_doctor_token";
  var INFO_KEY = "jiulingmao_doctor_info";
  var DEMO_KEY = "jiulingmao_doctor_demo_v1";
  var DAY_OPTIONS = ["1", "2", "3", "5", "7"];
  var EMPTY_REPLY = { level: "", yellowDays: "2", action: "", note: "" };
  var FGS_FACE = [
    ["ear_position", "耳朵"],
    ["orbital_tightening", "眼部"],
    ["muzzle_tension", "口鼻"],
    ["whiskers_change", "胡须"],
    ["head_position", "头肩"]
  ];
  var FGS_BODY = [
    ["body_shape", "体型"],
    ["fur_condition", "毛发"],
    ["posture", "姿态"],
    ["eye_spirit", "眼神"]
  ];
  var TYPE_META = {
    fgs: { label: "面部/体态", short: "面部" },
    stool: { label: "便便", short: "便便" },
    vomit: { label: "呕吐物", short: "呕吐" },
    teeth: { label: "牙齿", short: "牙齿" },
    postop: { label: "伤口", short: "伤口" }
  };
  var TIER_TEXT = { good: "绿档", observe: "黄档", vet: "红档" };
  var TIER_HINT = { good: "正常", observe: "待查看", vet: "待处理" };
  var LEVEL_LINES = {
    green: "🟢 先在家观察，暂时不用去医院",
    red: "🔴 建议今天就去"
  };

  var state = {
    doctor: null,
    demo: false,
    section: "todo",
    records: [],
    archive: [],
    cats: [],
    owners: [],
    phrases: {
      fgs: ["先观察精神、食欲、活动量", "建议 48 小时内到院评估疼痛", "疼痛信号明显，建议今天到院"],
      stool: ["先观察精神与便便形状", "建议带新鲜粪便到院化验", "便血或精神差，请今天到院"],
      vomit: ["今晚停零食，观察是否再吐", "24 小时内再吐，建议到院", "带血或精神差，请急诊"],
      teeth: ["先观察进食是否疼痛", "建议口腔探诊确认", "疑似牙吸收，请尽快口腔科"],
      postop: ["切口看起来正常，继续限制活动", "建议按计划到院复查/拆线", "红肿渗液或精神差，请今天到院"]
    },
    overrideReasons: [
      { id: "fur", label: "误判毛发遮挡" },
      { id: "breed", label: "该品种正常" },
      { id: "seen", label: "已当面看过" },
      { id: "borderline", label: "分数临界，临床不支持" },
      { id: "other", label: "其他" }
    ],
    redlineRules: {
      blood: { label: "带血", hot: true },
      vomit_3x: { label: "24h 超 3 次", hot: true },
      lethargy: { label: "精神萎靡", hot: true },
      abscess: { label: "脓肿/撕脱/烧烫", hot: true },
      systemic: { label: "全身红旗", hot: true },
      stool4: { label: "4分·按观察处理", hot: false },
      forl: { label: "疑似牙吸收 FORL/TR", hot: false }
    },
    planTemplate: {
      id: "neuter-14",
      name: "绝育术后 14 天",
      items: [
        { day: 1, title: "术后第 1 天", text: "拍一张切口特写。看有没有渗液、裂开，精神食欲是否回来。" },
        { day: 3, title: "术后第 3 天", text: "再拍切口。轻度红肿可接受；若红肿扩大或流脓，直接到院。" },
        { day: 7, title: "术后第 7 天", text: "切口应明显收干。继续圈养，不要拆线除非主治安排。" },
        { day: 14, title: "术后第 14 天", text: "按医院安排拆线/复查。拍一张收尾照，归档。" }
      ]
    },
    settings: { notify_red: true, notify_yellow: true, notify_followup: true },
    plans: {},
    current: null,
    reply: Object.assign({}, EMPTY_REPLY),
    submitting: false,
    greenOpen: false,
    overrideDraft: { level: "", reason: "" },
    planCatId: "",
    clients: [],
    clientCurrent: null,
    clientCat: null,
    clientCatModule: "",
    clientSearch: "",
    clientScanOpen: {},
    aliasEditing: false,
    askCurrent: null,
    fromAsk: false,
    profile: { name: "", title: "", gender: "female", avatar_url: "", city: "", hospital: "" },
    refreshTimer: null
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

  function typeLabel(type) {
    return (TYPE_META[type] || TYPE_META.fgs).label;
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
        if (!res.ok) throw new Error((data && data.detail) || "请求失败");
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

  function persistDemo() {
    if (!state.demo) return;
    try {
      sessionStorage.setItem(DEMO_KEY, JSON.stringify({
        records: state.records,
        archive: state.archive,
        plans: state.plans,
        settings: state.settings,
        doctor: state.doctor
      }));
    } catch (e) {}
  }

  function allRecords() {
    return (state.records || []).concat(state.archive || []);
  }

  function findRecord(id) {
    return allRecords().filter(function (r) { return String(r.id) === String(id); })[0] || null;
  }

  function findCat(id) {
    return (state.cats || []).filter(function (c) { return c.id === id; })[0] || null;
  }

  function findOwner(id) {
    return (state.owners || []).filter(function (o) { return o.id === id; })[0] || null;
  }

  function isRedline(rec) {
    if (!rec) return false;
    if (rec.is_redline) return true;
    var hot = { blood: 1, vomit_3x: 1, lethargy: 1, abscess: 1, systemic: 1 };
    return (rec.triggered_rules || []).some(function (k) { return hot[k]; });
  }

  function isFollowup(rec) {
    return !!(rec && (rec.kind === "followup" || rec.unread_owner));
  }

  function queueGroups() {
    var live = (state.records || []).filter(function (r) { return !r.done; });
    var redline = [];
    var red = [];
    var follow = [];
    var yellow = [];
    var green = [];
    live.forEach(function (r) {
      if (r.pain_level === "vet" && isRedline(r)) redline.push(r);
      else if (r.pain_level === "vet") red.push(r);
      else if (isFollowup(r)) follow.push(r);
      else if (r.pain_level === "observe") yellow.push(r);
      else green.push(r);
    });
    var byTime = function (a, b) { return (b.created_at || 0) - (a.created_at || 0); };
    redline.sort(byTime);
    red.sort(byTime);
    follow.sort(byTime);
    yellow.sort(byTime);
    green.sort(byTime);
    return { redline: redline, red: red, follow: follow, yellow: yellow, green: green };
  }

  function actionableList() {
    var g = queueGroups();
    return g.redline.concat(g.red, g.follow, g.yellow);
  }

  function nextActionable(exceptId) {
    var list = actionableList();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) !== String(exceptId || "")) return list[i];
    }
    return null;
  }

  function ruleLabel(key) {
    var map = state.redlineRules || {};
    return (map[key] && map[key].label) || key;
  }

  function ruleHot(key) {
    var map = state.redlineRules || {};
    if (map[key]) return !!map[key].hot;
    return /blood|vomit_3x|lethargy|abscess|systemic/.test(key);
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

  function showLogin() {
    $("view-login").hidden = false;
    $("view-work").hidden = true;
    var banner = $("demo-banner");
    if (banner) banner.hidden = true;
    stopRefresh();
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
    var n = Number(info.client_count || (state.owners && state.owners.length) || 0);
    var cc = $("client-count");
    if (n > 0) {
      cc.hidden = false;
      cc.textContent = String(n);
    } else {
      cc.hidden = true;
    }
  }

  function updateTabCounts() {
    var actionN = actionableList().length;
    var todoEl = $("todo-count");
    if (actionN > 0) {
      todoEl.hidden = false;
      todoEl.textContent = String(actionN);
    } else {
      todoEl.hidden = true;
    }
    var askN = (state.records || []).filter(function (r) {
      return (r.thread || []).some(function (m) { return m.role === "owner"; });
    }).length;
    var askEl = $("ask-count");
    if (askN > 0) {
      askEl.hidden = false;
      askEl.textContent = String(askN);
    } else {
      askEl.hidden = true;
    }
  }

  function showSection(section) {
    state.section = section;
    document.querySelectorAll(".doc-main-tabs .doc-tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-section") === section);
    });
    $("pane-todo").hidden = section !== "todo";
    $("pane-clients").hidden = section !== "clients";
    $("pane-ask").hidden = section !== "ask";
    $("pane-settings").hidden = section !== "settings";
    if (section === "todo") {
      if (state.demo) renderTodo();
      else loadTodo();
    } else if (section === "clients") loadClients();
    else if (section === "ask") renderAsk();
    else renderSettings();
  }

  function showWork() {
    $("view-login").hidden = true;
    $("view-work").hidden = false;
    var banner = $("demo-banner");
    if (banner) banner.hidden = !state.demo;
    renderToolbar();
    if (!state.demo) startRefresh();
    showSection(state.section || "todo");
  }

  function cloneSeed() {
    var seed = window.DEMO_SEED;
    return JSON.parse(JSON.stringify(seed));
  }

  function applySeed(seed, extra) {
    extra = extra || {};
    state.doctor = extra.doctor || seed.doctor;
    state.owners = seed.owners;
    state.cats = seed.cats;
    state.records = extra.records || seed.records;
    state.archive = extra.archive || seed.archive;
    state.phrases = seed.phrases;
    state.overrideReasons = seed.overrideReasons;
    state.redlineRules = seed.redlineRules;
    state.planTemplate = seed.planTemplate;
    state.settings = extra.settings || seed.settings;
    state.plans = extra.plans || {};
    if (state.doctor) state.doctor.client_count = seed.owners.length;
  }

  function enterDemo() {
    state.demo = true;
    state.section = "todo";
    state.current = null;
    state.clientCurrent = null;
    state.askCurrent = null;
    state.reply = Object.assign({}, EMPTY_REPLY);
    var seed = cloneSeed();
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(DEMO_KEY) || "null"); } catch (e) {}
    applySeed(seed, saved || {});
    showWork();
  }

  function whyLine(rec) {
    if (isRedline(rec)) {
      return (rec.triggered_rules || []).map(ruleLabel).join(" · ") || "红线触发";
    }
    if (isFollowup(rec)) return "主人追问，挂在这条记录上";
    if (rec.type === "teeth" && rec.raw_scores && rec.raw_scores.suspected_tr) return "疑似牙吸收，须探诊";
    if (rec.type === "stool" && rec.raw_scores && rec.raw_scores.fecal_score === 4) return "4分·按观察处理";
    if (rec.type === "fgs" && rec.raw_scores) {
      var s = rec.raw_scores;
      var bits = [];
      if ((s.orbital_tightening || 0) >= 2) bits.push("眼部紧缩 2 分");
      if ((s.posture || 0) >= 2) bits.push("姿态 2 分");
      return bits.length ? bits.join(" + ") + " 拉高" : ("疼痛 " + (s.total || 0) + "/18");
    }
    if (rec.diagnosis) return String(rec.diagnosis).slice(0, 28);
    return typeLabel(rec.type);
  }

  function todoCardHtml(rec, extraCta) {
    var tier = rec.pain_level || "good";
    var cls = "todo-item is-" + tier + (state.current && state.current.id === rec.id ? " is-active" : "") +
      (isRedline(rec) ? " is-redline" : "");
    var cta = extraCta || (tier === "vet" ? "待处理" : (isFollowup(rec) ? "追问" : "待查看"));
    return '<button type="button" class="' + cls + '" data-record="' + escapeHtml(rec.id) + '">' +
      '<span class="todo-tier is-' + tier + '">' + escapeHtml(TIER_TEXT[tier] || "") + "</span>" +
      '<div class="todo-item-body"><div class="todo-item-title">' +
      escapeHtml((rec.cat_name || "猫咪") + " · " + typeLabel(rec.type)) + "</div>" +
      '<div class="todo-item-sub">' + escapeHtml((rec.owner_alias || "") + " · " + formatTime(rec.created_at)) + "</div>" +
      '<div class="todo-item-why">' + escapeHtml(whyLine(rec)) + "</div></div>" +
      '<span class="todo-item-cta">' + escapeHtml(cta) + "</span></button>";
  }

  function renderTodo() {
    updateTabCounts();
    var g = queueGroups();
    var action = actionableList();
    var list = $("todo-list");
    var loading = $("todo-loading");
    if (loading) loading.hidden = true;
    var progress = $("todo-progress");
    if (!(state.records || []).length) {
      progress.textContent = "";
      list.innerHTML = "";
      var empty = $("review-empty");
      var body = $("review-body");
      body.hidden = true;
      empty.hidden = false;
      $("review-pane").classList.remove("is-open");
      empty.querySelector("p").textContent = "今天还没有待办";
      empty.querySelector("span").textContent = "客户检测进来后，会按红 / 黄 / 绿排在这里。";
      return;
    }
    if (!action.length && !g.green.length) {
      progress.textContent = "";
      list.innerHTML = '<p class="doc-empty">队列空了</p>';
      renderCleared();
      return;
    }
    progress.textContent = action.length
      ? ("还剩 " + action.length + " 条要处理" + (g.green.length ? " · " + g.green.length + " 条绿档已折叠" : ""))
      : (g.green.length + " 条绿档，可一键已阅");
    var html = "";
    g.redline.concat(g.red).forEach(function (r) { html += todoCardHtml(r, isRedline(r) ? "红线 · 置顶" : "待处理"); });
    g.follow.forEach(function (r) { html += todoCardHtml(r, "新追问"); });
    g.yellow.forEach(function (r) { html += todoCardHtml(r, "待查看"); });
    if (g.green.length) {
      html += '<div class="green-fold"><div class="green-fold-head"><div><strong>' +
        g.green.length + " 条绿档</strong><span>正常，折叠不打扰</span></div>" +
        '<div class="green-fold-actions">' +
        '<button type="button" class="doc-btn-ghost" id="btn-toggle-green">' +
        (state.greenOpen ? "收起" : "展开") + "</button>" +
        '<button type="button" class="doc-btn-primary is-compact" id="btn-read-greens">全部已阅</button>' +
        "</div></div>";
      if (state.greenOpen) {
        html += '<div class="green-fold-list">' + g.green.map(function (r) {
          return todoCardHtml(r, "已阅也可点开");
        }).join("") + "</div>";
      }
      html += "</div>";
    }
    list.innerHTML = html;
    if (!state.current) renderReviewEmpty();
    else renderReview();
  }

  function renderCleared() {
    $("review-empty").hidden = true;
    $("review-body").hidden = false;
    $("review-pane").classList.add("is-open");
    $("review-body").innerHTML =
      '<div class="cleared-state"><div class="cleared-mark">✓</div>' +
      "<p>今日已清空</p><span>红黄都处理完了，绿档也已阅。可以去看客户档案。</span></div>";
  }

  function renderReviewEmpty() {
    var empty = $("review-empty");
    var body = $("review-body");
    var pane = $("review-pane");
    body.hidden = true;
    empty.hidden = false;
    pane.classList.remove("is-open");
    var p = empty.querySelector("p");
    var span = empty.querySelector("span");
    if (p) p.textContent = "从左侧点开一条";
    if (span) span.textContent = "红档先看，黄档待查看，绿档折叠不打扰。";
  }

  function photosHtml(photos) {
    photos = (photos || []).slice(0, 4);
    if (!photos.length) return "";
    var cols = Math.min(2, photos.length);
    return '<div class="review-photos" style="grid-template-columns:repeat(' + cols + ',1fr)">' +
      photos.map(function (p) {
        var src = photoSrc(p.path);
        return '<div class="review-photo" data-preview="' + escapeHtml(src) + '">' +
          '<img src="' + escapeHtml(src) + '" alt="" data-preview="' + escapeHtml(src) + '">' +
          (p.when ? "<span>" + escapeHtml(p.when) + "</span>" : "") + "</div>";
      }).join("") + "</div>";
  }

  function dimBarsHtml(pairs, scores) {
    return pairs.map(function (pair) {
      var v = Number((scores && scores[pair[0]]) || 0);
      var hot = v >= 2;
      var pct = Math.max(6, Math.round((v / 2) * 100));
      return '<div class="dim-bar-row' + (hot ? " is-hot" : "") + '">' +
        '<span class="dim-bar-name">' + escapeHtml(pair[1]) + "</span>" +
        '<div class="dim-bar-track"><div class="dim-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="dim-bar-val">' + v + "/2</span></div>";
    }).join("");
  }

  function reasonHtml(rec) {
    var type = rec.type || "fgs";
    var s = rec.raw_scores || {};
    var tier = rec.pain_level || "good";
    var html = '<section class="reason-box"><h3>进档理由</h3>';
    if (type === "fgs") {
      html += '<div class="reason-hero is-' + tier + '"><strong>' + (s.total || 0) +
        "<em>/18</em></strong><span>" + escapeHtml(TIER_TEXT[tier] + " · 18 分制") + "</span></div>";
      html += '<div class="dim-group-label">面部 5 项</div>' + dimBarsHtml(FGS_FACE, s);
      html += '<div class="dim-group-label">体态 4 项</div>' + dimBarsHtml(FGS_BODY, s);
      if (s.brachy_adjusted) {
        html += '<div class="brachy-note">扁脸基线已修正。这次拉高的是高分项，不是品种脸型。</div>';
      }
    } else if (type === "teeth") {
      var gi = s.gi || 0;
      var ci = s.ci || 0;
      html += '<div class="teeth-nums"><div class="teeth-num"><em>牙龈炎 GI</em><strong>' + gi +
        "</strong><span>/3</span></div><div class=\"teeth-num\"><em>牙结石 CI</em><strong>" + ci +
        "</strong><span>/3</span></div><div class=\"teeth-num\"><em>合计</em><strong>" + (gi + ci) +
        "</strong><span>GI+CI</span></div></div>";
      if (s.suspected_tr) {
        html += '<p class="forl-alert">疑似牙吸收（FORL/TR）——必须探诊确认</p>';
      }
    } else if (type === "stool") {
      var fs = s.fecal_score || 0;
      html += '<div class="reason-hero is-' + tier + '"><strong>' + fs +
        "<em>/7</em></strong><span>普瑞纳分</span></div>";
      var recent = s.recent || [fs];
      html += '<div class="dim-group-label">近 5 次分数</div><div class="spark-row">' +
        recent.map(function (n, i) {
          var last = i === recent.length - 1;
          var hot = n >= 6 || n <= 1;
          var h = Math.max(8, Math.round((n / 7) * 44));
          return '<div class="spark-col' + (last ? " is-last" : "") + (hot ? " is-hot" : "") +
            '"><i style="height:' + h + 'px"></i><span>' + n + "</span></div>";
        }).join("") + "</div>";
      if (fs === 4 && tier === "observe") {
        html += '<div class="rule-tags"><span class="rule-tag">4分·按观察处理</span></div>';
      }
    } else if (type === "vomit") {
      var tags = [
        { k: "颜色", v: s.color, hot: /血|咖啡/.test(s.color || "") },
        { k: "内容物", v: s.content, hot: /异物/.test(s.content || "") },
        { k: "类型", v: s.event, hot: false },
        { k: "24h 次数", v: s.count_24h != null ? (s.count_24h + " 次") : "", hot: (s.count_24h || 0) >= 3 }
      ];
      html += '<div class="feature-tags">' + tags.filter(function (t) { return t.v; }).map(function (t) {
        return '<span class="feature-tag' + (t.hot ? " is-hot" : "") + '">' +
          escapeHtml(t.k + " · " + t.v) + "</span>";
      }).join("") + "</div>";
    } else if (type === "postop") {
      html += '<div class="wound-rule"><strong>分型：</strong>' +
        escapeHtml(s.wound_label || s.wound_type || "未分型") + "</div>";
      (s.rules || []).forEach(function (line) {
        html += '<div class="wound-rule">' + escapeHtml(line) + "</div>";
      });
    }
    var rules = rec.triggered_rules || [];
    if (rules.length && type !== "stool") {
      html += '<div class="rule-tags" style="margin-top:0.7rem">' + rules.map(function (k) {
        return '<span class="rule-tag' + (ruleHot(k) ? " is-hot" : "") + '">' + escapeHtml(ruleLabel(k)) + "</span>";
      }).join("") + "</div>";
    } else if (rules.length && type === "stool") {
      html += '<div class="rule-tags" style="margin-top:0.55rem">' + rules.map(function (k) {
        return '<span class="rule-tag' + (ruleHot(k) ? " is-hot" : "") + '">' + escapeHtml(ruleLabel(k)) + "</span>";
      }).join("") + "</div>";
    }
    if (rec.diagnosis) {
      html += '<div class="detail-text" style="margin-top:0.7rem">' + escapeHtml(rec.diagnosis) + "</div>";
    }
    html += "</section>";
    return html;
  }

  function historyCompareHtml(rec) {
    var rows = allRecords().filter(function (r) {
      return r.cat_id === rec.cat_id && r.type === rec.type && r.id !== rec.id;
    }).sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); }).slice(0, 4);
    var html = '<section class="reason-box"><h3>历史对比</h3>';
    if (!rows.length) {
      html += '<p class="doc-empty" style="padding:0.6rem 0">这只猫还没有同类型的更早记录</p></section>';
      return html;
    }
    html += '<div class="history-list">' + rows.map(function (r) {
      var photo = r.photos && r.photos[0] ? photoSrc(r.photos[0].path) : "";
      var sum = whyLine(r);
      if (r.type === "stool" && r.raw_scores) sum = "普瑞纳 " + (r.raw_scores.fecal_score || 0) + "/7";
      if (r.type === "fgs" && r.raw_scores) sum = "疼痛 " + (r.raw_scores.total || 0) + "/18";
      if (r.type === "teeth" && r.raw_scores) sum = "GI " + (r.raw_scores.gi || 0) + " · CI " + (r.raw_scores.ci || 0);
      var stamp = r.doctor_action ? '<span class="history-current-tag">医生已回</span>' : "";
      return '<div class="history-card"><div class="history-card-head">' +
        (photo ? '<img class="history-thumb" src="' + escapeHtml(photo) + '" alt="" data-preview="' + escapeHtml(photo) + '">' : '<div class="history-thumb"></div>') +
        '<div class="history-meta"><div class="history-meta-row">' + stamp + "</div>" +
        '<span class="history-summary">' + escapeHtml(sum) + "</span>" +
        '<span class="history-date">' + escapeHtml(formatTime(r.created_at) + " · " + (TIER_TEXT[r.pain_level] || "")) +
        "</span></div></div></div>";
    }).join("") + "</div></section>";
    return html;
  }

  function ctxHtml(ctx) {
    if (!ctx || typeof ctx !== "object") return "";
    var keys = Object.keys(ctx).filter(function (k) { return ctx[k]; });
    if (!keys.length) return "";
    var labels = {
      photo_state: "拍照时", appetite: "食欲", water: "饮水", activity: "活动量",
      stool: "便便", abnormal: "异常", vomit_event_type: "事件类型",
      wound_type: "伤口来源", postop_day: "术后第几天", surgery_type: "手术",
      surgery_name: "具体手术"
    };
    return '<section class="reason-box"><h3>主人填写</h3><div class="ctx-list">' +
      keys.map(function (k) {
        return '<div class="ctx-item"><span class="ctx-item-label">' + escapeHtml(labels[k] || k) +
          '</span><span class="ctx-item-value">' + escapeHtml(ctx[k]) + "</span></div>";
      }).join("") + "</div></section>";
  }

  function threadClosed(rec) {
    var thread = rec.thread || [];
    var last = 0;
    thread.forEach(function (m) {
      if (m.role === "doctor" || m.role === "owner") last = Math.max(last, m.at || 0);
    });
    if (!last) last = rec.created_at || 0;
    if (Date.now() / 1000 - last > 48 * 3600) return "timeout";
    var doctorAt = 0;
    thread.forEach(function (m) {
      if (m.role === "doctor" && m.kind !== "supplement") doctorAt = Math.max(doctorAt, m.at || 0);
    });
    var ownerRounds = 0;
    thread.forEach(function (m) {
      if (m.role === "owner" && (m.at || 0) > doctorAt) ownerRounds += 1;
    });
    if (ownerRounds >= 2 && rec.doctor_action) return "rounds";
    return "";
  }

  function threadHtml(rec) {
    var thread = rec.thread || [];
    var html = '<section class="reason-box"><h3>记录上的对话</h3><div class="thread-list">';
    if (!thread.length) {
      html += '<div class="thread-msg is-system"><div class="thread-text">还没有对话。你的回复会挂在这条记录上，不是另开聊天窗。</div></div>';
    }
    thread.forEach(function (m) {
      var who = m.role === "owner" ? (rec.owner_alias || "主人")
        : m.role === "doctor" ? ((m.kind === "supplement" ? "补充说明" : "你的回复") + (m.locked ? " · 不可改" : ""))
        : "系统";
      html += '<div class="thread-msg is-' + escapeHtml(m.role) + '"><div class="thread-who">' +
        escapeHtml(who + " · " + formatTime(m.at)) + '</div><div class="thread-text">' +
        escapeHtml(m.text) + "</div></div>";
    });
    html += "</div>";
    var closed = threadClosed(rec);
    if (closed) {
      html += '<div class="thread-exits"><span class="thread-exit">拍新检测</span>' +
        '<span class="thread-exit">发起问诊</span><span class="thread-exit">来院</span></div>' +
        '<p class="doc-empty" style="padding:0.5rem 0 0">已' +
        (closed === "timeout" ? "超过 48 小时" : "满 2 轮追问") + "，出口只有上面三个。</p>";
    } else if (rec.doctor_action) {
      html += '<div class="reply-field" style="margin-top:0.7rem"><div class="reply-field-head">' +
        '<span class="reply-opt">不限次</span><span class="reply-field-label">＋补充说明</span></div>' +
        '<textarea class="reply-input" id="reply-supplement" maxlength="300" placeholder="补充不会覆盖原回复，留痕不可改"></textarea>' +
        '<button type="button" class="doc-btn-ghost" id="btn-supplement" style="margin-top:0.5rem">写下补充</button></div>';
    }
    html += "</section>";
    return html;
  }

  function phrasesFor(type) {
    var map = state.phrases || {};
    return map[type] || map.fgs || [];
  }

  function replyHtml(rec) {
    if (rec.done && rec.doctor_action) {
      var a = rec.doctor_action;
      var line = a.level === "green" ? LEVEL_LINES.green
        : a.level === "red" ? LEVEL_LINES.red
        : yellowJudgmentLine(a.yellowDays || "2");
      return '<section class="reply-section"><h3>已回复</h3>' +
        '<div class="answered-card"><div class="answered-block"><span class="answered-label">我的判断</span>' +
        '<div class="answered-judgment is-' + escapeHtml(a.level) + '">' + escapeHtml(line) + "</div></div>" +
        (a.action ? '<div class="answered-block"><span class="answered-label">观察 / 就医</span><div class="answered-text">' +
          escapeHtml(a.action) + "</div></div>" : "") +
        (a.note ? '<div class="answered-block"><span class="answered-label">补充</span><div class="answered-text">' +
          escapeHtml(a.note) + "</div></div>" : "") +
        "</div></section>";
    }
    var form = state.reply;
    var phrases = phrasesFor(rec.type);
    var html = '<section class="reply-section"><h3>三键回复</h3><div class="tri-keys">';
    html += '<button type="button" class="tri-key' + (form.level === "green" ? " is-green" : "") +
      '" data-level="green">在家观察</button>';
    html += '<button type="button" class="tri-key' + (form.level === "yellow" ? " is-yellow" : "") +
      '" data-level="yellow">建议来院</button>';
    html += '<button type="button" class="tri-key' + (form.level === "red" ? " is-red" : "") +
      '" data-level="red">请来院</button></div>';
    if (form.level === "yellow") {
      html += '<div class="days-row"><span class="days-label">几天内来院</span><div class="days-chips">';
      html += DAY_OPTIONS.map(function (d) {
        return '<button type="button" class="days-chip' + (form.yellowDays === d ? " is-active" : "") +
          '" data-days="' + d + '">' + d + "天</button>";
      }).join("") + "</div></div>";
    }
    if (phrases.length) {
      html += '<div class="quick-chips" style="margin-top:0.75rem">' + phrases.map(function (line, i) {
        return '<button type="button" class="quick-chip" data-quick="' + i + '">' + escapeHtml(line) + "</button>";
      }).join("") + "</div>";
    }
    html += '<textarea class="reply-input" id="reply-action" maxlength="120" placeholder="一句话：观察重点或来院做什么">' +
      escapeHtml(form.action) + "</textarea>";
    html += '<textarea class="reply-input" id="reply-note" maxlength="300" placeholder="可选补充，最多 300 字" style="margin-top:0.5rem;min-height:64px">' +
      escapeHtml(form.note) + "</textarea>";
    html += '<button type="button" class="doc-btn-primary reply-submit" id="btn-submit-reply"' +
      (state.submitting ? " disabled" : "") + ">" +
      (state.submitting ? "提交中..." : "发送并下一条") + "</button></section>";
    return html;
  }

  function reviewHtml(rec) {
    var cat = findCat(rec.cat_id) || { name: rec.cat_name, breed: "", gender: "", neutered: 0 };
    var age = catAgeText(cat.birth_date);
    var meta = [cat.breed || "品种未填", genderText(cat.gender), cat.neutered ? "已绝育" : "未绝育"];
    if (age) meta.push(age);
    if (cat.weight) meta.push(cat.weight + " kg");
    var tier = rec.pain_level || "good";
    var html = '<div class="review-close-bar"><strong>' + escapeHtml((rec.cat_name || "猫咪") + " · " + typeLabel(rec.type)) +
      '</strong><button type="button" class="doc-btn-ghost" id="btn-close-review">返回队列</button></div>';
    html += '<div class="doc-detail"><div class="detail-head">' +
      '<img class="detail-cat-avatar" src="' + escapeHtml(catAvatar(cat)) + '" alt="">' +
      "<div><div class=\"detail-cat-name\">" + escapeHtml(rec.cat_name || "猫咪") + "</div>" +
      '<div class="detail-cat-meta">' + escapeHtml(meta.join(" · ")) + " · 主人 " +
      escapeHtml(rec.owner_alias || "") + "</div>";
    if (rec.owner_phone) {
      html += '<a class="phone-btn" href="tel:' + escapeHtml(rec.owner_phone) + '">打电话给主人</a>';
    }
    html += "</div></div>";
    html += '<div class="review-tier-row"><span class="review-tier-badge is-' + tier + '">' +
      escapeHtml((TIER_TEXT[tier] || "") + " · " + (isRedline(rec) ? "红线触发" : TIER_HINT[tier])) +
      '</span><button type="button" class="override-link" id="btn-open-override">调整档位</button></div>';
    if (rec.doctor_override) {
      html += '<div class="override-note">已从 ' + escapeHtml(TIER_TEXT[rec.doctor_override.from] || "") +
        " 改为 " + escapeHtml(TIER_TEXT[rec.doctor_override.to] || "") +
        " · " + escapeHtml(rec.doctor_override.reason_label || "") + "</div>";
    }
    html += photosHtml(rec.photos);
    html += reasonHtml(rec);
    html += ctxHtml(rec.cat_context);
    html += historyCompareHtml(rec);
    html += threadHtml(rec);
    html += replyHtml(rec);
    html += '<div class="urgent-foot">情况紧急？不要等回复，直接就医。</div></div>';
    return html;
  }

  function reviewMount() {
    if (state.fromAsk) {
      return { empty: $("ask-detail-empty"), body: $("ask-detail-body"), pane: $("ask-detail-pane") };
    }
    return { empty: $("review-empty"), body: $("review-body"), pane: $("review-pane") };
  }

  function renderReview() {
    var rec = state.current;
    var mount = reviewMount();
    if (!rec) {
      if (mount.body) mount.body.hidden = true;
      if (mount.empty) mount.empty.hidden = false;
      if (mount.pane) mount.pane.classList.remove("is-open");
      return;
    }
    if (mount.empty) mount.empty.hidden = true;
    if (mount.body) {
      mount.body.hidden = false;
      mount.body.innerHTML = reviewHtml(rec);
    }
    if (mount.pane) mount.pane.classList.add("is-open");
  }

  function openReview(id, fromAsk) {
    var rec = findRecord(id);
    if (!rec) return;
    state.current = rec;
    state.fromAsk = !!fromAsk;
    state.reply = Object.assign({}, EMPTY_REPLY);
    if (fromAsk) {
      state.askCurrent = rec;
      renderAsk();
    } else {
      renderTodo();
    }
    renderReview();
  }

  function closeReview() {
    var id = state.current && state.current.id;
    state.current = null;
    state.reply = Object.assign({}, EMPTY_REPLY);
    if (state.fromAsk) {
      state.fromAsk = false;
      state.askCurrent = null;
      renderAsk();
      return;
    }
    renderTodo();
    if (id) {
      var el = document.querySelector('[data-record="' + id + '"]');
      if (el) el.classList.remove("is-active");
    }
  }

  function submitReply() {
    if (state.submitting || !state.current) return;
    var form = state.reply;
    if (!form.level) return toast("先点一个键：观察 / 建议来院 / 请来院");
    if (form.level === "yellow") {
      var days = parseInt(form.yellowDays, 10);
      if (!days) return toast("选一下几天内来院");
    }
    if (!(form.action || "").trim()) return toast("用上面的短语，或写一句给主人");
    var rec = state.current;
    var comment = composeDoctorComment(form);
    if (state.demo) {
      rec.done = true;
      rec.unread_owner = false;
      rec.kind = "record";
      rec.doctor_action = {
        level: form.level,
        yellowDays: form.yellowDays,
        action: (form.action || "").trim(),
        note: (form.note || "").trim(),
        at: Math.floor(Date.now() / 1000)
      };
      rec.thread = rec.thread || [];
      rec.thread.push({
        id: "doc-" + Date.now(),
        role: "doctor",
        text: comment,
        at: rec.doctor_action.at,
        locked: true
      });
      persistDemo();
      toast(form.level === "red" ? "已请来院，下一条" : "已发送，下一条");
      var next = nextActionable(rec.id);
      state.reply = Object.assign({}, EMPTY_REPLY);
      if (next) openReview(next.id, state.fromAsk);
      else {
        state.current = null;
        if (state.fromAsk) renderAsk();
        else renderTodo();
      }
      return;
    }
    if (rec.consultation_id) {
      state.submitting = true;
      renderReview();
      api("/api/v1/doctor/consultations/" + encodeURIComponent(rec.consultation_id) + "/reply", "POST", { comment: comment })
        .then(function () {
          state.submitting = false;
          rec.done = true;
          toast("回复已发送");
          var next = nextActionable(rec.id);
          if (next) openReview(next.id);
          else {
            state.current = null;
            loadTodo();
          }
        })
        .catch(function (err) {
          state.submitting = false;
          renderReview();
          if (handleAuthError(err)) return;
          toast(networkMessage(err, "提交失败"));
        });
      return;
    }
    rec.done = true;
    toast("这条没有问诊单，已在本地标为已处理");
    var nxt = nextActionable(rec.id);
    if (nxt) openReview(nxt.id);
    else {
      state.current = null;
      renderTodo();
    }
  }

  function markGreensRead() {
    (state.records || []).forEach(function (r) {
      if (!r.done && r.pain_level === "good") r.done = true;
    });
    persistDemo();
    toast("绿档已全部已阅");
    if (state.current && state.current.pain_level === "good") state.current = null;
    renderTodo();
  }

  function openOverride() {
    if (!state.current) return;
    var cur = state.current.pain_level || "good";
    var order = ["vet", "observe", "good"];
    var idx = order.indexOf(cur);
    var lowers = order.slice(idx + 1);
    if (!lowers.length) return toast("已经是绿档，不能再往下调");
    state.overrideDraft = { level: lowers[0], reason: "" };
    var box = $("override-levels");
    box.innerHTML = lowers.map(function (lv) {
      return '<button type="button" class="level-item' + (state.overrideDraft.level === lv ? " is-" + (lv === "good" ? "green" : lv === "observe" ? "yellow" : "red") : "") +
        '" data-override-level="' + lv + '"><span></span><span>改为' + TIER_TEXT[lv] +
        (lv === "good" ? "（正常）" : lv === "observe" ? "（待查看）" : "") + "</span></button>";
    }).join("");
    $("override-reasons").innerHTML = (state.overrideReasons || []).map(function (r) {
      return '<button type="button" class="doc-chip" data-override-reason="' + escapeHtml(r.id) + '">' +
        escapeHtml(r.label) + "</button>";
    }).join("");
    $("override-mask").hidden = false;
  }

  function paintOverrideModal() {
    document.querySelectorAll("#override-levels .level-item").forEach(function (btn) {
      var lv = btn.getAttribute("data-override-level");
      btn.className = "level-item" + (state.overrideDraft.level === lv
        ? (lv === "good" ? " is-green" : lv === "observe" ? " is-yellow" : " is-red")
        : "");
    });
    document.querySelectorAll("#override-reasons .doc-chip").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-override-reason") === state.overrideDraft.reason);
    });
  }

  function saveOverride() {
    var rec = state.current;
    if (!rec) return;
    if (!state.overrideDraft.level) return toast("选一个下调后的档位");
    if (!state.overrideDraft.reason) return toast("选一个改档原因");
    var reason = (state.overrideReasons || []).filter(function (r) {
      return r.id === state.overrideDraft.reason;
    })[0];
    rec.doctor_override = {
      from: rec.ai_pain_level || rec.pain_level,
      to: state.overrideDraft.level,
      reason: state.overrideDraft.reason,
      reason_label: reason ? reason.label : "",
      at: Math.floor(Date.now() / 1000)
    };
    rec.pain_level = state.overrideDraft.level;
    persistDemo();
    $("override-mask").hidden = true;
    toast("档位已改，这条会留下训练标注");
    renderTodo();
    renderReview();
  }

  function addSupplement() {
    var rec = state.current;
    if (!rec) return;
    var box = $("reply-supplement");
    var text = box ? String(box.value || "").trim() : "";
    if (!text) return toast("写一句补充");
    rec.thread = rec.thread || [];
    rec.thread.push({
      id: "sup-" + Date.now(),
      role: "doctor",
      kind: "supplement",
      text: text,
      at: Math.floor(Date.now() / 1000),
      locked: true
    });
    persistDemo();
    toast("补充已留下，不可改");
    renderReview();
  }

  function renderAsk() {
    updateTabCounts();
    var items = (state.records || []).filter(function (r) {
      return (r.thread || []).some(function (m) { return m.role === "owner"; });
    });
    var list = $("ask-list");
    var empty = $("ask-empty");
    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = "主人点「问医生」会落到最近一条记录的对话里。问诊单是下一期，现在先用记录线程。";
    } else {
      empty.hidden = true;
      list.innerHTML = items.map(function (r) {
        return todoCardHtml(r, r.unread_owner ? "待回" : "已回");
      }).join("");
    }
    if (state.askCurrent) {
      state.current = state.askCurrent;
      state.fromAsk = true;
      renderReview();
    } else {
      $("ask-detail-empty").hidden = false;
      $("ask-detail-body").hidden = true;
      $("ask-detail-pane").classList.remove("is-open");
    }
  }

  function demoStats() {
    var all = allRecords();
    var handled = all.filter(function (r) { return r.doctor_action; });
    var redYellow = all.filter(function (r) { return r.pain_level === "vet" || r.pain_level === "observe" || r.ai_pain_level === "vet" || r.ai_pain_level === "observe"; });
    var intercept = redYellow.length;
    var come = handled.filter(function (r) { return r.doctor_action && r.doctor_action.level === "red"; }).length;
    var override = all.filter(function (r) { return r.doctor_override; }).length;
    var actionable = all.filter(function (r) {
      return (r.ai_pain_level || r.pain_level) !== "good" || r.doctor_action;
    });
    return {
      intercept: intercept,
      come: come,
      override: override,
      overrideDen: Math.max(1, actionable.length),
      plans: Object.keys(state.plans || {}).length
    };
  }

  function renderSettings() {
    var info = state.doctor || {};
    var code = info.referral_code || "";
    var stats = state.demo ? demoStats() : null;
    var html = '<div class="settings-wrap">';
    if (stats) {
      html += '<section class="settings-card"><h3>今日仪表（演示）</h3><div class="settings-stat-grid">' +
        '<div class="settings-stat"><em>红黄拦截</em><strong>' + stats.intercept + "</strong></div>" +
        '<div class="settings-stat"><em>请来院发出</em><strong>' + stats.come + "</strong></div>" +
        '<div class="settings-stat"><em>跟诊计划</em><strong>' + stats.plans + "</strong></div>" +
        '<div class="settings-stat"><em>医生覆盖</em><strong>' + stats.override + "/" + stats.overrideDen + "</strong></div>" +
        "</div></section>";
    }
    html += '<section class="settings-card"><h3>推荐码</h3>';
    if (code) {
      html += '<div class="doc-referral-label">给你客户的推荐码</div><strong id="referral-code" style="font-size:1.5rem;letter-spacing:0.12em">' +
        escapeHtml(code) + "</strong>" +
        '<div class="doc-referral-hint" style="margin:0.35rem 0 0.7rem">他们用这个码进九龄猫，检测会回到你的「我的客户」。</div>' +
        '<div class="doc-toolbar-actions"><button type="button" class="doc-btn-ghost" id="btn-copy-code">复制推荐码</button>' +
        '<button type="button" class="doc-btn-ghost" id="btn-copy-link">复制链接</button></div>';
    } else {
      html += '<p class="doc-empty" style="padding:0.4rem 0">登录后可以看到你的推荐码。</p>';
    }
    html += "</section>";
    html += '<section class="settings-card"><h3>快捷短语 · 按检测类型预置</h3><p class="doc-modal-lead">先用这套，自定义短语下一期。</p>';
    ["fgs", "stool", "vomit", "teeth", "postop"].forEach(function (k) {
      html += '<div class="phrase-group"><h4>' + escapeHtml(typeLabel(k)) + "</h4><div class=\"quick-chips\">" +
        (phrasesFor(k).map(function (line) {
          return '<span class="quick-chip" style="cursor:default">' + escapeHtml(line) + "</span>";
        }).join("") || '<span class="doc-empty">暂无</span>') + "</div></div>";
    });
    html += "</section>";
    html += '<section class="settings-card"><h3>通知</h3>';
    [
      ["notify_red", "红档推送"],
      ["notify_yellow", "黄档提醒"],
      ["notify_followup", "主人追问"]
    ].forEach(function (row) {
      var on = !!(state.settings && state.settings[row[0]]);
      html += '<div class="toggle-row"><span>' + row[1] + '</span><button type="button" class="' +
        (on ? "is-on" : "") + '" data-toggle="' + row[0] + '">' + (on ? "开" : "关") + "</button></div>";
    });
    html += "</section></div>";
    $("pane-settings").innerHTML = html;
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

  function buildDemoClients() {
    var q = (state.clientSearch || "").trim();
    return (state.owners || []).map(function (o) {
      var oCats = (state.cats || []).filter(function (c) { return c.owner_id === o.id; });
      var pending = (state.records || []).filter(function (r) {
        return r.owner_id === o.id && !r.done && r.pain_level !== "good";
      }).length;
      return {
        user_id: o.id,
        alias: o.alias,
        nickname: o.nickname,
        avatar_url: "",
        cat_count: oCats.length,
        cat_names: oCats.map(function (c) { return c.name; }).join("、"),
        pending_count: pending,
        bound_at: o.bound_at,
        phone: o.phone
      };
    }).filter(function (c) {
      if (!q) return true;
      return (c.alias + c.nickname + c.cat_names).indexOf(q) >= 0;
    });
  }

  function loadClients() {
    if (state.demo) {
      $("client-loading").hidden = true;
      state.clients = buildDemoClients();
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

  function renderClients() {
    var list = $("client-list");
    var empty = $("client-empty");
    if (!state.clients.length) {
      list.innerHTML = "";
      empty.hidden = false;
      empty.textContent = state.clientSearch ? "没有匹配的客户" : "还没有诊所客户。到「设置」复制推荐码发给家长。";
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
            "<span>" + escapeHtml(sub) + "</span></div>" +
            (c.pending_count ? '<span class="doc-module-tag">待处理 ' + c.pending_count + "</span>" : "") +
          "</div></button>"
      );
    }).join("");
  }

  function demoClientDetail(userId) {
    var owner = findOwner(userId);
    var oCats = (state.cats || []).filter(function (c) { return c.owner_id === userId; });
    return {
      cat_count: oCats.length,
      user: {
        id: owner.id,
        nickname: owner.nickname,
        alias: owner.alias,
        display_name: owner.alias,
        avatar_url: "",
        bound_at: owner.bound_at,
        phone: owner.phone
      },
      cats: oCats.map(function (cat) {
        var scans = allRecords().filter(function (r) { return r.cat_id === cat.id; });
        var modules = {};
        ["fgs", "stool", "vomit", "teeth", "postop"].forEach(function (k) {
          var list = scans.filter(function (r) { return r.type === k; })
            .sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
          modules[k] = { count: list.length, last: list[0] || null };
        });
        return Object.assign({}, cat, { scan_count: scans.length, modules: modules, scans: scans });
      })
    };
  }

  function openClient(userId) {
    state.aliasEditing = false;
    if (state.demo) {
      state.clientCurrent = demoClientDetail(userId);
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

  function historySummaryFromRec(r) {
    if (!r) return "还没测过";
    if (r.type === "fgs" && r.raw_scores) return "疼痛 " + (r.raw_scores.total || 0) + "/18";
    if (r.type === "stool" && r.raw_scores) return "普瑞纳 " + (r.raw_scores.fecal_score || 0) + "/7";
    if (r.type === "teeth" && r.raw_scores) return "GI " + (r.raw_scores.gi || 0) + " · CI " + (r.raw_scores.ci || 0);
    if (r.type === "postop") return "伤口 " + (TIER_TEXT[r.pain_level] || r.pain_level || "");
    return typeLabel(r.type);
  }

  function lastSummary(last) {
    if (!last) return "还没测过";
    if (last.raw_scores) return historySummaryFromRec(last);
    if (last.module === "fgs" || last.total_score != null) return "疼痛 " + (last.total_score || 0) + "/18";
    if (last.module === "stool" || last.fecal_score != null) return "普瑞纳 " + (last.fecal_score || 0) + "/7";
    return "有记录";
  }

  function clientScanCardHtml(r) {
    var open = !!state.clientScanOpen[r.id];
    var photo = r.photos && r.photos[0] ? photoSrc(r.photos[0].path) : (r.image_path ? photoSrc(String(r.image_path).split(",")[0]) : "");
    var img = photo ? '<img class="history-thumb" src="' + escapeHtml(photo) + '" alt="">' : '<div class="history-thumb"></div>';
    var inner = '<button type="button" class="history-card-head" data-toggle-client-scan="' + escapeHtml(r.id) + '">' +
      img + '<div class="history-meta"><span class="history-summary">' + escapeHtml(historySummaryFromRec(r) || typeLabel(r.type || r.module)) + "</span>" +
      '<span class="history-date">' + escapeHtml(formatTime(r.created_at) + (r.doctor_action ? " · 医生已回" : "")) +
      "</span></div><span class=\"history-open-hint\">" + (open ? "收起" : "点开") +
      '</span><span class="history-arrow">›</span></button>';
    if (open) {
      inner += '<div class="history-detail">' + reasonHtml(r) +
        (r.doctor_action ? '<div class="answered-card"><div class="answered-text">' +
          escapeHtml(r.doctor_action.action || "") + "</div></div>" : "") +
        '<button type="button" class="doc-btn-ghost" data-open-record="' + escapeHtml(r.id) +
        '">在审阅页打开</button></div>';
    }
    return '<div class="history-card' + (open ? " is-open" : "") + '">' + inner + "</div>";
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
      "</div>";
    if (u.phone) html += '<a class="phone-btn" href="tel:' + escapeHtml(u.phone) + '">打电话</a>';
    html += "</div></div>";
    html += '<section class="detail-section"><h3>每只猫的五大检测</h3>';
    if (!cats.length) {
      html += '<p class="doc-empty">这位家长还没建猫咪档案</p>';
    } else {
      html += cats.map(function (cat) {
        var selected = state.clientCat && ((state.clientCat.cat && state.clientCat.cat.id) || state.clientCat.id) === cat.id;
        var meta = [cat.breed || "品种未填", cat.gender === "male" ? "公" : cat.gender === "female" ? "母" : "", cat.neutered ? "已绝育" : "未绝育"].filter(Boolean).join(" · ");
        var tiles = ["fgs", "stool", "vomit", "teeth", "postop"].map(function (k) {
          var st = (cat.modules && cat.modules[k]) || { count: 0, last: null };
          var count = Number(st.count || 0);
          var focus = selected && state.clientCatModule === k;
          return '<button type="button" class="module-tile' + (focus ? " is-active" : "") + (count ? "" : " is-empty") +
            '" data-cat="' + escapeHtml(cat.id) + '" data-module="' + k + '">' +
            "<strong>" + typeLabel(k) + "</strong>" +
            "<span>" + (count ? count + " 条" : "未测") + "</span>" +
            "<em>" + escapeHtml(count ? lastSummary(st.last) : "还没测过") + "</em></button>";
        }).join("");
        var panels = "";
        if (selected) {
          var scans = (state.clientCat && state.clientCat.scans) || cat.scans || [];
          var list = scans.filter(function (r) { return (r.type || r.module) === state.clientCatModule; })
            .sort(function (a, b) { return (b.created_at || 0) - (a.created_at || 0); });
          var label = typeLabel(state.clientCatModule);
          panels = '<div class="module-panel"><h4>' + escapeHtml(cat.name) + " · " + label + " · " + list.length + " 条</h4>";
          if (cat.medical_history) {
            panels += '<div class="detail-text">病史：' + escapeHtml(cat.medical_history) + "</div>";
          }
          if (state.plans[cat.id]) {
            panels += '<div class="plan-chip">已开 · ' + escapeHtml(state.plans[cat.id].name) + "</div>";
          } else if (cat.id === "c-zhima" || (cat.medical_history && /绝育|卵巢/.test(cat.medical_history))) {
            panels += '<button type="button" class="doc-btn-primary is-compact" id="btn-open-plan" data-plan-cat="' +
              escapeHtml(cat.id) + '" style="margin-top:0.55rem">开跟诊计划 · 绝育术后 14 天</button>';
          }
          if (!list.length) panels += '<p class="doc-empty">这只猫还没有' + label + "检测</p>";
          else panels += '<div class="history-list">' + list.map(clientScanCardHtml).join("") + "</div>";
          panels += "</div>";
        }
        return '<article class="cat-board' + (selected ? " is-open" : "") + '">' +
          '<button type="button" class="cat-board-head" data-cat="' + escapeHtml(cat.id) + '">' +
          "<strong>" + escapeHtml(cat.name) + "</strong>" +
          '<span class="client-meta">' + escapeHtml(meta) + "</span></button>" +
          '<div class="module-tiles">' + tiles + "</div>" + panels + "</article>";
      }).join("");
    }
    html += "</section></div>";
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
      var owner = findOwner(uid);
      if (owner) owner.alias = next;
      (state.records || []).forEach(function (r) {
        if (r.owner_id === uid) r.owner_alias = next;
      });
      persistDemo();
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

  function openPlanModal(catId) {
    state.planCatId = catId;
    var cat = findCat(catId) || { name: "猫咪" };
    var tpl = state.planTemplate;
    $("plan-lead").textContent = (cat.name || "猫咪") + " · " + (tpl && tpl.name ? tpl.name : "绝育术后 14 天") +
      "。主人会按节点收到拍照提醒。";
    $("plan-body").innerHTML = ((tpl && tpl.items) || []).map(function (it) {
      return '<div class="plan-step"><strong>' + escapeHtml(it.title) + "</strong><span>" +
        escapeHtml(it.text) + "</span></div>";
    }).join("");
    $("plan-mask").hidden = false;
  }

  function savePlan() {
    if (!state.planCatId) return;
    var tpl = state.planTemplate || { id: "neuter-14", name: "绝育术后 14 天" };
    state.plans[state.planCatId] = {
      id: tpl.id,
      name: tpl.name,
      at: Math.floor(Date.now() / 1000)
    };
    persistDemo();
    $("plan-mask").hidden = true;
    toast("计划已发给主人（示例，不会真的推送）");
    renderClientDetail();
  }

  function mapInboxCard(card) {
    var tier = card.tier || "good";
    var blob = String(card.badge || "") + String(card.summary || "");
    return {
      id: card.id,
      cat_id: card.cat_id || card.id,
      owner_id: card.user_id || "",
      cat_name: card.cat_name,
      owner_alias: card.owner_alias || card.owner_nickname || "",
      type: card.module || "fgs",
      pain_level: tier,
      ai_pain_level: tier,
      triggered_rules: /带血/.test(blob) ? ["blood"] : (/尿闭/.test(blob) ? ["systemic"] : []),
      is_redline: /带血|尿闭|红线|急诊/.test(blob),
      raw_scores: {},
      photos: card.photos || [],
      diagnosis: card.summary || "",
      advice: "",
      cat_context: {},
      created_at: (card.photos && card.photos[0] && card.photos[0].created_at) || 0,
      doctor_action: null,
      doctor_override: null,
      thread: card.consultation_id ? [{
        id: "sys-" + card.id,
        role: "system",
        text: "主人从结果页点了「问医生」。",
        at: (card.photos && card.photos[0] && card.photos[0].created_at) || 0
      }] : [],
      unread_owner: !!card.consultation_id,
      kind: card.consultation_id ? "followup" : "record",
      done: false,
      consultation_id: card.consultation_id || "",
      user_id: card.user_id || ""
    };
  }

  function loadTodo() {
    if (state.demo) {
      renderTodo();
      return;
    }
    $("todo-loading").hidden = false;
    return api("/api/v1/doctor/inbox").then(function (res) {
      var rows = [];
      ((res && res.buckets) || []).forEach(function (b) {
        (b.cards || []).forEach(function (card) {
          rows.push(mapInboxCard(card));
        });
      });
      state.records = rows;
      $("todo-loading").hidden = true;
      renderTodo();
    }).catch(function (err) {
      $("todo-loading").hidden = true;
      if (handleAuthError(err)) return;
      toast(networkMessage(err, "加载待办失败"));
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
    if (state.demo) return;
    api("/api/v1/doctor/quick-replies").then(function (res) {
      var list = (res && res.replies) || [];
      if (!list.length) return;
      state.phrases = {
        fgs: list.slice(0, 3),
        stool: list.slice(0, 3),
        vomit: list.slice(0, 3),
        teeth: list.slice(0, 3),
        postop: list.slice(0, 3)
      };
    }).catch(function () {});
  }

  function startRefresh() {
    stopRefresh();
    if (state.demo) return;
    state.refreshTimer = setInterval(function () {
      if (document.hidden || $("view-work").hidden) return;
      if (state.section === "todo") loadTodo();
      else if (state.section === "clients") loadClients();
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

  function relativeUploadPath(url) {
    var abs = String(url || "");
    if (abs.indexOf(API_BASE) === 0) return abs.slice(API_BASE.length);
    return abs;
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
    if (state.demo) {
      state.doctor = Object.assign({}, state.doctor, payload);
      persistDemo();
      renderToolbar();
      closeProfile();
      toast("示例资料已更新（不会写入服务器）");
      return;
    }
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
    if (state.demo) return toast("示例模式不上传头像");
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

  function onReviewClick(e) {
    var preview = e.target.getAttribute("data-preview");
    if (preview) {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(preview);
      return;
    }
    if (e.target.id === "btn-close-review") {
      closeReview();
      return;
    }
    if (e.target.id === "btn-open-override") {
      openOverride();
      return;
    }
    if (e.target.id === "btn-submit-reply") {
      submitReply();
      return;
    }
    if (e.target.id === "btn-supplement") {
      addSupplement();
      return;
    }
    var levelBtn = e.target.closest("[data-level]");
    if (levelBtn) {
      state.reply.level = levelBtn.getAttribute("data-level");
      renderReview();
      return;
    }
    var dayBtn = e.target.closest("[data-days]");
    if (dayBtn) {
      state.reply.yellowDays = dayBtn.getAttribute("data-days");
      renderReview();
      return;
    }
    var quick = e.target.closest("[data-quick]");
    if (quick && state.current) {
      var idx = Number(quick.getAttribute("data-quick"));
      var list = phrasesFor(state.current.type);
      state.reply.action = list[idx] || state.reply.action;
      renderReview();
    }
  }

  function onReviewInput(e) {
    if (e.target.id === "reply-action") state.reply.action = e.target.value;
    if (e.target.id === "reply-note") state.reply.note = e.target.value;
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
          state.demo = false;
          state.section = "todo";
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
        state.current = null;
        state.fromAsk = false;
        showSection(section);
      });
    });

    $("todo-list").addEventListener("click", function (e) {
      if (e.target.id === "btn-read-greens") {
        markGreensRead();
        return;
      }
      if (e.target.id === "btn-toggle-green") {
        state.greenOpen = !state.greenOpen;
        renderTodo();
        return;
      }
      var card = e.target.closest("[data-record]");
      if (!card) return;
      openReview(card.getAttribute("data-record"), false);
    });

    $("review-body").addEventListener("click", onReviewClick);
    $("review-body").addEventListener("input", onReviewInput);
    $("ask-detail-body").addEventListener("click", onReviewClick);
    $("ask-detail-body").addEventListener("input", onReviewInput);

    $("ask-list").addEventListener("click", function (e) {
      var card = e.target.closest("[data-record]");
      if (!card) return;
      openReview(card.getAttribute("data-record"), true);
    });

    $("btn-refresh").addEventListener("click", function () {
      if (state.section === "todo") {
        if (state.demo) renderTodo();
        else loadTodo();
      } else if (state.section === "clients") loadClients();
      else if (state.section === "ask") renderAsk();
      else renderSettings();
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
      var planBtn = e.target.closest("[data-plan-cat]");
      if (planBtn) {
        openPlanModal(planBtn.getAttribute("data-plan-cat"));
        return;
      }
      var openRec = e.target.closest("[data-open-record]");
      if (openRec) {
        showSection("todo");
        openReview(openRec.getAttribute("data-open-record"), false);
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
        var catId = catBtn.getAttribute("data-cat");
        var wantMod = catBtn.getAttribute("data-module") || "";
        if (state.demo) {
          var cat = (state.clientCurrent.cats || []).filter(function (c) { return c.id === catId; })[0];
          var scans = ((cat && cat.scans) || []).slice().sort(function (a, b) {
            return (b.created_at || 0) - (a.created_at || 0);
          });
          state.clientCat = cat ? { cat: cat, scans: scans } : null;
          state.clientCatModule = wantMod || (scans[0] && (scans[0].type || scans[0].module)) || "stool";
          renderClientDetail();
          return;
        }
        if (state.clientCat && state.clientCat.cat && state.clientCat.cat.id === catId) {
          if (wantMod) state.clientCatModule = wantMod;
          renderClientDetail();
          return;
        }
        var uid2 = state.clientCurrent.user.id;
        api("/api/v1/doctor/clients/" + encodeURIComponent(uid2) + "/cats/" + encodeURIComponent(catId))
          .then(function (res) {
            state.clientCat = res;
            var scans = ((res && res.scans) || []).map(function (s) {
              s.type = s.module || s.type;
              return s;
            });
            if (state.clientCat) state.clientCat.scans = scans;
            if (wantMod) state.clientCatModule = wantMod;
            else state.clientCatModule = (scans[0] && (scans[0].type || scans[0].module)) || "fgs";
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

    $("pane-settings").addEventListener("click", function (e) {
      if (e.target.id === "btn-copy-code") {
        copyText((state.doctor && state.doctor.referral_code) || "", "推荐码已复制");
        return;
      }
      if (e.target.id === "btn-copy-link") {
        copyText((state.doctor && state.doctor.referral_url) || "", "链接已复制，发给诊所客户");
        return;
      }
      var tog = e.target.closest("[data-toggle]");
      if (tog) {
        var key = tog.getAttribute("data-toggle");
        state.settings[key] = !state.settings[key];
        persistDemo();
        renderSettings();
      }
    });

    $("btn-edit-profile").addEventListener("click", openProfile);
    $("btn-toolbar-avatar").addEventListener("click", openProfile);
    $("btn-logout").addEventListener("click", function () {
      var msg = state.demo ? "退出示例界面？" : "退出登录？会返回登录页";
      if (window.confirm(msg)) {
        if (state.demo) {
          try { sessionStorage.removeItem(DEMO_KEY); } catch (err) {}
        }
        state.demo = false;
        state.section = "todo";
        state.current = null;
        state.records = [];
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

    $("btn-override-cancel").addEventListener("click", function () {
      $("override-mask").hidden = true;
    });
    $("override-mask").addEventListener("click", function (e) {
      if (e.target === $("override-mask")) $("override-mask").hidden = true;
    });
    $("override-levels").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-override-level]");
      if (!btn) return;
      state.overrideDraft.level = btn.getAttribute("data-override-level");
      paintOverrideModal();
    });
    $("override-reasons").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-override-reason]");
      if (!btn) return;
      state.overrideDraft.reason = btn.getAttribute("data-override-reason");
      paintOverrideModal();
    });
    $("btn-override-save").addEventListener("click", saveOverride);

    $("btn-plan-cancel").addEventListener("click", function () {
      $("plan-mask").hidden = true;
    });
    $("plan-mask").addEventListener("click", function (e) {
      if (e.target === $("plan-mask")) $("plan-mask").hidden = true;
    });
    $("btn-plan-save").addEventListener("click", savePlan);

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
      if (e.key !== "Escape") return;
      $("lightbox").hidden = true;
      if (!$("profile-mask").hidden) closeProfile();
      else if (!$("override-mask").hidden) $("override-mask").hidden = true;
      else if (!$("plan-mask").hidden) $("plan-mask").hidden = true;
      else if (state.current && window.matchMedia("(max-width: 860px)").matches) closeReview();
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
      state.section = "todo";
      showWork();
      loadMe();
      loadQuickReplies();
    } else {
      showLogin();
    }
  }

  boot();
})();
