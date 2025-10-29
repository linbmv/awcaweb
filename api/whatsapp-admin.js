/* eslint-disable no-undef */
// /api/whatsapp-admin.js - WhatsApp管理API（使用Baileys实现）
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

// 安全导入baileys模块
let baileysModule;
try {
  baileysModule = require('baileys');
} catch (e) {
  console.error('无法导入baileys模块:', e.message);
  // 导出一个错误处理函数，而不是让整个模块失败
  module.exports = async (req, res) => {
    res.status(500).json({ error: 'Baileys模块未正确安装或配置: ' + e.message });
  };
  module.exports.config = { runtime: 'nodejs' };
  return; // 退出模块执行
}

// 从模块中提取需要的函数
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  jidNormalizedUser,
  proto,
  getContentType,
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore // 新版本中的缓存函数
} = baileysModule;

// 在新版本的baileys中，不再需要makeInMemoryStore，我们创建一个简单的store对象
// 由于新版本的架构变化，我们使用更简单的方式处理存储
const store = {
  bind: (ev) => {
    // 绑定事件监听器
    if (ev) {
      console.log('Store绑定到事件系统');
    }
  },
  loadMessage: () => undefined,
  loadMessages: () => [],
  loadReceipts: () => undefined,
  processMessage: () => {},
  toJSON: () => ({}),
  fromJSON: () => {},
  writeToFile: () => {},
  readFromFile: () => {}
};

// WhatsApp管理服务
class WhatsAppAdminService {
  constructor() {
    this.sock = null;
    this.isReady = false;
    this.connectionState = 'disconnected';
    this.qrCode = null;
    this.qrTimestamp = null;
    this.authState = null;
    this.contacts = [];
    this.groups = [];
    this.qrCallback = null; // 用于在生成QR码时回调
  }

