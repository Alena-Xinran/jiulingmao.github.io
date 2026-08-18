/**
 * 术后跟诊工作台 · 演示数据入口
 *
 * 真正的剧本在 shared/demo-cast.js —— 那份是**和宠主端小程序共用**的，
 * 同一批家长、同一批宠物、同一批记录。演示时才能「家长端填一条 → 医生端立刻看到这只」。
 * 各自造数据的话，现场一对不上就穿帮了。
 *
 * 这里只做一件事：把剧本转成看板要的形状。
 */
(function (global) {
  var CAST = global.PostopCast

  function build() {
    var data = CAST.build()
    return {
      hospital: data.hospital,
      doctors: data.doctors.map(function (d) { return d.name }),
      doctorList: data.doctors,
      owners: data.owners,
      cases: data.cases,
    }
  }

  global.PostopDemo = { build: build, dateStr: CAST.dateStr }
})(window)
