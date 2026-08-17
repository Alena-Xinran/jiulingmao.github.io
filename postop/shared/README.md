# 共享规则

`rules.js` / `ai.js` 是从 `postop_front/utils/` **原样复制**过来的，
两边必须是同一份——分级规则一旦漂移，主人看到的和医生看到的就不是一个结论了。

改动只改 `postop_front/utils/`，然后同步：

```bash
cp postop_front/utils/{rules.js,ai.js} jiulingmao.github.io/postop/shared/
```

这两个文件做了双端导出（CommonJS + `window.PostopRules` / `window.PostopAI`），
小程序 `require()` 和浏览器 `<script>` 都能用。
