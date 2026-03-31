import {
  CaptureAssessment,
  ExerciseProfile,
  PoseMetricFrame,
  TrackingData,
  TrackingHighlight,
  TrackingPoint,
  VideoAnalysisResult,
} from './analysis-types';

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

type CameraProfile = 'front' | 'front_diagonal' | 'side' | 'rear_diagonal' | 'rear';

type TrackingAnchor = {
  point: Landmark;
  anchorType: 'wrist_mid' | 'single_wrist' | 'elbow_mid';
};

const MIN_SAMPLE_COUNT = 20;
const MAX_SAMPLE_COUNT = 36;

const EXERCISE_LABELS: Record<ExerciseProfile, string> = {
  auto: '自动识别',
  squat: '深蹲',
  bench_press: '卧推',
  clean: '高翻',
  deadlift: '硬拉',
  other: '综合力量动作',
};

let poseLandmarkerPromise: Promise<any> | null = null;

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function toPixel(point: Landmark, width: number, height: number) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function distance(a: Landmark, b: Landmark) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function visibilityOf(point?: Landmark) {
  return point?.visibility ?? 0;
}

function averageVisibility(points: Array<Landmark | undefined>) {
  return average(points.map((point) => visibilityOf(point)));
}

function getSampleCount(duration: number) {
  return clamp(Math.round(duration * 3), MIN_SAMPLE_COUNT, MAX_SAMPLE_COUNT);
}

function getBoundingBox(points: Array<Landmark | undefined>) {
  const validPoints = points.filter((point): point is Landmark => Boolean(point));

  if (validPoints.length === 0) {
    return { width: 0, height: 0 };
  }

  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);

  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function chooseValueByVisibility(leftValue: number, rightValue: number, leftVisibility: number, rightVisibility: number) {
  const totalVisibility = leftVisibility + rightVisibility;

  if (totalVisibility <= 0) {
    return average([leftValue, rightValue]);
  }

  if (Math.abs(leftVisibility - rightVisibility) > 0.18) {
    return leftVisibility > rightVisibility ? leftValue : rightValue;
  }

  return (leftValue * leftVisibility + rightValue * rightVisibility) / totalVisibility;
}

function getTrackingAnchor(landmarks: Landmark[]): TrackingAnchor {
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const wristVisibility = averageVisibility([leftWrist, rightWrist]);

  if (wristVisibility >= 0.35) {
    return {
      point: midpoint(leftWrist, rightWrist),
      anchorType: 'wrist_mid',
    };
  }

  if (Math.max(visibilityOf(leftWrist), visibilityOf(rightWrist)) >= 0.2) {
    return {
      point: visibilityOf(leftWrist) >= visibilityOf(rightWrist) ? leftWrist : rightWrist,
      anchorType: 'single_wrist',
    };
  }

  return {
    point: midpoint(leftElbow, rightElbow),
    anchorType: 'elbow_mid',
  };
}

function getTrajectoryLabel(exercise: ExerciseProfile, anchorTypes: TrackingAnchor['anchorType'][]) {
  const fallbackCount = anchorTypes.filter((item) => item !== 'wrist_mid').length;

  if (fallbackCount > Math.max(2, anchorTypes.length / 3)) {
    return exercise === 'bench_press' ? '杠铃手部/前臂复合轨迹' : '手部/前臂复合轨迹';
  }

  if (anchorTypes.includes('single_wrist')) {
    return exercise === 'bench_press' ? '杠铃主侧手部轨迹' : '主侧手部轨迹';
  }

  return exercise === 'bench_press' ? '杠铃手部中点轨迹' : '手部中点轨迹';
}

function getResolutionLabel(width: number, height: number) {
  const pixels = width * height;

  if (pixels >= 1920 * 1080) return '1080P 及以上';
  if (pixels >= 1280 * 720) return '720P 级别';
  if (pixels >= 854 * 480) return '480P 级别';
  return '低分辨率';
}

function getClarityLabel(visibilityScore: number, coverageScore: number) {
  const composite = visibilityScore * 0.65 + coverageScore * 0.35;

  if (composite >= 0.72) return '清晰度较好';
  if (composite >= 0.55) return '清晰度可用';
  if (composite >= 0.4) return '清晰度一般';
  return '清晰度偏低';
}

function inferCameraProfile(viewRatio: number, faceVisibility: number): CameraProfile {
  if (viewRatio < 0.34) return 'side';
  if (faceVisibility < 0.18) return viewRatio >= 0.62 ? 'rear' : 'rear_diagonal';
  if (faceVisibility < 0.38) return viewRatio >= 0.62 ? 'rear_diagonal' : 'front_diagonal';
  if (viewRatio < 0.62) return 'front_diagonal';
  return 'front';
}

function getCameraAngleLabel(profile: CameraProfile) {
  if (profile === 'side') return '侧面或接近侧面';
  if (profile === 'front_diagonal') return '侧前方或斜前方';
  if (profile === 'rear_diagonal') return '侧后方或斜后方';
  if (profile === 'rear') return '后方或接近后方';
  return '正面或接近正面';
}

