/* eslint-disable no-undef */
// /api/send-statistics.js - 发送统计信息（支持WhatsApp真实@用户）

const path = require('path');
const fs = require('fs').promises;

// 导入通知服务
const NotificationService = require('./notification.js');

// 本地数据存储路径
const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'local-data.json');
const ASSOCIATION_FILE = path.join(__dirname, '..', 'data', 'whatsapp-associations.json');

// 读取关联数据
async function readAssociations() {
  try {
    const data = await fs.readFile(ASSOCIATION_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      userToContact: {},
      contactToUser: {}
    };
  }
}

// 读取用户数据
async function readUsers() {
  try {
    const data = await fs.readFile(LOCAL_DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch (error) {
    return [];
  }
}

// 生成统计信息（支持WhatsApp格式）
async function generateStatisticsText(users, useWhatsAppFormat = false) {
  const unreadUsers = users.filter(user => !user.isRead && !user.frozen);
  const frozenUsers = users.filter(user => user.frozen);

  // 读取关联数据
  const associations = await readAssociations();

  // 按未读天数分组
  const groups = {};
  unreadUsers.forEach(user => {
    const days = user.unreadDays;
    if (!groups[days]) {
      groups[days] = [];
    }
    groups[days].push(user);
  });

  // 生成文本
  let text = '📖 每日读经统计\n\n';

  // 按天数排序显示
  const sortedDays = Object.keys(groups).map(Number).sort((a, b) => a - b);

  if (useWhatsAppFormat && associations) {
    // WhatsApp格式 - 使用真实@用户
    for (const days of sortedDays) {
      const usersInGroup = groups[days];
      const mentions = usersInGroup.map(user => {
        const contactJid = associations.userToContact[user.id];
        if (contactJid) {
          // 使用真实@用户
          return `@${user.name} (${days}日未读)`;
        } else {
          // 如果没有关联，使用文本格式
          return `@${user.name} (${days}日未读)`;
        }
      }).join('\n');

      text += `${mentions}\n\n`;
    }
  } else {
    // 普通格式
    for (const days of sortedDays) {
      const usersInGroup = groups[days];
      const names = usersInGroup.map(user => `@${user.name}`).join(' ');
      text += `${names} ${days}日未读\n\n`;
    }
  }

  // 显示冻结用户
  if (frozenUsers.length > 0) {
    text += `\n⚠️ 冻结用户（连续7天未读）:\n`;
    const frozenNames = frozenUsers.map(user => `@${user.name}`).join(' ');
    text += `${frozenNames}`;
  }

  if (unreadUsers.length === 0 && frozenUsers.length === 0) {
    text += '🎉 所有用户今日均已完成读经！';
  }

  return text;
}

// Vercel Serverless Function
module.exports = async (req, res) => {
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
    const { channel = 'all', useWhatsAppFormat = false } = req.body;

    // 读取用户数据
    const users = await readUsers();

    // 生成统计信息
    const statistics = await generateStatisticsText(users, useWhatsAppFormat);

    // 发送统计信息
    const notificationService = new NotificationService();

    let result;
    if (channel === 'all' || channel === 'all_channels' || channel === 'notification') {
      result = await notificationService.sendToAllChannels(statistics);
      return res.status(200).json({
        success: true,
        message: result.message,
        statistics,
        details: result
      });
    } else {
      await notificationService.send(channel, statistics);
      return res.status(200).json({
        success: true,
        message: `统计信息已发送到 ${channel}`,
        statistics
      });
    }
  } catch (error) {
    console.error(`发送统计失败:`, error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = {
  runtime: 'nodejs',
};
