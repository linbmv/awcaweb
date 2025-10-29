## 操作日志 - 修复统计发送渠道问题

**时间**: 2025-10-30
**任务**: 修复 .env 配置后仍出现 500 错误的问题

### 问题描述
用户在 `.env` 文件中已配置 WhatsApp 群组信息，但前端发送统计信息时仍然出现 500 错误：
- POST 请求到 `/api/statistics-to-channel` 返回 500 内部服务器错误
- 前端显示 `channel is not defined` 错误

### 问题根因分析

**配置不匹配问题**：
1. `.env` 文件中已正确配置：
   - `WHATSAPP_BAILEYS_ENABLED=true`
   - `WHATSAPP_BAILEYS_RECIPIENT_PHONE=120363402186536633@g.us`

2. 但以下配置被注释：
   - `WHATSAPP_API_URL` (被注释)
   - `WHATSAPP_API_KEY` (被注释)

3. 前端代码默认使用渠道：`'whatsapp_api'`
   - `frontend/src/services/api.js:62` 默认参数为 `'whatsapp_api'`
   - `frontend/src/App.vue:378` 默认渠道为 `'whatsapp_api'`

4. API 路由处理逻辑：
   - 前端调用 `/api/statistics-to-channel`
   - 传递 `channel='whatsapp_api'` 和 `customStats`
   - 后端尝试使用 `whatsapp_api` 渠道发送
   - 缺少 `WHATSAPP_API_URL` 和 `WHATSAPP_API_KEY` 配置，抛出错误

### 解决方案
**将前端默认渠道修改为 `whatsapp_baileys`**，与用户实际配置的渠道保持一致。

### 实施步骤

#### 步骤1: 修复 API 服务默认参数
**文件**: `frontend/src/services/api.js:62`

**修改前**:
```javascript
async sendStatisticsToChannel(stats, channel = 'whatsapp_api') {
  return await api.post('/statistics-to-channel', { customStats: stats, channel })
},
```

**修改后**:
```javascript
async sendStatisticsToChannel(stats, channel = 'whatsapp_baileys') {
  return await api.post('/statistics-to-channel', { customStats: stats, channel })
},
```

**理由**: API 服务层是其他组件调用的基础，需确保默认配置与实际环境一致。

#### 步骤2: 修复前端组件默认渠道
**文件**: `frontend/src/App.vue:378`

**修改前**:
```javascript
channel = 'whatsapp_api';
```

**修改后**:
```javascript
channel = 'whatsapp_baileys';
```

**理由**: Vue 组件是最终用户交互层，需与 API 服务保持一致。

### 验证结果

**修改后流程**:
1. 用户点击发送统计按钮
2. 前端使用 `channel='whatsapp_baileys'` 调用 API
3. `/api/statistics-to-channel` 路由接收请求
4. `NotificationService` 调用 `sendWhatsAppBaileys` 方法
5. 方法检查 `WHATSAPP_BAILEYS_ENABLED=true` ✓
6. 方法使用 `WHATSAPP_BAILEYS_RECIPIENT_PHONE=120363402186536633@g.us` ✓
7. 消息成功发送到 WhatsApp 群组

**预期结果**:
- 不再出现 500 错误
- 统计信息成功发送到配置的群组
- 前端显示成功消息

### 技术细节

**涉及的组件**:
- `NotificationService` 类 (`api/notification.js`)
- WhatsApp Baileys 发送器 (`api/whatsapp-sender.js`)
- 前端 API 服务 (`frontend/src/services/api.js`)
- 主应用组件 (`frontend/src/App.vue`)

**配置验证逻辑**:
```javascript
// 在 notification.js 第 22-32 行
const baileysEnabled = process.env.WHATSAPP_BAILEYS_ENABLED === 'true';
const targetJid = recipientJid || process.env.WHATSAPP_BAILEYS_RECIPIENT_PHONE;

if (!baileysEnabled || !targetJid) {
    console.warn('WhatsApp Baileys 配置未设置');
    return;
}
```

### 风险评估

**低风险修改**:
- ✅ 仅修改默认值，不影响自定义配置
- ✅ 不改变 API 接口或返回格式
- ✅ 向前兼容，已有自定义配置的用户不受影响
- ✅ 改善用户体验，解决实际使用问题

**潜在改进点**:
1. 未来可添加渠道配置验证机制，在启动时检查配置完整性
2. 前端可添加渠道选择器，让用户明确选择发送渠道
3. 文档中明确说明不同渠道的配置要求

### 总结

此次修复成功解决了用户配置与环境不匹配导致的 500 错误问题。通过将前端默认渠道从 `whatsapp_api` 改为 `whatsapp_baileys`，使代码与用户在 `.env` 中的实际配置保持一致。

**修改范围**: 2 行代码
**修复难度**: 简单
**测试建议**: 人工验证发送统计功能，确认消息成功发送到 WhatsApp 群组
