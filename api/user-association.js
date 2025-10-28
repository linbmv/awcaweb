/* eslint-disable no-undef */
// /api/user-association.js - 用户关联API
const path = require('path');
const fs = require('fs').promises;

// 本地数据存储路径
const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'local-data.json');
const ASSOCIATION_FILE = path.join(__dirname, '..', 'data', 'whatsapp-associations.json');

// 读取关联数据
async function readAssociations() {
  try {
    const data = await fs.readFile(ASSOCIATION_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // 如果文件不存在，返回默认空结构
    return {
      userToContact: {},  // userId -> contactJid
      contactToUser: {}   // contactJid -> userId
    };
  }
}

// 写入关联数据
async function writeAssociations(associations) {
  try {
    await fs.writeFile(ASSOCIATION_FILE, JSON.stringify(associations, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入关联数据失败:', error);
    throw error;
  }
}

// 读取用户数据
async function readUsers() {
  try {
    const data = await fs.readFile(LOCAL_DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch (error) {
    console.error('读取用户数据失败:', error);
    return [];
  }
}

// 写入用户数据
async function writeUsers(users) {
  try {
    let data = { users, config: { resetHour: 4, timezone: 'Asia/Shanghai', maxUnreadDays: 7, lastReset: null } };
    try {
      const existingData = await fs.readFile(LOCAL_DB_PATH, 'utf8');
      const parsed = JSON.parse(existingData);
      data.config = parsed.config || data.config;
    } catch (error) {
      // 忽略读取配置错误，使用默认值
    }
    await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入用户数据失败:', error);
    throw error;
  }
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

  try {
    if (req.method === 'GET') {
      // 获取用户关联信息
      const associations = await readAssociations();
      const users = await readUsers();

      // 合并用户数据和关联数据
      const enrichedUsers = users.map(user => ({
        ...user,
        whatsappJid: associations.userToContact[user.id] || null
      }));

      return res.status(200).json({
        users: enrichedUsers,
        associations: associations
      });
    } else if (req.method === 'POST') {
      // 创建或更新关联
      const { userId, contactJid } = req.body;

      if (!userId || !contactJid) {
        return res.status(400).json({ error: '缺少必要参数：userId 和 contactJid' });
      }

      const associations = await readAssociations();

      // 如果该联系人已经关联到其他用户，先移除旧关联
      for (const [uid, cjid] of Object.entries(associations.userToContact)) {
        if (cjid === contactJid && uid !== userId) {
          delete associations.userToContact[uid];
          delete associations.contactToUser[cjid];
        }
      }

      // 设置新关联
      associations.userToContact[userId] = contactJid;
      associations.contactToUser[contactJid] = userId;

      await writeAssociations(associations);

      return res.status(200).json({
        message: '关联已保存',
        userId,
        contactJid
      });
    } else if (req.method === 'PUT') {
      // 更新关联
      const { userId, contactJid } = req.body;

      if (!userId || !contactJid) {
        return res.status(400).json({ error: '缺少必要参数：userId 和 contactJid' });
      }

      const associations = await readAssociations();

      // 移除旧的关联
      delete associations.userToContact[userId];
      for (const [cjid, uid] of Object.entries(associations.contactToUser)) {
        if (uid === userId) {
          delete associations.contactToUser[cjid];
        }
      }

      // 设置新关联
      associations.userToContact[userId] = contactJid;
      associations.contactToUser[contactJid] = userId;

      await writeAssociations(associations);

      return res.status(200).json({
        message: '关联已更新',
        userId,
        contactJid
      });
    } else if (req.method === 'DELETE') {
      // 删除关联
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: '缺少用户ID参数' });
      }

      const associations = await readAssociations();

      const contactJid = associations.userToContact[userId];
      if (contactJid) {
        delete associations.userToContact[userId];
        delete associations.contactToUser[contactJid];
        await writeAssociations(associations);
      }

      return res.status(200).json({
        message: '关联已删除',
        userId
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`用户关联操作失败:`, error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = {
  runtime: 'nodejs',
};
