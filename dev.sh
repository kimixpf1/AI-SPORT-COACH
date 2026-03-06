#!/bin/bash

# 清除可能冲突的系统环境变量
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_API_KEY

# 从.env文件加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 隐藏弃用警告（可选）
export NODE_NO_WARNINGS=1

# 启动开发服务器
npm run dev
