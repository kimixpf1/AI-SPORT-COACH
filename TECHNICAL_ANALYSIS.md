# 举重视频分析技术方案

## 项目需求
1. 识别举重视频中的杠铃片（圆形物体）
2. 追踪杠铃片的运动轨迹
3. 在视频上实时绘制轨迹
4. 计算杠铃的速度和加速度
5. 使用图表展示速度和加速度数据

## 技术方案调研

### 1. 计算机视觉库（物体检测和追踪）

#### 方案A：OpenCV.js + Hough Circle Transform（推荐）
**优势：**
- 专门用于圆形检测的经典算法
- 轻量级，浏览器性能好
- 不需要训练模型，直接使用
- 对杠铃片这种规则圆形物体检测准确度高

**劣势：**
- 需要调整参数（半径范围、阈值等）
- 对光照和遮挡敏感
- OpenCV.js 文件较大（~8MB）

**实现复杂度：** ⭐⭐⭐（中等）

**性能：**
- 初始加载：~2-3秒（加载OpenCV.js）
- 每帧处理：~30-50ms（720p视频）
- 适合离线处理，不适合实时

**代码示例：**
```typescript
import cv from 'opencv.js';

async function detectBarbellPlates(videoElement: HTMLVideoElement) {
  // 创建canvas并获取当前帧
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  ctx.drawImage(videoElement, 0, 0);

  // 转换为OpenCV Mat
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const circles = new cv.Mat();

  // 转灰度
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 高斯模糊减少噪声
  cv.GaussianBlur(gray, gray, new cv.Size(9, 9), 2, 2);

  // Hough圆检测
  cv.HoughCircles(
    gray,
    circles,
    cv.HOUGH_GRADIENT,
    1,              // dp: 累加器分辨率
    gray.rows / 8,  // minDist: 圆心最小距离
    100,            // param1: Canny边缘检测高阈值
    30,             // param2: 累加器阈值
    20,             // minRadius: 最小半径（像素）
    100             // maxRadius: 最大半径（像素）
  );

  // 提取检测到的圆
  const detectedCircles = [];
  for (let i = 0; i < circles.cols; i++) {
    const x = circles.data32F[i * 3];
    const y = circles.data32F[i * 3 + 1];
    const radius = circles.data32F[i * 3 + 2];
    detectedCircles.push({ x, y, radius });
  }

  // 清理内存
  src.delete();
  gray.delete();
  circles.delete();

  return detectedCircles;
}
```

