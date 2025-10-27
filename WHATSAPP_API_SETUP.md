# WhatsApp API 集成部署指南

## 概述

本项目已集成了独立的 WhatsApp API 服务（awcamsg），用于在点击"统计"按钮时自动发送消息到指定的 WhatsApp 群组。

## 部署步骤

### 步骤 1: 部署 awcamsg 服务

1. 克隆 awcamsg 项目：
```bash
git clone https://github.com/linbmv/awcamsg.git
cd awcamsg
```

2. 使用 Docker Compose 部署：
```bash
docker-compose up -d --build
```

3. 查看日志并获取 API Key：
```bash
docker-compose logs -f
```
首次启动时会生成 API Key，请记录下来。

4. 扫码登录：
- 访问 http://localhost:3000/api/status 获取二维码
- 使用 WhatsApp 手机应用扫描二维码完成登录

5. 获取群组 JID：
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:3000/api/groups
```
选择目标群组，记录其 JID（格式：群组名-群组ID@g.us）

### 步骤 2: 配置 abread 项目

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填写以下关键配置：

```env
# WhatsApp API 服务配置
WHATSAPP_API_URL=http://your-awcamsg-service.com:3000
WHATSAPP_API_KEY=your_api_key_from_awcamsg
WHATSAPP_GROUP_JID=your-group-jid@g.us

# 基础配置
APP_PASSWORD=your_app_password
TIMEZONE=Asia/Shanghai
MAX_UNREAD_DAYS=7
```

### 步骤 3: 部署到 Vercel

1. 将项目推送到 GitHub：
```bash
git add .
git commit -m "集成 WhatsApp API 服务"
git push
```

2. 在 Vercel 中导入项目：
- 访问 [Vercel](https://vercel.com)
- 点击 "Add New Project"
- 选择你的 GitHub 仓库

3. 配置环境变量：
在 Vercel 项目设置中添加以下环境变量：
- `APP_PASSWORD`
- `TIMEZONE`
- `MAX_UNREAD_DAYS`
- `CRON_SECRET`
- `WHATSAPP_API_URL`
- `WHATSAPP_API_KEY`
- `WHATSAPP_GROUP_JID`

4. 部署：
点击 "Deploy" 完成部署。

### 步骤 4: 测试功能

1. 访问部署的网站
2. 输入应用密码登录
3. 添加一些用户并设置状态
4. 点击 WhatsApp 图标的"统计"按钮
5. 检查指定群组是否收到消息

## 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `WHATSAPP_API_URL` | awcamsg 服务的访问地址 | `http://localhost:3000` 或 `https://awcamsg.vercel.app` |
| `WHATSAPP_API_KEY` | awcamsg 服务的 API 密钥 | `a1b2c3d4e5f6...` |
| `WHATSAPP_GROUP_JID` | 目标群组的 JID | `读经群-123456789@g.us` |

## 故障排除

### 问题 1: 发送失败

检查：
1. awcamsg 服务是否正常运行
2. API Key 是否正确
3. 群组 JID 是否正确
4. 是否已扫码登录 WhatsApp

查看 Vercel 函数的日志：
```bash
vercel logs
```

### 问题 2: CORS 错误

确保 awcamsg 服务的 CORS 配置允许来自 Vercel 域名的请求。

### 问题 3: 群组 JID 找不到

使用以下 API 获取群组列表：
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://your-awcamsg-url/api/groups
```

## 工作流程

1. 用户在 abread 网站中管理读经状态
2. 点击"统计"按钮时，系统生成统计文本
3. 前端调用 `/api/statistics-to-channel` API
4. 后端调用 awcamsg 服务的 `/api/send-message` 接口
5. WhatsApp 消息发送到指定群组

## 注意事项

- awcamsg 服务需要持续运行以保持 WhatsApp 连接
- 如果服务重启，需要重新扫码登录
- API Key 和群组 JID 是敏感信息，请妥善保管
- 建议使用 HTTPS 部署 awcamsg 服务以提高安全性
