<template>
  <div class="whatsapp-admin">
    <!-- 页面标题 -->
    <div class="admin-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>WhatsApp 管理</h2>
      <div class="header-actions">
        <button class="refresh-btn" @click="refreshAll" :disabled="loading">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
        </button>
      </div>
    </div>

    <!-- 连接状态卡片 -->
    <div class="status-card" :class="connectionStatusClass">
      <div class="status-icon">
        <i v-if="connectionState === 'connected'" class="fas fa-check-circle"></i>
        <i v-else-if="connectionState === 'connecting'" class="fas fa-spinner fa-spin"></i>
        <i v-else-if="connectionState === 'qr'" class="fas fa-qrcode"></i>
        <i v-else class="fas fa-times-circle"></i>
      </div>
      <div class="status-content">
        <h3>
          <span v-if="connectionState === 'connected'">✅ 已连接</span>
          <span v-else-if="connectionState === 'connecting'">🔄 连接中...</span>
          <span v-else-if="connectionState === 'qr'">📱 等待扫码</span>
          <span v-else>❌ 未连接</span>
        </h3>
        <p v-if="connectionState === 'qr'">请使用手机 WhatsApp 扫描二维码</p>
        <p v-else-if="connectionState === 'disconnected'">需要重新连接</p>
        <div class="status-actions" v-if="connectionState === 'connected'">
          <button class="disconnect-btn" @click="disconnect">断开连接</button>
          <button class="clear-auth-btn" @click="clearAuth">清除认证</button>
        </div>
        <div class="status-actions" v-else-if="connectionState === 'disconnected'">
          <button class="connect-btn" @click="connect">重新连接</button>
        </div>
      </div>
    </div>

    <!-- QR码显示 -->
    <div v-if="qrCode && connectionState === 'qr'" class="qr-section">
      <h3>扫码登录</h3>
      <div class="qr-code">
        <img :src="`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`" alt="QR Code" />
      </div>
      <p class="qr-hint">使用手机 WhatsApp 扫描此二维码</p>
    </div>

    <!-- 用户关联管理 -->
    <div class="association-section" v-if="connectionState === 'connected'">
      <div class="section-header">
        <h3>📱 用户关联管理</h3>
        <p>将读经用户与 WhatsApp 联系人关联，实现真实@用户推送</p>
      </div>

      <div class="association-content">
        <!-- 搜索框 -->
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索用户或联系人..."
            class="search-input"
          />
        </div>

        <!-- 用户列表 -->
        <div class="user-list">
          <div
            v-for="user in filteredUsers"
            :key="user.id"
            class="user-item"
            :class="{ associated: user.whatsappJid }"
          >
            <div class="user-info">
              <div class="user-name">{{ user.name }}</div>
              <div class="user-status">
                <span v-if="user.isRead" class="status-badge read">已读</span>
                <span v-else class="status-badge unread">{{ user.unreadDays }}日未读</span>
                <span v-if="user.frozen" class="status-badge frozen">冻结</span>
              </div>
            </div>

            <div class="association-controls">
              <div v-if="user.whatsappJid" class="associated-contact">
                <i class="fab fa-whatsapp"></i>
                <span>{{ getContactName(user.whatsappJid) }}</span>
                <button class="unlink-btn" @click="unlinkUser(user.id)" title="取消关联">
                  <i class="fas fa-unlink"></i>
                </button>
              </div>
              <div v-else class="unassociated">
                <button class="link-btn" @click="showContactPicker(user)">
                  <i class="fas fa-link"></i> 关联联系人
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 联系人选择弹窗 -->
    <div v-if="showPicker" class="modal-overlay" @click="closePicker">
      <div class="contact-picker-modal" @click.stop>
        <div class="modal-header">
          <h3>选择 WhatsApp 联系人</h3>
          <button class="close-btn" @click="closePicker">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal-search">
          <input
            v-model="contactSearchQuery"
            type="text"
            placeholder="搜索联系人..."
            class="search-input"
          />
        </div>

        <div class="contact-list">
          <div
            v-for="contact in filteredContacts"
            :key="contact.jid"
            class="contact-item"
            @click="selectContact(contact)"
          >
            <div class="contact-avatar">
              <i class="fab fa-whatsapp"></i>
            </div>
            <div class="contact-info">
              <div class="contact-name">{{ contact.name || '未知联系人' }}</div>
              <div class="contact-jid">{{ contact.jid }}</div>
            </div>
            <div class="contact-check">
              <i v-if="isContactAssociated(contact.jid)" class="fas fa-check-circle"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 群组信息 -->
    <div class="group-section" v-if="connectionState === 'connected' && groups.length > 0">
      <div class="section-header">
        <h3>👥 可用群组</h3>
        <p>发送统计信息的目标群组</p>
      </div>

      <div class="group-list">
        <div
          v-for="group in groups"
          :key="group.jid"
          class="group-item"
          :class="{ active: selectedGroupJid === group.jid }"
          @click="selectGroup(group.jid)"
        >
          <div class="group-icon">
            <i class="fas fa-users"></i>
          </div>
          <div class="group-info">
            <div class="group-name">{{ group.name || '未命名群组' }}</div>
            <div class="group-count">{{ group.participantCount }} 人</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 发送测试 -->
    <div class="test-section" v-if="connectionState === 'connected'">
      <div class="section-header">
        <h3>🧪 测试发送</h3>
        <p>测试向指定群组发送统计信息</p>
      </div>

      <div class="test-controls">
        <button class="test-btn" @click="sendTest" :disabled="!selectedGroupJid || sending">
          <i class="fas fa-paper-plane"></i>
          <span v-if="sending">发送中...</span>
          <span v-else>发送测试统计</span>
        </button>
      </div>

      <div v-if="sendResult" class="send-result" :class="{ success: sendResult.success, error: !sendResult.success }">
        {{ sendResult.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import apiService from '../services/api'

// 响应式数据
const loading = ref(false)
const sending = ref(false)
const connectionState = ref('disconnected')
const qrCode = ref(null)
const users = ref([])
const associations = ref({})
const contacts = ref([])
const groups = ref([])
const selectedGroupJid = ref('')
const searchQuery = ref('')
const contactSearchQuery = ref('')
const showPicker = ref(false)
const currentUserId = ref(null)
const sendResult = ref(null)

// 定时器
let statusCheckInterval = null

// 计算属性
const connectionStatusClass = computed(() => {
  return {
    'status-connected': connectionState.value === 'connected',
    'status-connecting': connectionState.value === 'connecting',
    'status-qr': connectionState.value === 'qr',
    'status-disconnected': connectionState.value === 'disconnected'
  }
})

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const query = searchQuery.value.toLowerCase()
  return users.value.filter(user =>
    user.name.toLowerCase().includes(query)
  )
})

