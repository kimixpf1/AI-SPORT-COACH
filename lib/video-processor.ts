import type ffmpegType from 'fluent-ffmpeg';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// 动态导入ffmpeg以避免构建时的问题
let ffmpeg: typeof ffmpegType;
let ffmpegInitialized = false;

async function initFfmpeg() {
  if (!ffmpegInitialized) {
    const ffmpegModule = await import('fluent-ffmpeg');
    ffmpeg = ffmpegModule.default;

    // 尝试设置ffmpeg和ffprobe路径
    try {
      // 根据平台选择正确的路径
      const platform = process.platform;
      const arch = process.arch;

      let ffmpegBinaryPath: string;
      let ffprobeBinaryPath: string;

      if (platform === 'darwin' && arch === 'arm64') {
        // macOS ARM64
        ffmpegBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffmpeg-installer',
          'darwin-arm64',
          'ffmpeg'
        );
        ffprobeBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffprobe-installer',
          'darwin-arm64',
          'ffprobe'
        );
      } else if (platform === 'darwin' && arch === 'x64') {
        // macOS x64
        ffmpegBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffmpeg-installer',
          'darwin-x64',
          'ffmpeg'
        );
        ffprobeBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffprobe-installer',
          'darwin-x64',
          'ffprobe'
        );
      } else if (platform === 'linux') {
        // Linux
        ffmpegBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffmpeg-installer',
          'linux-x64',
          'ffmpeg'
        );
        ffprobeBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffprobe-installer',
          'linux-x64',
          'ffprobe'
        );
      } else if (platform === 'win32') {
        // Windows
        ffmpegBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffmpeg-installer',
          'win32-x64',
          'ffmpeg.exe'
        );
        ffprobeBinaryPath = path.join(
          process.cwd(),
          'node_modules',
          '@ffprobe-installer',
          'win32-x64',
          'ffprobe.exe'
        );
      } else {
        throw new Error(`不支持的平台: ${platform}-${arch}`);
      }

      console.log('FFmpeg路径:', ffmpegBinaryPath);
      console.log('FFprobe路径:', ffprobeBinaryPath);

      // 检查文件是否存在
      try {
        await fs.access(ffmpegBinaryPath);
        await fs.access(ffprobeBinaryPath);
        ffmpeg.setFfmpegPath(ffmpegBinaryPath);
        ffmpeg.setFfprobePath(ffprobeBinaryPath);
        console.log('FFmpeg和FFprobe初始化成功');
      } catch (err) {
        console.error('FFmpeg或FFprobe二进制文件不存在');
        console.error('FFmpeg:', ffmpegBinaryPath);
        console.error('FFprobe:', ffprobeBinaryPath);
        throw new Error('FFmpeg/FFprobe未正确安装，请运行: npm install @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe');
      }
    } catch (error) {
      console.error('FFmpeg初始化失败:', error);
      throw error;
    }

    ffmpegInitialized = true;
  }
  return ffmpeg;
}

export interface VideoFrame {
  data: string; // base64编码的JPEG图片
  timestamp: number; // 时间戳（秒）
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface VideoAnalysisData {
  frames: VideoFrame[];
  metadata: VideoMetadata;
}

/**
 * 从视频中提取关键帧和元数据
 * @param videoBuffer 视频文件的Buffer
 * @param frameCount 要提取的帧数（默认8帧）
 * @returns 帧数据和元数据
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  frameCount: number = 8
): Promise<VideoAnalysisData> {
  console.log('开始提取视频帧...');
  console.log('目标帧数:', frameCount);

  // 初始化ffmpeg
  const ffmpegInstance = await initFfmpeg();

  // 创建临时目录
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-frames-'));
  const videoPath = path.join(tempDir, 'input.mp4');
  const framesDir = path.join(tempDir, 'frames');

  try {
    // 保存视频到临时文件
    await fs.writeFile(videoPath, videoBuffer);
    await fs.mkdir(framesDir);

    // 获取视频时长和元数据
    const duration = await getVideoDuration(videoPath, ffmpegInstance);
    console.log('视频时长:', duration, '秒');

    // 获取完整的视频元数据
    const metadata = await getVideoMetadataFromPath(videoPath, ffmpegInstance);
    console.log('视频元数据:', metadata);

    // 计算帧的时间点（均匀分布）
    const timestamps: number[] = [];
    for (let i = 0; i < frameCount; i++) {
      // 从10%到90%的位置提取帧，避免开头和结尾
      const position = 0.1 + (0.8 * i) / (frameCount - 1);
      timestamps.push(duration * position);
    }

    console.log('提取时间点:', timestamps.map(t => t.toFixed(2)).join(', '));

    // 提取帧
    const frames: VideoFrame[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const framePath = path.join(framesDir, `frame-${i}.jpg`);

      await extractFrameAtTime(videoPath, framePath, timestamp, ffmpegInstance);

      // 压缩和优化图片
      const optimizedBuffer = await sharp(framePath)
        .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const base64 = optimizedBuffer.toString('base64');

      frames.push({
        data: base64,
        timestamp,
      });

      console.log(`帧 ${i + 1}/${frameCount} 提取完成 (${timestamp.toFixed(2)}s)`);
    }

    console.log('所有帧提取完成');
    return { frames, metadata };
  } finally {
    // 清理临时文件
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('临时文件已清理');
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }
}

/**
 * 获取视频时长
 */
function getVideoDuration(videoPath: string, ffmpegInstance: typeof ffmpegType): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpegInstance.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * 从视频路径获取完整元数据
 */
function getVideoMetadataFromPath(
  videoPath: string,
  ffmpegInstance: typeof ffmpegType
): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpegInstance.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: eval(videoStream?.r_frame_rate || '0') || 0,
        });
      }
    });
  });
}

/**
 * 在指定时间点提取一帧
 */
function extractFrameAtTime(
  videoPath: string,
  outputPath: string,
  timestamp: number,
  ffmpegInstance: typeof ffmpegType
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpegInstance(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}