function getConfidenceLabel(score: number) {
  if (score >= 0.8) return '高可信度';
  if (score >= 0.62) return '中高可信度';
  if (score >= 0.46) return '可参考';
  return '低可信度，建议结合原视频人工复核';
}

function describeSpeed(value: number) {
  if (value > 260) return '爆发速度很高';
  if (value > 180) return '速度较快';
  if (value > 110) return '速度稳定';
  if (value > 60) return '速度偏慢';
  return '速度明显不足';
}

function describeAcceleration(value: number) {
  if (value > 250) return '加速能力突出';
  if (value > 100) return '加速顺畅';
  if (value > -60) return '节奏比较平稳';
  return '阶段衔接偏生硬';
}

function angleBetween(a: Landmark, b: Landmark, c: Landmark) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAB = Math.sqrt(abx * abx + aby * aby);
  const magCB = Math.sqrt(cbx * cbx + cby * cby);

  if (!magAB || !magCB) {
    return 180;
  }

  const cosine = clamp(dot / (magAB * magCB), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

function verticalAngle(a: Landmark, b: Landmark) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs((Math.atan2(dx, Math.abs(dy) || 0.0001) * 180) / Math.PI);
}

async function loadPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
      );
      const baseOptions = {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
      };

      try {
        return await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            ...baseOptions,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      } catch {
        return vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            ...baseOptions,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      }
    })();
  }

  return poseLandmarkerPromise;
}

async function createVideoElement(file: File) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const url = URL.createObjectURL(file);
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('视频加载失败，请更换更清晰的训练视频'));
  });

  return { video, url };
}

async function seekVideo(video: HTMLVideoElement, time: number) {
  await new Promise<void>((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      resolve();
    };

    const handleError = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      reject(new Error('视频解码失败，请尝试更短或更稳定的视频'));
    };

    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = time;
  });
}

