/* eslint-disable no-undef */
// /api/backup-restore.js - 备份/还原API
const path = require('path');
const fs = require('fs').promises;
const { db, writeData } = require('./_lib/db.js');

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

// 创建备份
async function createBackup() {
  try {
    // 获取当前用户数据
    const users = await db.getUsers();

    // 获取当前配置
    const config = await db.getConfig();

    // 获取用户关联数据
    const associations = await readAssociations();

    // 获取WhatsApp认证信息
    const whatsappAuthFiles = await readWhatsAppAuthFiles();

    // 创建备份数据
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      users,
      config,
      associations,
      whatsappAuth: whatsappAuthFiles
    };

    return backupData;
  } catch (error) {
    console.error('创建备份失败:', error);
    throw error;
  }
}

// 读取WhatsApp认证文件
async function readWhatsAppAuthFiles() {
  const authDir = './whatsapp_auth';
  try {
    const files = await fs.readdir(authDir);
    const authData = {};

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(authDir, file);
          const content = await fs.readFile(filePath, 'utf8');
          authData[file] = JSON.parse(content);
        } catch (error) {
          console.warn(`读取认证文件 ${file} 失败:`, error.message);
        }
      }
    }

    return authData;
  } catch (error) {
    console.warn('读取WhatsApp认证信息失败:', error.message);
    return {}; // 返回空对象，避免影响备份流程
  }
}

// 写入WhatsApp认证文件
async function writeWhatsAppAuthFiles(authData) {
  const authDir = './whatsapp_auth';
  try {
    // 创建目录如果不存在
    if (!require('fs').existsSync(authDir)) {
      await fs.mkdir(authDir, { recursive: true });
    }

    // 写入每个认证文件
    for (const [filename, content] of Object.entries(authData)) {
      if (typeof content === 'object') {
        const filePath = path.join(authDir, filename);
        await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');
      }
    }

    console.log('WhatsApp认证文件恢复成功');
    return true;
  } catch (error) {
    console.error('写入WhatsApp认证文件失败:', error);
    throw error;
  }
}

// 验证备份数据
function validateBackupData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('备份数据格式无效');
  }

  if (!Array.isArray(data.users)) {
    throw new Error('备份数据缺少用户列表或格式不正确');
  }

  if (!data.associations || typeof data.associations !== 'object') {
    throw new Error('备份数据缺少关联信息或格式不正确');
  }

  // WhatsApp认证信息是可选的
  if (data.whatsappAuth && typeof data.whatsappAuth !== 'object') {
    throw new Error('WhatsApp认证信息格式不正确');
  }

  return true;
}

// 从备份恢复数据
async function restoreFromBackup(backupData, options = { mergeExisting: false }) {
  try {
    // 验证备份数据
    validateBackupData(backupData);

    // 获取当前用户数据
    const currentUsers = await db.getUsers();
    const currentAssociations = await readAssociations();

    let usersToRestore = backupData.users;
    let associationsToRestore = backupData.associations;

    // 如果是合并模式，需要检查ID冲突
    if (options.mergeExisting) {
      // 收集已存在的ID
      const existingUserIds = new Set(currentUsers.map(u => u.id));
      const existingContactJids = new Set(Object.keys(currentAssociations.contactToUser || {}));

      // 检查并处理冲突的用户ID
      const newUserIds = new Set();
      const idConflicts = [];

      // 处理用户ID冲突
      usersToRestore = usersToRestore.map(user => {
        if (existingUserIds.has(user.id)) {
          // 如果ID冲突，生成一个新的ID
          let newId = user.id;
          while (existingUserIds.has(newId) || newUserIds.has(newId)) {
            newId = Date.now() + Math.floor(Math.random() * 1000);
          }

          // 更新关联信息中的用户ID
          if (associationsToRestore.userToContact[user.id]) {
            associationsToRestore.userToContact[newId] = associationsToRestore.userToContact[user.id];
            delete associationsToRestore.userToContact[user.id];
          }

          idConflicts.push({ oldId: user.id, newId });
          newUserIds.add(newId);
          return { ...user, id: newId };
        }
        newUserIds.add(user.id);
        return user;
      });

      // 处理联系人JID冲突
      const newContactJids = new Set();
      const jidConflicts = [];

      Object.keys(associationsToRestore.userToContact).forEach(userId => {
        const contactJid = associationsToRestore.userToContact[userId];
        if (existingContactJids.has(contactJid) || newContactJids.has(contactJid)) {
          // 如果JID冲突，生成一个新的JID
          let newJid = contactJid;
          while (existingContactJids.has(newJid) || newContactJids.has(newJid)) {
            newJid = contactJid + '_restored_' + Date.now() + Math.floor(Math.random() * 1000);
          }

          // 更新关联信息
          associationsToRestore.userToContact[userId] = newJid;
          associationsToRestore.contactToUser[newJid] = userId;
          delete associationsToRestore.contactToUser[contactJid];

          jidConflicts.push({ oldJid: contactJid, newJid });
          newContactJids.add(newJid);
        } else {
          newContactJids.add(contactJid);
        }
      });

      console.log(`合并模式下解决了 ${idConflicts.length} 个用户ID冲突和 ${jidConflicts.length} 个联系人JID冲突`);
    }

    // 如果不是合并模式，直接替换现有数据
    if (!options.mergeExisting) {
      // 写入新用户数据
      await writeData(usersToRestore, backupData.config);
    } else {
      // 合并现有数据和恢复数据
      const mergedUsers = [...currentUsers, ...usersToRestore];
      await writeData(mergedUsers, backupData.config);
    }

    // 写入关联数据
    await writeAssociations(associationsToRestore);

    // 恢复WhatsApp认证信息
    let whatsappAuthRestored = false;
    if (backupData.whatsappAuth && Object.keys(backupData.whatsappAuth).length > 0) {
      try {
        console.log('开始恢复WhatsApp认证信息...');
        await writeWhatsAppAuthFiles(backupData.whatsappAuth);
        whatsappAuthRestored = true;
        console.log('WhatsApp认证信息恢复成功');
      } catch (authError) {
        console.error('恢复WhatsApp认证信息失败:', authError.message);
        // 这不是致命错误，继续执行
      }
    }

    return {
      success: true,
      message: '数据恢复成功',
      restoredUsers: usersToRestore.length,
      mergedWithExisting: options.mergeExisting,
      whatsappAuthRestored
    };
  } catch (error) {
    console.error('从备份恢复数据失败:', error);
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
      // 导出备份数据
      const backupData = await createBackup();

      // 设置响应头，使浏览器下载文件
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bible-reading-backup-${new Date().toISOString().split('T')[0]}.json"`);

      return res.status(200).json(backupData);
    } else if (req.method === 'POST') {
      // 从备份恢复数据
      const { backupData, mergeExisting = false } = req.body;

      if (!backupData) {
        return res.status(400).json({ error: '缺少备份数据' });
      }

      const result = await restoreFromBackup(backupData, { mergeExisting });

      return res.status(200).json({
        success: true,
        message: '数据恢复成功',
        ...result
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(`备份/还原操作失败:`, error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = {
  runtime: 'nodejs',
};