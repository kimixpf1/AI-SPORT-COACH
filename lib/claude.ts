import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPTS } from './prompts';
import { extractVideoFrames } from './video-processor';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.v3.cm',
});

export interface VideoAnalysisResult {
  exerciseType: string;
  trajectoryAnalysis: {
    barPath: string;
    keyPoints: string[];
    deviations: string;
  };
  velocityAnalysis: {
    phases: Array<{
      phase: string;
      velocity: string;
      acceleration: string;
    }>;
    criticalMoments: string;
  };
  postureAnalysis: {
    stability: { score: number; issues: string[] };
    rangeOfMotion: { score: number; notes: string };
    bodyAlignment: { score: number; issues: string[] };
  };
  overallScore: number;
  suggestions: string[];
  strengths: string[];
  risks: string[];
}

export async function analyzeVideo(
  videoBuffer: Buffer,
  mediaType: string
): Promise<{ result: VideoAnalysisResult; rawResponse: string }> {
  console.log('=== Claude API 调用开始 ===');
  console.log('配置信息:', {
    baseURL: process.env.ANTHROPIC_BASE_URL,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    apiKeyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) + '...',
  });

  try {
    // 提取视频关键帧和元数据
    console.log('开始提取视频帧和元数据...');
    const { frames, metadata } = await extractVideoFrames(videoBuffer, 8);
    console.log(`成功提取 ${frames.length} 帧`);
    console.log('视频元数据:', metadata);

    // 构建消息内容
    const imageContents = frames.map((frame, index) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data: frame.data,
      },
    }));

    console.log('发送请求到Claude API...');
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContents,
            {
              type: 'text',
              text: `作为一名专业的举重教练，请分析这个举重训练视频。

视频信息：
- 格式：${mediaType}
- 时长：${metadata.duration.toFixed(2)}秒
- 分辨率：${metadata.width}x${metadata.height}
- 帧率：${metadata.fps.toFixed(1)} fps
- 提供的关键帧：${frames.length}张（时间点：${frames.map(f => f.timestamp.toFixed(1) + 's').join(', ')}）

请仔细观察这些关键帧，分析运动员的举重技术，包括：
1. 识别具体的动作类型
2. 分析杠铃的运动轨迹
3. 评估动作的速度和节奏
4. 检查身体姿态和稳定性
5. 识别技术问题和潜在风险

重要：请只返回JSON格式的数据，不要添加任何额外的说明文字。JSON格式如下：

\`\`\`json
{
  "exerciseType": "具体的动作类型",
  "trajectoryAnalysis": {
    "barPath": "基于观察到的杠铃运动轨迹描述",
    "keyPoints": ["关键位置点1", "关键位置点2"],
    "deviations": "与理想轨迹的偏差"
  },
  "velocityAnalysis": {
    "phases": [
      {
        "phase": "阶段名称",
        "velocity": "速度描述",
        "acceleration": "加速度描述"
      }
    ],
    "criticalMoments": "关键时刻的速度变化"
  },
  "postureAnalysis": {
    "stability": { "score": 0-10, "issues": ["观察到的问题"] },
    "rangeOfMotion": { "score": 0-10, "notes": "动作幅度评价" },
    "bodyAlignment": { "score": 0-10, "issues": ["对齐问题"] }
  },
  "overallScore": 0-10,
  "suggestions": ["具体的改进建议"],
  "strengths": ["观察到的优点"],
  "risks": ["潜在的受伤风险"]
}
\`\`\`

请基于实际观察到的内容进行分析，确保JSON格式正确。`,
            },
          ],
        },
      ],
      system: SYSTEM_PROMPTS.videoAnalysis,
    });

    console.log('API响应成功');
    console.log('响应内容类型:', response.content[0]?.type);

    const rawResponse = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    console.log('原始响应长度:', rawResponse.length);
    console.log('原始响应预览:', rawResponse.substring(0, 200));

    // 尝试从响应中提取JSON
    let result: VideoAnalysisResult;
    let jsonStr = ''; // 在外部声明，以便在catch块中访问

    try {
      // 查找JSON代码块，更宽松的匹配
      // 尝试匹配 ```json ... ``` 格式
      const jsonCodeBlock = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlock) {
        jsonStr = jsonCodeBlock[1];
      } else {
        // 尝试匹配 ``` ... ``` 格式
        const codeBlock = rawResponse.match(/```\s*([\s\S]*?)\s*```/);
        if (codeBlock) {
          jsonStr = codeBlock[1];
        } else {
          // 尝试直接提取JSON对象
          const jsonObject = rawResponse.match(/\{[\s\S]*\}/);
          if (jsonObject) {
            jsonStr = jsonObject[0];
          } else {
            jsonStr = rawResponse;
          }
        }
      }

      console.log('提取的JSON字符串长度:', jsonStr.length);
      console.log('JSON预览:', jsonStr.substring(0, 300));

      // 清理JSON字符串
      jsonStr = jsonStr.trim();

      console.log('开始解析JSON...');
      result = JSON.parse(jsonStr);
      console.log('JSON解析成功，动作类型:', result.exerciseType);
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      console.error('尝试解析的字符串:', jsonStr?.substring(0, 500));

      // 如果解析失败，尝试从原始响应中提取关键信息
      const exerciseTypeMatch = rawResponse.match(/"exerciseType":\s*"([^"]+)"/);
      const exerciseType = exerciseTypeMatch ? exerciseTypeMatch[1] : '未识别';

      console.log('使用备用方案，提取到的动作类型:', exerciseType);

      // 返回一个基本结构，但包含原始响应
      result = {
        exerciseType,
        trajectoryAnalysis: {
          barPath: rawResponse,
          keyPoints: [],
          deviations: '',
        },
        velocityAnalysis: {
          phases: [],
          criticalMoments: '',
        },
        postureAnalysis: {
          stability: { score: 0, issues: [] },
          rangeOfMotion: { score: 0, notes: '' },
          bodyAlignment: { score: 0, issues: [] },
        },
        overallScore: 0,
        suggestions: [],
        strengths: [],
        risks: [],
      };
    }

    return { result, rawResponse };
  } catch (error) {
    console.error('=== Claude API调用失败 ===');
    console.error('错误类型:', error?.constructor?.name);
    console.error('错误信息:', error instanceof Error ? error.message : String(error));
    console.error('错误详情:', error);

    if (error instanceof Error) {
      throw new Error(`视频分析失败: ${error.message}`);
    }
    throw new Error('视频分析失败，请稍后重试');
  }
}
