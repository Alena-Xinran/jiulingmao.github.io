/* 九龄猫官网 · 年糕和锅贴
 *
 * 角色来自短剧《合租的猫》，性格照剧里的设定：
 *   年糕：8 岁橘白公猫，左耳有缺口，戴绿项圈，晚风旧书店的店长。
 *         十点上班、六点下班（北京时间），面无表情，从来不叫，只有内心独白。
 *   锅贴：3 岁橘白母猫，耳朵完整，会小声叫，一看镜头就坐直。
 *
 * 页面上写 <button class="cat" data-cat="niangao"> / data-cat="guotie" 就会被画出来；
 * 只做装饰（门卡片上探头的那种）加 data-pose="peek" data-static。
 * 中英文由 <html lang> 决定。
 */
(function () {
  'use strict';

  var ZH = (document.documentElement.lang || 'zh').toLowerCase().indexOf('zh') === 0;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  var T = ZH ? {
    niangao: [
      '十点上班，六点下班。',
      '疼不疼，我不说。脸上写着。',
      '猫会忍痛。拍张脸，九龄猫看得出来。',
      '便便也要看。别笑。',
      '我八岁了。每天拍一张，变化才看得见。',
      '做完手术，医生每天会看你的打卡。',
      '我不叫。有事看我表情。',
      '今天的工资还没发。一个罐头。',
      '摸可以。别摸太久。'
    ],
    tooMany: '可以了。我在上班。',
    purr: '……行吧，再摸一会儿。',
    asleep: ['下班了。明天十点。', '……（翻了个身）', '六点以后不营业。'],
    paid: '工资到了。',
    paidAsleep: '下班了。罐头先放着，明天吃。',
    paidTwice: '一天一个罐头。规矩。',
    payslip: '年糕 · 今日工资<small>一个罐头 ✓</small>',
    guotie: ['喵。', '喵……（小声）', '（坐直了）', '喵？'],
    guotieWake: '喵？……（又睡了）',
    onDuty: '年糕店长 · 值班中',
    offDuty: '年糕店长 · 已下班',
    tag: '店长',
    copied: '已复制，发给你的医院吧',
    copyFail: '没复制上，长按文字手动复制'
  } : {
    niangao: [
      'Shift: 10 to 6. Every day.',
      'I won\'t say if it hurts. My face will.',
      'Cats hide pain. One photo of my face tells a lot.',
      'Yes, we check poop too. Don\'t laugh.',
      'I\'m eight. One photo a day shows the changes.',
      'After surgery, the vet reads your daily check-in.',
      'I don\'t meow. Read my face.',
      'Today\'s pay: one can. Still waiting.',
      'You can pet me. Not for too long.'
    ],
    tooMany: 'That\'s enough. I\'m working.',
    purr: '…Fine. A bit longer.',
    asleep: ['Off duty. Back at ten.', '…(rolls over)', 'Closed after six.'],
    paid: 'Payday.',
    paidAsleep: 'Off duty. Leave the can. I\'ll eat tomorrow.',
    paidTwice: 'One can a day. Rules.',
    payslip: 'Niangao · today\'s pay<small>one can ✓</small>',
    guotie: ['Meow.', 'mew… (quietly)', '(sits up straight)', 'Meow?'],
    guotieWake: 'Meow? …(back to sleep)',
    onDuty: 'Manager Niangao · on duty',
    offDuty: 'Manager Niangao · off duty',
    tag: 'BOSS',
    copied: 'Copied — send it to your vet',
    copyFail: 'Could not copy. Select the text instead.'
  };

  // ───────────────── 画猫 ─────────────────
  var C = { orange: '#f0a04b', deep: '#d97b25', white: '#fff9f0', pink: '#f4a6a0', ink: '#4a3426', eye: '#e9b44c', green: '#5e9a5b', tag: '#f5d36b' };

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  var HEAD = 'M44 96 C40 62 64 46 100 46 C136 46 160 62 156 96 C153 124 130 136 100 136 C70 136 47 124 44 96 Z';
  var BODY = 'M58 208 C36 208 34 160 50 132 C60 114 140 114 150 132 C166 160 164 208 142 208 Z';
  var BLAZE = 'M100 58 C95 70 91 86 89 100 C80 104 70 110 72 118 C80 133 120 133 128 118 C130 110 120 104 111 100 C109 86 105 70 100 58 Z';

  function drawCat(kind, pose) {
    var niangao = kind === 'niangao';
    var peek = pose === 'peek';
    var svg = el('svg', { viewBox: peek ? '30 14 140 140' : '0 0 200 220', 'aria-hidden': 'true', focusable: 'false' });

    if (!peek) {
      // 尾巴在身子后面
      var tail = el('g', { 'class': 'c-tail' }, svg);
      el('path', { d: 'M146 196 C186 198 194 158 178 138 C171 129 160 133 165 142 C176 160 172 182 144 184', fill: C.orange, 'class': 'c-stroke' }, tail);
      el('path', { d: 'M178 140 C171 132 163 134 165 142', fill: 'none', stroke: C.white, 'stroke-width': 5, 'stroke-linecap': 'round' }, tail);

      var body = el('g', { 'class': 'c-body' }, svg);
      el('path', { d: BODY, fill: C.white }, body);
      el('path', { d: 'M50 132 C42 152 40 182 52 202 C62 186 64 158 74 128 Z', fill: C.orange }, body);
      el('path', { d: 'M150 132 C158 152 160 182 148 202 C138 186 136 158 126 128 Z', fill: C.orange }, body);
      el('path', { d: BODY, fill: 'none', 'class': 'c-stroke' }, body);
      el('ellipse', { cx: 82, cy: 206, rx: 14, ry: 8, fill: C.white, 'class': 'c-stroke' }, body);
      el('ellipse', { cx: 118, cy: 206, rx: 14, ry: 8, fill: C.white, 'class': 'c-stroke' }, body);
      el('path', { d: 'M78 203 L78 209 M86 203 L86 209 M114 203 L114 209 M122 203 L122 209', 'class': 'c-stroke', 'stroke-width': 2 }, body);
    }

    var head = el('g', { 'class': 'c-head' }, svg);
    // 耳朵。年糕左耳（画面右边）有个缺口
    el('path', { d: 'M58 72 L60 22 L94 50 Z', fill: C.orange, 'class': 'c-stroke' }, head);
    el('path', { d: 'M65 60 L66 36 L84 51 Z', fill: C.pink }, head);
    el('path', { d: niangao ? 'M142 72 L141 47 L133 42 L140 35 L140 22 L106 50 Z' : 'M142 72 L140 22 L106 50 Z', fill: C.orange, 'class': 'c-stroke' }, head);
    el('path', { d: 'M135 60 L134 38 L116 51 Z', fill: C.pink }, head);
    // 脸
    el('path', { d: HEAD, fill: C.orange }, head);
    el('path', { d: BLAZE, fill: C.white }, head);
    el('path', { d: 'M91 51 L93 61 M100 49 L100 59 M109 51 L107 61', stroke: C.deep, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, head);
    el('path', { d: 'M48 88 L60 90 M47 98 L59 98 M152 88 L140 90 M153 98 L141 98', stroke: C.deep, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, head);
    el('path', { d: HEAD, fill: 'none', 'class': 'c-stroke' }, head);

    if (!niangao) {
      el('ellipse', { cx: 70, cy: 112, rx: 8, ry: 5, fill: C.pink, opacity: 0.55 }, head);
      el('ellipse', { cx: 130, cy: 112, rx: 8, ry: 5, fill: C.pink, opacity: 0.55 }, head);
    }

    // 眼睛：瞳孔会跟着鼠标走
    [78, 122].forEach(function (x) {
      var eye = el('g', { 'class': 'c-eye' }, head);
      el('ellipse', { cx: x, cy: 92, rx: niangao ? 10 : 11, ry: niangao ? 9 : 11, fill: C.eye, 'class': 'c-stroke', 'stroke-width': 2.5 }, eye);
      var pupil = el('g', { 'class': 'c-pupil' }, eye);
      el('ellipse', { cx: x, cy: 92, rx: niangao ? 3.6 : 5, ry: niangao ? 6.5 : 8, fill: C.ink }, pupil);
      el('circle', { cx: x + 2.6, cy: 88, r: 2, fill: '#fff' }, pupil);
      if (niangao) {
        // 面无表情的打工人：上眼皮耷拉着
        el('path', { d: 'M' + (x - 10.5) + ' 91 C' + (x - 10) + ' 81 ' + (x + 10) + ' 81 ' + (x + 10.5) + ' 91 Z', fill: C.orange }, eye);
        el('path', { d: 'M' + (x - 10.5) + ' 91 L' + (x + 10.5) + ' 91', 'class': 'c-stroke', 'stroke-width': 2.5 }, eye);
      }
      el('path', { 'class': 'c-closed c-stroke', d: 'M' + (x - 10) + ' 92 Q' + x + ' 100 ' + (x + 10) + ' 92', fill: 'none' }, head);
    });

    el('path', { d: 'M94 105 L106 105 L100 112 Z', fill: C.pink, 'class': 'c-stroke', 'stroke-width': 2 }, head);
    el('path', {
      d: niangao ? 'M100 112 L100 116 M100 116 Q95 119 91 117 M100 116 Q105 119 109 117'
                 : 'M100 112 L100 115 M91 115 Q95 120 100 115 Q105 120 109 115',
      fill: 'none', 'class': 'c-stroke', 'stroke-width': 2.5
    }, head);
    el('path', { d: 'M70 110 L38 104 M70 116 L38 118 M130 110 L162 104 M130 116 L162 118', 'class': 'c-stroke', 'stroke-width': 2, fill: 'none', opacity: 0.8 }, head);

    if (niangao && !peek) {
      // 绿项圈 + 店长吊牌
      el('path', { d: 'M64 128 Q100 146 136 128', fill: 'none', stroke: C.green, 'stroke-width': 9, 'stroke-linecap': 'round' }, head);
      el('path', { d: 'M64 128 Q100 146 136 128', fill: 'none', stroke: C.ink, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.5, transform: 'translate(0 5)' }, head);
      var tag = el('g', { 'class': 'c-tag' }, head);
      el('rect', { x: 86, y: 141, width: 28, height: 18, rx: 5, fill: C.tag, 'class': 'c-stroke', 'stroke-width': 2 }, tag);
      var t = el('text', { x: 100, y: 154, 'text-anchor': 'middle', 'font-size': ZH ? 10 : 8, fill: C.ink, 'font-family': 'KuaiLe, cursive' }, tag);
      t.textContent = T.tag;
    }

    if (peek) {
      // 探头：两只爪子搭在卡片边上
      el('ellipse', { cx: 72, cy: 140, rx: 16, ry: 10, fill: C.white, 'class': 'c-stroke' }, svg);
      el('ellipse', { cx: 128, cy: 140, rx: 16, ry: 10, fill: niangao ? C.white : C.orange, 'class': 'c-stroke' }, svg);
    }
    return svg;
  }

  function canSVG() {
    var svg = el('svg', { viewBox: '0 0 62 52', 'aria-hidden': 'true' });
    el('ellipse', { cx: 31, cy: 42, rx: 27, ry: 8, fill: '#d9dfe6', 'class': 'c-stroke', stroke: C.ink, 'stroke-width': 2.5 }, svg);
    el('path', { d: 'M4 16 L4 42 A27 8 0 0 0 58 42 L58 16', fill: '#f6c25b', stroke: C.ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
    el('ellipse', { cx: 31, cy: 16, rx: 27, ry: 8, fill: '#e8edf2', stroke: C.ink, 'stroke-width': 2.5 }, svg);
    el('ellipse', { cx: 31, cy: 16, rx: 19, ry: 4.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.5, opacity: 0.5 }, svg);
    // 罐头上的小鱼
    el('path', { d: 'M20 31 Q28 24 36 31 Q28 38 20 31 Z M36 31 L42 26 L42 36 Z', fill: '#fff', stroke: C.ink, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
    return svg;
  }

  function pawSVG() {
    var svg = el('svg', { viewBox: '0 0 24 24', 'class': 'paw', 'aria-hidden': 'true' });
    var f = 'rgba(74,52,38,.55)';
    el('ellipse', { cx: 12, cy: 15.5, rx: 5.5, ry: 4.5, fill: f }, svg);
    [[5.5, 9], [10, 6], [14, 6], [18.5, 9]].forEach(function (p) { el('ellipse', { cx: p[0], cy: p[1], rx: 2.3, ry: 2.8, fill: f }, svg); });
    return svg;
  }

  // ───────────────── 小工具 ─────────────────
  function pick(list, last) {
    if (list.length < 2) return list[0];
    var i;
    do { i = Math.floor(Math.random() * list.length); } while (list[i] === last);
    return list[i];
  }

  function say(cat, text, os, ms) {
    var b = cat.querySelector('.bubble');
    if (!b) return;
    b.textContent = text;
    b.classList.toggle('os', !!os);
    b.classList.add('show');
    clearTimeout(cat._sayT);
    cat._sayT = setTimeout(function () { b.classList.remove('show'); }, ms || 2600);
  }

  function flash(cat, cls, ms) {
    cat.classList.add(cls);
    clearTimeout(cat['_' + cls]);
    cat['_' + cls] = setTimeout(function () { cat.classList.remove(cls); }, ms);
  }

  function hearts(cat, n) {
    if (REDUCED) return;
    for (var i = 0; i < n; i++) {
      var h = document.createElement('span');
      h.className = 'heart';
      h.textContent = '♥';
      h.style.left = (35 + Math.random() * 30) + '%';
      h.style.top = (10 + Math.random() * 20) + '%';
      h.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
      h.style.animationDelay = (i * 0.12) + 's';
      cat.appendChild(h);
      setTimeout(h.remove.bind(h), 1400);
    }
  }

  function shanghaiHour() {
    try {
      return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    } catch (e) { return new Date().getHours(); }
  }

  function toast(text) {
    var t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // ───────────────── 装上猫 ─────────────────
  var cats = [];

  function mount(node) {
    var kind = node.dataset.cat;
    node.classList.add('cat', 'cat-' + kind);
    node.insertBefore(drawCat(kind, node.dataset.pose), node.firstChild);
    if (!node.hasAttribute('data-static')) {
      var b = document.createElement('span');
      b.className = 'bubble';
      b.setAttribute('aria-live', 'polite');
      node.appendChild(b);
      var z = document.createElement('span');
      z.className = 'zzz';
      z.textContent = 'z z Z';
      node.appendChild(z);
    }
    var state = { node: node, kind: kind, pupils: [].slice.call(node.querySelectorAll('.c-pupil')), x: 0, y: 0, tx: 0, ty: 0, lazy: kind === 'niangao' ? 0.07 : 0.2 };
    cats.push(state);
    scheduleBlink(node);
    return state;
  }

  function scheduleBlink(node) {
    setTimeout(function () {
      if (!node.classList.contains('asleep')) flash(node, 'blink', 140);
      scheduleBlink(node);
    }, 2200 + Math.random() * 3800);
  }

  // 眼睛跟着鼠标（或手指、或被拖着的罐头）
  var pointer = null;
  function track() {
    cats.forEach(function (s) {
      if (pointer && !s.node.classList.contains('asleep')) {
        var r = s.node.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var cx = r.left + r.width / 2, cy = r.top + r.height * (s.node.dataset.pose === 'peek' ? 0.55 : 0.42);
        var dx = pointer.x - cx, dy = pointer.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var m = Math.min(1, d / 220) * (s.kind === 'niangao' ? 3.2 : 4);
        s.tx = dx / d * m; s.ty = dy / d * m * 0.8;
      } else { s.tx = 0; s.ty = 0; }
      s.x += (s.tx - s.x) * s.lazy; s.y += (s.ty - s.y) * s.lazy;
      var tr = 'translate(' + s.x.toFixed(2) + ' ' + s.y.toFixed(2) + ')';
      s.pupils.forEach(function (p) { p.setAttribute('transform', tr); });
    });
    requestAnimationFrame(track);
  }

  // ───────────────── 年糕 ─────────────────
  function setupNiangao(s) {
    var node = s.node, clicks = 0, clickT, last, petDist = 0, petLast = null;
    node.setAttribute('aria-label', ZH ? '年糕店长，点一下听他心里在想什么' : 'Manager Niangao. Tap to hear what he is thinking.');

    node.addEventListener('click', function () {
      if (node.classList.contains('asleep')) { last = pick(T.asleep, last); say(node, last, true); return; }
      clicks++;
      clearTimeout(clickT);
      clickT = setTimeout(function () { clicks = 0; }, 4000);
      if (clicks >= 5) { say(node, T.tooMany, true); return; }
      last = pick(T.niangao, last);
      say(node, last, true, 3200);
      flash(node, 'happy', 900);
      hearts(node, 2);
    });

    // 在头上来回摸：攒够距离就呼噜
    node.addEventListener('pointermove', function (e) {
      if (node.classList.contains('asleep') || e.pointerType === 'touch' && !e.isPrimary) return;
      var r = node.getBoundingClientRect();
      if (e.clientY > r.top + r.height * 0.62) { petLast = null; return; }
      if (petLast) petDist += Math.abs(e.clientX - petLast.x) + Math.abs(e.clientY - petLast.y);
      petLast = { x: e.clientX, y: e.clientY };
      if (petDist > 900) {
        petDist = 0;
        flash(node, 'purr', 1600);
        flash(node, 'happy', 1600);
        say(node, T.purr, true, 2400);
        hearts(node, 3);
      }
    });
    node.addEventListener('pointerleave', function () { petLast = null; petDist = Math.max(0, petDist - 300); });
  }

  // ───────────────── 锅贴 ─────────────────
  function setupGuotie(s) {
    var node = s.node, last;
    var napping = node.hasAttribute('data-nap');
    node.setAttribute('aria-label', ZH ? '锅贴，点一下她会小声叫' : 'Guotie. Tap and she meows quietly.');
    if (napping) node.classList.add('asleep');

    node.addEventListener('click', function () {
      if (node.classList.contains('asleep')) {
        node.classList.remove('asleep');
        say(node, T.guotieWake, false, 2200);
        setTimeout(function () { node.classList.add('asleep'); }, 2600);
        return;
      }
      last = pick(T.guotie, last);
      say(node, last, false, 1800);
      flash(node, 'upright', 2000);
      if (!REDUCED) flash(node, 'hop', 460);
    });
    s.near = !napping;
  }

  // 锅贴：一看镜头（鼠标靠近）就坐直
  function proximity() {
    if (!pointer) return;
    cats.forEach(function (s) {
      if (s.kind !== 'guotie' || !s.near) return;
      var r = s.node.getBoundingClientRect();
      var dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
      s.node.classList.toggle('upright', dx * dx + dy * dy < 170 * 170);
    });
  }

  // ───────────────── 上下班 ─────────────────
  function applyShift() {
    var h = shanghaiHour();
    var onDuty = h >= 10 && h < 18;
    document.querySelectorAll('[data-shift]').forEach(function (n) { n.classList.toggle('asleep', !onDuty); });
    document.querySelectorAll('[data-duty]').forEach(function (n) {
      n.classList.toggle('off', !onDuty);
      var label = n.querySelector('.duty-text');
      if (label) label.textContent = onDuty ? T.onDuty : T.offDuty;
    });
  }

  // ───────────────── 罐头 ─────────────────
  function setupCan(can) {
    can.appendChild(canSVG());
    var target = document.querySelector('[data-cat="niangao"][data-shift]') || document.querySelector('[data-cat="niangao"]:not([data-static])');
    var slip = document.querySelector('.payslip');
    var fed = 0, drag = null;

    function feed() {
      if (!target) return;
      if (target.classList.contains('asleep')) { say(target, T.paidAsleep, true, 3000); return; }
      if (fed >= 2) { say(target, T.paidTwice, true); return; }
      fed++;
      can.classList.add('eaten');
      flash(target, 'munch', 1400);
      flash(target, 'happy', 1800);
      hearts(target, 4);
      say(target, T.paid, true, 2400);
      if (slip) { slip.innerHTML = T.payslip; slip.classList.add('show'); setTimeout(function () { slip.classList.remove('show'); }, 3200); }
      setTimeout(function () { can.classList.remove('eaten'); }, 5000);
    }

    function overTarget(x, y) {
      if (!target) return false;
      var r = target.getBoundingClientRect();
      return x > r.left - 20 && x < r.right + 20 && y > r.top - 20 && y < r.bottom + 20;
    }

    can.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      can.setPointerCapture(e.pointerId);
    });
    can.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) {
        drag.moved = true;
        can.classList.add('dragging');
      }
      if (drag.moved) {
        can.style.left = (e.clientX - 31) + 'px';
        can.style.top = (e.clientY - 26) + 'px';
        pointer = { x: e.clientX, y: e.clientY };
      }
    });
    function end(e) {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      can.classList.remove('dragging');
      can.style.left = ''; can.style.top = '';
      if (!moved || overTarget(e.clientX, e.clientY)) feed();
    }
    can.addEventListener('pointerup', end);
    can.addEventListener('pointercancel', function () { drag = null; can.classList.remove('dragging'); can.style.left = ''; can.style.top = ''; });
    can.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); feed(); } });
  }

  // ───────────────── 页面上其他的小交互 ─────────────────
  function setupPaws() {
    document.querySelectorAll('[data-paws]').forEach(function (box) {
      box.addEventListener('pointerdown', function (e) {
        if (REDUCED || e.target.closest('button, a, .cat, .can')) return;
        var r = box.getBoundingClientRect();
        var p = pawSVG();
        p.style.left = (e.clientX - r.left - 11) + 'px';
        p.style.top = (e.clientY - r.top - 11) + 'px';
        p.style.setProperty('--r', (Math.random() * 50 - 25) + 'deg');
        box.appendChild(p);
        setTimeout(function () { p.remove(); }, 1400);
      });
    });
  }

  function setupMenu() {
    var btn = document.querySelector('.menu-btn'), links = document.querySelector('.nav-links');
    if (!btn || !links) return;
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { links.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  }

  function setupDialogs() {
    document.querySelectorAll('[data-open]').forEach(function (t) {
      t.addEventListener('click', function (e) {
        var d = document.getElementById(t.dataset.open);
        if (!d || !d.showModal) return;
        e.preventDefault();
        d.showModal();
      });
    });
    var viewer = document.getElementById('image-viewer');
    document.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!viewer || !viewer.showModal) return;
        var img = b.querySelector('img');
        viewer.querySelector('img').src = img.currentSrc || img.src;
        viewer.querySelector('img').alt = img.alt;
        viewer.querySelector('p').textContent = img.alt;
        viewer.showModal();
      });
    });
    document.querySelectorAll('dialog').forEach(function (d) {
      var close = d.querySelector('.close');
      if (close) close.addEventListener('click', function () { d.close(); });
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    });
  }

  function setupCopy() {
    document.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var src = document.querySelector(b.dataset.copy);
        var text = src ? src.innerText.trim() : '';
        var ok = function () { toast(T.copied); };
        var fail = function () { toast(T.copyFail); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fail);
        else {
          try {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy') ? ok() : fail();
            ta.remove();
          } catch (e) { fail(); }
        }
      });
    });
  }

  function setupFlips() {
    document.querySelectorAll('[data-flip]').forEach(function (b) {
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { b.setAttribute('aria-pressed', String(b.classList.toggle('on'))); });
    });
  }

  function init() {
    setupMenu();
    setupFlips();
    setupDialogs();
    setupCopy();
    setupPaws();
    document.querySelectorAll('[data-cat]').forEach(function (n) {
      var s = mount(n);
      if (n.hasAttribute('data-static')) return;
      if (s.kind === 'niangao') setupNiangao(s); else setupGuotie(s);
    });
    applyShift();
    setInterval(applyShift, 60000);
    document.querySelectorAll('.can').forEach(setupCan);
    window.addEventListener('pointermove', function (e) { pointer = { x: e.clientX, y: e.clientY }; proximity(); }, { passive: true });
    window.addEventListener('pointerdown', function (e) { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
    requestAnimationFrame(track);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
