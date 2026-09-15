/* Daily photo comparison shared by demo and live doctor workspaces. */
window.PostopPhotoHistory = (function () {
  const days = new Map()
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const safeUrl = value => /^(https?:\/\/|\/)/i.test(value || '') && !/^\/\//.test(value) ? value : ''
  function group(reports) {
    const grouped = new Map()
    ;(reports || []).slice().sort((a,b) => String(a.date).localeCompare(String(b.date)) || (a.seq||1)-(b.seq||1) || (a.created_at||0)-(b.created_at||0)).forEach(r => {
      const date = r.date || ('第 '+r.day+' 天')
      if (!grouped.has(date)) grouped.set(date,{date,day:r.day,photos:[]})
      const day = grouped.get(date)
      let photos = r.photos || []
      if (!photos.length && r.has_photo) photos = [{placeholder:true}]
      photos.forEach(p => day.photos.push({url:safeUrl(p.url),seq:r.seq||1,placeholder:!!p.placeholder}))
    })
    return Array.from(grouped.values())
  }
  function picture(p, label) {
    return p && p.url ? '<img loading="lazy" src="'+esc(p.url)+'" alt="'+esc(label)+'">' : '<div class="ph-empty">'+(p && p.placeholder?'演示照片占位':'当天未上传照片')+'</div>'
  }
  function render(c, reports) {
    const rows=group(reports)
    if (!rows.length) return '<p>暂无打卡照片</p>'
    return '<div class="ph-timeline">'+rows.map((d,i)=>{
      const key=String(c.id)+':'+d.date
      days.set(key,d)
      const cover=d.photos[d.photos.length-1]
      return '<article class="ph-day">'+(cover?'<button type="button" class="ph-cover" data-photo-day="'+esc(key)+'">'+picture(cover,d.date+'伤口照片')+'</button>':picture(null,''))+'<strong>'+esc(d.date)+'</strong><span>第 '+esc(d.day)+' 天</span>'+(d.photos.length>1?'<button type="button" class="ph-more" data-photo-day="'+esc(key)+'">更多（'+d.photos.length+'张）</button>':'')+'</article>'
    }).join('')+'</div>'
  }
  document.addEventListener('click',e=>{
    const trigger=e.target.closest('[data-photo-day]')
    if(!trigger) return
    const d=days.get(trigger.dataset.photoDay)
    if(!d) return
    let modal=document.getElementById('photo-day-modal')
    if(!modal){modal=document.createElement('dialog');modal.id='photo-day-modal';modal.className='ph-modal';document.body.append(modal);modal.addEventListener('click',event=>{if(event.target===modal || event.target.closest('[data-close-photos]'))modal.close()})}
    modal.innerHTML='<div class="ph-modal-head"><h2>'+esc(d.date)+' · 全部照片（'+d.photos.length+'张）</h2><button type="button" data-close-photos aria-label="关闭照片">关闭</button></div><div class="ph-grid">'+d.photos.map((p,i)=>'<figure>'+ (p.url?'<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+picture(p,'第'+(i+1)+'张')+'</a>':picture(p,''))+'<figcaption>第 '+p.seq+' 次打卡 · 照片 '+(i+1)+'</figcaption></figure>').join('')+'</div>'
    modal.showModal()
  })
  return {render,group}
})()