function getMetricFrame(landmarks: Landmark[], timestamp: number): PoseMetricFrame {
  const nose = landmarks[0];
  const leftEye = landmarks[2];
  const rightEye = landmarks[5];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const leftFoot = landmarks[31];
  const rightFoot = landmarks[32];

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const ankleMid = midpoint(leftAnkle, rightAnkle);
  const leftKneeAngle = angleBetween(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = angleBetween(rightHip, rightKnee, rightAnkle);
  const leftHipAngle = angleBetween(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = angleBetween(rightShoulder, rightHip, rightKnee);
  const leftElbowAngle = angleBetween(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = angleBetween(rightShoulder, rightElbow, rightWrist);
  const leftSideVisibility = averageVisibility([leftShoulder, leftElbow, leftWrist, leftHip, leftKnee, leftAnkle]);
  const rightSideVisibility = averageVisibility([rightShoulder, rightElbow, rightWrist, rightHip, rightKnee, rightAnkle]);
  const keyVisibility = averageVisibility([
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftWrist,
    rightWrist,
  ]);
  const bodyBox = getBoundingBox([
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftWrist,
    rightWrist,
  ]);
  const coverageScore = clamp(bodyBox.height * 0.8 + bodyBox.width * 0.2, 0, 1);
  const torsoHeight = average([distance(leftShoulder, leftHip), distance(rightShoulder, rightHip)]);
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const hipWidth = Math.abs(leftHip.x - rightHip.x);
  const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
  const footWidth = Math.abs(leftFoot.x - rightFoot.x);
  const viewRatio = clamp(average([shoulderWidth, hipWidth]) / Math.max(torsoHeight, 0.01), 0, 1.5);
  const faceVisibility = averageVisibility([nose, leftEye, rightEye, leftEar, rightEar]);
  const kneeWidthRatio = clamp(kneeWidth / Math.max(footWidth, 0.01), 0, 2);
  const centerOffset = average([
    Math.abs(shoulderMid.x - hipMid.x),
    Math.abs(hipMid.x - ankleMid.x),
    Math.abs((nose?.x ?? shoulderMid.x) - hipMid.x),
  ]);

  return {
    timestamp,
    kneeAngle: chooseValueByVisibility(leftKneeAngle, rightKneeAngle, leftSideVisibility, rightSideVisibility),
    hipAngle: chooseValueByVisibility(leftHipAngle, rightHipAngle, leftSideVisibility, rightSideVisibility),
    elbowAngle: chooseValueByVisibility(leftElbowAngle, rightElbowAngle, leftSideVisibility, rightSideVisibility),
    torsoLean: verticalAngle(shoulderMid, hipMid),
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y),
    hipTilt: Math.abs(leftHip.y - rightHip.y),
    kneeTrackOffset: average([
      Math.abs(leftKnee.x - leftFoot.x),
      Math.abs(rightKnee.x - rightFoot.x),
    ]),
    visibilityScore: keyVisibility,
    coverageScore,
    viewRatio,
    faceVisibility,
    centerOffset,
    kneeWidthRatio,
  };
}

function inferExercise(metrics: PoseMetricFrame[], wristPath: TrackingPoint[]) {
  const minKneeAngle = Math.min(...metrics.map((frame) => frame.kneeAngle));
  const minElbowAngle = Math.min(...metrics.map((frame) => frame.elbowAngle));
  const avgTorsoLean = average(metrics.map((frame) => frame.torsoLean));
  const wristVerticalRange =
    Math.max(...wristPath.map((point) => point.y)) - Math.min(...wristPath.map((point) => point.y));

  if (avgTorsoLean > 65 && minElbowAngle < 100) {
    return 'bench_press' as const;
  }

  if (wristVerticalRange > 140 && minElbowAngle < 120 && minKneeAngle < 120) {
    return 'clean' as const;
  }

  if (minKneeAngle < 110) {
    return 'squat' as const;
  }

  if (avgTorsoLean > 30) {
    return 'deadlift' as const;
  }

  return 'other' as const;
}

function buildVelocityData(trajectory: TrackingPoint[]) {
  return trajectory.slice(1).map((point, index) => {
    const previous = trajectory[index];
    const dt = point.timestamp - previous.timestamp || 0.001;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

    if (index === 0) {
      return {
        time: point.timestamp,
        velocity,
        acceleration: 0,
      };
    }

    const previousVelocity = trajectory[index].timestamp === point.timestamp
      ? velocity
      : Math.sqrt(
          Math.pow(previous.x - trajectory[index - 1].x, 2) +
            Math.pow(previous.y - trajectory[index - 1].y, 2)
        ) / ((previous.timestamp - trajectory[index - 1].timestamp) || 0.001);

    return {
      time: point.timestamp,
      velocity,
      acceleration: (velocity - previousVelocity) / dt,
    };
  });
}

function buildCaptureAssessment(
  metrics: PoseMetricFrame[],
  sampleCount: number,
  width: number,
  height: number
): CaptureAssessment {
  const detectedFrameRatio = metrics.length / Math.max(sampleCount, 1);
  const visibilityScore = average(metrics.map((frame) => frame.visibilityScore));
  const coverageScore = average(metrics.map((frame) => frame.coverageScore));
  const faceVisibility = average(metrics.map((frame) => frame.faceVisibility));
  const cameraProfile = inferCameraProfile(average(metrics.map((frame) => frame.viewRatio)), faceVisibility);
  const confidenceScore = clamp(detectedFrameRatio * 0.38 + visibilityScore * 0.37 + coverageScore * 0.25, 0, 1);
  const warnings: string[] = [];

  if (detectedFrameRatio < 0.45) {
    warnings.push('有效姿态帧占比偏低，本次结果更适合做节奏与大方向复盘。');
  }

  if (visibilityScore < 0.52) {
    warnings.push('关键关节可见性偏低，说明视频清晰度、遮挡或光线对识别有影响。');
  }

  if (coverageScore < 0.42) {
    warnings.push('人物在画面中的占比偏小，系统仍可分析，但细节角度误差会增大。');
  }

  if (cameraProfile === 'front') {
    warnings.push('当前更接近正面视角，左右对称判断更可靠，前后路径解读相对保守。');
  }

  if (cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') {
    warnings.push('当前机位更适合复盘髋、膝、踝对齐和左右侧发力差异，前后路径结论会偏保守。');
  }

  return {
    angleLabel: getCameraAngleLabel(cameraProfile),
    clarityLabel: getClarityLabel(visibilityScore, coverageScore),
    resolutionLabel: `${getResolutionLabel(width, height)} · ${width}×${height}`,
    confidenceLabel: getConfidenceLabel(confidenceScore),
    detectedFrameRatio: round(detectedFrameRatio * 100, 0),
    visibilityScore: round(visibilityScore * 100, 0),
    coverageScore: round(coverageScore * 100, 0),
    warnings,
  };
}

function getTrajectoryNarrative(
  horizontalDrift: number,
  smoothness: number,
  exerciseLabel: string,
  cameraProfile: CameraProfile
) {
  if (cameraProfile === 'front') {
    return `${exerciseLabel}当前更适合复盘左右对称、肩髋平衡和节奏稳定性；由于机位接近正面，前后路径只做保守解读。`;
  }

  if (cameraProfile === 'rear') {
    return `${exerciseLabel}当前更适合复盘后方对齐：可以重点看头部、肩带、骨盆、膝盖和脚三点是否在同一控制链上。`;
  }

  if (cameraProfile === 'rear_diagonal') {
    return `${exerciseLabel}在侧后方机位下既能看后方对齐，也能看部分前后路径，适合检查左右受力、髋部偏移和下肢对线。`;
  }

  if (cameraProfile === 'front_diagonal') {
    if (horizontalDrift < 45 && smoothness < 55) {
      return `${exerciseLabel}在侧前方视角下的主轨迹比较连贯，既能看发力路径，也能兼顾左右平衡。`;
    }

    return `${exerciseLabel}在斜侧视角下仍能看出主路径波动，说明发力线和重心转换还有继续收紧的空间。`;
  }

  if (horizontalDrift < 30 && smoothness < 40) {
    return `${exerciseLabel}的手部主轨迹接近垂直，路径比较干净，适合继续强化节奏一致性。`;
  }

  if (horizontalDrift < 60) {
    return `${exerciseLabel}主轨迹整体可控，但中段仍有轻微前后漂移，说明发力线略有波动。`;
  }

  return `${exerciseLabel}主轨迹前后摆动较明显，提示发力路径不够集中，器械与身体重心配合还需加强。`;
}

function getRangeNotes(exercise: ExerciseProfile, minKneeAngle: number, minElbowAngle: number, minHipAngle: number) {
  if (exercise === 'bench_press') {
    if (minElbowAngle < 80) return '触胸深度和推起幅度都比较充分。';
    if (minElbowAngle < 95) return '卧推幅度基本够用，但仍可进一步稳定下放深度。';
    return '卧推下放深度偏浅，建议加强触胸控制和肩胛稳定。';
  }

  if (exercise === 'clean') {
    if (minKneeAngle < 95 && minHipAngle < 90) return '下肢屈伸幅度较完整，利于完成二次发力和接杠。';
    return '髋膝屈伸幅度还不够充分，影响高翻爆发和接杠质量。';
  }

  if (exercise === 'deadlift') {
    if (minHipAngle < 75) return '髋铰链幅度较充分，起拉准备比较到位。';
    return '起拉阶段髋铰链深度不足，可能削弱后链参与度。';
  }

  if (minKneeAngle < 95) return '深度较充分，已经接近理想训练深蹲幅度。';
  if (minKneeAngle < 110) return '下蹲深度基本达标，但底部还能更沉稳。';
  return '下蹲深度偏浅，建议优先改善髋踝活动度与底部稳定。';
}

function buildSuggestions(
  exercise: ExerciseProfile,
  scores: { stability: number; range: number; alignment: number },
  metrics: PoseMetricFrame[],
  captureAssessment: CaptureAssessment,
  cameraProfile: CameraProfile
) {
  const suggestions: string[] = [];
  const avgTorsoLean = average(metrics.map((frame) => frame.torsoLean));
  const avgShoulderTilt = average(metrics.map((frame) => frame.shoulderTilt));
  const avgKneeTrack = average(metrics.map((frame) => frame.kneeTrackOffset));
  const avgCenterOffset = average(metrics.map((frame) => frame.centerOffset));
  const avgKneeWidthRatio = average(metrics.map((frame) => frame.kneeWidthRatio));

  if (captureAssessment.detectedFrameRatio < 55) {
    suggestions.push('这段视频仍可用于复盘，但下次尽量保证脚踝到器械全程入镜，并把手机固定在髋部附近高度，识别会更稳定。');
  }

  if (cameraProfile === 'front') {
    suggestions.push('这次优先用结果检查左右对称和重心分布；如果想精确看前后路径，补一条侧前方 30°-45° 机位的视频会更好。');
  }

  if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && exercise === 'squat') {
    suggestions.push('后方机位优先盯头、骨盆和脚中线是否保持对齐，起身时尽量让骨盆垂直向上，不要一侧先抬或向侧方偏移。');
  }

  if (scores.range < 7) {
    if (exercise === 'bench_press') {
      suggestions.push('卧推先用中轻重量做 3 秒下放 + 胸口停顿 1 秒，确认触胸深度、前臂垂直和肩胛收紧后再加重。');
    } else if (exercise === 'deadlift') {
      suggestions.push('硬拉先做停顿式起拉练习，让杠离地前完成髋铰链、背阔锁紧和脚中部发力，再逐步恢复训练重量。');
    } else {
      suggestions.push('先用空杆或轻重量做慢速离心加底部停顿，优先把动作幅度做完整，再逐步恢复正常训练节奏。');
    }
  }

  if (scores.stability < 7) {
    suggestions.push('正式组前加入核心呼吸加压和肩胛稳定热身，并把每组前 2 次做成技术重复，先把起始姿势锁稳再追求速度。');
  }

  if (scores.alignment < 7) {
    if (cameraProfile === 'front') {
      suggestions.push('优先盯左右侧是否同步发力，让肩、髋、膝在同一节奏下完成伸展，避免一侧先发力把轨迹带偏。');
    } else if (cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') {
      suggestions.push('保持双脚三点着地并主动把地面向两侧分开，让膝盖持续对准脚中部，减少后方看得到的左右偏移和膝线摆动。');
    } else {
      suggestions.push('把发力注意力放在脚中部和身体中线，让器械更贴近身体完成加速，减少前后漂移和绕路。');
    }
  }

  if ((exercise === 'squat' || exercise === 'clean') && avgTorsoLean > 18) {
    suggestions.push('深蹲或高翻底部起身时先让胸骨向前上方延展，同时持续踩稳中足，避免髋部先冲起把躯干前倾放大。');
  }

  if (exercise === 'bench_press' && avgShoulderTilt > 0.035) {
    suggestions.push('卧推下放时保持两侧肩胛同时后缩下沉，杠铃落点尽量稳定在下胸到胸下缘，减少单侧肩膀先松脱。');
  }

  if ((exercise === 'squat' || exercise === 'deadlift') && avgKneeTrack > 0.06) {
    suggestions.push('继续盯膝盖与脚尖方向一致，起身时主动把地面向两侧分开，减少膝线向内塌陷或向外甩出的波动。');
  }

  if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgCenterOffset > 0.045) {
    suggestions.push('从后方看，身体中线有轻微左右漂移；建议每组开始前先锁定足底压力分布，避免重心长期偏到单侧。');
  }

  if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgKneeWidthRatio < 0.82) {
    suggestions.push('膝间距相对脚宽偏窄，提示蹲起过程中有向内夹膝趋势；可加弹力带外推或慢速停顿深蹲强化髋外展控制。');
  }

  return Array.from(new Set(suggestions)).slice(0, 5);
}

