#!/bin/bash

echo "🏋️ 举重教练 - 项目初始化"
echo ""

# 检查.env文件
if [ ! -f .env ]; then
  echo "❌ 未找到.env文件，请先配置环境变量"
  echo "   复制.env.example为.env并填写ANTHROPIC_API_KEY"
  exit 1
fi

# 检查API密钥
if ! grep -q "ANTHROPIC_API_KEY=sk-" .env; then
  echo "⚠️  警告: 未检测到有效的ANTHROPIC_API_KEY"
  echo "   请在.env文件中配置你的API密钥"
fi

# 生成Prisma客户端
echo "📦 生成Prisma客户端..."
npx prisma generate

# 初始化数据库
echo "🗄️  初始化数据库..."
npx prisma db push

echo ""
echo "✅ 初始化完成！"
echo ""
echo "运行以下命令启动开发服务器:"
echo "  npm run dev"
echo ""
echo "然后访问: http://localhost:3000"
