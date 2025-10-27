# 部署检查清单

## 部署前准备

### 1. awcamsg 服务部署 ✅

- [ ] 克隆 awcamsg 项目
- [ ] 运行 `docker-compose up -d --build`
- [ ] 获取自动生成的 API Key
- [ ] 访问 `/api/status` 获取二维码
- [ ] 使用 WhatsApp 扫码登录
- [ ] 调用 `/api/groups` 获取群组列表
- [ ] 记录目标群组 JID

### 2. 环境变量配置 ✅

在 `.env` 文件中配置以下变量：

- [ ] `APP_PASSWORD` - 应用访问密码
- [ ] `TIMEZONE=Asia/Shanghai`
- [ ] `MAX_UNREAD_DAYS=7`
- [ ] `WHATSAPP_API_URL` - awcamsg 服务地址
- [ ] `WHATSAPP_API_KEY` - 从 awcamsg 服务获取
- [ ] `WHATSAPP_GROUP_JID` - 从群组列表获取

### 3. 项目代码确认 ✅

- [ ] `api/notification.js` - 已添加 WhatsApp API 支持
- [ ] `frontend/src/App.vue` - 默认渠道已改为 whatsapp_api
- [ ] `.env.example` - 已添加 WhatsApp API 环境变量
- [ ] `vercel.json` - Vercel 配置完整

## Vercel 部署步骤

### 1. GitHub 推送
```bash
git add .
git commit -m "集成 WhatsApp API 服务"
git push origin main
```

### 2. Vercel 导入
- [ ] 访问 [vercel.com](https://vercel.com)
- [ ] 点击 "Add New Project"
- [ ] 选择 GitHub 仓库
- [ ] Vercel 自动检测项目类型

### 3. 环境变量配置
在 Vercel 项目设置中添加：

- [ ] `APP_PASSWORD`
- [ ] `TIMEZONE`
- [ ] `MAX_UNREAD_DAYS`
- [ ] `CRON_SECRET` (可选)
- [ ] `WHATSAPP_API_URL`
- [ ] `WHATSAPP_API_KEY`
- [ ] `WHATSAPP_GROUP_JID`

### 4. 部署
- [ ] 点击 "Deploy" 按钮
- [ ] 等待部署完成
- [ ] 记录部署 URL

## 部署后测试

### 1. 基础功能测试
- [ ] 访问部署的网站
- [ ] 输入应用密码登录
- [ ] 添加测试用户
- [ ] 设置用户读经状态

### 2. WhatsApp 集成测试
- [ ] 点击 "统计" 按钮
- [ ] 检查指定群组是否收到消息
- [ ] 验证消息格式正确
- [ ] 验证消息内容完整

### 3. 错误处理测试
- [ ] 测试错误的 API Key
- [ ] 测试错误的群组 JID
- [ ] 测试 awcamsg 服务不可用的情况

### 4. 性能测试
- [ ] 测试消息发送延迟 (<5秒)
- [ ] 测试并发访问
- [ ] 检查 Vercel 函数日志

## 故障排除

### 问题：消息发送失败

**排查步骤：**
1. 检查 Vercel 函数日志
   ```bash
   vercel logs
   ```

2. 检查 awcamsg 服务状态
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

3. 验证环境变量
   - API URL 是否正确
   - API Key 是否有效
   - 群组 JID 是否正确

4. 测试 API 连接
   ```bash
   curl -X POST https://your-awcamsg-url/api/send-message \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_API_KEY" \
     -d '{"jid": "test@g.us", "message": "test"}'
   ```

### 问题：二维码无法获取

**解决方案：**
1. 重启 awcamsg 服务
   ```bash
   docker-compose restart
   ```

2. 访问 `/api/request-qr` 强制生成新二维码

### 问题：群组 JID 找不到

**解决方法：**
1. 确认已登录 WhatsApp
2. 确保用户至少在一个群组中
3. 调用 `/api/groups` 重新获取

## 成功标准

✅ **部署成功的标志：**
1. 网站可以正常访问和登录
2. 可以添加和管理用户
3. 点击统计按钮后，WhatsApp 群组能收到格式正确的统计消息
4. Vercel 函数日志显示成功发送
5. awcamsg 服务保持稳定运行

## 维护建议

### 日常维护
- [ ] 定期检查 awcamsg 服务状态
- [ ] 监控 Vercel 函数日志
- [ ] 备份重要数据

### 升级计划
- [ ] 定期更新依赖包
- [ ] 关注 awcamsg 项目更新
- [ ] 优化消息发送性能

## 联系信息

如遇到问题，请参考：
- 部署指南：`WHATSAPP_API_SETUP.md`
- 集成总结：`INTEGRATION_SUMMARY.md`
- awcamsg 项目文档：https://github.com/linbmv/awcamsg

---
**最后更新：** 2025-10-27
