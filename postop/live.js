/* Real doctor workspace. Demo continues to use the existing postop.js UI. */
window.PostopLive = (function () {
  const base = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8010' : 'https://api.jiulingmao.com'
  const prefix = '/api/v1/postop/clinic'
  const $ = id => document.getElementById(id)
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const labels = {red:'需处理',yellow:'观察中',green:'未见明显异常'}
  const trend = {improving:'较上次好转',stable:'与上次持平',worsening:'较上次加重',not_applicable:'暂无可比记录'}
  const wounds = {surgical_incision_closed:'闭合手术切口',open_wound:'开放创面',puncture_or_bite:'穿刺 / 咬伤',abscess_suspected:'疑似脓肿',avulsion_degloving:'撕脱伤',burn:'烧烫伤',contusion_closed:'闭合挫伤',undetermined:'待判定'}
  let token = sessionStorage.getItem('postop_live_token') || '', cases = [], selected = '', filter='all', timer
  async function api(path, method='GET', body) {
    const form = body instanceof FormData
    const response = await fetch(base + prefix + path, {method,headers:{Authorization:'Bearer '+token,...(form?{}:{'Content-Type':'application/json'})},body:body ? (form?body:JSON.stringify(body)):undefined})
    const result = await response.json()
    if (!response.ok) { if(response.status===401){sessionStorage.removeItem('postop_live_token');token='';gate()} throw new Error(typeof result.detail==='string'?result.detail:'请检查填写内容') }
    // Signed file paths remain valid when moving the API hostname.
    function rewriteFiles(value) {
      if (!value || typeof value !== 'object') return
      Object.keys(value).forEach(key => {
        const item = value[key]
        if (key === 'url' && typeof item === 'string' && item.includes('/api/v1/postop/files/')) {
          value[key] = base + item.slice(item.indexOf('/api/v1/postop/files/'))
        } else if (item && typeof item === 'object') rewriteFiles(item)
      })
    }
    rewriteFiles(result)
    return result
  }
  function fail(e) { $('live-message').textContent=e.message || '操作失败' }
  function options(values) {return Object.keys(values).map(k=>`<option value="${esc(k)}">${esc(values[k])}</option>`).join('')}
  function formField(label,name,type='text',value='',extra='') {return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`}
  function gate() {clearInterval(timer);$('gate').hidden=false;$('app').hidden=true}
  async function load() {
    const result=await api('/board');cases=result.cases
    $('live-count').textContent=`${cases.length} 个跟诊病例 · ${result.open_questions} 条待回复`
    renderList()
    if(selected && cases.some(c=>c.id===selected)) await detail(selected)
  }
  function renderList() {
    const query=$('live-search').value.trim()
    $('live-list').innerHTML=cases.filter(c=>(filter==='all'||(filter==='ask'?c.needs_reply:c.level===filter))&&(!query||[c.pet_name,c.owner_phone,c.procedure_label].join(' ').includes(query))).map(c=>`<button class="live-case ${selected===c.id?'selected':''}" data-case="${esc(c.id)}"><strong>${esc(c.pet_name)} <small>${c.species==='dog'?'犬':'猫'}</small></strong><span class="live-level ${esc(c.level)}">${labels[c.level]||'待评估'}</span><p>${esc(c.procedure_label)} · 第 ${c.day} 天</p><p>${esc(c.owner_phone)} · ${c.today_reported?'今日已打卡':'今日未打卡'}${c.needs_reply?' · 有问题待回复':''}</p></button>`).join('') || '<p class="live-empty">暂无病例。可先按家长手机号建立跟诊档案。</p>'
  }
  async function detail(id) {
    selected=id
    const c=(await api('/cases/'+encodeURIComponent(id))).case
    const records=(await api('/cases/'+encodeURIComponent(id)+'/medical-records')).records
    renderList()
    $('live-detail').innerHTML=`<h2>${esc(c.pet_name)} <small>${c.species==='dog'?'犬':'猫'} · ${esc(c.breed)}</small></h2><p>${esc(c.procedure_label)} · ${esc(c.surgery_date)} · 伤口部位：${esc(c.wound_site||'未填写')}</p><p>家长手机号 <a href="tel:${esc(c.owner_phone)}">${esc(c.owner_phone)}</a> · 认领码 ${esc(c.claim_code)}</p><p class="live-level ${esc(c.level)}">当前分类：${labels[c.level]}${c.today_peak_level?' · 今日最高：'+labels[c.today_peak_level]:''}</p><p>${esc(c.doctor_note)}</p>
      <h3>家长提问</h3>${c.questions.map(q=>`<article><p>${esc(q.text)}</p><small>${esc(q.date)}</small>${q.answer?`<p class="live-reply">${esc(q.answer.doctor_name)}：${esc(q.answer.content)}</p>`:'<small> · 待回复</small>'}</article>`).join('')||'<p>暂无提问</p>'}
      ${c.needs_reply?'<form id="live-reply"><textarea name="content" required maxlength="4000" placeholder="回复当前所有未答问题"></textarea><button class="btn-primary">发送回复</button></form>':''}
      <h3>同角度对比</h3>${window.PostopPhotoHistory.render(c,c.photo_history || c.reports)}<h3>每日记录</h3><p class="live-muted">当天展示最新照片，保留当天最高风险与历史版本。</p>${c.reports.map(r=>`<article><strong>${esc(r.date)} · 第 ${r.seq} 次</strong><span class="live-level ${esc(r.level)}">${labels[r.level]}</span><p>${esc(r.note)}</p><div class="live-photos">${r.photos.map(p=>`<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(p.url)}" alt="${esc(r.date)}伤口照片"></a>`).join('')}</div>${r.ai_report && r.ai_report.status!=='completed'?`<p>AI：${esc(r.ai_report.message||'检测中，预计约1分钟')}</p>`:r.ai_report?`<p><strong>AI：${esc(wounds[r.ai_report.wound_type]||'')} · ${esc(trend[r.ai_report.trend]||'暂无对比')}</strong></p><p>${esc(r.ai_report.wound_assessment)}</p><p>${esc((r.ai_report.advice||[]).join('；'))}</p><small>可信度 ${esc(r.ai_report.confidence)} · 对比日期 ${esc((r.ai_report.compared_dates||[]).join('、')||'无')}</small>`:'<p>本次无可用 AI 结论，请结合问卷和照片评估。</p>'}</article>`).join('')||'<p>等待家长首次打卡</p>'}
      <h3>宠物病历</h3>${records.map(r=>`<article><strong>${esc(r.title)}</strong> · ${esc(r.record_date)}<p>${esc(r.summary)}</p>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">查看附件</a>`:''}</article>`).join('')||'<p>尚未上传病历</p>'}
      <form id="live-record">${formField('病历标题','title','text','','required maxlength="100"')}${formField('日期','record_date','date',new Date().toLocaleDateString('en-CA'),'required')}<label>病历摘要（供历史对比参考）<textarea name="summary" maxlength="10000"></textarea></label><label>附件<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="btn-primary">保存病历</button></form>`
    if($('live-reply')) $('live-reply').onsubmit=async e=>{e.preventDefault();await runForm(e,async()=>{await api('/cases/'+id+'/answers','POST',{content:new FormData(e.target).get('content')});await load()})}
    $('live-record').onsubmit=async e=>{e.preventDefault();await runForm(e,async()=>{const body=new FormData(e.target);if(!body.get('file').size)body.delete('file');await api('/cases/'+id+'/medical-records','POST',body);await detail(id)})}
  }
  async function runForm(e,fn){const button=e.target.querySelector('button[type="submit"],button');if(button)button.disabled=true;try{await fn();$('live-message').textContent='已保存'}catch(err){fail(err)}finally{if(button)button.disabled=false}}
  async function openProfile() {
    const p=(await api('/profile')).profile
    $('live-dialog-body').innerHTML=`<h2>医生简介</h2><form id="live-profile">${formField('姓名','name','text',p.name,'required')}${formField('职称','title','text',p.title)}<label>简介<textarea name="bio" maxlength="2000">${esc(p.bio)}</textarea></label><button class="btn-primary">保存简介</button></form>`
    $('live-dialog').showModal()
    $('live-profile').onsubmit=e=>{e.preventDefault();runForm(e,async()=>{await api('/profile','PUT',Object.fromEntries(new FormData(e.target)));$('live-dialog').close()})}
  }
  async function openSchedule() {
    const slots=(await api('/schedule')).slots, bookings=(await api('/bookings')).bookings
    $('live-dialog-body').innerHTML=`<h2>我的预约时间</h2><p>按日期设置上下午容量；填 0 关闭该时段。</p><form id="live-schedule">${formField('日期','date','date','','required')}<label>时段<select name="slot"><option value="am">上午</option><option value="pm">下午</option></select></label>${formField('可预约人数','capacity','number',8,'min="0" max="100" required')}<button class="btn-primary">保存时段</button></form><h3>已开放时段</h3>${slots.map(s=>`<p>${esc(s.date)} ${s.slot==='am'?'上午':'下午'} · ${s.capacity} 个号</p>`).join('')||'<p>还没有开放时段</p>'}<h3>家长预约</h3>${bookings.map(b=>`<article>${esc(b.date)} ${b.slot==='am'?'上午':'下午'} · ${esc(b.pet_name)}<p>${esc(b.owner_phone)} · ${esc(b.note)}</p></article>`).join('')||'<p>暂无预约</p>'}`
    $('live-dialog').showModal()
    $('live-schedule').onsubmit=e=>{e.preventDefault();runForm(e,async()=>{const d=Object.fromEntries(new FormData(e.target));d.capacity=Number(d.capacity);await api('/schedule','PUT',{slots:[d]});await openSchedule()})}
  }
  function openCreate() {
    const procs=window.PostopRules.PROCEDURES
    const procOptions=Array.isArray(procs)?Object.fromEntries(procs.map(p=>[p.key,p.label])):Object.fromEntries(Object.entries(procs).map(([k,p])=>[k,p.label]))
    const pets={};cases.forEach(c=>{pets[c.pet_id]=c})
    $('live-dialog-body').innerHTML=`<h2>建立跟诊档案</h2><form id="live-create"><label>宠物档案<select name="pet_id"><option value="">新宠物</option>${Object.values(pets).map(c=>`<option value="${esc(c.pet_id)}">${esc(c.pet_name)} · ${esc(c.owner_phone)}</option>`).join('')}</select></label>${formField('家长手机号','owner_phone','tel','','required pattern="1[3-9][0-9]{9}"')}${formField('宠物名字','pet_name','text','','required')}<label>物种<select name="species"><option value="cat">猫</option><option value="dog">狗</option></select></label>${formField('品种','breed')}<label>跟诊项目<select name="procedure">${options(procOptions)}</select></label><label>伤口类型<select name="wound_type">${options(wounds)}</select></label>${formField('伤口部位','wound_site')}${formField('手术 / 受伤日期','surgery_date','date','','required')}${formField('跟诊天数','days','number',14,'min="1" max="365" required')}<label>医嘱<textarea name="doctor_note" maxlength="4000"></textarea></label><button class="btn-primary">建立档案</button></form>`
    $('live-dialog').showModal()
    const f=$('live-create')
    f.elements.pet_id.onchange=()=>{const c=pets[f.elements.pet_id.value];if(c){['owner_phone','pet_name','species','breed'].forEach(k=>f.elements[k].value=c[k]||'')}}
    f.onsubmit=e=>{e.preventDefault();runForm(e,async()=>{const d=Object.fromEntries(new FormData(f));d.days=Number(d.days);const r=await api('/cases','POST',d);selected=r.case.id;$('live-dialog').close();await load()})}
  }
  async function enter() {
    $('gate').hidden=true;$('app').hidden=false
    await load();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&!$('live-dialog').open&&!document.querySelector('textarea:focus,input:focus'))load().catch(fail)},60000)
  }
  function start() {
    $('app').innerHTML=`<header class="topbar"><div class="topbar-in"><div><div class="brand-title">九龄跟诊 · 医生工作台</div><div id="live-count" class="brand-sub"></div></div><nav class="live-nav"><button id="live-new">新建病例</button><button id="live-bio">医生简介</button><button id="live-slots">预约排班</button><button id="live-refresh">刷新</button><button id="live-out">退出</button></nav></div></header><p id="live-message" class="live-message" role="status"></p><main class="live-board"><aside><div class="live-tools"><input id="live-search" placeholder="搜索宠物 / 手机号"><select id="live-filter"><option value="all">全部病例</option><option value="red">需处理</option><option value="ask">待回复</option><option value="yellow">观察中</option><option value="green">未见明显异常</option></select></div><div id="live-list"></div></aside><section id="live-detail"><p class="live-empty">选择左侧病例，查看打卡变化、提问和病历。</p></section></main><dialog id="live-dialog"><button id="live-close" class="live-close">关闭</button><div id="live-dialog-body"></div></dialog>`
    $('gate-user').placeholder='医生手机号'
    $('gate-demo').onclick=()=>{location.search='?demo=1'}
    const register=document.createElement('button');register.className='gate-demo';register.textContent='注册医生账号';$('gate-form').after(register)
    register.onclick=()=>{
      $('live-dialog-body').innerHTML=`<h2>注册医生账号</h2><form id="live-register">${formField('注册邀请码','registration_code','password','','required')}${formField('医生姓名','name','text','','required')}${formField('诊所名称','clinic_name','text','','required')}${formField('手机号','phone','tel','','required')}${formField('密码（至少10位）','password','password','','required minlength="10"')}<p id="live-register-error" role="alert"></p><button class="btn-primary">注册并登录</button></form>`;$('live-dialog').showModal()
      $('live-register').onsubmit=async e=>{e.preventDefault();try{const r=await api('/register','POST',Object.fromEntries(new FormData(e.target)));token=r.token;sessionStorage.setItem('postop_live_token',token);$('live-dialog').close();await enter()}catch(err){$('live-register-error').textContent=err.message}}
    }
    // Dialog sits outside the hidden app so registration remains visible on the login screen.
    document.body.append($('live-dialog'))
    $('gate-form').onsubmit=async e=>{e.preventDefault();$('gate-submit').disabled=true;try{const r=await api('/login','POST',{phone:$('gate-user').value.trim(),password:$('gate-pass').value});token=r.token;sessionStorage.setItem('postop_live_token',token);await enter()}catch(err){$('gate-err').hidden=false;$('gate-err').textContent=err.message}finally{$('gate-submit').disabled=false}}
    $('live-list').onclick=e=>{const b=e.target.closest('[data-case]');if(b)detail(b.dataset.case).catch(fail)}
    $('live-search').oninput=renderList;$('live-filter').onchange=e=>{filter=e.target.value;renderList()}
    $('live-bio').onclick=()=>openProfile().catch(fail);$('live-slots').onclick=()=>openSchedule().catch(fail);$('live-new').onclick=openCreate
    $('live-refresh').onclick=()=>load().catch(fail);$('live-close').onclick=()=>$('live-dialog').close()
    $('live-out').onclick=()=>{token='';sessionStorage.removeItem('postop_live_token');cases=[];$('live-list').innerHTML='';$('live-detail').innerHTML='';gate()}
    if(token)enter().catch(fail);else gate()
  }
  return {start}
})()