function buildStrengths(scores: { stability: number; range: number; alignment: number }, trajectoryNarrative: string) {
  const strengths: string[] = [];

  if (scores.range >= 8) {
    strengths.push('动作幅度比较完整，训练刺激容易覆盖目标肌群和关键技术环节。');
  }

  if (scores.stability >= 8) {
    strengths.push('躯干与左右侧节奏稳定，说明基本控制能力较好。');
  }

  if (scores.alignment >= 8) {
    strengths.push('主轨迹较集中，器械与身体重心配合比较顺畅。');
  }

  if (strengths.length === 0) {
    strengths.push(`当前最明显的优点是${trajectoryNarrative.replace('。', '')}。`);
  }

  return strengths;
}

function buildRisks(exercise: ExerciseProfile, scores: { stability: number; range: number; alignment: number }, metrics: PoseMetricFrame[]) {
  const risks: string[] = [];
  const avgTorsoLean = average(metrics.map((frame) => frame.torsoLean));
  const avgShoulderTilt = average(metrics.map((frame) => frame.shoulderTilt));
  const avgCenterOffset = average(metrics.map((frame) => frame.centerOffset));
  const avgKneeWidthRatio = average(metrics.map((frame) => frame.kneeWidthRatio));
  const avgFaceVisibility = average(metrics.map((frame) => frame.faceVisibility));
  const cameraProfile = inferCameraProfile(average(metrics.map((frame) => frame.viewRatio)), avgFaceVisibility);

  if (scores.range <= 5) {
    risks.push('动作幅度不足时，容易用代偿完成动作，长期会限制技术形成。');
  }

  if (scores.alignment <= 5) {
    risks.push('路径偏移过大时，腰背和肩肘可能承受额外剪切压力。');
  }

  if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgCenterOffset > 0.05) {
    risks.push('从后方看中线偏移较大时，单侧髋、膝和足底可能长期承担更多负荷。');
  }

  if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgKneeWidthRatio < 0.8) {
    risks.push('后方机位可见膝线向内收趋势时，膝关节和髋外侧稳定结构的压力通常会升高。');
  }

  if ((exercise === 'squat' || exercise === 'deadlift') && avgTorsoLean > 24) {
    risks.push('躯干前倾偏大时，低背负荷会明显上升。');
  }

  if (exercise === 'bench_press' && avgShoulderTilt > 0.04) {
    risks.push('肩胛稳定不足会增加肩前侧不适和推起卡顿的概率。');
  }

  return risks;
}

