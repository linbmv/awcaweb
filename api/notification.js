/* eslint-disable no-undef */
// /api/notification.js - 消息推送API

const { generateStatisticsText } = require('./_lib/utils.js');

// 导入Baileys发送器
let WhatsAppSender;
try {
    WhatsAppSender = require('./whatsapp-sender');
} catch (error) {
    console.log('Baileys模块未找到，跳过WhatsApp Baileys支持');
}

// 统一的消息推送服务
class NotificationService {
    // 通过Baileys发送WhatsApp消息（仅发送）
    async sendWhatsAppBaileys(message, recipientJid = null) {
        // 如果没有提供目标JID，使用环境变量中的默认值
        const defaultRecipient = process.env.WHATSAPP_BAILEYS_RECIPIENT_PHONE;
        const targetJid = recipientJid || defaultRecipient;

        const baileysEnabled = process.env.WHATSAPP_BAILEYS_ENABLED === 'true';

        if (!baileysEnabled || !targetJid) {
            if (!recipientJid) {
                // 如果是使用默认值的情况下失败，给出警告
                console.warn('WhatsApp Baileys 配置未设置 (WHATSAPP_BAILEYS_ENABLED=true, WHATSAPP_BAILEYS_RECIPIENT_PHONE)');
                return;
            } else {
                // 如果是用户提供了JID但仍然失败，抛出错误
                throw new Error('WhatsApp Baileys 未启用或目标JID未提供');
            }
        }

        try {
            // 检查是否已安装Baileys模块
            if (!WhatsAppSender) {
                throw new Error('Baileys模块未安装或未找到');
            }

            // 构建完整的API URL
            const port = process.env.PORT || 3003;
            const baseUrl = `http://localhost:${port}`;
            const response = await fetch(`${baseUrl}/api/whatsapp-sender`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: targetJid,
                    message: message
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`发送 WhatsApp Baileys 消息失败: ${errorData.error?.message || response.statusText}`);
            }

            console.log(`WhatsApp Baileys 消息发送成功到 ${targetJid}`);
        } catch (error) {
            console.error('发送 WhatsApp Baileys 消息失败:', error);
            throw error;
        }
    }

    // 发送到Bark
    async sendBark(message) {
        const barkUrl = process.env.BARK_URL;
        if (!barkUrl) {
            throw new Error('Bark URL未配置');
        }
        // Bark的URL通常是 https://api.day.app/your_device_key/推送内容
        const fullUrl = barkUrl.endsWith('/') ?
            `${barkUrl}${encodeURIComponent(message)}` :
            `${barkUrl}/${encodeURIComponent(message)}`;

        const response = await fetch(fullUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`发送 Bark 消息失败: HTTP ${response.status} - ${errorText}`);
        }

        return response;
    }

    // 发送到通用Webhook
n    // 通过外部 WhatsApp API 服务发送消息
    async sendWhatsAppApi(message) {
        const whatsappApiUrl = process.env.WHATSAPP_API_URL;
        const whatsappApiKey = process.env.WHATSAPP_API_KEY;
        const whatsappGroupJid = process.env.WHATSAPP_GROUP_JID;

        if (!whatsappApiUrl || !whatsappApiKey) {
            throw new Error("WhatsApp API URL 或 API Key 未配置");
        }

        if (!whatsappGroupJid) {
            throw new Error("WhatsApp 群组 JID 未配置");
        }

        try {
            const response = await fetch(`${whatsappApiUrl}/api/send-message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": whatsappApiKey
                },
                body: JSON.stringify({
                    jid: whatsappGroupJid,
                    message: message
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`发送 WhatsApp API 消息失败: ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            console.log("WhatsApp API 消息发送成功:", result);
            return result;
        } catch (error) {
            console.error("发送 WhatsApp API 消息失败:", error);
            throw error;
        }
    }
    async sendWebhook(message) {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
            throw new Error('Webhook URL未配置');
        }
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }), // 很多webhook接受content字段
        });
    }

    async send(channel, message, options = {}) {
        // 如果channel为'notification'，则发送到所有已配置的渠道
        if (channel === 'notification' || channel === 'all' || channel === 'all_channels') {
            return this.sendToAllChannels(message);
        }

        const adapters = {
            'whatsapp_baileys': this.sendWhatsAppBaileys,
            'whatsapp_api': this.sendWhatsAppApi,
            'bark': this.sendBark,
            'webhook': this.sendWebhook
        };
        if (!adapters[channel]) {
            throw new Error(`不支持的消息渠道: ${channel}`);
        }

        // 根据渠道类型传递不同的参数
        if (channel === 'whatsapp_baileys') {
            return adapters[channel].call(this, message, options.recipientJid);
        } else {
            return adapters[channel].call(this, message);
        }
    }

    // 发送到所有已配置的渠道
    async sendToAllChannels(message) {
        const channels = [];

        // 检查并收集所有已配置的渠道
        if (process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_GROUP_JID) {
            channels.push("whatsapp_api");
        }


        if (process.env.WHATSAPP_BAILEYS_ENABLED === 'true' && process.env.WHATSAPP_BAILEYS_RECIPIENT_PHONE) {
            channels.push('whatsapp_baileys');
        }

        if (process.env.BARK_URL) {
            channels.push('bark');
        }

        if (process.env.WEBHOOK_URL) {
            channels.push('webhook');
        }

        if (channels.length === 0) {
            throw new Error('没有配置任何通知渠道');
        }

        // 并行发送到所有已配置的渠道
        const results = await Promise.allSettled(
            channels.map(channel => this.send(channel, message))
        );

        // 记录结果
        const successful = [];
        const failed = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successful.push(channels[index]);
            } else {
                failed.push({ channel: channels[index], error: result.reason });
            }
        });

        return {
            successful,
            failed,
            total: channels.length,
            message: `成功发送到 ${successful.length}/${channels.length} 个渠道`
        };
    }

    // 发送到特定的WhatsApp群组（绕过配置检查，直接发送到指定JID）
    async sendToWhatsAppGroup(message, groupJid) {
        if (!groupJid) {
            throw new Error('必须提供群组JID');
        }

        try {
            // 尝试通过Baileys发送（如果可用）
            if (process.env.WHATSAPP_BAILEYS_ENABLED === 'true') {
                await this.sendWhatsAppBaileys(message, groupJid);
                return {
                    success: true,
                    channel: 'whatsapp_baileys',
                    message: `消息已发送到群组 ${groupJid}`
                };
            } else {
                throw new Error('WhatsApp Baileys未启用');
            }
        } catch (error) {
            console.error('发送到WhatsApp群组失败:', error);
            throw error;
        }
    }
}

// 同时导出NotificationService类和API处理函数
module.exports = NotificationService;
module.exports.NotificationService = NotificationService;

// Vercel Serverless Function for notification
module.exports.handler = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { channel, message } = req.body;

    if (!message) {
      return res.status(400).json({ error: '缺少message参数' });
    }

    const notificationService = new NotificationService();

    // 如果channel为'all'，则发送到所有已配置的渠道
    let result;
    if (channel === 'all' || channel === 'all_channels') {
      result = await notificationService.sendToAllChannels(message);
      return res.status(200).json({
        success: true,
        message: result.message,
        details: result
      });
    } else {
      if (!channel) {
        return res.status(400).json({ error: '缺少channel参数' });
      }
      await notificationService.send(channel, message);
      return res.status(200).json({ success: true, message: `消息已发送到 ${channel}` });
    }
  } catch (error) {
    console.error(`发送通知失败:`, error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = {
  runtime: 'nodejs',
};
