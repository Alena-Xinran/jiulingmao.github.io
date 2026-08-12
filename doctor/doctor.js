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
    profile: { name: "", title: "", gender: "female", avatar_url: "" },
    refreshTimer: null,
    clients: [],
    clientCurrent: null,
    clientCat: null,
    clientSearch: ""
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
    if (section === "clients") {
      loadClients();
    } else {
      closeDetail();
      loadList();
    }
  }

  function loadClients() {
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
    api("/api/v1/doctor/clients/" + encodeURIComponent(userId)).then(function (res) {
      state.clientCurrent = res;
      state.clientCat = null;
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
    var html = '<div class="detail-close-bar"><strong>客户档案</strong>' +
      '<button type="button" class="doc-btn-ghost" id="btn-close-client">关闭</button></div>' +
      '<div class="doc-detail"><div class="detail-head">' +
      '<img class="detail-cat-avatar" src="' + escapeHtml(u.avatar_url ? uploadUrl(u.avatar_url) : avatarFallback(u.display_name, "doctor")) + '" alt="">' +
      "<div><div class=\"detail-cat-name\">" + escapeHtml(u.display_name || u.nickname || "用户") + "</div>" +
      '<div class="detail-cat-meta">家长 ' + escapeHtml(u.nickname || "") +
      " · 名下 " + (state.clientCurrent.cat_count || 0) + " 只猫 · 绑定于 " + escapeHtml(formatTime(u.bound_at)) +
      "</div></div></div>";
    html += '<section class="detail-section"><h3>给你看的备注名</h3>' +
      '<div class="alias-row"><input id="client-alias" maxlength="20" value="' + escapeHtml(u.alias || "") +
      '" placeholder="如：王女士 / 小白家长">' +
      '<button type="button" class="doc-btn-ghost" id="btn-save-alias">保存</button></div></section>';
    html += '<section class="detail-section"><h3>猫咪</h3>';
    if (!cats.length) {
      html += '<p class="doc-empty">这位家长还没建猫咪档案</p>';
    } else {
      html += '<div class="cat-mini-grid">' + cats.map(function (cat) {
        return '<button type="button" class="cat-mini-card" data-cat="' + escapeHtml(cat.id) + '">' +
          "<strong>" + escapeHtml(cat.name) + "</strong>" +
          '<span class="client-meta">' + escapeHtml([cat.breed || "品种未填", cat.gender === "male" ? "公" : cat.gender === "female" ? "母" : "", cat.neutered ? "已绝育" : "未绝育"].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="client-meta">' + (cat.scan_count ? cat.scan_count + " 条检测" : "还没检测") + "</span></button>";
      }).join("") + "</div>";
    }
    html += "</section>";
    if (state.clientCat) {
      var cat = state.clientCat.cat || {};
      var scans = state.clientCat.scans || [];
      html += '<section class="detail-section"><h3>' + escapeHtml(cat.name) + " 的检测</h3>";
      if (cat.medical_history) {
        html += '<div class="detail-text">病史：' + escapeHtml(cat.medical_history) + "</div>";
      }
      if (!scans.length) {
        html += '<p class="doc-empty">这只猫还没有检测记录</p>';
      } else {
        html += scans.map(function (s) {
          return '<div class="history-card"><div class="history-card-head">' +
            (s.image_path ? '<img class="history-thumb" src="' + escapeHtml(uploadUrl(String(s.image_path).split(",")[0])) + '" alt="" data-preview="' + escapeHtml(uploadUrl(String(s.image_path).split(",")[0])) + '">' : '<div class="history-thumb"></div>') +
            '<div class="history-meta"><span class="doc-module-tag">' + escapeHtml(moduleLabel(s.module)) + "</span>" +
            '<span class="history-summary">' + escapeHtml(historySummary(s)) + "</span>" +
            '<span class="history-date">' + escapeHtml(formatTime(s.created_at)) + "</span></div></div></div>";
        }).join("");
      }
      html += "</section>";
    }
    var consults = state.clientCurrent.consultations || [];
    if (consults.length) {
      html += '<section class="detail-section"><h3>问诊记录</h3>' + consults.map(function (c) {
        return '<div class="ctx-item"><span class="ctx-item-label">' + escapeHtml(c.status === "pending" ? "待回复" : "已回复") +
          "</span><span class=\"ctx-item-value\">" + escapeHtml((c.cat_name || "") + " · " + moduleLabel(c.module) + " · " + formatTime(c.created_at)) +
          "</span></div>";
      }).join("") + "</section>";
    }
    html += "</div>";
    body.innerHTML = html;
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
    renderToolbar();
    startRefresh();
    showSection(state.section || "clients");
  }

  function renderToolbar() {
    var info = state.doctor || {};
    $("toolbar-name").textContent = info.name || "医生";
    $("toolbar-title").textContent = info.title || "未填写专业";
    var img = $("toolbar-avatar");
    img.src = doctorAvatar(info);
    img.alt = info.name || "医生";
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
    r.imageUrl = r.scan && r.scan.image_path ? uploadUrl(String(r.scan.image_path).split(",")[0]) : "";
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
      empty.hidden = false;
      body.hidden = true;
      pane.classList.remove("is-open");
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    pane.classList.add("is-open");
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

    var html = '<div class="detail-close-bar">' +
      "<strong>咨询详情</strong>" +
      '<button type="button" class="doc-btn-ghost" id="btn-close-detail">关闭</button>' +
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

    html += '<section class="detail-section"><div class="history-head"><h3>这只猫的其他检测</h3>' +
      (state.history.length ? '<span class="history-count">共 ' + state.history.length + " 条</span>" : "") +
      "</div>";
    if (state.historyLoading) {
      html += '<p class="doc-empty">正在加载...</p>';
    } else if (!state.history.length) {
      html += '<p class="doc-empty">这只猫没有其他检测记录</p>';
    } else {
      html += '<div class="history-list">' + state.history.map(function (item) {
        var open = !!state.historyOpen[item.id];
        var cls = "history-card" + (item.is_current ? " is-current" : "") + (open ? " is-open" : "");
        var inner = '<button type="button" class="history-card-head" data-toggle-history="' + escapeHtml(item.id) + '">' +
          (item.imageUrl
            ? '<img class="history-thumb" src="' + escapeHtml(item.imageUrl) + '" alt="" data-preview="' + escapeHtml(item.imageUrl) + '">'
            : '<div class="history-thumb"></div>') +
          '<div class="history-meta"><div class="history-meta-row">' +
          '<span class="doc-module-tag">' + escapeHtml(item.moduleLabel) + "</span>" +
          (item.is_current ? '<span class="history-current-tag">本次</span>' : "") +
          '</div><span class="history-summary">' + escapeHtml(item.summary) + "</span>" +
          '<span class="history-date">' + escapeHtml(item.dateText) + "</span></div>" +
          '<span class="history-arrow">›</span></button>';
        if (open) {
          inner += '<div class="history-detail">';
          if (item.module === "fgs") {
            inner += '<div class="history-dim-grid">' + FGS_DIMS.map(function (pair) {
              return '<div class="history-dim"><span>' + pair[1] + "</span><strong>" +
                escapeHtml(item[pair[0]] || 0) + "/2</strong></div>";
            }).join("") + "</div>";
          }
          if (item.diagnosis) {
            inner += '<div><div class="answered-label">AI 初判</div><div class="answered-text">' +
              escapeHtml(item.diagnosis) + "</div></div>";
          }
          if (item.advice) {
            inner += '<div><div class="answered-label">AI 建议</div><div class="answered-text">' +
              escapeHtml(item.advice) + "</div></div>";
          }
          if (item.catContextItems && item.catContextItems.length) {
            inner += "<div><div class=\"answered-label\">用户填写的情况</div>" + ctxListHtml(item.catContextItems) + "</div>";
          }
          inner += "</div>";
        }
        return '<div class="' + cls + '">' + inner + "</div>";
      }).join("") + "</div>";
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
    renderList();
    renderDetail();
    loadHistory(rec.id);
  }

  function closeDetail() {
    state.current = null;
    state.reply = Object.assign({}, EMPTY_REPLY);
    state.history = [];
    state.historyOpen = {};
    renderList();
    renderDetail();
  }

  function loadHistory(cid) {
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
    state.submitting = true;
    renderDetail();
    api("/api/v1/doctor/consultations/" + encodeURIComponent(state.current.id) + "/reply", "POST", { comment: comment })
      .then(function () {
        state.submitting = false;
        toast("回复已发送");
        closeDetail();
        loadList();
      })
      .catch(function (err) {
        state.submitting = false;
        renderDetail();
        if (handleAuthError(err)) return;
        toast(networkMessage(err, "提交失败"));
      });
  }

  function loadMe() {
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
    api("/api/v1/doctor/quick-replies").then(function (res) {
      state.quickReplies = (res && res.replies) || [];
    }).catch(function () {});
  }

  function startRefresh() {
    stopRefresh();
    state.refreshTimer = setInterval(function () {
      if (document.hidden || $("view-work").hidden) return;
      if (state.section === "clients") loadClients();
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
      avatar_url: info.avatar_url ? uploadUrl(info.avatar_url) : ""
    };
    $("profile-name").value = state.profile.name;
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
        renderClients();
        renderClientDetail();
        return;
      }
      if (e.target.id === "btn-save-alias") {
        var uid = state.clientCurrent && state.clientCurrent.user && state.clientCurrent.user.id;
        var alias = ($("client-alias") && $("client-alias").value) || "";
        if (!uid) return;
        api("/api/v1/doctor/clients/" + encodeURIComponent(uid), "PATCH", { alias: alias }).then(function () {
          toast("备注已保存");
          openClient(uid);
        }).catch(function (err) {
          toast(networkMessage(err, "保存失败"));
        });
        return;
      }
      var catBtn = e.target.closest("[data-cat]");
      if (catBtn && state.clientCurrent && state.clientCurrent.user) {
        var uid2 = state.clientCurrent.user.id;
        api("/api/v1/doctor/clients/" + encodeURIComponent(uid2) + "/cats/" + encodeURIComponent(catBtn.getAttribute("data-cat")))
          .then(function (res) {
            state.clientCat = res;
            renderClientDetail();
          })
          .catch(function (err) {
            toast(networkMessage(err, "加载失败"));
          });
      }
    });
    $("btn-edit-profile").addEventListener("click", openProfile);
    $("btn-logout").addEventListener("click", function () {
      if (window.confirm("退出登录？会返回登录页")) {
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
