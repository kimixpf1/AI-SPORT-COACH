# 修复说明

## 🔧 已修复的问题

### 1. OpenCV.js 重复加载错误
**问题**：`Cannot register public name 'IntVector' twice`

**原因**：React StrictMode 在开发模式下会双重调用 useEffect，导致 OpenCV.js 被加载两次

**修复**：
- 添加全局检查，避免重复加载
- 使用 `window.cvLoadingPromise` 确保只加载一次
- 添加初始化完成检测

### 2. cv.imread 函数签名错误
**问题**：`RuntimeError: function signature mismatch`

**原因**：`cv.imread(canvas)` 的使用方式不正确

**修复**：
- 改用 `cv.matFromImageData(imageData)` 方法
- 先从 canvas 获取 ImageData，再转换为 Mat

### 3. 检测参数优化
**问题**：椭圆形杠铃片难以检测

**优化**：
- 降低 `param2` 从 30 到 20（检测更多圆）
- 降低 `param1` 从 100 到 80（检测更多边缘）
- 扩大半径范围：10-200 像素
- 降低最小圆心距离

## 📊 新的检测参数

```typescript
cv.HoughCircles(
  blurred,
  circles,
  cv.HOUGH_GRADIENT,
  1,                    // dp: 累加器分辨率
  blurred.rows / 10,    // minDist: 圆心最小距离
  80,                   // param1: Canny边缘检测高阈值
  20,                   // param2: 累加器阈值（更宽松）
  10,                   // minRadius: 最小半径
  200                   // maxRadius: 最大半径
);
```

## 🧪 测试建议

### 1. 刷新页面
清除之前的错误状态：
```bash
# 停止开发服务器（Ctrl+C）
# 重新启动
npm run dev
```

### 2. 打开浏览器控制台
查看详细的检测日志：
- 每帧检测到的圆的数量
- 每个圆的中心坐标和半径
- 选择的最大圆

### 3. 观察检测结果
现在应该能看到：
```
检测到 X 个圆
  圆 1: 中心(x, y), 半径=r
  圆 2: 中心(x, y), 半径=r
  选择最大圆: 中心(x, y), 半径=r
帧 1/30: 检测到杠铃 (x, y)
```

## 🎯 如果仍然检测失败

### 方案 A：进一步降低阈值
编辑 `VideoTracker.tsx` 第 185 行：
```typescript
20,  // param2: 改为 15 或 10
```

### 方案 B：调整半径范围
根据视频中杠铃片的实际大小调整：
```typescript
5,    // minRadius: 更小
300   // maxRadius: 更大
```

### 方案 C：使用边缘检测可视化
添加调试代码查看边缘检测结果：
```typescript
// 在检测函数中添加
cv.imshow(tempCanvas, blurred);  // 显示模糊后的图像
```

## 📝 预期效果

修复后应该能够：
1. ✅ OpenCV.js 正常加载，无重复错误
2. ✅ 检测函数正常运行，无签名错误
3. ✅ 检测到至少一些圆形物体
4. ✅ 轨迹绘制在视频上

## 🔍 调试技巧

### 查看检测到的所有圆
控制台会显示每帧检测到的所有圆，包括：
- 圆的数量
- 每个圆的位置和大小
- 最终选择的圆

### 如果检测到多个圆
说明参数太宽松，可以：
- 提高 `param2`（如 25 或 30）
- 提高 `param1`（如 90 或 100）
- 缩小半径范围

### 如果完全检测不到
说明参数太严格，可以：
- 降低 `param2`（如 15 或 10）
- 降低 `param1`（如 60 或 70）
- 扩大半径范围

## 🚀 下一步

测试完成后，如果效果满意：
1. 提交代码
2. 推送到远程仓库
3. 继续优化（如添加卡尔曼滤波平滑轨迹）
