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
  // 颜色照《合租的猫》封面：暖橘虎斑、奶白胸口、琥珀色眼睛、绿项圈
  var C = {
    orange: '#f2a24f', orangeLight: '#f9c27a', deep: '#d6782a', stripe: '#c9681f',
    white: '#fffaf2', cream: '#f6e6cf', pink: '#f3a3a0', ink: '#5a3b28',
    eyeLight: '#f6cf66', eyeDark: '#d8952a', green: '#5f9e4e', greenDark: '#3f7a35', tag: '#f5d36b'
  };
  var uidN = 0;

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function gradient(defs, id, stops, vertical) {
    var g = el('linearGradient', vertical === false ? { id: id, x1: 0, y1: 0, x2: 1, y2: 0 } : { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
    return 'url(#' + id + ')';
  }

  // 坐姿：大圆脸、梨形身子、两只前爪并拢，尾巴绕到右边地上（封面上的样子）
  var HEAD = 'M38 102 C34 66 62 47 100 47 C138 47 166 66 162 102 C160 130 136 145 100 145 C64 145 40 130 38 102 Z';
  var BODY = 'M46 216 C28 214 30 174 44 150 C56 131 144 131 156 150 C170 174 172 214 154 216 Z';
  var BIB = 'M62 138 C50 166 54 202 64 216 L136 216 C146 202 150 166 138 138 Z';
  var BLAZE = 'M100 62 C96 74 93 87 92 99 C79 103 67 111 69 124 C75 142 125 142 131 124 C133 111 121 103 108 99 C107 87 104 74 100 62 Z';

  function drawCat(kind, pose) {
    var niangao = kind === 'niangao';
    var peek = pose === 'peek';
    var id = 'c' + (++uidN);
    var svg = el('svg', { viewBox: peek ? '28 14 144 146' : '0 0 200 232', 'aria-hidden': 'true', focusable: 'false' });
    var defs = el('defs', {}, svg);
    var fur = gradient(defs, id + 'f', [[0, C.orangeLight], [0.55, C.orange], [1, C.deep]]);
    var furSide = gradient(defs, id + 's', [[0, C.deep], [0.5, C.orange], [1, C.deep]], false);
    var eyeFill = gradient(defs, id + 'e', [[0, C.eyeLight], [1, C.eyeDark]]);
    var whiteFill = gradient(defs, id + 'w', [[0, C.white], [1, C.cream]]);
    var sw = { 'class': 'c-stroke' };

    if (!peek) {
      el('ellipse', { cx: 104, cy: 222, rx: 78, ry: 9, fill: 'rgba(90,59,40,.18)', 'class': 'c-shadow' }, svg);
      // 尾巴绕在右边地上，尾尖会翘
      var tail = el('g', { 'class': 'c-tail' }, svg);
      el('path', { d: 'M138 218 C170 222 198 212 196 188 C195 177 183 175 182 185 C183 200 168 207 140 205 Z', fill: fur, 'class': 'c-stroke' }, tail);
      el('path', { d: 'M160 207 Q163 214 158 219 M175 202 Q180 208 177 214 M186 192 Q192 194 193 200', stroke: C.stripe, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, tail);

      var body = el('g', { 'class': 'c-body' }, svg);
      el('path', { d: BODY, fill: furSide }, body);
      el('path', { d: BIB, fill: whiteFill }, body);
      // 身侧的虎斑
      el('path', { d: 'M40 170 Q52 164 58 176 M36 188 Q50 182 56 194 M144 176 Q148 164 160 170 M144 194 Q150 182 164 188', stroke: C.stripe, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }, body);
      // 胸口的绒毛
      el('path', { d: 'M88 150 l4 6 l4 -6 l4 6 l4 -6 l4 6', stroke: C.cream, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round', opacity: 0.9 }, body);
      el('path', { d: BODY, fill: 'none', 'class': 'c-stroke' }, body);
      el('path', { d: 'M100 172 L100 212', stroke: C.ink, 'stroke-width': 2, opacity: 0.35, 'stroke-linecap': 'round' }, body);
      el('path', { d: 'M72 176 Q70 196 72 208 M128 176 Q130 196 128 208', stroke: C.ink, 'stroke-width': 1.8, fill: 'none', opacity: 0.28, 'stroke-linecap': 'round' }, body);
      // 两只并拢的前爪
      [84, 116].forEach(function (x) {
        el('ellipse', { cx: x, cy: 214, rx: 15, ry: 9, fill: C.white, 'class': 'c-stroke' }, body);
        el('path', { d: 'M' + (x - 5) + ' 210 L' + (x - 5) + ' 217 M' + (x + 5) + ' 210 L' + (x + 5) + ' 217', stroke: C.ink, 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.6 }, body);
      });
    }

    var head = el('g', { 'class': 'c-head' }, svg);
    // 耳朵：圆一点的耳尖，内侧粉色带白色绒毛。年糕左耳（画面右边）有个缺口
    var earL = el('g', { 'class': 'c-ear c-ear-l' }, head);
    el('path', { d: 'M54 78 L56 30 Q57 23 63 27 L96 54 Z', fill: fur, 'class': 'c-stroke' }, earL);
    el('path', { d: 'M62 66 L63 38 L85 55 Z', fill: C.pink }, earL);
    el('path', { d: 'M64 60 L70 48 M68 64 L76 54', stroke: C.white, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.85 }, earL);
    var earR = el('g', { 'class': 'c-ear c-ear-r' }, head);
    el('path', { d: niangao ? 'M146 78 L145 52 L137 47 L144 40 L143 30 Q143 23 137 27 L104 54 Z' : 'M146 78 L144 30 Q143 23 137 27 L104 54 Z', fill: fur, 'class': 'c-stroke' }, earR);
    el('path', { d: 'M138 66 L137 40 L115 55 Z', fill: C.pink }, earR);
    el('path', { d: 'M136 60 L130 48 M132 64 L124 54', stroke: C.white, 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.85 }, earR);

    // 脸
    el('path', { d: HEAD, fill: fur }, head);
    el('path', { d: BLAZE, fill: whiteFill }, head);
    // 额头的「M」字虎斑 + 脸颊条纹
    el('path', { d: niangao ? 'M82 60 Q85 66 86 74 M92 54 Q94 62 94 70 M100 52 L100 60 M108 54 Q106 62 106 70 M118 60 Q115 66 114 74'
                            : 'M92 54 Q94 60 94 66 M100 52 L100 58 M108 54 Q106 60 106 66', stroke: C.stripe, 'stroke-width': niangao ? 3 : 2.6, fill: 'none', 'stroke-linecap': 'round' }, head);
    el('path', { d: niangao ? 'M40 96 Q50 95 58 99 M41 107 Q50 106 58 108 M160 96 Q150 95 142 99 M159 107 Q150 106 142 108'
                            : 'M41 104 Q49 103 55 106 M159 104 Q151 103 145 106', stroke: C.stripe, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, head);
    // 逆光的那一圈亮边（封面里的阳光）
    el('path', { d: 'M52 76 Q70 52 100 50 Q126 50 142 62', stroke: '#fff4dc', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', opacity: 0.75 }, head);
    el('path', { d: HEAD, fill: 'none', 'class': 'c-stroke' }, head);

    // 腮红
    el('ellipse', { cx: 66, cy: 118, rx: 9, ry: 5.5, fill: C.pink, opacity: niangao ? 0.35 : 0.55 }, head);
    el('ellipse', { cx: 134, cy: 118, rx: 9, ry: 5.5, fill: C.pink, opacity: niangao ? 0.35 : 0.55 }, head);

    // 眼睛：琥珀色，瞳孔跟着鼠标走
    [76, 124].forEach(function (x) {
      var eye = el('g', { 'class': 'c-eye' }, head);
      if (niangao) el('path', { d: 'M' + (x - 12) + ' 96 Q' + x + ' 82 ' + (x + 12) + ' 96 Q' + x + ' 109 ' + (x - 12) + ' 96 Z', fill: eyeFill, 'class': 'c-stroke', 'stroke-width': 2.4 }, eye);
      else el('circle', { cx: x, cy: 97, r: 11, fill: eyeFill, 'class': 'c-stroke', 'stroke-width': 2.4 }, eye);
      var pupil = el('g', { 'class': 'c-pupil' }, eye);
      el('ellipse', { cx: x, cy: niangao ? 96 : 97, rx: niangao ? 3.4 : 5.2, ry: niangao ? 7 : 7.4, fill: C.ink }, pupil);
      el('circle', { cx: x + (niangao ? 3 : 3.4), cy: niangao ? 91.5 : 92.5, r: niangao ? 2 : 3.2, fill: '#fff' }, pupil);
      el('circle', { cx: x - 3, cy: 100, r: 1.1, fill: '#fff', opacity: 0.8 }, pupil);
      if (niangao) {
        // 封面上那种「不太想理你」：上眼皮压下来一点
        el('path', { d: 'M' + (x - 13) + ' 95 Q' + x + ' 80 ' + (x + 13) + ' 95 L' + (x + 13) + ' 93 Q' + x + ' 88 ' + (x - 13) + ' 93 Z', fill: fur }, eye);
        el('path', { d: 'M' + (x - 12.5) + ' 94 Q' + x + ' 89 ' + (x + 12.5) + ' 94', 'class': 'c-stroke', 'stroke-width': 2.4, fill: 'none' }, eye);
      }
      el('path', { 'class': 'c-closed c-stroke', d: 'M' + (x - 11) + ' 96 Q' + x + ' 104 ' + (x + 11) + ' 96', fill: 'none', 'stroke-width': 2.8 }, head);
    });

    // 鼻子、嘴
    el('path', { d: 'M93 112 Q100 108 107 112 Q103 118 100 119 Q97 118 93 112 Z', fill: C.pink, 'class': 'c-stroke', 'stroke-width': 2 }, head);
    el('path', {
      'class': 'c-mouth c-stroke',
      d: niangao ? 'M100 119 L100 123 M100 123 Q95 126 91 123 M100 123 Q105 126 109 123'
                 : 'M100 119 L100 122 M90 122 Q95 128 100 122 Q105 128 110 122',
      fill: 'none', 'stroke-width': 2.4
    }, head);
    el('path', { 'class': 'c-meow', d: 'M94 124 Q100 134 106 124 Z', fill: '#c0504d', stroke: C.ink, 'stroke-width': 2, 'stroke-linejoin': 'round' }, head);
    el('path', { d: 'M70 116 Q54 111 36 112 M70 121 Q54 120 37 124 M130 116 Q146 111 164 112 M130 121 Q146 120 163 124', stroke: C.ink, 'stroke-width': 1.6, fill: 'none', opacity: 0.55, 'stroke-linecap': 'round' }, head);

    if (niangao && !peek) {
      // 绿项圈 + 小小的店长牌
      el('path', { d: 'M64 136 Q100 156 136 136', fill: 'none', stroke: C.green, 'stroke-width': 10, 'stroke-linecap': 'round' }, head);
      el('path', { d: 'M65 141 Q100 160 135 141', fill: 'none', stroke: C.greenDark, 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.8 }, head);
      var tag = el('g', { 'class': 'c-tag' }, head);
      el('path', { d: 'M100 150 L100 154', stroke: C.ink, 'stroke-width': 2 }, tag);
      el('rect', { x: 86, y: 153, width: 28, height: 17, rx: 6, fill: C.tag, 'class': 'c-stroke', 'stroke-width': 2 }, tag);
      var t = el('text', { x: 100, y: 165.5, 'text-anchor': 'middle', 'font-size': ZH ? 10 : 8, fill: C.ink, 'font-family': 'KuaiLe, cursive' }, tag);
      t.textContent = T.tag;
    }

    if (peek) {
      // 探头：两只爪子搭在卡片边上
      [72, 128].forEach(function (x) {
        el('ellipse', { cx: x, cy: 148, rx: 17, ry: 10, fill: niangao || x < 100 ? C.white : C.orange, 'class': 'c-stroke' }, svg);
        el('path', { d: 'M' + (x - 5) + ' 144 L' + (x - 5) + ' 151 M' + (x + 5) + ' 144 L' + (x + 5) + ' 151', stroke: C.ink, 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.6 }, svg);
      });
    }
    return svg;
  }

  // 书店场景：照封面画的——左边书架、窗外的绿、斜进来的阳光、木地板、右边一摞书和一盆绿植
  function drawScene() {
    var id = 'sc' + (++uidN);
    var svg = el('svg', { 'class': 'scene', viewBox: '0 0 600 420', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', focusable: 'false' });
    var defs = el('defs', {}, svg);
    var wall = gradient(defs, id + 'w', [[0, '#fdf0d4'], [1, '#f2d29e']]);
    var floor = gradient(defs, id + 'f', [[0, '#e7b77c'], [1, '#d39a5c']]);
    var blur = el('filter', { id: id + 'b', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 7 }, blur);
    var line = { stroke: C.ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    function L(a) { var o = {}; for (var k in line) o[k] = line[k]; for (var j in a) o[j] = a[j]; return o; }

    el('rect', { x: 0, y: 0, width: 600, height: 300, fill: wall }, svg);
    // 窗：外面是虚化的绿
    el('rect', L({ x: 222, y: 26, width: 196, height: 196, rx: 14, fill: '#fff6dc' }), svg);
    var bokeh = el('g', { filter: 'url(#' + id + 'b)', opacity: 0.75 }, svg);
    [[262, 70, 34, '#cfe59a'], [330, 56, 40, '#b5d77e'], [392, 92, 30, '#d9eba8'], [290, 150, 38, '#a9cf78'], [372, 168, 34, '#c4e08f'], [250, 196, 22, '#e2efb6']].forEach(function (b) {
      el('circle', { cx: b[0], cy: b[1], r: b[2], fill: b[3] }, bokeh);
    });
    el('path', L({ d: 'M320 26 L320 222 M222 124 L418 124', fill: 'none', opacity: 0.55 }), svg);
    el('rect', L({ x: 222, y: 26, width: 196, height: 196, rx: 14, fill: 'none' }), svg);

    // 左边的书架
    el('rect', L({ x: -10, y: 22, width: 176, height: 290, fill: '#8f5f3d' }), svg);
    el('rect', { x: 4, y: 34, width: 148, height: 266, fill: '#6f4529' }, svg);
    var colors = ['#c9744a', '#6f9e6a', '#e7b65f', '#8f5c3d', '#d98d7b', '#7fa6c9', '#ead6b0', '#b5523b'];
    [[38, 98], [118, 178], [198, 258]].forEach(function (shelf, si) {
      var x = 8;
      for (var i = 0; x < 146; i++) {
        var w = 12 + ((i * 7 + si * 5) % 4) * 4, h = 44 + ((i * 11 + si * 3) % 5) * 3;
        var tilt = (i + si) % 6 === 4;
        el('rect', L({ x: x, y: shelf[1] - h, width: w, height: h, rx: 2, fill: colors[(i + si * 3) % colors.length], 'stroke-width': 2, transform: tilt ? 'rotate(8 ' + (x + w) + ' ' + shelf[1] + ')' : '' }), svg);
        el('path', { d: 'M' + (x + 3) + ' ' + (shelf[1] - h + 8) + ' h' + (w - 6), stroke: 'rgba(255,255,255,.45)', 'stroke-width': 2 }, svg);
        x += w + (tilt ? 8 : 1);
      }
      el('rect', L({ x: -10, y: shelf[1], width: 176, height: 12, fill: '#b07a4e' }), svg);
    });

    // 斜进来的阳光
    var rays = el('g', { 'class': 'rays' }, svg);
    el('path', { d: 'M300 26 L372 26 L250 420 L120 420 Z', fill: '#fff6d8', opacity: 0.32 }, rays);
    el('path', { d: 'M384 26 L418 26 L330 420 L270 420 Z', fill: '#fff6d8', opacity: 0.22 }, rays);

    // 木地板 + 地上的光斑
    el('rect', L({ x: -10, y: 300, width: 620, height: 130, fill: floor }), svg);
    el('path', { d: 'M0 334 L600 334 M0 372 L600 372 M0 408 L600 408', stroke: 'rgba(90,59,40,.28)', 'stroke-width': 2 }, svg);
    el('path', { d: 'M90 300 L84 334 M260 334 L254 372 M420 300 L416 334 M150 372 L146 408 M520 372 L516 408 M340 408 L338 420', stroke: 'rgba(90,59,40,.28)', 'stroke-width': 2 }, svg);
    el('path', { d: 'M170 302 L430 302 L470 420 L120 420 Z', fill: '#fff1cc', opacity: 0.45, 'class': 'sunspot' }, svg);

    // 右边：小木桌上一摞书，桌边一盆绿植
    el('rect', L({ x: 470, y: 228, width: 150, height: 18, fill: '#b9814f' }), svg);
    el('rect', L({ x: 480, y: 246, width: 14, height: 70, fill: '#9a6a44' }), svg);
    [[484, 204, 120, '#e7d2ad'], [492, 184, 108, '#c9744a'], [480, 166, 116, '#7fa6c9'], [496, 148, 96, '#ead6b0']].forEach(function (b) {
      el('rect', L({ x: b[0], y: b[1], width: b[2], height: b[1] === 204 ? 24 : 18, rx: 3, fill: b[3], 'stroke-width': 2 }), svg);
    });
    var plant = el('g', { 'class': 'plant' }, svg);
    [['M548 330 C520 300 512 262 530 240 C548 262 552 296 548 330 Z', '#7fb069'], ['M552 330 C556 290 578 262 604 258 C600 292 578 318 552 330 Z', '#5f9e4e'],
     ['M546 332 C510 320 488 296 486 270 C516 278 538 300 546 332 Z', '#8cbf6a'], ['M556 332 C572 306 600 296 620 300 C606 324 584 334 556 332 Z', '#6fa35b'],
     ['M550 330 C548 296 556 264 572 246 C580 276 570 306 550 330 Z', '#9ccc73']].forEach(function (lf) {
      el('path', L({ d: lf[0], fill: lf[1], 'stroke-width': 2 }), plant);
    });
    el('path', L({ d: 'M520 330 L580 330 L572 392 L528 392 Z', fill: '#c8734a' }), svg);
    el('path', L({ d: 'M516 324 L584 324 L584 338 L516 338 Z', fill: '#d9875b' }), svg);

    // 左下角地上的一摞书
    [[6, 388, 120, '#8f5c3d'], [14, 370, 104, '#6f9e6a'], [4, 352, 116, '#e7b65f']].forEach(function (b) {
      el('rect', L({ x: b[0], y: b[1], width: b[2], height: 18, rx: 3, fill: b[3], 'stroke-width': 2 }), svg);
    });

    // 光里飘着的小灰尘
    var motes = el('g', { 'class': 'motes' }, svg);
    [[250, 120, 2.4], [286, 190, 1.8], [228, 250, 2.8], [312, 96, 1.6], [270, 300, 2.2], [208, 330, 1.8], [340, 150, 2], [300, 360, 1.6]].forEach(function (m, i) {
      el('circle', { cx: m[0], cy: m[1], r: m[2], fill: '#fffbea', style: 'animation-delay:' + (-i * 0.9) + 's' }, motes);
    });
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
      if (!node.classList.contains('asleep')) {
        var r = Math.random();
        // 偶尔慢慢眨一下眼：猫对人表示放心的样子
        if (r < 0.2) flash(node, 'slowblink', 900);
        else flash(node, 'blink', 140);
        if (!REDUCED && Math.random() < 0.35) flash(node, Math.random() < 0.5 ? 'twitch-l' : 'twitch-r', 360);
      }
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
      if (!REDUCED) flash(node, 'tilt', 700);
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
      if (last.indexOf('（') !== 0 && last.indexOf('(') !== 0) flash(node, 'meowing', 500);
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
    document.querySelectorAll('.stage').forEach(function (st) { st.insertBefore(drawScene(), st.firstChild); });
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