function buildPhases(velocityData: TrackingData['velocityData']) {
  if (velocityData.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.floor(velocityData.length / 3));
  const phaseNames = ['准备到离心', '转换到发力', '完成到锁定'];

  return phaseNames.map((phase, index) => {
    const start = index * size;
    const end = index === phaseNames.length - 1 ? velocityData.length : (index + 1) * size;
    const phaseData = velocityData.slice(start, end);
    const avgVelocity = average(phaseData.map((item) => item.velocity));
    const avgAcceleration = average(phaseData.map((item) => item.acceleration));

    return {
      phase,
      velocity: `${describeSpeed(avgVelocity)}（均值 ${round(avgVelocity, 0)} px/s）`,
      acceleration: `${describeAcceleration(avgAcceleration)}（均值 ${round(avgAcceleration, 0)} px/s²）`,
    };
  });
}

function getDeepestFrame(metrics: PoseMetricFrame[], exercise: ExerciseProfile) {
  if (exercise === 'bench_press') {
    return metrics.reduce((best, frame) => (frame.elbowAngle < best.elbowAngle ? frame : best), metrics[0]);
  }

  if (exercise === 'deadlift') {
    return metrics.reduce((best, frame) => (frame.hipAngle < best.hipAngle ? frame : best), metrics[0]);
  }

  return metrics.reduce((best, frame) => (frame.kneeAngle < best.kneeAngle ? frame : best), metrics[0]);
}

