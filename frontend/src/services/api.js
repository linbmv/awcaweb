import axios from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api', // 使用环境变量或默认值
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 可以在这里添加认证token等
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response
  },
  error => {
    console.error('API请求错误:', error)
    return Promise.reject(error)
  }
)

// API方法
export const apiService = {
  // 获取用户列表
  async getUsers() {
    return await api.get('/users')
  },

  // 添加用户
  async addUsers(names) {
    return await api.post('/users', { names })
  },

  // 更新用户
  async updateUser(userId, data) {
    return await api.put(`/users/${userId}`, data)
  },

  // 删除用户
  async deleteUser(userId) {
    return await api.delete(`/users/${userId}`)
  },

  // 发送统计
  async sendStatistics(stats, channel = 'notification') {  // 添加渠道参数，默认为notification
    return await api.post('/statistics/send', { stats, channel })
  },

  // 通过特定渠道发送统计
  async sendStatisticsToChannel(stats, channel) {
    return await api.post('/statistics-to-channel', { customStats: stats, channel })
  },

  // 获取统计
  async getStatistics() {
    return await api.get('/statistics')
  },
  
  // 验证密码
  async verifyPassword(password) {
    return await api.post('/verify-password', { password })
  },

  // ===== WhatsApp 管理相关API =====

  // 获取WhatsApp连接状态
  async getWhatsAppStatus() {
    return await api.get('/whatsapp-admin?action=status')
  },

  // WhatsApp管理操作
  async whatsappAdmin(data) {
    return await api.post('/whatsapp-admin', data)
  },

  // 获取QR码
  async getWhatsAppQr() {
    return await api.get('/whatsapp-admin?action=qr')
  },

  // 获取WhatsApp联系人列表
  async getWhatsAppContacts() {
    return await api.get('/whatsapp-admin?action=contacts')
  },

  // 获取WhatsApp群组列表
  async getWhatsAppGroups() {
    return await api.get('/whatsapp-admin?action=groups')
  },

  // 获取用户关联信息
  async getUserAssociations() {
    return await api.get('/user-association')
  },

  // 关联用户与联系人
  async associateUser(data) {
    return await api.post('/user-association', data)
  },

  // 取消用户关联
  async unassociateUser(userId) {
    return await api.delete(`/user-association?userId=${userId}`)
  },

  // 发送统计信息（支持WhatsApp格式）
  async sendStatisticsEnhanced(data) {
    return await api.post('/send-statistics', data)
  }
}

export default apiService