**参考资料：**
- [OpenCV.js Hough Circle Transform](https://docs.opencv.org/4.x/d3/de5/tutorial_js_houghcircles.html)
- [Hough Circle Detection GitHub](https://github.com/alxcnwy/Hough-Circle-Detection)

---

#### 方案B：TensorFlow.js + COCO-SSD
**优势：**
- 预训练模型，开箱即用
- 可以检测多种物体
- 社区支持好，文档完善

**劣势：**
- 不专门针对圆形检测
- 模型较大（~5MB）
- 对杠铃片这种特定物体可能识别不准
- 需要自定义训练才能准确识别杠铃片

**实现复杂度：** ⭐⭐（简单）

**性能：**
- 初始加载：~3-5秒
- 每帧处理：~50-100ms
- 不适合实时处理

**代码示例：**
```typescript
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

async function detectObjects(videoElement: HTMLVideoElement) {
  const model = await cocoSsd.load();
  const predictions = await model.detect(videoElement);
  
  // COCO-SSD不能直接识别杠铃片，需要自定义训练
  return predictions;
}
```

**参考资料：**
- [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [React TensorFlow Object Detection](https://github.com/amogh-w/React-Tensorflow-Object-Detection)

---

#### 方案C：MediaPipe Object Detection
**优势：**
- Google官方支持
- 性能优化好
- 支持自定义模型

**劣势：**
- 需要自定义训练模型才能识别杠铃片
- 文档相对较少
- 配置复杂

**实现复杂度：** ⭐⭐⭐⭐（复杂）

**性能：**
- 初始加载：~2-4秒
- 每帧处理：~20-40ms
- 性能较好

**参考资料：**
- [MediaPipe Object Detection Guide](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js)
- [Create Custom Object Detection Web App](https://codelabs.developers.google.com/mp-object-detection-web)

---

#### 方案D：简化方案 - 颜色追踪
**优势：**
- 实现最简单
- 性能最好
- 不需要额外库

**劣势：**
- 准确度低
- 容易受环境干扰
- 需要杠铃片有明显颜色特征

**实现复杂度：** ⭐（非常简单）

**代码示例：**
```typescript
function detectByColor(canvas: HTMLCanvasElement, targetColor: RGB) {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let sumX = 0, sumY = 0, count = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // 颜色匹配
    if (colorMatch(r, g, b, targetColor)) {
      const x = (i / 4) % canvas.width;
      const y = Math.floor((i / 4) / canvas.width);
      sumX += x;
      sumY += y;
      count++;
    }
  }
  
  if (count > 0) {
    return { x: sumX / count, y: sumY / count };
  }
  return null;
}
```

---

### 2. 视频绘制方案（Canvas相关库）

#### 方案A：原生Canvas API（推荐）
**优势：**
- 零依赖，性能最好
- 完全控制，灵活性高
- 学习成本低

**劣势：**
- 需要手动管理绘制逻辑
- 动画需要自己实现

**代码示例：**
```typescript
function drawTrajectory(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  trajectory: Point[]
) {
  const ctx = canvas.getContext('2d')!;
  
  // 绘制视频帧
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // 绘制轨迹
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  trajectory.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  
  ctx.stroke();
  
  // 绘制当前位置
  const current = trajectory[trajectory.length - 1];
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(current.x, current.y, 5, 0, 2 * Math.PI);
  ctx.fill();
}
```

---

#### 方案B：Konva.js
**优势：**
- 声明式API，易用
- 支持React（react-konva）
- 性能优化好
- 支持图层管理

**劣势：**
- 额外依赖（~150KB）
- 对于简单场景可能过度设计

**代码示例：**
```typescript
import Konva from 'konva';
import { Stage, Layer, Line, Circle } from 'react-konva';

function VideoOverlay({ trajectory }: { trajectory: Point[] }) {
  return (
    <Stage width={1280} height={720}>
      <Layer>
        {/* 轨迹线 */}
        <Line
          points={trajectory.flatMap(p => [p.x, p.y])}
          stroke="#00ff00"
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
        />
        
        {/* 当前位置 */}
        {trajectory.length > 0 && (
          <Circle
            x={trajectory[trajectory.length - 1].x}
            y={trajectory[trajectory.length - 1].y}
            radius={5}
            fill="#ff0000"
          />
        )}
      </Layer>
    </Stage>
  );
}
```

**参考资料：**
- [Konva.js Official](https://konvajs.org/)
- [Best Canvas Library Comparison](https://konvajs.org/docs/guides/best-canvas-library.html)
- [Konva vs Fabric Comparison](https://github.com/konvajs/konva/issues/637)

---

#### 方案C：Fabric.js
**优势：**
- 功能丰富
- 支持对象操作
- 社区活跃

**劣势：**
- 较重（~200KB）
- 对于视频叠加可能过度设计
- 性能不如Konva

**推荐：** 对于视频轨迹绘制，原生Canvas或Konva.js更合适。

---

### 3. 图表库（速度和加速度可视化）

#### Recharts 双纵轴配置（项目已有）

**优势：**
- 项目已集成
- React友好
- 文档完善
- 支持双Y轴

**代码示例：**
```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DataPoint {
  time: number;      // 时间（秒）
  velocity: number;  // 速度（m/s）
  acceleration: number; // 加速度（m/s²）
}

function VelocityAccelerationChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="time" 
          label={{ value: '时间 (s)', position: 'insideBottom', offset: -5 }}
        />
        
        {/* 左Y轴 - 速度 */}
        <YAxis 
          yAxisId="left"
          label={{ value: '速度 (m/s)', angle: -90, position: 'insideLeft' }}
          stroke="#8884d8"
        />
        
        {/* 右Y轴 - 加速度 */}
        <YAxis 
          yAxisId="right"
          orientation="right"
          label={{ value: '加速度 (m/s²)', angle: 90, position: 'insideRight' }}
          stroke="#82ca9d"
        />
        
        <Tooltip />
        <Legend />
        
        <Line 
          yAxisId="left"
          type="monotone" 
          dataKey="velocity" 
          stroke="#8884d8" 
          name="速度"
          strokeWidth={2}
        />
        
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="acceleration" 
          stroke="#82ca9d" 
          name="加速度"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**参考资料：**
- [Recharts BiAxial Line Chart](https://www.geeksforgeeks.org/create-a-biaxial-line-chart-using-recharts-in-reactjs/)
- [Recharts Multiple Axis Configuration](https://app.studyraid.com/en/read/11352/355001/multiple-axis-configuration)

---

## 完整实现方案

### 推荐技术栈
1. **物体检测：** OpenCV.js + Hough Circle Transform
2. **视频绘制：** 原生Canvas API（简单场景）或 Konva.js（复杂交互）
3. **图表展示：** Recharts（项目已有）
4. **处理方式：** 浏览器端 + 可选后端加速

---

### 实现流程

#### 阶段1：视频上传和帧提取
```typescript
// app/api/process-video/route.ts
import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const video = formData.get('video') as File;
  
  // 提取视频帧（每秒30帧）
  const frames = await extractFrames(video, 30);
  
  return NextResponse.json({ frames });
}
```

#### 阶段2：浏览器端圆形检测
```typescript
// lib/barbell-detector.ts
import cv from 'opencv.js';

export class BarbellDetector {
  private cv: any;
  
  async initialize() {
    // 加载OpenCV.js
    this.cv = await import('opencv.js');
  }
  
  detectPlates(imageData: ImageData): Circle[] {
    const src = this.cv.matFromImageData(imageData);
    const gray = new this.cv.Mat();
    const circles = new this.cv.Mat();
    
    // 预处理
    this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);
    this.cv.GaussianBlur(gray, gray, new this.cv.Size(9, 9), 2);
    
    // 检测圆形
    this.cv.HoughCircles(
      gray, circles,
      this.cv.HOUGH_GRADIENT,
      1, gray.rows / 8,
      100, 30, 20, 100
    );
    
    // 转换结果
    const detected: Circle[] = [];
    for (let i = 0; i < circles.cols; i++) {
      detected.push({
        x: circles.data32F[i * 3],
        y: circles.data32F[i * 3 + 1],
        radius: circles.data32F[i * 3 + 2]
      });
    }
    
    // 清理
    src.delete();
    gray.delete();
    circles.delete();
    
    return detected;
  }
}
```

#### 阶段3：轨迹追踪
```typescript
// lib/trajectory-tracker.ts
export class TrajectoryTracker {
  private trajectory: Point[] = [];
  
  addPoint(circle: Circle, timestamp: number) {
    this.trajectory.push({
      x: circle.x,
      y: circle.y,
      time: timestamp
    });
  }
  
  calculateVelocity(): number[] {
    const velocities: number[] = [];
    
    for (let i = 1; i < this.trajectory.length; i++) {
      const p1 = this.trajectory[i - 1];
      const p2 = this.trajectory[i];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dt = p2.time - p1.time;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      const velocity = distance / dt; // 像素/秒
      
      velocities.push(velocity);
    }
    
    return velocities;
  }
  
  calculateAcceleration(): number[] {
    const velocities = this.calculateVelocity();
    const accelerations: number[] = [];
    
    for (let i = 1; i < velocities.length; i++) {
      const v1 = velocities[i - 1];
      const v2 = velocities[i];
      const dt = this.trajectory[i].time - this.trajectory[i - 1].time;
      
      const acceleration = (v2 - v1) / dt;
      accelerations.push(acceleration);
    }
    
    return accelerations;
  }
  
  // 像素转实际距离（需要标定）
  pixelsToMeters(pixels: number, referenceDistance: number): number {
    // referenceDistance: 已知物体的实际尺寸（米）
    // 例如：杠铃片直径45cm = 0.45m
    const pixelsPerMeter = pixels / referenceDistance;
    return pixels / pixelsPerMeter;
  }
}
```

#### 阶段4：视频叠加绘制
```typescript
// components/VideoPlayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { BarbellDetector } from '@/lib/barbell-detector';
import { TrajectoryTracker } from '@/lib/trajectory-tracker';

export function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trajectory, setTrajectory] = useState<Point[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const detector = useRef(new BarbellDetector());
  const tracker = useRef(new TrajectoryTracker());
  
  useEffect(() => {
    detector.current.initialize();
  }, []);
  
  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    
    // 绘制视频帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 检测杠铃片
    const circles = detector.current.detectPlates(imageData);
    
    if (circles.length > 0) {
      // 假设最大的圆是杠铃片
      const mainCircle = circles.reduce((max, c) => 
        c.radius > max.radius ? c : max
      );
      
      // 添加到轨迹
      tracker.current.addPoint(mainCircle, video.currentTime);
      
      // 绘制检测到的圆
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mainCircle.x, mainCircle.y, mainCircle.radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    
    // 绘制轨迹
    const traj = tracker.current.trajectory;
    if (traj.length > 1) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(traj[0].x, traj[0].y);
      
      for (let i = 1; i < traj.length; i++) {
        ctx.lineTo(traj[i].x, traj[i].y);
      }
      
      ctx.stroke();
    }
    
    // 继续处理下一帧
    if (isProcessing && !video.paused) {
      requestAnimationFrame(processFrame);
    }
  };
  
  const handlePlay = () => {
    setIsProcessing(true);
    requestAnimationFrame(processFrame);
  };
  
  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={videoUrl}
        onPlay={handlePlay}
        className="hidden"
      />
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full"
      />
    </div>
  );
}
```

#### 阶段5：数据可视化
```typescript
// components/AnalysisCharts.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface AnalysisChartsProps {
  data: {
    time: number;
    velocity: number;
    acceleration: number;
  }[];
}

export function AnalysisCharts({ data }: AnalysisChartsProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">速度和加速度分析</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              label={{ value: '时间 (s)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              yAxisId="left"
              label={{ value: '速度 (m/s)', angle: -90, position: 'insideLeft' }}
              stroke="#8884d8"
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              label={{ value: '加速度 (m/s²)', angle: 90, position: 'insideRight' }}
              stroke="#82ca9d"
            />
            <Tooltip />
            <Legend />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="velocity" 
              stroke="#8884d8" 
              name="速度"
              strokeWidth={2}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="acceleration" 
              stroke="#82ca9d" 
              name="加速度"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

---

## 技术难点和可行性分析

### 1. 圆形检测准确度 ⚠️
**难点：**
- 杠铃片可能被部分遮挡
- 光照变化影响检测
- 运动模糊降低准确度

**解决方案：**
- 使用多帧平均减少误检
- 调整Hough Transform参数
- 添加卡尔曼滤波平滑轨迹
- 使用颜色+形状双重验证

### 2. 像素到实际距离转换 ⚠️
**难点：**
- 需要相机标定
- 透视变换影响测量

**解决方案：**
- 让用户输入参考物体尺寸（如杠铃片直径45cm）
- 使用单应性矩阵校正透视
- 或简化为相对速度分析（不转换实际单位）

### 3. 浏览器性能 ⚠️
**难点：**
- OpenCV.js文件大（8MB）
- 实时处理可能卡顿
- 长视频内存占用高

**解决方案：**
- 使用Web Worker处理视频
- 降低处理帧率（如每秒10帧而非30帧）
- 分段处理长视频
- 考虑后端处理方案

### 4. 追踪连续性 ⚠️
**难点：**
- 多个圆形物体可能混淆
- 快速运动可能丢失追踪

**解决方案：**
- 使用最近邻算法匹配前后帧
- 添加运动预测（卡尔曼滤波）
- 限制搜索区域减少误匹配

---

## 是否需要后端处理？

### 纯浏览器方案 ✅
**优势：**
- 无服务器成本
- 隐私保护（视频不上传）
- 响应快（无网络延迟）

**劣势：**
- 性能受限于用户设备
- 初始加载慢（OpenCV.js 8MB）
- 复杂算法可能卡顿

**适用场景：**
- 短视频（<30秒）
- 用户设备性能较好
- 注重隐私

### 混合方案（推荐）⭐
**架构：**
1. 浏览器：视频预览、轨迹绘制、图表展示
2. 后端：重度计算（圆形检测、轨迹分析）

**优势：**
- 性能稳定
- 支持长视频
- 可以使用更复杂算法

**实现：**
```typescript
// app/api/detect-trajectory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import cv from 'opencv4nodejs'; // Node.js版本的OpenCV

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const video = formData.get('video') as File;
  
  // 后端处理视频
  const trajectory = await processVideoOnServer(video);
  
  return NextResponse.json({ trajectory });
}
```

---

## 依赖包安装

```bash
# OpenCV.js（浏览器端）
npm install opencv.js

# 或使用CDN
# <script src="https://docs.opencv.org/4.x/opencv.js"></script>

# Konva.js（可选，用于Canvas绘制）
npm install konva react-konva
npm install --save-dev @types/konva

# TensorFlow.js（可选方案）
npm install @tensorflow/tfjs @tensorflow-models/coco-ssd

# 后端OpenCV（可选）
npm install opencv4nodejs
```

---

## 性能优化建议

1. **懒加载OpenCV.js**
   ```typescript
   const loadOpenCV = () => {
     return new Promise((resolve) => {
       const script = document.createElement('script');
       script.src = 'https://docs.opencv.org/4.x/opencv.js';
       script.onload = resolve;
       document.body.appendChild(script);
     });
   };
   ```

2. **使用Web Worker**
   ```typescript
   // worker.ts
   self.onmessage = (e) => {
     const { imageData } = e.data;
     const circles = detectCircles(imageData);
     self.postMessage({ circles });
   };
   ```

3. **降采样处理**
   ```typescript
   // 将720p降到360p处理，提升速度
   const scale = 0.5;
   ctx.drawImage(video, 0, 0, width * scale, height * scale);
   ```

4. **缓存检测结果**
   ```typescript
   const cache = new Map<number, Circle[]>();
   const frameKey = Math.floor(video.currentTime * 10); // 每0.1秒缓存
   ```

---

## 总结和建议

### 最佳实践方案

**阶段1：MVP（最小可行产品）**
- 使用OpenCV.js + Hough Circle Transform
- 原生Canvas绘制轨迹
- Recharts展示速度/加速度
- 纯浏览器端处理

**阶段2：优化版本**
- 添加Web Worker提升性能
- 使用Konva.js改善交互
- 添加卡尔曼滤波平滑轨迹
- 支持相机标定

**阶段3：生产版本**
- 混合架构（浏览器+后端）
- 支持长视频处理
- 添加AI辅助分析（结合现有Claude分析）
- 多角度视频同步分析

### 预估开发时间
- MVP：2-3天
- 优化版：1周
- 生产版：2-3周

### 成本估算
- 纯浏览器：$0（无服务器成本）
- 混合方案：视频处理 ~$0.01-0.05/分钟（服务器计算）

---

## 参考资料汇总

### 计算机视觉
- [OpenCV.js Hough Circle Transform](https://docs.opencv.org/4.x/d3/de5/tutorial_js_houghcircles.html)
- [Hough Circle Detection GitHub](https://github.com/alxcnwy/Hough-Circle-Detection)
- [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [MediaPipe Object Detection](https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js)
- [SAM 3 for Video Tracking](https://pyimagesearch.com/2026/03/02/sam-3-for-video-concept-aware-segmentation-and-object-tracking/)

### Canvas库
- [Konva.js Official](https://konvajs.org/)
- [Best Canvas Library Guide](https://konvajs.org/docs/guides/best-canvas-library.html)
- [Konva vs Fabric Comparison](https://github.com/konvajs/konva/issues/637)
- [Best Canvas Libraries 2026](https://velt.dev/blog/best-canvas-library-web-mobile-apps)

### 图表库
- [Recharts Official](https://github.com/recharts/recharts)
- [Recharts BiAxial Chart](https://www.geeksforgeeks.org/create-a-biaxial-line-chart-using-recharts-in-reactjs/)
- [Recharts Multiple Axis](https://app.studyraid.com/en/read/11352/355001/multiple-axis-configuration)

### YOLO和实时检测
- [YOLO26 Documentation](https://docs.ultralytics.com/models/yolo26/)
- [YOLOv8 in Browser](https://dev.to/andreygermanov/how-to-detect-objects-in-videos-in-a-web-browser-using-yolov8-neural-network-and-javascript-lfb)
- [YOLO Real-Time Deployment](https://learnopencv.com/yolov26-real-time-deployment/)

### 其他
- [Velocity Based Training](https://en.wikipedia.org/wiki/Velocity_based_training)
- [WebGazer Eye Tracking](https://webgazer.cs.brown.edu/)