function buildTrackingHighlights(
  exercise: ExerciseProfile,
  metrics: PoseMetricFrame[],
  velocityData: TrackingData['velocityData'],
  sampleCount: number,
  detectedFrames: number
): TrackingHighlight[] {
  const deepestFrame = getDeepestFrame(metrics, exercise);
  const peakVelocityPoint = velocityData.reduce(
    (best, point) => (point.velocity > best.velocity ? point : best),
    velocityData[0]
  );
  const peakAccelerationPoint = velocityData.reduce(
    (best, point) => (Math.abs(point.acceleration) > Math.abs(best.acceleration) ? point : best),
    velocityData[0]
  );
  const torsoLeanPeak = metrics.reduce(
    (best, frame) => (frame.torsoLean > best.torsoLean ? frame : best),
    metrics[0]
  );

  const bottomDetailByExercise: Record<Exclude<ExerciseProfile, 'auto'>, string> = {
    squat: `下蹲最深点膝角约 ${round(deepestFrame.kneeAngle, 0)}°，可以据此回看底部稳定性。`,
    clean: `接杠前后膝角最低约 ${round(deepestFrame.kneeAngle, 0)}°，适合重点复盘二次发力到接杠转换。`,
    deadlift: `起拉准备阶段髋角最低约 ${round(deepestFrame.hipAngle, 0)}°，可重点观察后链预紧是否充分。`,
    bench_press: `下放最深处肘角约 ${round(deepestFrame.elbowAngle, 0)}°，适合回看触胸深度与肩胛稳定。`,
    other: `动作幅度最低点出现在这一刻，适合结合视频判断底部控制与重心位置。`,
  };

  return [
    {
      title: '最低幅度',
      timestamp: deepestFrame.timestamp,
      detail: bottomDetailByExercise[exercise === 'auto' ? 'other' : exercise],
    },
    {
      title: '峰值速度',
      timestamp: peakVelocityPoint.time,
      detail: `主发力峰值速度约 ${round(peakVelocityPoint.velocity, 0)} px/s，适合回看加速时序是否集中。`,
    },
    {
      title: '节奏冲击',
      timestamp: peakAccelerationPoint.time,
      detail: `该时刻加速度变化约 ${round(peakAccelerationPoint.acceleration, 0)} px/s²，能帮助判断转换是否顺滑。`,
    },
    {
      title: '姿态稳定',
      timestamp: torsoLeanPeak.timestamp,
      detail: `最大躯干前倾约 ${round(torsoLeanPeak.torsoLean, 0)}°，本次共识别 ${detectedFrames}/${sampleCount} 帧有效姿态。`,
    },
  ];
}

