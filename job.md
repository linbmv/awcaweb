# WhatsApp 读经打卡自动同步系统 - 最终完整实施指南

## 项目概述

构建一个**完整的 WhatsApp 读经管理系统**，完全替代 awca.js，集成其所有功能（每日4:01发送读经计划）并新增自动打卡识别功能，在每晚北京时间 22:01 批量同步到已部署的 abread 系统。

## 一、系统架构设计

### 1.1 整体架构
```mermaid
graph TB
    subgraph "WhatsApp服务层"
        A[单一服务进程]
        A1[定时发送<br/>4:01发送读经计划]
        A2[消息监听<br/>实时识别打卡]
        A3[缓存管理<br/>白天缓存数据]
    end
    
    subgraph "业务逻辑层"
        B[用户映射管理]
        C[手动标记管理]
        D[7天冻结逻辑]
        E[数据验证]
    end
    
    subgraph "同步服务层"
        F[定时同步<br/>22:01批量同步]
        G[API适配器]
        H[冲突解决]
    end
    
    subgraph "abread系统"
        I[API接口<br/>(Vercel已部署)]
        J[(数据库)]
    end
    
    subgraph "Web管理界面"
        K[用户映射配置]
        L[同步监控面板]
        M[手动干预界面]
    end
    
    A --> A1 & A2 & A3
    A2 --> B --> F
    A3 --> F --> G --> I
    C --> A3
    D --> E --> H --> G
    K --> B
    M --> C
```

### 1.2 核心功能清单

| 功能模块 | 说明 | 来源 |
|---------|------|------|
| **定时发送读经计划** | 每日4:01发送到三个群组 | 原awca.js功能 |
| **消息监听识别** | 实时监听群组消息，识别打卡 | 新增功能 |
| **数据缓存** | 白天缓存打卡数据 | 新增功能 |
| **批量同步** | 晚上22:01同步到abread | 新增功能 |
| **用户映射管理** | WhatsApp用户与abread用户映射 | 新增功能 |
| **7天冻结逻辑** | 遵循abread的冻结规则 | 新增功能 |

## 二、技术实现方案

### 2.1 技术栈
```yaml
后端核心:
  - Node.js 18+ 
  - Express (Web服务器)
  - @whiskeysockets/baileys (WhatsApp连接)
  
数据存储:
  - SQLite3 或 JSON文件 (轻量级存储)
  - 无需Redis (数据量小)
  
定时任务:
  - node-cron (支持时区)
  
前端界面:
  - React + TypeScript
  - Ant Design (UI组件)
  - Socket.io (实时通信)
  
部署方式:
  - Docker (容器化)
  - PM2 (进程管理)
  - Cloudflare Tunnel (反向代理)
```

### 2.2 环境配置（.env）
```env
# WhatsApp配置（继承自awca.js）
GROUP_IDS=120363320187783071@g.us,120363322577252489@g.us,120363307329726249@g.us
BIBLE_PLAN_URL=https://gist.githubusercontent.com/linbmv/8adb195011a6422d4ee40f773f32a8fa/raw/bible_reading_plan.txt
DAILY_WORD_URL=https://gist.githubusercontent.com/linbmv/8adb195011a6422d4ee40f773f32a8fa/raw/daily_word.txt
SESSION_PATH=./baileys_auth_info

# abread系统配置（自动分析）
ABREAD_URL=https://abread.vercel.app
ABREAD_API_KEY=your-api-key
REDIS_URL="redis://default:OGi07gvISltcR8eYmuNnR4WPbU3LDZD2@redis-17912.crce194.ap-seast-1-1.ec2.redns.redis-cloud.com:17912"

# 定时任务配置
SEND_TIME=4:01           # 发送读经计划时间
SYNC_TIME=22:01          # 同步打卡数据时间
TIMEZONE=Asia/Shanghai   # 北京时间

# 系统配置
PORT=3000
LOG_LEVEL=info
ENABLE_MANUAL_OVERRIDE=true
FREEZE_DAYS=7
```

## 三、核心服务实现

