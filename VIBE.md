# Vibe 氛围迁移

普通生图、Google 翻译、思维链排除和图片分页只需更新前端。**Vibe 需要在运行酒馆的云端服务器安装配套服务端插件。** 酒馆现有 NAI 接口会清空参考数组，不能仅靠前端设置实现 Vibe。

## 云端安装

在酒馆根目录执行：

```sh
git clone https://github.com/AYUUKI-K/Miao-Text-to-Image.git plugins/miao-nai-image
```

在该酒馆的 `config.yaml` 中将 `enableServerPlugins` 设为 `true`，重启酒馆。`package.json` 自动加载 `server-plugin/index.mjs`，没有额外 npm 依赖，不修改酒馆源码，不需要在 Cloudflare 放 Key。

后端更新：在 `plugins/miao-nai-image` 执行 `git pull`，重启酒馆。前端也要在扩展管理中更新并刷新页面。Vibe 页刷新能看到空列表或已有条目即表示连接正常；未安装会显示说明，普通生图仍可用。

## 使用

1. 在「Vibe」页导入官方 `.naiv4vibe` / `.naiv4vibeBundle`。支持 V4、V4.5 编码，暂不支持带遮罩编码。
2. 也可上传 PNG/JPEG/WebP，选择模型与信息提取量，点击「编码并保存」。新编码通常消耗 2 Anlas；相同条目、模型和提取量会复用编码。导入已有编码不需要再次编码。
3. 到「配置」页勾选本套配置使用的 Vibe，选择编码与强度。A/B 配置的选择和强度独立保存，复制后也可独立修改。
4. 生成只使用匹配当前模型的编码；缺失或模型不匹配会报错，绝不静默忽略。最多同时启用 16 个 Vibe。

按 [NovelAI 官方说明](https://docs.novelai.net/en/image/vibetransfer/)，V4 及以上超过 4 个 Vibe 时，每增加一个会额外消耗 2 Anlas。强度总和通常建议不超过 1，本插件按填写值发送，不自动归一化。

## 数据

- Vibe 编码、原图保存在当前酒馆用户目录的 `miao-vibes/` 中，不占浏览器缓存；不同用户隔离。备份酒馆时应包含此目录。
- 设置和聊天只记录 Vibe ID、编码选项及强度，不记录大段编码或 Key。
- 后端使用当前登录用户的酒馆 NAI 密钥，只向 `https://image.novelai.net` 发送生成/编码请求。不接受任意目标地址。
- 公共排队服务仍只接收 Key 指纹和随机标识，不接收 Key、图片、Vibe 或提示词。
- 删除 Vibe 会移除当前配置库对它的引用，不删除已经生成的图片。

## 翻译、思维链与分页

「查看提示词」的 Google 翻译调用酒馆自带 `/api/translate/google`，点击时把该段提示词发送到 Google。译文仅供查看，不改变生图内容。酒馆服务器需要能连接 Google，失败会在弹窗报错。

捕捉自动读取酒馆当前 `powerUserSettings.reasoning` 的前缀和后缀，排除对应区域，同时排除常见 think/thinking/analysis/reasoning 标签。未闭合的思维链排除到消息结尾；`message.extra.reasoning` 从不作为来源。

图片管理每页 24 张。选择日期和按日期清理包含同一天其他页的图片；确认弹窗会显示总数和前 24 张预览。

## 验证范围

测试覆盖官方文件/Bundle、模型匹配、后端用户隔离、编码复用、Vibe 生图请求、思维链、分页与队列。NAI 后端请求使用模拟响应验证，没有消耗账户 Anlas。首次在云端安装后，请使用自己的 Vibe 生成一张确认效果。
