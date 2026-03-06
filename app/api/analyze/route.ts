import { NextRequest, NextResponse } from 'next/server';
import { analyzeVideo } from '@/lib/claude';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  console.log('=== 开始处理视频分析请求 ===');
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File;

    console.log('收到文件:', file ? file.name : '无文件');

    if (!file) {
      return NextResponse.json(
        { error: '请上传视频文件' },
        { status: 400 }
      );
    }

    // 检查文件类型
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    console.log('文件类型:', file.type);
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: '不支持的视频格式，请上传MP4、MOV或AVI格式' },
        { status: 400 }
      );
    }

    // 检查文件大小（50MB限制）
    const maxSize = 50 * 1024 * 1024;
    console.log('文件大小:', (file.size / 1024 / 1024).toFixed(2), 'MB');
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: '视频文件过大，请上传小于50MB的文件' },
        { status: 400 }
      );
    }

    // 转换为Buffer
    console.log('读取视频文件...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('文件读取完成，大小:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

    // 调用Claude API分析（传递Buffer）
    console.log('开始调用Claude API进行真实视频分析...');
    console.log('API配置:', {
      baseURL: process.env.ANTHROPIC_BASE_URL,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    });

    const { result, rawResponse } = await analyzeVideo(buffer, file.type);
    console.log('API调用成功，结果:', result.exerciseType);

    // 保存到数据库
    console.log('保存到数据库...');
    const analysis = await prisma.analysis.create({
      data: {
        exerciseType: result.exerciseType,
        videoFileName: file.name,
        videoDuration: 0,
        trajectoryData: result.trajectoryAnalysis,
        velocityData: result.velocityAnalysis,
        postureAnalysis: result.postureAnalysis,
        overallScore: result.overallScore,
        suggestions: result.suggestions.join('\n'),
        rawResponse,
      },
    });
    console.log('保存成功，ID:', analysis.id);

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      result,
    });
  } catch (error) {
    console.error('=== 分析失败 ===');
    console.error('错误详情:', error);
    console.error('错误堆栈:', error instanceof Error ? error.stack : '无堆栈');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '分析失败' },
      { status: 500 }
    );
  }
}
