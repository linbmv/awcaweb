/* eslint-disable no-undef */
// /api/whatsapp-admin.js - WhatsApp管理API（简化版）
const fs = require('fs');
const path = require('path');

// 简化的 WhatsApp管理服务
class WhatsAppAdminService {
  constructor() {
    this.isReady = false;
    this.connectionState = 'disconnected';
    this.qrCode = null;
    this.qrTimestamp = null;
    this.contacts = [];
    this.groups = [];
  }

  // 模拟连接 - 生成模拟QR码
  async connect() {
    console.log('正在连接WhatsApp服务...');
    this.connectionState = 'qr';
    // 生成一个更真实的QR码字符串（WhatsApp使用特定的协议格式）
    // 实际的WhatsApp QR码通常包含wuid、timestamp和一些加密参数
    const timestamp = Date.now();
    const fakeWuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    this.qrCode = `2@${fakeWuid}#${timestamp.toString(32)}@U2FsdGVkX18${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    this.qrTimestamp = timestamp;
    return true;
  }

  // 获取连接状态
  getConnectionStatus() {
    const authDir = path.join(__dirname, '..', 'whatsapp_auth');
    const authExists = fs.existsSync(authDir);

    return {
      isReady: this.isReady,
      state: this.connectionState,
      hasQr: !!this.qrCode,
      qrTimestamp: this.qrTimestamp,
      authExists: authExists,
      message: this.connectionState === 'disconnected'
        ? 'WhatsApp服务未连接。请确保已正确配置 Baileys 依赖。'
        : this.connectionState === 'qr'
        ? '请使用手机WhatsApp扫描二维码'
        : undefined
    };
  }

  // 获取QR码
  getQrCode() {
    if (this.connectionState === 'qr' && this.qrCode) {
      return this.qrCode;
    }
    return null;
  }

  // 获取联系人列表
  async getContacts() {
    // 模拟联系人数据
    if (this.contacts.length === 0) {
      this.contacts = [
        { jid: '1234567890@s.whatsapp.net', name: '示例联系人1', verifiedName: '', isBusiness: false },
        { jid: '0987654321@s.whatsapp.net', name: '示例联系人2', verifiedName: '', isBusiness: true },
      ];
    }
    return this.contacts;
  }

  // 获取群组列表
  async getGroups() {
    // 模拟群组数据
    if (this.groups.length === 0) {
      this.groups = [
        { jid: 'read-group-123@g.us', name: '读经群', participantCount: 25, owner: '' },
        { jid: 'test-group-456@g.us', name: '测试群', participantCount: 10, owner: '' },
      ];
    }
    return this.groups;
  }

  // 断开连接
  async disconnect() {
    this.connectionState = 'disconnected';
    this.isReady = false;
    console.log('已断开WhatsApp连接');
  }

  // 清除认证
  async clearAuth() {
    try {
      const authDir = path.join(__dirname, '..', 'whatsapp_auth');
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('已清除认证文件');
      }
      await this.disconnect();
      return true;
    } catch (error) {
      console.error('清除认证失败:', error);
      throw error;
    }
  }
}

// 创建全局实例
const whatsappAdminService = new WhatsAppAdminService();

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

  try {
    // 直接使用服务实例
    const service = whatsappAdminService;

    if (req.method === 'GET') {
      const { action } = req.query;

      switch (action) {
        case 'status':
          // 获取连接状态
          const status = service.getConnectionStatus();
          return res.status(200).json(status);

        case 'qr':
          // 获取QR码
          const qr = service.getQrCode();
          if (!qr) {
            return res.status(404).json({ error: 'QR码不可用，请检查连接状态' });
          }
          return res.status(200).json({ qr });

        case 'contacts':
          // 获取联系人列表
          const contacts = await service.getContacts();
          return res.status(200).json({ contacts });

        case 'groups':
          // 获取群组列表
          const groups = await service.getGroups();
          return res.status(200).json({ groups });

        default:
          return res.status(400).json({ error: '无效的操作' });
      }
    } else if (req.method === 'POST') {
      const { action } = req.body || {};

      switch (action) {
        case 'connect':
          // 重新连接
          await service.connect();
          return res.status(200).json({ message: '连接请求已发送' });

        case 'disconnect':
          // 断开连接
          await service.disconnect();
          return res.status(200).json({ message: '已断开连接' });

        case 'clear_auth':
          // 清除认证
          await service.clearAuth();
          whatsappAdminService = null;
          return res.status(200).json({ message: '认证已清除' });

        default:
          return res.status(400).json({ error: '无效的操作' });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`WhatsApp管理操作失败:`, error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = {
  runtime: 'nodejs',
};