### 3.1 主服务类（完全替代awca.js）
```javascript
// whatsapp-service.js
class WhatsAppService {
  constructor() {
    // 继承awca.js的配置
    this.groupIds = process.env.GROUP_IDS.split(',');
    this.bibleReadingPlanUrl = process.env.BIBLE_PLAN_URL;
    this.dailyWordUrl = process.env.DAILY_WORD_URL;
    this.SESSION_FILE_PATH = process.env.SESSION_PATH;
    
    // 新增功能配置
    this.messageCache = new Map();
    this.userMappings = new Map();
    this.manualOverrides = new Set();
    this.sock = null;
  }

  async start() {
    // 1. 建立WhatsApp连接（借鉴awca.js）
    await this.connect();
    
    // 2. 注册所有定时任务
    this.scheduleAllTasks();
    
    // 3. 启动消息监听（新增）
    this.startMessageListener();
    
    // 4. 启动Web管理界面
    this.startWebServer();
    
    console.log('✅ WhatsApp服务已启动（完全替代awca.js）');
  }

  async connect() {
    // 从awca.js复制连接代码，但修改：
    // ✅ 删除所有 process.exit()
    // ✅ 删除 messagesHaveBeenSentThisSession
    // ✅ 删除 hasInitiatedExit
    // ✅ 保持连接持续运行
  }

  scheduleAllTasks() {
    const cron = require('node-cron');
    
    // 原awca.js功能：4:01发送读经计划
    cron.schedule('1 4 * * *', () => {
      this.sendDailyMessages();
    }, { timezone: 'Asia/Shanghai' });
    
    // 新增：22:01同步打卡数据
    cron.schedule('1 22 * * *', () => {
      this.syncToAbread();
    }, { timezone: 'Asia/Shanghai' });
    
    // 新增：每日凌晨4:00更新用户状态
    cron.schedule('0 4 * * *', () => {
      this.dailyUserUpdate();
    }, { timezone: 'Asia/Shanghai' });
  }
}
```

### 3.2 消息识别引擎
```javascript
class MessageParser {
  constructor() {
    this.patterns = [
      { regex: /^读经完成$/, type: 'daily', days: 1 },
      { regex: /^(\d+)[日天](读经|补读)完成$/, type: 'makeup' },
      { regex: /^([一二三四五六七八九十]+)[日天](读经|补读)完成$/, type: 'makeup' },
      { regex: /^(.+?)(\d*)[日天]?(读经|补读)完成$/, type: 'proxy' }
    ];
    
    this.chineseNumbers = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    };
  }

  parse(message) {
    for (const pattern of this.patterns) {
      const match = message.text.match(pattern.regex);
      if (match) {
        return {
          type: pattern.type,
          days: this.extractDays(match),
          target: this.extractTarget(match),
          source: 'whatsapp',
          timestamp: Date.now()
        };
      }
    }
    return null;
  }
}
```

### 3.3 业务规则实现（严格遵循abread）
```javascript
// 7天冻结规则
class FreezeManager {
  FREEZE_THRESHOLD = 7;
  
  async processUser(user) {
    // 冻结条件：活跃用户且7天未读
    if (user.status === 'active' && user.unreadDays >= this.FREEZE_THRESHOLD) {
      user.status = 'frozen';
      user.frozenAt = new Date();
      console.log(`用户 ${user.name} 因7天未读被冻结`);
    }
  }
  
  async unfreezeOnCheckIn(user) {
    // 解冻条件：冻结用户重新打卡
    if (user.status === 'frozen') {
      user.status = 'active';
      user.frozenAt = null;
      user.unreadDays = 0;
      console.log(`用户 ${user.name} 打卡后解冻`);
    }
  }
}

// 数据优先级
const PRIORITY = {
  'whatsapp': 3,  // WhatsApp自动识别最高
  'auto': 2,      // 系统自动
  'manual': 1     // 手动输入最低
};
```

## 四、前端管理界面