const filteredContacts = computed(() => {
  if (!contactSearchQuery.value) return contacts.value
  const query = contactSearchQuery.value.toLowerCase()
  return contacts.value.filter(contact =>
    (contact.name || '').toLowerCase().includes(query)
  )
})

// 方法
const goBack = () => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
  window.history.back()
}

const refreshAll = async () => {
  loading.value = true
  try {
    await Promise.all([
      checkStatus(),
      loadUsers(),
      loadContacts(),
      loadGroups()
    ])
  } finally {
    loading.value = false
  }
}

const checkStatus = async () => {
  try {
    const response = await apiService.getWhatsAppStatus()
    console.log('API响应:', response)
    // 修复：API响应在response.data中
    const status = response.data || response
    connectionState.value = status.state || 'disconnected'

    if (status.state === 'qr' && status.hasQr) {
      // 当状态为qr且hasQr为true时，获取具体的QR码
      try {
        const qrResponse = await apiService.getWhatsAppQr()
        qrCode.value = qrResponse.data?.qr || qrResponse.qr || null
      } catch (qrError) {
        console.error('获取QR码失败:', qrError)
        qrCode.value = null
      }
    } else {
      qrCode.value = null
    }
    console.log('连接状态:', connectionState.value)
  } catch (error) {
    console.error('检查状态失败:', error)
    connectionState.value = 'disconnected'
    // 不显示错误提示，因为模拟环境可能有预期的错误信息
    console.warn('获取连接状态失败，使用默认状态:', error.message || '未知错误')
  }
}

