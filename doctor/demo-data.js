/* 医生端演示数据：本地假用户，不写后端。30 只猫 = 1 红 / 3 黄 / 26 绿。 */
(function (root) {
  "use strict";

  var NOW = Math.floor(Date.now() / 1000);
  var H = 3600;
  var D = 86400;

  function photo(file, hoursAgo, when) {
    return {
      path: "../" + file,
      created_at: NOW - Math.round((hoursAgo || 0) * 3600),
      when: when || ""
    };
  }

  var PH = {
    stool: ["bangbang/2026-7-12.png", "bangbang/2026-6-25.png", "bangbang/2026-6-2.png", "example/1.png", "example/2.png", "example/4.png"],
    fgs: ["assets/scan1.png", "assets/scan2.png", "assets/scan3.png", "assets/scan4.png", "assets/scan5.png"],
    vomit: ["bangbang/2026-4-26.png", "bangbang/2026-4-20.png", "bangbang/2026-3.png", "bangbang/2026-4.png"],
    teeth: ["example/3.png", "example/5.png", "example/6.png"],
    postop: ["assets/scan4-1.png", "assets/scan4.png", "assets/scan5.png"]
  };

  var PHRASES = {
    fgs: ["先观察精神、食欲、活动量", "建议 48 小时内到院评估疼痛", "疼痛信号明显，建议今天到院"],
    stool: ["先观察精神与便便形状", "建议带新鲜粪便到院化验", "便血或精神差，请今天到院"],
    vomit: ["今晚停零食，观察是否再吐", "24 小时内再吐，建议到院", "带血或精神差，请急诊"],
    teeth: ["先观察进食是否疼痛", "建议口腔探诊确认", "疑似牙吸收，请尽快口腔科"],
    postop: ["切口看起来正常，继续限制活动", "建议按计划到院复查/拆线", "红肿渗液或精神差，请今天到院"]
  };

  var OVERRIDE_REASONS = [
    { id: "fur", label: "误判毛发遮挡" },
    { id: "breed", label: "该品种正常" },
    { id: "seen", label: "已当面看过" },
    { id: "borderline", label: "分数临界，临床不支持" },
    { id: "other", label: "其他" }
  ];

  var REDLINE_RULES = {
    blood: { label: "带血", hot: true },
    vomit_3x: { label: "24h 超 3 次", hot: true },
    lethargy: { label: "精神萎靡", hot: true },
    abscess: { label: "脓肿/撕脱/烧烫", hot: true },
    systemic: { label: "全身红旗", hot: true },
    stool4: { label: "4分·按观察处理", hot: false },
    forl: { label: "疑似牙吸收 FORL/TR", hot: false },
    puncture_cap: { label: "穿刺伤上限为观察", hot: false },
    score_vet: { label: "分数切到红档", hot: false }
  };

  var owners = [
    { id: "o-lixinran", alias: "李欣然", nickname: "Xinran", phone: "13800001001", bound_at: NOW - 20 * D },
    { id: "o-wang", alias: "王女士", nickname: "wang", phone: "13800001002", bound_at: NOW - 12 * D },
    { id: "o-chen", alias: "陈妈妈", nickname: "小陈", phone: "13800001003", bound_at: NOW - 20 * D },
    { id: "o-zhang", alias: "张先生", nickname: "阿张", phone: "13800001004", bound_at: NOW - 8 * D },
    { id: "o-liu", alias: "刘女士", nickname: "刘刘", phone: "13800001005", bound_at: NOW - 15 * D },
    { id: "o-zhou", alias: "周阿姨", nickname: "周周", phone: "13800001006", bound_at: NOW - 30 * D },
    { id: "o-wu", alias: "吴先生", nickname: "小吴", phone: "13800001007", bound_at: NOW - 6 * D },
    { id: "o-zhao", alias: "赵女士", nickname: "赵赵", phone: "13800001008", bound_at: NOW - 4 * D }
  ];

  var cats = [
    { id: "c-tuantuan", owner_id: "o-lixinran", name: "团团", breed: "英短", gender: "female", neutered: 1, birth_date: "2021-03-12", weight: 4.6, medical_history: "" },
    { id: "c-bangbang", owner_id: "o-lixinran", name: "邦邦", breed: "英短", gender: "male", neutered: 1, birth_date: "2022-01-08", weight: 5.1 },
    { id: "c-juzi", owner_id: "o-lixinran", name: "橘子", breed: "英短", gender: "female", neutered: 1, birth_date: "2023-05-01", weight: 3.8 },
    { id: "c-zhima", owner_id: "o-lixinran", name: "芝麻", breed: "美短", gender: "male", neutered: 1, birth_date: "2024-06-20", weight: 3.2, medical_history: "10 天前双侧卵巢子宫切除" },
    { id: "c-xiaobai", owner_id: "o-lixinran", name: "小白", breed: "中华田园", gender: "female", neutered: 1, birth_date: "2020-08-01", weight: 4.0 },
    { id: "c-xiaohei", owner_id: "o-lixinran", name: "小黑", breed: "中华田园", gender: "male", neutered: 1, birth_date: "2020-08-01", weight: 4.4 },
    { id: "c-xueqiu", owner_id: "o-lixinran", name: "雪球", breed: "布偶", gender: "female", neutered: 0, birth_date: "2025-01-15", weight: 3.1 },
    { id: "c-huihui", owner_id: "o-lixinran", name: "灰灰", breed: "俄蓝", gender: "male", neutered: 1, birth_date: "2022-11-02", weight: 5.4 },
    { id: "c-niangao", owner_id: "o-wang", name: "年糕", breed: "美短", gender: "male", neutered: 1, birth_date: "2023-02-14", weight: 4.8, medical_history: "曾有过一次急性胃肠炎" },
    { id: "c-mimi", owner_id: "o-chen", name: "咪咪", breed: "英短", gender: "female", neutered: 1, birth_date: "2022-04-01", weight: 4.2 },
    { id: "c-naicha", owner_id: "o-zhang", name: "奶茶", breed: "加菲", gender: "male", neutered: 1, birth_date: "2019-09-09", weight: 5.8, medical_history: "慢性口炎随访" },
    { id: "c-aoliao", owner_id: "o-zhang", name: "奥利奥", breed: "英短", gender: "female", neutered: 1, birth_date: "2021-07-07", weight: 4.1 },
    { id: "c-huzi", owner_id: "o-zhang", name: "虎子", breed: "中华田园", gender: "male", neutered: 1, birth_date: "2018-03-03", weight: 5.0 },
    { id: "c-pipi", owner_id: "o-zhang", name: "皮皮", breed: "美短", gender: "female", neutered: 0, birth_date: "2024-12-01", weight: 2.6 },
    { id: "c-doudou", owner_id: "o-liu", name: "豆豆", breed: "加菲", gender: "female", neutered: 1, birth_date: "2021-10-10", weight: 4.9 },
    { id: "c-maomao", owner_id: "o-liu", name: "毛毛", breed: "布偶", gender: "male", neutered: 1, birth_date: "2022-06-06", weight: 6.2 },
    { id: "c-qiuqiu", owner_id: "o-liu", name: "球球", breed: "英短", gender: "female", neutered: 1, birth_date: "2023-08-18", weight: 3.9 },
    { id: "c-huahua", owner_id: "o-zhou", name: "花花", breed: "三花", gender: "female", neutered: 1, birth_date: "2020-05-05", weight: 4.3 },
    { id: "c-diandian", owner_id: "o-zhou", name: "点点", breed: "奶牛猫", gender: "male", neutered: 1, birth_date: "2021-01-20", weight: 5.2 },
    { id: "c-keke", owner_id: "o-zhou", name: "可可", breed: "英短", gender: "female", neutered: 1, birth_date: "2022-09-09", weight: 4.0 },
    { id: "c-rourou", owner_id: "o-zhou", name: "肉肉", breed: "美短", gender: "male", neutered: 1, birth_date: "2019-12-12", weight: 6.0 },
    { id: "c-yuanyuan", owner_id: "o-zhou", name: "圆圆", breed: "英短", gender: "female", neutered: 1, birth_date: "2023-03-03", weight: 3.7 },
    { id: "c-pangpang", owner_id: "o-zhou", name: "胖胖", breed: "加菲", gender: "male", neutered: 1, birth_date: "2020-02-02", weight: 6.4 },
    { id: "c-buding", owner_id: "o-wu", name: "布丁", breed: "英短", gender: "female", neutered: 1, birth_date: "2022-02-22", weight: 4.1 },
    { id: "c-mango", owner_id: "o-wu", name: "芒果", breed: "橘猫", gender: "male", neutered: 1, birth_date: "2021-11-11", weight: 5.6 },
    { id: "c-ningmeng", owner_id: "o-wu", name: "柠檬", breed: "美短", gender: "female", neutered: 1, birth_date: "2023-07-07", weight: 3.5 },
    { id: "c-tangtang", owner_id: "o-wu", name: "糖糖", breed: "布偶", gender: "female", neutered: 0, birth_date: "2025-02-02", weight: 2.8 },
    { id: "c-mimi2", owner_id: "o-wu", name: "蜜蜜", breed: "英短", gender: "female", neutered: 1, birth_date: "2022-12-12", weight: 4.0 },
    { id: "c-daju", owner_id: "o-zhao", name: "大橘", breed: "橘猫", gender: "male", neutered: 1, birth_date: "2017-04-04", weight: 6.8 },
    { id: "c-xiaoju", owner_id: "o-zhao", name: "小橘", breed: "橘猫", gender: "female", neutered: 1, birth_date: "2024-01-01", weight: 3.3 }
  ];

  function ownerOf(catId) {
    var cat = cats.filter(function (c) { return c.id === catId; })[0];
    return owners.filter(function (o) { return o.id === cat.owner_id; })[0];
  }

  function rec(partial) {
    var cat = cats.filter(function (c) { return c.id === partial.cat_id; })[0];
    var owner = ownerOf(partial.cat_id);
    var created = partial.created_at != null ? partial.created_at : NOW - 2 * H;
    return Object.assign({
      id: partial.id,
      cat_id: cat.id,
      owner_id: owner.id,
      cat_name: cat.name,
      owner_alias: owner.alias,
      owner_nickname: owner.nickname,
      owner_phone: owner.phone,
      type: "stool",
      pain_level: "good",
      ai_pain_level: "good",
      triggered_rules: [],
      is_redline: false,
      raw_scores: {},
      photos: [],
      diagnosis: "",
      advice: "",
      cat_context: {},
      created_at: created,
      doctor_action: null,
      doctor_override: null,
      thread: [],
      done: false,
      kind: "record",
      unread_owner: false
    }, partial, {
      ai_pain_level: partial.ai_pain_level || partial.pain_level || "good"
    });
  }

  var records = [];

  records.push(rec({
    id: "r-niangao-stool",
    cat_id: "c-niangao",
    type: "stool",
    pain_level: "vet",
    triggered_rules: ["blood", "lethargy"],
    is_redline: true,
    raw_scores: { fecal_score: 7, recent: [3, 3, 4, 6, 7] },
    photos: [photo(PH.stool[3], 1.2, "今天 07:40"), photo(PH.stool[4], 2.5, "今天 06:15")],
    diagnosis: "水样便，可见鲜红血丝，主人描述精神差、几乎不吃。",
    advice: "便血 + 精神萎靡属于红线，建议今天到院排查。",
    cat_context: { appetite: "几乎不吃", water: "很少", activity: "蔫、不愿动", stool: "水样带血", abnormal: "精神萎靡" },
    created_at: NOW - 1.3 * H,
    kind: "record"
  }));

  records.push(rec({
    id: "r-mimi-vomit",
    cat_id: "c-mimi",
    type: "vomit",
    pain_level: "observe",
    triggered_rules: [],
    raw_scores: {
      color: "黄绿胆汁",
      content: "毛球",
      event: "呕吐",
      count_24h: 2
    },
    photos: [photo(PH.vomit[0], 1, "今晚 21:03"), photo(PH.vomit[1], 12, "今天 08:40")],
    diagnosis: "更像毛球混食物，今晚这一口偏黄绿。",
    advice: "先观察精神食欲。若 24 小时内再吐两次，或精神变差，建议就医。",
    cat_context: { appetite: "略差", water: "正常", activity: "还行", vomit_event_type: "更像呕吐" },
    created_at: NOW - 1 * H,
    kind: "followup",
    unread_owner: true,
    thread: [
      { id: "t1", role: "system", text: "主人从结果页点了「问医生」，对话挂在这条记录上。", at: NOW - 50 * 60 },
      { id: "t2", role: "owner", text: "昨晚又吐了一次，今天精神还行，要不要禁食？能给点零食吗？", at: NOW - 40 * 60, round: 1 }
    ]
  }));

  records.push(rec({
    id: "r-naicha-teeth",
    cat_id: "c-naicha",
    type: "teeth",
    pain_level: "observe",
    triggered_rules: ["forl"],
    raw_scores: { gi: 2, ci: 1, suspected_tr: true },
    photos: [photo(PH.teeth[0], 3, "今天 17:20"), photo(PH.teeth[1], 72, "3 天前")],
    diagnosis: "牙龈中度红肿，齿颈可见缺损影，不能排除牙吸收。",
    advice: "牙吸收必须探诊确认，建议口腔科面诊。",
    cat_context: { appetite: "吃得慢，会躲干粮", water: "正常", activity: "正常" },
    created_at: NOW - 3 * H
  }));

  records.push(rec({
    id: "r-doudou-fgs",
    cat_id: "c-doudou",
    type: "fgs",
    pain_level: "observe",
    triggered_rules: [],
    raw_scores: {
      ear_position: 1,
      orbital_tightening: 2,
      muzzle_tension: 1,
      whiskers_change: 0,
      head_position: 1,
      body_shape: 0,
      fur_condition: 1,
      posture: 2,
      eye_spirit: 0,
      total: 8,
      face_total: 5,
      body_total: 3,
      brachy_adjusted: true
    },
    photos: [photo(PH.fgs[0], 4, "今天 16:05"), photo(PH.fgs[1], 80, "3 天前")],
    diagnosis: "眼部紧缩与姿态拉高，总分 8/18，扁脸基线已修正。",
    advice: "先观察精神食欲；若持续蜷缩或不吃，建议到院。",
    cat_context: { photo_state: "刚醒", appetite: "正常", activity: "比平时懒" },
    created_at: NOW - 4 * H
  }));

  var greens = [
    { id: "r-tuantuan-stool", cat_id: "c-tuantuan", type: "stool", hours: 10, scores: { fecal_score: 3, recent: [2, 3, 3, 2, 3] }, diagnosis: "成型，颜色正常。", extraPhotos: 2 },
    { id: "r-bangbang-fgs", cat_id: "c-bangbang", type: "fgs", hours: 12, scores: { ear_position: 0, orbital_tightening: 1, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 1, fur_condition: 0, posture: 1, eye_spirit: 0, total: 3, face_total: 1, body_total: 2, brachy_adjusted: true }, diagnosis: "疼痛信号很轻。" },
    { id: "r-juzi-teeth", cat_id: "c-juzi", type: "teeth", hours: 28, scores: { gi: 0, ci: 0, suspected_tr: false }, diagnosis: "牙龈粉，未见结石。" },
    { id: "r-zhima-postop", cat_id: "c-zhima", type: "postop", hours: 8, scores: { wound_type: "surgical_incision_closed", wound_label: "闭合手术切口", rules: ["分型：闭合手术切口", "术后第 10 天，创缘对合，未见裂开"] }, diagnosis: "绝育切口对合良好，少量结痂。", ctx: { wound_type: "术后伤口", postop_day: "10", surgery_type: "绝育", surgery_name: "卵巢子宫切除" } },
    { id: "r-xiaobai-stool", cat_id: "c-xiaobai", type: "stool", hours: 14, scores: { fecal_score: 3, recent: [3, 3, 3, 2, 3] }, diagnosis: "成型偏软，仍在正常范围。" },
    { id: "r-xiaohei-teeth", cat_id: "c-xiaohei", type: "teeth", hours: 40, scores: { gi: 0, ci: 1, suspected_tr: false }, diagnosis: "少量齿龈缘结石。" },
    { id: "r-xueqiu-fgs", cat_id: "c-xueqiu", type: "fgs", hours: 9, scores: { ear_position: 0, orbital_tightening: 0, muzzle_tension: 1, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 0, posture: 0, eye_spirit: 0, total: 1, face_total: 1, body_total: 0, brachy_adjusted: false }, diagnosis: "表情放松。" },
    { id: "r-huihui-stool", cat_id: "c-huihui", type: "stool", hours: 22, scores: { fecal_score: 2, recent: [2, 2, 3, 2, 2] }, diagnosis: "条状成型。" },
    { id: "r-aoliao-stool", cat_id: "c-aoliao", type: "stool", hours: 11, scores: { fecal_score: 2, recent: [3, 2, 2, 3, 2] }, diagnosis: "正常成型。" },
    { id: "r-huzi-vomit", cat_id: "c-huzi", type: "vomit", hours: 30, scores: { color: "白色泡沫", content: "空胃", event: "呕吐", count_24h: 1 }, diagnosis: "单次空胃泡沫，精神好。" },
    { id: "r-pipi-fgs", cat_id: "c-pipi", type: "fgs", hours: 18, scores: { ear_position: 1, orbital_tightening: 0, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 1, posture: 0, eye_spirit: 0, total: 2, face_total: 1, body_total: 1, brachy_adjusted: false }, diagnosis: "幼猫，状态好。" },
    { id: "r-maomao-stool", cat_id: "c-maomao", type: "stool", hours: 7, scores: { fecal_score: 3, recent: [3, 3, 2, 3, 3] }, diagnosis: "成型。" },
    { id: "r-qiuqiu-fgs", cat_id: "c-qiuqiu", type: "fgs", hours: 16, scores: { ear_position: 0, orbital_tightening: 1, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 0, posture: 0, eye_spirit: 0, total: 1, face_total: 1, body_total: 0, brachy_adjusted: true }, diagnosis: "很放松。" },
    { id: "r-huahua-stool", cat_id: "c-huahua", type: "stool", hours: 6, scores: { fecal_score: 3, recent: [2, 3, 3, 3, 3] }, diagnosis: "正常。" },
    { id: "r-diandian-fgs", cat_id: "c-diandian", type: "fgs", hours: 20, scores: { ear_position: 0, orbital_tightening: 0, muzzle_tension: 0, whiskers_change: 1, head_position: 0, body_shape: 1, fur_condition: 0, posture: 0, eye_spirit: 0, total: 2, face_total: 1, body_total: 1, brachy_adjusted: false }, diagnosis: "无疼痛信号。" },
    { id: "r-keke-vomit", cat_id: "c-keke", type: "vomit", hours: 26, scores: { color: "未消化猫粮", content: "食物", event: "反流", count_24h: 1 }, diagnosis: "更像吃太快反流。" },
    { id: "r-rourou-stool", cat_id: "c-rourou", type: "stool", hours: 13, scores: { fecal_score: 3, recent: [3, 2, 3, 3, 3] }, diagnosis: "成型。" },
    { id: "r-yuanyuan-fgs", cat_id: "c-yuanyuan", type: "fgs", hours: 15, scores: { ear_position: 1, orbital_tightening: 1, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 0, posture: 1, eye_spirit: 0, total: 3, face_total: 2, body_total: 1, brachy_adjusted: true }, diagnosis: "轻度信号，仍绿档。" },
    { id: "r-pangpang-teeth", cat_id: "c-pangpang", type: "teeth", hours: 36, scores: { gi: 1, ci: 0, suspected_tr: false }, diagnosis: "龈缘轻微红，无肿胀。" },
    { id: "r-buding-stool", cat_id: "c-buding", type: "stool", hours: 5, scores: { fecal_score: 2, recent: [2, 2, 3, 2, 2] }, diagnosis: "条状成型。" },
    { id: "r-mango-fgs", cat_id: "c-mango", type: "fgs", hours: 19, scores: { ear_position: 0, orbital_tightening: 0, muzzle_tension: 0, whiskers_change: 0, head_position: 1, body_shape: 1, fur_condition: 1, posture: 1, eye_spirit: 0, total: 4, face_total: 1, body_total: 3, brachy_adjusted: false }, diagnosis: "体态分略高，仍绿档。" },
    { id: "r-ningmeng-vomit", cat_id: "c-ningmeng", type: "vomit", hours: 32, scores: { color: "透明粘液", content: "毛发少许", event: "呕吐", count_24h: 1 }, diagnosis: "偶发，精神好。" },
    { id: "r-tangtang-fgs", cat_id: "c-tangtang", type: "fgs", hours: 8, scores: { ear_position: 0, orbital_tightening: 0, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 0, posture: 0, eye_spirit: 0, total: 0, face_total: 0, body_total: 0, brachy_adjusted: false }, diagnosis: "完全放松。" },
    { id: "r-mimi2-stool", cat_id: "c-mimi2", type: "stool", hours: 17, scores: { fecal_score: 3, recent: [3, 3, 3, 3, 3] }, diagnosis: "稳定成型。" },
    { id: "r-daju-stool", cat_id: "c-daju", type: "stool", hours: 21, scores: { fecal_score: 3, recent: [3, 2, 3, 3, 2] }, diagnosis: "正常。" },
    { id: "r-xiaoju-teeth", cat_id: "c-xiaoju", type: "teeth", hours: 29, scores: { gi: 0, ci: 0, suspected_tr: false }, diagnosis: "乳牙期，牙龈粉。" }
  ];

  greens.forEach(function (g, i) {
    var files = PH[g.type] || PH.stool;
    var photos = [photo(files[i % files.length], g.hours, g.hours < 24 ? "今天" : Math.round(g.hours / 24) + " 天前")];
    if (g.extraPhotos) {
      photos.push(photo(files[(i + 1) % files.length], g.hours + 24, "昨天"));
    }
    records.push(rec({
      id: g.id,
      cat_id: g.cat_id,
      type: g.type,
      pain_level: "good",
      triggered_rules: [],
      raw_scores: g.scores,
      photos: photos,
      diagnosis: g.diagnosis,
      advice: "继续日常观察即可。",
      cat_context: g.ctx || { appetite: "正常", water: "正常", activity: "正常" },
      created_at: NOW - g.hours * H
    }));
  });

  var archive = [
    rec({
      id: "a-tuantuan-stool4",
      cat_id: "c-tuantuan",
      type: "stool",
      pain_level: "observe",
      ai_pain_level: "observe",
      triggered_rules: ["stool4"],
      raw_scores: { fecal_score: 4, recent: [3, 3, 3, 3, 4] },
      photos: [photo(PH.stool[2], 48, "2 天前")],
      diagnosis: "偏软 4 分，按观察处理（前端抬档）。",
      created_at: NOW - 2 * D,
      done: true,
      doctor_action: { level: "green", action: "先观察，明天若仍 4 分再联系我", note: "", at: NOW - 2 * D + 2 * H }
    }),
    rec({
      id: "a-mimi-vomit-old",
      cat_id: "c-mimi",
      type: "vomit",
      pain_level: "observe",
      raw_scores: { color: "未消化猫粮", content: "食物", event: "呕吐", count_24h: 1 },
      photos: [photo(PH.vomit[2], 72, "3 天前")],
      diagnosis: "未消化猫粮。",
      created_at: NOW - 3 * D,
      done: true,
      doctor_action: { level: "green", action: "吃太快，改慢食碗", note: "", at: NOW - 3 * D + H }
    }),
    rec({
      id: "a-mimi-vomit-older",
      cat_id: "c-mimi",
      type: "vomit",
      pain_level: "good",
      raw_scores: { color: "少量毛团", content: "毛球", event: "呕吐", count_24h: 1 },
      photos: [photo(PH.vomit[3], 120, "5 天前")],
      diagnosis: "少量毛团。",
      created_at: NOW - 5 * D,
      done: true
    }),
    rec({
      id: "a-doudou-fgs-old",
      cat_id: "c-doudou",
      type: "fgs",
      pain_level: "good",
      raw_scores: { ear_position: 0, orbital_tightening: 1, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 0, fur_condition: 0, posture: 1, eye_spirit: 0, total: 2, face_total: 1, body_total: 1, brachy_adjusted: true },
      photos: [photo(PH.fgs[2], 96, "4 天前")],
      diagnosis: "基线偏低。",
      created_at: NOW - 4 * D,
      done: true
    }),
    rec({
      id: "a-naicha-teeth-old",
      cat_id: "c-naicha",
      type: "teeth",
      pain_level: "observe",
      raw_scores: { gi: 2, ci: 1, suspected_tr: false },
      photos: [photo(PH.teeth[2], 14 * 24, "两周前")],
      diagnosis: "牙龈炎随访。",
      created_at: NOW - 14 * D,
      done: true,
      doctor_action: { level: "yellow", yellowDays: "7", action: "一周内口腔复查", note: "", at: NOW - 14 * D + 3 * H }
    }),
    rec({
      id: "a-zhima-d3",
      cat_id: "c-zhima",
      type: "postop",
      pain_level: "good",
      raw_scores: { wound_type: "surgical_incision_closed", wound_label: "闭合手术切口", rules: ["术后第 3 天，轻度红肿可接受"] },
      photos: [photo(PH.postop[1], 7 * 24, "7 天前")],
      diagnosis: "术后第 3 天，轻度红肿。",
      created_at: NOW - 7 * D,
      done: true,
      doctor_action: { level: "green", action: "继续伊丽莎白圈，限制跳跃", note: "", at: NOW - 7 * D + H }
    }),
    rec({
      id: "a-niangao-stool-old",
      cat_id: "c-niangao",
      type: "stool",
      pain_level: "good",
      raw_scores: { fecal_score: 3, recent: [3, 3, 2, 3, 3] },
      photos: [photo(PH.stool[0], 10 * 24, "10 天前")],
      diagnosis: "当时成型正常。",
      created_at: NOW - 10 * D,
      done: true
    }),
    rec({
      id: "a-bangbang-fgs-old",
      cat_id: "c-bangbang",
      type: "fgs",
      pain_level: "good",
      raw_scores: { ear_position: 0, orbital_tightening: 1, muzzle_tension: 0, whiskers_change: 0, head_position: 0, body_shape: 1, fur_condition: 0, posture: 1, eye_spirit: 1, total: 4, face_total: 1, body_total: 3, brachy_adjusted: true },
      photos: [photo(PH.fgs[3], 72, "3 天前")],
      diagnosis: "和今天差不多。",
      created_at: NOW - 3 * D,
      done: true
    })
  ];

  var PLAN_TEMPLATE = {
    id: "neuter-14",
    name: "绝育术后 14 天",
    days: [1, 3, 7, 14],
    items: [
      { day: 1, title: "术后第 1 天", text: "拍一张切口特写。看有没有渗液、裂开，精神食欲是否回来。" },
      { day: 3, title: "术后第 3 天", text: "再拍切口。轻度红肿可接受；若红肿扩大或流脓，直接到院。" },
      { day: 7, title: "术后第 7 天", text: "切口应明显收干。继续圈养，不要拆线除非主治安排。" },
      { day: 14, title: "术后第 14 天", text: "按医院安排拆线/复查。拍一张收尾照，归档。" }
    ]
  };

  root.DEMO_SEED = {
    now: NOW,
    doctor: {
      id: "demo-doc",
      name: "李医生",
      city: "杭州",
      hospital: "西湖宠物医院",
      title: "猫内科",
      gender: "female",
      referral_code: "HZLI01",
      referral_url: "https://www.jiulingmao.com/join/?code=HZLI01",
      client_count: owners.length
    },
    owners: owners,
    cats: cats,
    records: records,
    archive: archive,
    phrases: PHRASES,
    overrideReasons: OVERRIDE_REASONS,
    redlineRules: REDLINE_RULES,
    planTemplate: PLAN_TEMPLATE,
    settings: {
      notify_red: true,
      notify_yellow: true,
      notify_followup: true
    }
  };
})(window);