### 4.1 用户映射配置（核心界面）
```jsx
const UserMappingUI = () => {
  // 核心功能：
  // 1. 显示WhatsApp联系人列表
  // 2. 显示abread用户列表
  // 3. 拖拽或下拉建立映射关系
  // 4. 智能匹配建议
  // 5. 批量导入/导出CSV
  
  return (
    <Card title="用户映射配置">
      <Table columns={[
        { title: 'WhatsApp联系人', dataIndex: 'whatsapp' },
        { title: '映射到abread用户', dataIndex: 'abread' },
        { title: '智能建议', dataIndex: 'suggestion' },
        { title: '操作', dataIndex: 'action' }
      ]} />
      <Button onClick={autoDetect}>自动检测</Button>
      <Button onClick={importCSV}>导入映射</Button>
    </Card>
  );
};
```

## 五、项目结构

```
whatsapp-bible-system/
├── src/
│   ├── core/
│   │   ├── WhatsAppService.js      # 主服务（替代awca.js）
│   │   ├── MessageParser.js        # 消息识别
│   │   └── CacheManager.js         # 缓存管理
│   ├── services/
│   │   ├── SyncService.js          # 同步服务
│   │   ├── UserMapping.js          # 用户映射
│   │   └── FreezeManager.js        # 冻结逻辑
│   ├── api/
│   │   ├── server.js               # Express服务器
│   │   └── routes/
│   │       ├── mapping.js          # 映射API
│   │       ├── override.js         # 手动标记API
│   │       └── monitor.js          # 监控API
│   └── index.js                    # 程序入口
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx       # 主控面板
│   │   │   ├── UserMapping.jsx     # 用户映射
│   │   │   └── SyncMonitor.jsx     # 同步监控
│   │   └── App.jsx
│   └── package.json
│
├── baileys_auth_info/              # WhatsApp会话
├── data/                           # 本地数据存储
│   ├── cache.json
│   ├── mappings.json
│   └── overrides.json
│
├── docker-compose.yml
├── .env
└── README.md
```

## 六、部署方案

### 6.1 Docker部署
```yaml
version: '3.8'

services:
  whatsapp-bible:
    build: .
    container_name: whatsapp-bible-system
    ports:
      - "3000:3000"
    volumes:
      - ./baileys_auth_info:/app/baileys_auth_info
      - ./data:/app/data
    env_file:
      - .env
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
```

### 6.2 PM2部署（备选）
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'whatsapp-bible',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      TZ: 'Asia/Shanghai'
    }
  }]
}
```

## 七、给Claude Code的实施指令

### 7.1 项目定位
```markdown
创建一个完整的WhatsApp读经管理系统，完全替代awca.js：
- 包含awca.js的所有功能（4:01发送读经计划）
- 新增打卡识别和同步功能（22:01同步到abread）
- 提供Web管理界面
```

### 7.2 关键实施要点
1. **借鉴awca.js但不依赖它** - 提取代码，改造为持续服务
2. **单一服务进程** - 一个服务完成所有功能
3. **严格遵循abread逻辑** - 特别是7天冻结规则
4. **数据不重复不丢失** - 缓存机制和冲突解决
5. **用户友好的配置** - 通过Web界面配置映射

### 7.3 实施顺序
```
Phase 1: 基础服务搭建
- 创建WhatsAppService类（借鉴awca.js）
- 实现持续连接（删除退出逻辑）
- 添加定时任务框架

Phase 2: 核心功能开发
- 消息识别引擎
- 缓存管理系统
- 用户映射服务
- 同步服务（22:01）

Phase 3: 管理界面
- 用户映射配置UI
- 同步监控面板
- 手动干预功能

Phase 4: 测试和优化
- 功能测试
- 错误处理
- 日志完善
```

## 八、预期成果

✅ **一个完整的系统替代awca.js和手工管理**
✅ **自动化程度高** - 自动识别、自动同步
✅ **数据准确可靠** - 严格遵循abread逻辑
✅ **部署简单** - Docker一键部署
✅ **易于维护** - 模块化设计，日志完善

---

这份最终指南整合了所有讨论内容，提供了清晰的实施路线，Claude Code可以基于此文档逐步实现整个系统。