  // 连接到WhatsApp
  async connect() {
    console.log('正在连接到WhatsApp...');

    try {
      // 获取最新版本
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`使用 WhatsApp Web v${version.join('.')}, 最新版本: ${isLatest}`);

      const { state, saveCreds } = await useMultiFileAuthState('./whatsapp_auth');
      this.authState = state;

      // 创建pino logger实例以兼容新版本的baileys
      const pino = require('pino');
      const logger = pino({ level: 'debug' });

      const sock = makeWASocket({
        version,
        auth: state,
        logger: logger,
        printQRInTerminal: false, // 新版本已弃用此选项，需要手动处理QR码
        browser: Browsers.baileys('Desktop'), // 使用桌面浏览器标识
        markOnlineOnConnect: true,
        retryRequestDelayMs: 100,
        maxMsgRetryCount: 10,
      });

      // 存储sock实例
      this.sock = sock;

      // 设置事件监听器
      sock.ev.process(async (events) => {
        // 连接更新
        if (events['connection.update']) {
          const { connection, lastDisconnect, qr } = events['connection.update'];

          if (qr) {
            // 当需要QR码时
            console.log('请扫描以下二维码登录:');
            console.log(qr);
            this.qrCode = qr;
            this.qrTimestamp = Date.now();
            this.connectionState = 'qr';

            // 如果有回调函数，执行它
            if (this.qrCallback) {
              this.qrCallback(qr);
            }
          }

          if (connection === 'open') {
            console.log('已成功连接到WhatsApp');
            this.connectionState = 'connected';
            this.isReady = true;
            this.qrCode = null;
          } else if (connection === 'close') {
            console.log('与WhatsApp断开连接');
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('是否需要重连:', shouldReconnect);

            if (shouldReconnect) {
              setTimeout(() => {
                this.connect();
              }, 5000);
            } else {
              console.log('登录已失效，需要重新扫描QR码');
              this.connectionState = 'disconnected';
            }
          } else if (connection === 'connecting') {
            console.log('正在连接到WhatsApp...');
          }
        }

        // 凭据更新
        if (events['creds.update']) {
          await saveCreds();
          console.log('凭据已更新');
        }

        // 接收到消息
        if (events['messages.upsert']) {
          console.log('接收到消息:', events['messages.upsert']);
        }

        // 群组元数据更新
        if (events['group-metadata.update']) {
          console.log('群组元数据更新:', events['group-metadata.update']);
        }

        // 联系人更新
        if (events['contacts.update']) {
          for (const contact of events['contacts.update']) {
            if (contact.notify) {
              console.log('联系人更新:', contact.notify);
            }
          }
        }
      });

      // 设置store
      store.bind(sock.ev);

      return true;
    } catch (error) {
      console.error('连接到WhatsApp失败:', error);
      this.connectionState = 'disconnected';
      throw error;
    }
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
        : this.connectionState === 'connected'
        ? '已连接到WhatsApp'
        : '正在连接...'
    };
  }

  // 获取QR码
  getQrCode() {
    if (this.connectionState === 'qr' && this.qrCode) {
      return this.qrCode;
    }
    return null;
  }

  // 设置QR码回调函数
  setQrCallback(callback) {
    this.qrCallback = callback;
  }

  // 获取联系人列表
  async getContacts() {
    if (!this.sock) {
      console.log('WhatsApp未连接，返回空联系人列表');
      return [];
    }

    try {
      // 获取所有联系人
      const contacts = this.sock.contacts || {};
      const contactList = Object.values(contacts).map(contact => ({
        jid: contact.id,
        name: contact.name || contact.notify || contact.vname || contact.short || '未知联系人',
        verifiedName: contact.verifiedName || '',
        isBusiness: contact.isBusiness || false
      }));

      this.contacts = contactList;
      return contactList;
    } catch (error) {
      console.error('获取联系人失败:', error);
      return [];
    }
  }

  // 获取群组列表
  async getGroups() {
    if (!this.sock) {
      console.log('WhatsApp未连接，返回空群组列表');
      return [];
    }

    try {
      // 获取群组列表
      const groupData = await this.sock.groupFetchAllParticipating();
      const groupList = Object.values(groupData || {}).map(group => ({
        jid: group.id,
        name: group.subject || '未命名群组',
        participantCount: group.participants ? Object.keys(group.participants).length : 0,
        owner: group.owner || ''
      }));

      this.groups = groupList;
      return groupList;
    } catch (error) {
      console.error('获取群组失败:', error);
      return [];
    }
  }

  // 获取群组成员列表
  async getGroupParticipants(groupJid) {
    if (!this.sock) {
      console.log('WhatsApp未连接，返回空成员列表');
      return [];
    }

    try {
      // 获取群组信息，包括成员
      const groupMetadata = await this.sock.groupMetadata(groupJid);
      const participants = groupMetadata.participants || [];

      const participantList = participants.map(participant => ({
        jid: participant.id,
        name: participant.name || participant.displayName || participant.id,
        isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin',
        isSuperAdmin: participant.admin === 'superadmin'
      }));

      return participantList;
    } catch (error) {
      console.error('获取群组成员失败:', error);
      return [];
    }
  }

  // 断开连接
  async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (error) {
        console.error('登出失败:', error);
      }
      this.sock = null;
      this.isReady = false;
      this.connectionState = 'disconnected';
      console.log('已断开与WhatsApp的连接');
    }
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

  // 获取聊天历史消息
  async getChatMessages(jid, limit = 50) {
    if (!this.sock) {
      throw new Error('WhatsApp未连接');
    }

    try {
      // 尝试从聊天存储中获取消息 - 这是当前版本Baileys的主要方式
      if (this.sock.chats && this.sock.chats.get) {
        const chat = this.sock.chats.get(jid);
        if (chat && chat.msgs) {
          // 尝试获取最近的消息
          const messages = Array.from(chat.msgs.values ? chat.msgs.values() : chat.msgs).slice(-limit);

          // 处理消息数据，使其更易用
          const processedMessages = messages.map(message => {
            const msgKey = message.key;
            const msgContent = message.message;

            let messageText = '';
            let messageType = 'unknown';

            if (msgContent?.conversation) {
              messageText = msgContent.conversation;
              messageType = 'text';
            } else if (msgContent?.extendedTextMessage?.text) {
              messageText = msgContent.extendedTextMessage.text;
              messageType = 'text';
            } else if (msgContent?.imageMessage) {
              messageText = '[图片消息]';
              messageType = 'image';
            } else if (msgContent?.videoMessage) {
              messageText = '[视频消息]';
              messageType = 'video';
            } else if (msgContent?.audioMessage) {
              messageText = '[语音消息]';
              messageType = 'audio';
            } else if (msgContent?.documentMessage) {
              messageText = '[文档消息]';
              messageType = 'document';
            } else if (msgContent?.contactMessage) {
              messageText = '[联系人消息]';
              messageType = 'contact';
            } else if (msgContent?.locationMessage) {
              messageText = '[位置消息]';
              messageType = 'location';
            }

            return {
              id: msgKey.id,
              from: msgKey.remoteJid,
              fromMe: msgKey.fromMe,
              participant: msgKey.participant,
              pushName: message.pushName,
              message: messageText,
              type: messageType,
              timestamp: message.messageTimestamp ? new Date(message.messageTimestamp * 1000) : null,
              status: message.status
            };
          });

          return processedMessages;
        }
      }

      // 如果聊天存储不可用，返回空数组
      return [];
    } catch (error) {
      console.error('获取聊天消息失败:', error);
      // 如果主要方法失败，尝试备用方法
      try {
        // 尝试从聊天存储中获取消息
        if (this.sock.chats && this.sock.chats.get) {
          const chat = this.sock.chats.get(jid);
          if (chat && chat.msgs) {
            // 尝试获取最近的消息
            const messages = Array.from(chat.msgs.values ? chat.msgs.values() : chat.msgs).slice(-limit);
            return messages.map(message => {
              const msgKey = message.key;
              const msgContent = message.message;

              let messageText = '';
              let messageType = 'unknown';

              if (msgContent?.conversation) {
                messageText = msgContent.conversation;
                messageType = 'text';
              } else if (msgContent?.extendedTextMessage?.text) {
                messageText = msgContent.extendedTextMessage.text;
                messageType = 'text';
              } else if (msgContent?.imageMessage) {
                messageText = '[图片消息]';
                messageType = 'image';
              } else if (msgContent?.videoMessage) {
                messageText = '[视频消息]';
                messageType = 'video';
              } else if (msgContent?.audioMessage) {
                messageText = '[语音消息]';
                messageType = 'audio';
              } else if (msgContent?.documentMessage) {
                messageText = '[文档消息]';
                messageType = 'document';
              } else if (msgContent?.contactMessage) {
                messageText = '[联系人消息]';
                messageType = 'contact';
              } else if (msgContent?.locationMessage) {
                messageText = '[位置消息]';
                messageType = 'location';
              }

              return {
                id: msgKey.id,
                from: msgKey.remoteJid,
                fromMe: msgKey.fromMe,
                participant: msgKey.participant,
                pushName: message.pushName,
                message: messageText,
                type: messageType,
                timestamp: message.messageTimestamp ? new Date(message.messageTimestamp * 1000) : null,
                status: message.status
              };
            });
          }
        }
      } catch (innerError) {
        console.error('备用方法获取聊天消息失败:', innerError);
      }

      // 如果两种方法都失败，返回空数组
      return [];
    }
  }

  // 获取特定联系人的聊天历史
  async getContactChatHistory(contactJid, limit = 50) {
    return await this.getChatMessages(contactJid, limit);
  }

  // 获取群组聊天历史
  async getGroupChatHistory(groupJid, limit = 50) {
    return await this.getChatMessages(groupJid, limit);
  }

  // 发送消息到指定JID
  async sendMessage(jid, message) {
    if (!this.sock) {
      throw new Error('WhatsApp未连接');
    }

    try {
      // 确保消息是正确的字符串格式
      const cleanMessage = String(message);
      const result = await this.sock.sendMessage(jid, { text: cleanMessage });
      return result;
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  // 获取所有聊天列表
  async getChats() {
    if (!this.sock) {
      throw new Error('WhatsApp未连接');
    }

    try {
      // 获取所有聊天记录
      const chats = this.sock.chats || new Map();
      const chatList = [];

      for (const [jid, chat] of chats.entries()) {
        chatList.push({
          jid: jid,
          name: chat.name || chat.pushName || jid,
          unreadCount: chat.unreadCount || 0,
          lastMessage: chat.lastMessage || null,
          timestamp: chat.timestamp ? new Date(chat.timestamp * 1000) : null,
          isGroup: jid.includes('@g.us'),
          isUser: jid.includes('@s.whatsapp.net')
        });
      }

      return chatList;
    } catch (error) {
      console.error('获取聊天列表失败:', error);
      throw error;
    }
  }

  // 备份认证信息
  async backupAuth() {
    try {
      const authDir = path.join(__dirname, '..', 'whatsapp_auth');
      if (!fs.existsSync(authDir)) {
        console.log('认证目录不存在，无法备份');
        return false;
      }

      // 获取认证目录中的所有文件
      const files = fs.readdirSync(authDir);
      const backupData = {};

      for (const file of files) {
        const filePath = path.join(authDir, file);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, 'utf8');
          backupData[file] = content;
        }
      }

      console.log(`已备份 ${files.length} 个认证文件`);
      return backupData;
    } catch (error) {
      console.error('备份认证信息失败:', error);
      throw error;
    }
  }

  // 恢复认证信息
  async restoreAuth(backupData) {
    try {
      const authDir = path.join(__dirname, '..', 'whatsapp_auth');

      // 创建认证目录（如果不存在）
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      // 写入备份的文件
      for (const [fileName, content] of Object.entries(backupData)) {
        const filePath = path.join(authDir, fileName);
        fs.writeFileSync(filePath, content, 'utf8');
      }

      console.log(`已恢复 ${Object.keys(backupData).length} 个认证文件`);
      return true;
    } catch (error) {
      console.error('恢复认证信息失败:', error);
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

        case 'group_participants':
          // 获取群组成员列表
          const { jid: groupJid } = req.query;
          if (!groupJid) {
            return res.status(400).json({ error: '缺少群组JID参数' });
          }
          const participants = await service.getGroupParticipants(groupJid);
          return res.status(200).json({ participants });

        case 'chats':
          // 获取聊天列表
          const chats = await service.getChats();
          return res.status(200).json({ chats });

        case 'chat_history':
          // 获取特定聊天的历史消息
          const { jid, limit } = req.query;
          if (!jid) {
            return res.status(400).json({ error: '缺少聊天JID参数' });
          }
          const chatHistory = await service.getChatMessages(jid, parseInt(limit) || 50);
          return res.status(200).json({ messages: chatHistory });

        case 'send_message':
          // 发送消息
          const { jid: sendJid, message } = req.query;
          if (!sendJid || !message) {
            return res.status(400).json({ error: '缺少消息JID或消息内容参数' });
          }
          const sendResult = await service.sendMessage(sendJid, message);
          return res.status(200).json({ result: sendResult });

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
          return res.status(200).json({ message: '认证已清除' });

        case 'backup_auth':
          // 备份认证信息
          const backupData = await service.backupAuth();
          if (backupData) {
            return res.status(200).json({
              message: '认证信息备份成功',
              backupData: backupData,
              fileCount: Object.keys(backupData).length
            });
          } else {
            return res.status(404).json({ error: '没有找到认证信息进行备份' });
          }

        case 'restore_auth':
          // 恢复认证信息
          const backupDataFromBody = req.body.backupData;
          if (!backupDataFromBody) {
            return res.status(400).json({ error: '缺少备份数据' });
          }
          await service.restoreAuth(backupDataFromBody);
          return res.status(200).json({ message: '认证信息恢复成功' });

        case 'send_message':
          // 发送消息
          const { jid: sendJid, message } = req.body;
          if (!sendJid || !message) {
            return res.status(400).json({ error: '缺少消息JID或消息内容参数' });
          }
          const sendResult = await service.sendMessage(sendJid, message);
          return res.status(200).json({ result: sendResult });

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