export async function analyzeVideoLocally(
  file: File,
  selectedExercise: ExerciseProfile,
  onProgress?: (value: number, stage: string) => void
): Promise<{ result: VideoAnalysisResult; trackingData: TrackingData }> {
  const poseLandmarker = await loadPoseLandmarker();
  const { video, url } = await createVideoElement(file);

  try {
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const duration = Math.max(video.duration || 1, 1);
    const sampleCount = getSampleCount(duration);
    const trajectory: TrackingPoint[] = [];
    const metricFrames: PoseMetricFrame[] = [];
    const anchorTypes: TrackingAnchor['anchorType'][] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const time = sampleCount === 1 ? 0 : (index / (sampleCount - 1)) * duration;
      await seekVideo(video, time);

      const detection = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const landmarks = detection.landmarks?.[0] as Landmark[] | undefined;
      onProgress?.(Math.round(((index + 1) / sampleCount) * 100), '正在进行多角度鲁棒识别');

      if (!landmarks || landmarks.length < 33) {
        continue;
      }

      const trackingAnchor = getTrackingAnchor(landmarks);
      const wristPoint = toPixel(trackingAnchor.point, width, height);

      trajectory.push({
        x: wristPoint.x,
        y: wristPoint.y,
        timestamp: time,
      });
      anchorTypes.push(trackingAnchor.anchorType);

      metricFrames.push(getMetricFrame(landmarks, time));
    }

    if (trajectory.length < 4 || metricFrames.length < 4) {
      throw new Error('当前视频里可稳定识别的姿态帧仍然太少，建议尽量保证全身入镜、减少遮挡，并让动作主体更靠近画面中心。');
    }

    const velocityData = buildVelocityData(trajectory);
    const exercise = selectedExercise === 'auto' ? inferExercise(metricFrames, trajectory) : selectedExercise;
    const exerciseLabel = EXERCISE_LABELS[exercise];
    const captureAssessment = buildCaptureAssessment(metricFrames, sampleCount, width, height);
    const avgFaceVisibility = average(metricFrames.map((frame) => frame.faceVisibility));
    const cameraProfile = inferCameraProfile(average(metricFrames.map((frame) => frame.viewRatio)), avgFaceVisibility);
    const deepestFrame = getDeepestFrame(metricFrames, exercise);
    const minKneeAngle = Math.min(...metricFrames.map((frame) => frame.kneeAngle));
    const minHipAngle = Math.min(...metricFrames.map((frame) => frame.hipAngle));
    const minElbowAngle = Math.min(...metricFrames.map((frame) => frame.elbowAngle));
    const avgShoulderTilt = average(metricFrames.map((frame) => frame.shoulderTilt));
    const avgHipTilt = average(metricFrames.map((frame) => frame.hipTilt));
    const avgKneeTrack = average(metricFrames.map((frame) => frame.kneeTrackOffset));
    const avgCenterOffset = average(metricFrames.map((frame) => frame.centerOffset));
    const avgKneeWidthRatio = average(metricFrames.map((frame) => frame.kneeWidthRatio));
    const avgTorsoLean = average(metricFrames.map((frame) => frame.torsoLean));
    const avgVisibility = average(metricFrames.map((frame) => frame.visibilityScore));
    const avgCoverage = average(metricFrames.map((frame) => frame.coverageScore));
    const horizontalDrift = Math.max(...trajectory.map((point) => point.x)) - Math.min(...trajectory.map((point) => point.x));
    const verticalRange = Math.max(...trajectory.map((point) => point.y)) - Math.min(...trajectory.map((point) => point.y));
    const smoothness = average(
      velocityData.slice(1).map((point, index) => Math.abs(point.acceleration - velocityData[index].acceleration))
    );
    const peakVelocity = velocityData.reduce((best, point) => Math.max(best, point.velocity), 0);
    const peakAcceleration = velocityData.reduce(
      (best, point) => Math.max(best, Math.abs(point.acceleration)),
      0
    );

    const stabilityScore = clamp(
      10 - avgShoulderTilt * 110 - avgHipTilt * 120 - Math.min(3.2, smoothness / 85) + avgVisibility * 0.6,
      1,
      10
    );
    const rangeScore = clamp(
      exercise === 'bench_press'
        ? 10 - Math.max(0, minElbowAngle - 75) / 9
        : exercise === 'deadlift'
          ? 10 - Math.max(0, minHipAngle - 72) / 7
          : 10 - Math.max(0, minKneeAngle - 90) / 7,
      1,
      10
    );
    const alignmentScore = clamp(
      cameraProfile === 'front'
        ? 10 - avgShoulderTilt * 125 - avgHipTilt * 130 - avgKneeTrack * 35 - avgCenterOffset * 120 - Math.max(0, avgTorsoLean - 18) / 7
        : cameraProfile === 'front_diagonal'
          ? 10 - horizontalDrift / 22 - avgKneeTrack * 38 - avgShoulderTilt * 65 - Math.max(0, avgTorsoLean - 16) / 5.5
          : cameraProfile === 'rear' || cameraProfile === 'rear_diagonal'
            ? 10 - avgShoulderTilt * 110 - avgHipTilt * 115 - avgKneeTrack * 30 - avgCenterOffset * 135 - Math.abs(1 - avgKneeWidthRatio) * 6
          : 10 - horizontalDrift / 18 - avgKneeTrack * 42 - Math.max(0, avgTorsoLean - 15) / 5,
      1,
      10
    );
    const reliabilityBonus = clamp((avgVisibility * 0.5 + avgCoverage * 0.5) * 0.8, 0, 0.8);
    const overallScore = round(
      clamp(stabilityScore * 0.34 + rangeScore * 0.33 + alignmentScore * 0.33 + reliabilityBonus, 1, 10),
      1
    );
    const trajectoryNarrative = getTrajectoryNarrative(horizontalDrift, smoothness, exerciseLabel, cameraProfile);
    const deepestMomentLabel =
      exercise === 'bench_press'
        ? `下放最深点出现在 ${round(deepestFrame.timestamp)} 秒附近，肘角约 ${round(deepestFrame.elbowAngle, 0)}°`
        : exercise === 'deadlift'
          ? `起拉准备最低点出现在 ${round(deepestFrame.timestamp)} 秒附近，髋角约 ${round(deepestFrame.hipAngle, 0)}°`
          : `最低动作幅度出现在 ${round(deepestFrame.timestamp)} 秒附近，膝角约 ${round(deepestFrame.kneeAngle, 0)}°`;
    const keyMoments = [
      deepestMomentLabel,
      `最快发力段在 ${round(velocityData.reduce((best, item) => item.velocity > best.velocity ? item : best, velocityData[0]).time)} 秒附近`,
      `本次共识别 ${metricFrames.length}/${sampleCount} 帧有效姿态，当前机位判断为${captureAssessment.angleLabel}`,
    ];

    const postureIssuesStability: string[] = [];
    const postureIssuesAlignment: string[] = [];

    if (stabilityScore < 7) {
      postureIssuesStability.push('左右侧发力节奏不够一致，动作过程中出现轻微晃动');
    }

    if (smoothness > 60) {
      postureIssuesStability.push('节奏波动较大，底部转换和完成阶段不够连贯');
    }

    if (alignmentScore < 7) {
      postureIssuesAlignment.push(
        cameraProfile === 'front'
          ? '左右两侧的伸展顺序还不够同步，说明身体对齐与重心分布仍可继续优化'
          : cameraProfile === 'rear' || cameraProfile === 'rear_diagonal'
            ? '后方机位可见左右侧对线仍不够稳定，说明骨盆、膝盖和脚之间的控制链还需要继续强化'
          : '主轨迹离中线偏远，说明发力路径还不够集中'
      );
    }

    if (avgTorsoLean > 20) {
      postureIssuesAlignment.push('躯干角度波动偏大，说明核心稳定还可以继续加强');
    }

    if (avgKneeTrack > 0.06 && exercise !== 'bench_press') {
      postureIssuesAlignment.push('膝盖与脚尖方向的一致性不足，底部控制需要加强');
    }

    if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgCenterOffset > 0.045) {
      postureIssuesAlignment.push('从后方看，头-骨盆-双脚中线存在轻微左右偏移，提示重心分布并不完全平均。');
    }

    if ((cameraProfile === 'rear' || cameraProfile === 'rear_diagonal') && avgKneeWidthRatio < 0.82) {
      postureIssuesAlignment.push('后方机位下膝间距相对脚宽偏窄，提示蹲起阶段有夹膝或髋外展控制不足的趋势。');
    }

    if (captureAssessment.warnings.length > 0) {
      postureIssuesStability.push(...captureAssessment.warnings.slice(0, 2));
    }

    const suggestions = buildSuggestions(
      exercise,
      { stability: stabilityScore, range: rangeScore, alignment: alignmentScore },
      metricFrames,
      captureAssessment,
      cameraProfile
    );

    const result: VideoAnalysisResult = {
      exerciseType: exerciseLabel,
      analysisMode: 'MediaPipe 本地分析 · 多角度鲁棒识别',
      captureAssessment,
      trajectoryAnalysis: {
        barPath: trajectoryNarrative,
        keyPoints: keyMoments,
        deviations:
          cameraProfile === 'front'
            ? '当前机位以对称性复盘为主，建议优先看左右两侧是否同时发力、肩髋是否平行。'
            : cameraProfile === 'rear' || cameraProfile === 'rear_diagonal'
              ? '当前机位以后方对线复盘为主，建议优先看头部、骨盆、膝盖和脚的相对位置是否始终稳定。'
            : horizontalDrift < 40
              ? '整体路径偏差较小，关键是继续保持同样的发力顺序和上升节奏。'
              : '中段路径偏移较明显，建议重点复盘起始位置、核心紧张和加速方向。',
      },
      velocityAnalysis: {
        phases: buildPhases(velocityData),
        criticalMoments:
          velocityData.length > 0
            ? `最高速度出现在 ${round(
                velocityData.reduce((best, item) => item.velocity > best.velocity ? item : best, velocityData[0]).time
              )} 秒附近，说明这一段是本次动作的主要输出窗口。`
            : '当前视频速度样本较少，建议换用更完整的视频再次分析。',
      },
      postureAnalysis: {
        stability: {
          score: round(stabilityScore),
          issues: postureIssuesStability,
        },
        rangeOfMotion: {
          score: round(rangeScore),
          notes: getRangeNotes(exercise, minKneeAngle, minElbowAngle, minHipAngle),
        },
        bodyAlignment: {
          score: round(alignmentScore),
          issues: postureIssuesAlignment,
        },
      },
      overallScore,
      suggestions,
      strengths: buildStrengths(
        { stability: stabilityScore, range: rangeScore, alignment: alignmentScore },
        trajectoryNarrative
      ),
      risks: buildRisks(
        exercise,
        { stability: stabilityScore, range: rangeScore, alignment: alignmentScore },
        metricFrames
      ),
    };

    return {
      result,
      trackingData: {
        trajectory,
        velocityData,
        poseMetrics: metricFrames,
        sampleCount,
        detectedFrames: metricFrames.length,
        trajectoryLabel: getTrajectoryLabel(exercise, anchorTypes),
        highlights: buildTrackingHighlights(exercise, metricFrames, velocityData, sampleCount, metricFrames.length),
        metricSummary: {
          peakVelocity,
          peakAcceleration,
          verticalRange,
          horizontalDrift,
          averageTorsoLean: avgTorsoLean,
        },
        captureAssessment,
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