const connect = async () => {
  loading.value = true
  try {
    await apiService.whatsappAdmin({ action: 'connect' })
    await checkStatus()
  } catch (error) {
    console.error('连接失败:', error)
  } finally {
    loading.value = false
  }
}

const disconnect = async () => {
  loading.value = true
  try {
    await apiService.whatsappAdmin({ action: 'disconnect' })
    await checkStatus()
  } catch (error) {
    console.error('断开连接失败:', error)
  } finally {
    loading.value = false
  }
}

const clearAuth = async () => {
  if (!confirm('确定要清除WhatsApp认证吗？需要重新扫码登录。')) {
    return
  }

  loading.value = true
  try {
    await apiService.whatsappAdmin({ action: 'clear_auth' })
    qrCode.value = null
    connectionState.value = 'disconnected'
  } catch (error) {
    console.error('清除认证失败:', error)
  } finally {
    loading.value = false
  }
}

const loadUsers = async () => {
  try {
    const response = await apiService.getUserAssociations()
    users.value = response.users
    associations.value = response.associations
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const loadContacts = async () => {
  try {
    const response = await apiService.getWhatsAppContacts()
    contacts.value = response.data?.contacts || []
  } catch (error) {
    console.error('加载联系人失败:', error)
    contacts.value = []
    showError('无法加载联系人列表，WhatsApp服务可能未连接')
  }
}

const loadGroups = async () => {
  try {
    const response = await apiService.getWhatsAppGroups()
    groups.value = response.data?.groups || []
  } catch (error) {
    console.error('加载群组失败:', error)
    groups.value = []
    showError('无法加载群组列表，WhatsApp服务可能未连接')
  }
}

const getContactName = (jid) => {
  const contact = contacts.value.find(c => c.jid === jid)
  return contact?.name || jid
}

const showContactPicker = (user) => {
  currentUserId.value = user.id
  showPicker.value = true
  contactSearchQuery.value = ''
}

const closePicker = () => {
  showPicker.value = false
  currentUserId.value = null
  contactSearchQuery.value = ''
}

const isContactAssociated = (contactJid) => {
  return Object.values(associations.value.contactToUser || {}).includes(contactJid)
}

const selectContact = async (contact) => {
  if (isContactAssociated(contact.jid)) {
    alert('此联系人已被其他用户关联')
    return
  }

  try {
    await apiService.associateUser({
      userId: currentUserId.value,
      contactJid: contact.jid
    })

    await loadUsers()
    closePicker()
  } catch (error) {
    console.error('关联用户失败:', error)
    alert('关联失败，请重试')
  }
}

const unlinkUser = async (userId) => {
  if (!confirm('确定要取消此用户的关联吗？')) {
    return
  }

  try {
    await apiService.unassociateUser(userId)
    await loadUsers()
  } catch (error) {
    console.error('取消关联失败:', error)
    alert('取消关联失败，请重试')
  }
}

const selectGroup = (groupJid) => {
  selectedGroupJid.value = groupJid
}

const sendTest = async () => {
  sending.value = true
  sendResult.value = null

  try {
    // 这里应该调用新的API
    await apiService.sendStatistics({
      channel: 'whatsapp_api',
      useWhatsAppFormat: true
    })

    sendResult.value = {
      success: true,
      message: '测试统计信息已发送'
    }
  } catch (error) {
    console.error('发送测试失败:', error)
    sendResult.value = {
      success: false,
      message: '发送失败: ' + (error.message || '未知错误')
    }
  } finally {
    sending.value = false
  }
}

// 生命周期
onMounted(async () => {
  await refreshAll()

  // 每5秒检查一次状态
  statusCheckInterval = setInterval(checkStatus, 5000)
})

onUnmounted(() => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
})

// 错误提示
function showError(message) {
  alert(message)
  console.error(message)
}
</script>

<style scoped>
.whatsapp-admin {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #eee;
}

.admin-header h2 {
  margin: 0;
  font-size: 28px;
  color: #333;
}

.back-btn {
  padding: 8px 16px;
  background: #f5f5f5;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
}

.back-btn:hover {
  background: #e0e0e0;
}

.refresh-btn {
  padding: 8px 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-left: 10px;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-card.status-connected {
  border-left: 4px solid #4CAF50;
}

.status-card.status-connecting {
  border-left: 4px solid #2196F3;
}

.status-card.status-qr {
  border-left: 4px solid #FF9800;
}

.status-card.status-disconnected {
  border-left: 4px solid #f44336;
}

.status-icon {
  font-size: 48px;
}

.status-card.status-connected .status-icon {
  color: #4CAF50;
}

.status-card.status-connecting .status-icon {
  color: #2196F3;
}

.status-card.status-qr .status-icon {
  color: #FF9800;
}

.status-card.status-disconnected .status-icon {
  color: #f44336;
}

.status-content {
  flex: 1;
}

.status-content h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.status-content p {
  margin: 0 0 12px 0;
  color: #666;
}

.status-actions {
  display: flex;
  gap: 10px;
}

.connect-btn, .disconnect-btn, .clear-auth-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.connect-btn {
  background: #4CAF50;
  color: white;
}

.disconnect-btn {
  background: #FF9800;
  color: white;
}

.clear-auth-btn {
  background: #f44336;
  color: white;
}

.qr-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  text-align: center;
}

.qr-section h3 {
  margin: 0 0 20px 0;
}

.qr-code {
  display: inline-block;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 12px;
}

.qr-code img {
  display: block;
}

.qr-hint {
  margin-top: 16px;
  color: #666;
}

.association-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.section-header {
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
}

.section-header p {
  margin: 0;
  color: #666;
}

.search-box {
  margin-bottom: 20px;
}

.search-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
}

