# 喵喵文生图：云端按 Key 排队

这是一个轻量的排号服务。它不生成图片，不接收 NAI Key、提示词或图片，只接收 Key 的 SHA-256 指纹以及随机的排队标识。

所有用户只填同一个队列服务根地址。A/B 使用同一个 Key 时指纹相同，会排入同一队列；C 使用另一个 Key 时自动进入独立队列，无需额外配置。

## 插件使用

1. 在「生成」页保存一次自己的 NAI Key。Key 仍由酒馆密钥管理保存；插件只额外记录它的指纹。
2. 填入我们部署的队列服务地址，点击「检查队列连接」。
3. 打开「启用云端排队」。

轮到自己时，插件通过酒馆原有 NAI 接口生成，生成结束再释放排号。无需给每个 Key 单独填服务地址，也不需要安装酒馆服务端插件。

如果在别的插件中切换或删除了酒馆 NAI Key，需要在本插件重新保存一次，重新关联当前 Key 的指纹。

## 免费服务部署：Render

仓库提供 `render.yaml`，也可手动新建一个 Web Service：

- 代码仓库：本仓库
- Runtime：Node
- Build Command：`node --check queue-service/service.mjs`
- Start Command：`node queue-service/service.mjs`
- Instance Type：**Free**
- Health Check Path：`/ping`

Render 免费实例闲置后会休眠，下次访问可能需要约一分钟唤醒。免费额度和休眠政策以 [Render 官方说明](https://render.com/docs/free) 为准。此服务不需要 GPU、数据库、NAI Key 或付费实例。

如果有现成能运行 Docker 的平台，也可使用 `Dockerfile.queue`；设置平台端口指向环境变量 `PORT`（默认 7860）。

本地检查：

```sh
node queue-service/service.mjs
```

根路径返回服务说明，`/ping` 用于连通性检查。`POST /join-queue` 入队，`POST /my-turn` 查询和续期，`POST /complete` 释放，`POST /leave-queue` 退出。

## 队列边界

- 同一把 Key 的所有使用者必须使用**同一个队列服务**。绕过队列直接在官网或别处生成时，服务无法协调那次请求，NAI 仍可能返回占用或限流错误。
- 当前服务是内存队列，只部署**一个实例**。重启会清空排队，不会自动重放可能已扣费的生成请求。
- 等待中的任务持续轮询；断线约 90 秒后移除。持有生成权限的任务有超时租约，关闭页面不会永久卡住其他人。
- 普通生成错误会释放排号，不自动重复调用 NAI。网络超时可能无法确认是否已生成，此时等待租约自然到期，降低撞车风险。
- 服务不记录或公开 Key 指纹列表，也不显示其他用户的 Key。任意 HTTP 请求若携带 `key` 字段会被拒绝。

`npm test` 包括 A/B 同 Key、C 不同 Key 的并发测试，以及租约过期、重复入队、错误释放等测试，均不使用真实 NAI Key。
