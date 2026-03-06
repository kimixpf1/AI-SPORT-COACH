# 举重教练 - AI视频分析工具

专业的举重和力量举训练视频分析工具，基于Claude AI提供智能分析。

## 功能特性

- 🎥 视频上传和分析（MP4/MOV/AVI，最大50MB）
- 🤖 AI智能分析（基于Claude Opus 4.6）
- 📊 动作识别、轨迹分析、速度评估、姿态评分
- 💡 个性化改进建议
- 📝 历史记录追踪

## 技术栈

- Next.js 15 + TypeScript
- Tailwind CSS
- Prisma ORM + SQLite/PostgreSQL
- Claude API (Anthropic)
- FFmpeg (视频处理)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_BASE_URL=https://api.v3.cm
DATABASE_URL="file:./dev.db"
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 使用说明

1. **上传视频** - 选择一个举重训练视频（建议5-15秒）
2. **开始分析** - 点击"开始分析"按钮
3. **等待处理** - 系统会提取8个关键帧并发送给AI分析（约15-30秒）
4. **查看结果** - 获得详细的技术分析报告

## 分析内容

- **动作识别** - 自动识别动作类型（深蹲、硬拉、卧推、抓举、挺举等）
- **轨迹分析** - 杠铃运动轨迹和关键位置点
- **速度评估** - 各阶段的速度和加速度分析
- **姿态评分** - 稳定性、动作幅度、身体对齐评分
- **改进建议** - 具体的技术改进建议
- **风险提示** - 潜在的受伤风险

## 自定义提示词

系统提示词配置在 `lib/prompts.ts` 文件中，你可以根据需要修改：

```typescript
export const SYSTEM_PROMPTS = {
  videoAnalysis: `你是一名专业的举重教练...`,
  specificExercises: {
    squat: `深蹲分析要点...`,
    // 添加更多动作
  }
};
```

修改后重启服务即可生效。

## 部署到Zeabur

### 准备工作

1. 注册Zeabur账号: https://zeabur.com
2. 准备Anthropic API密钥

### 部署步骤

1. **创建项目** - 在Zeabur创建新项目
2. **添加PostgreSQL** - 添加数据库服务
3. **连接仓库** - 连接GitHub仓库
4. **配置环境变量**
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ANTHROPIC_BASE_URL=https://api.v3.cm
   DATABASE_URL=<自动配置>
   ```
5. **切换数据库** - 将 `prisma/schema.prisma` 改为使用PostgreSQL：
   ```bash
   cp prisma/schema.production.prisma prisma/schema.prisma
   ```
6. **部署** - 推送代码，Zeabur会自动部署

## 项目结构

```
weightlifting-coach/
├── app/                    # Next.js应用
│   ├── api/               # API路由
│   │   ├── analyze/       # 视频分析
│   │   ├── history/       # 历史记录
│   │   └── analysis/[id]/ # 分析详情
│   ├── page.tsx           # 主页面
│   └── layout.tsx         # 布局
├── lib/                   # 核心库
│   ├── claude.ts          # Claude API客户端
│   ├── prisma.ts          # 数据库客户端
│   ├── prompts.ts         # 系统提示词 ⭐
│   └── video-processor.ts # 视频处理
├── prisma/                # 数据库
│   ├── schema.prisma      # SQLite（开发）
│   └── schema.production.prisma  # PostgreSQL（生产）
└── .env                   # 环境变量
```

## 成本估算

- 每次分析：约 $0.05-0.10（使用Claude Opus 4.6）
- 包含：8张视频帧 + AI分析
- 优化建议：减少帧数或使用Sonnet模型可降低成本

## 常见问题

### Q: 视频上传失败？

A: 检查文件格式（MP4/MOV/AVI）和大小（<50MB）

### Q: 分析时间过长？

A: 正常处理时间为15-30秒，包括视频帧提取和AI分析

### Q: 如何提高分析准确性？

A:
- 使用清晰的视频（光线充足、角度合适）
- 确保完整的动作周期
- 调整 `lib/prompts.ts` 中的提示词

### Q: 如何查看数据库？

A: 使用Prisma Studio：
```bash
npx prisma studio
```

## 技术说明

### 视频处理流程

1. 接收视频文件
2. 提取8个关键帧（均匀分布在10%-90%时间范围）
3. 压缩优化（1280x720, JPEG 85%）
4. 发送到Claude API
5. 解析分析结果
6. 保存到数据库

### API配置

项目使用自定义Claude API端点，配置在 `.env` 文件中：

```bash
ANTHROPIC_BASE_URL=https://api.v3.cm
```

如需使用官方API，改为：
```bash
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

## 开发建议

1. **本地开发** - 使用SQLite数据库（快速迭代）
2. **调整提示词** - 优化AI分析效果
3. **测试视频** - 使用不同类型的举重视频测试
4. **部署前** - 切换到PostgreSQL
5. **监控成本** - 关注API使用量

## License

MIT

---

**开发者：** Claude Sonnet 4.6
**项目状态：** 生产就绪 ✅