.user-list {
  max-height: 400px;
  overflow-y: auto;
}

.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.3s;
}

.user-item:hover {
  background: #f9f9f9;
}

.user-item.associated {
  background: #f0f8ff;
  border-color: #4CAF50;
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 4px;
}

.user-status {
  display: flex;
  gap: 8px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-badge.read {
  background: #e8f5e9;
  color: #4CAF50;
}

.status-badge.unread {
  background: #fff3e0;
  color: #FF9800;
}

.status-badge.frozen {
  background: #ffebee;
  color: #f44336;
}

.association-controls {
  display: flex;
  align-items: center;
}

.associated-contact {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4CAF50;
  font-size: 14px;
}

.unlink-btn {
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
}

.link-btn {
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.contact-picker-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
}

.modal-search {
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.contact-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.3s;
}

.contact-item:hover {
  background: #f5f5f5;
}

.contact-avatar {
  width: 40px;
  height: 40px;
  background: #4CAF50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.contact-info {
  flex: 1;
}

.contact-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.contact-jid {
  font-size: 12px;
  color: #666;
}

.contact-check {
  color: #4CAF50;
  font-size: 20px;
}

.group-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.group-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.group-item:hover {
  background: #f9f9f9;
}

.group-item.active {
  background: #e3f2fd;
  border-color: #2196F3;
}

.group-icon {
  width: 40px;
  height: 40px;
  background: #2196F3;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}

.group-info {
  flex: 1;
}

.group-name {
  font-weight: 500;
  margin-bottom: 2px;
}

.group-count {
  font-size: 12px;
  color: #666;
}

.test-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.test-controls {
  margin-bottom: 16px;
}

.test-btn {
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 12px 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-result {
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
}

.send-result.success {
  background: #e8f5e9;
  color: #4CAF50;
}

.send-result.error {
  background: #ffebee;
  color: #f44336;
}
</style>
