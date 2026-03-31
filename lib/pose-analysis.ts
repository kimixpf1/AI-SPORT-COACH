import { ExerciseProfile, PoseMetricFrame, TrackingData, TrackingHighlight, TrackingPoint, VideoAnalysisResult } from './analysis-types';

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

const SAMPLE_COUNT = 24;

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

      return vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
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
  const leftKneeAngle = angleBetween(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = angleBetween(rightHip, rightKnee, rightAnkle);
  const leftHipAngle = angleBetween(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = angleBetween(rightShoulder, rightHip, rightKnee);
  const leftElbowAngle = angleBetween(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = angleBetween(rightShoulder, rightElbow, rightWrist);

  return {
    timestamp,
    kneeAngle: average([leftKneeAngle, rightKneeAngle]),
    hipAngle: average([leftHipAngle, rightHipAngle]),
    elbowAngle: average([leftElbowAngle, rightElbowAngle]),
    torsoLean: verticalAngle(shoulderMid, hipMid),
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y),
    hipTilt: Math.abs(leftHip.y - rightHip.y),
    kneeTrackOffset: average([
      Math.abs(leftKnee.x - leftFoot.x),
      Math.abs(rightKnee.x - rightFoot.x),
    ]),
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

function getTrajectoryNarrative(horizontalDrift: number, smoothness: number, exerciseLabel: string) {
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

function buildSuggestions(exercise: ExerciseProfile, scores: { stability: number; range: number; alignment: number }, metrics: PoseMetricFrame[]) {
  const suggestions: string[] = [];
  const avgTorsoLean = average(metrics.map((frame) => frame.torsoLean));
  const avgShoulderTilt = average(metrics.map((frame) => frame.shoulderTilt));
  const avgKneeTrack = average(metrics.map((frame) => frame.kneeTrackOffset));

  if (scores.range < 7) {
    suggestions.push('先用空杆或轻重量做慢速分解练习，优先把动作幅度做完整，再逐步加重。');
  }

  if (scores.stability < 7) {
    suggestions.push('训练前增加核心与肩胛稳定热身，让起始姿势和发力过程更稳。');
  }

  if (scores.alignment < 7) {
    suggestions.push('把发力注意力放在脚中部和身体中线，减少器械路径左右或前后漂移。');
  }

  if ((exercise === 'squat' || exercise === 'clean') && avgTorsoLean > 18) {
    suggestions.push('底部起身时保持胸椎主动上提，避免髋部先冲起导致前倾放大。');
  }

  if (exercise === 'bench_press' && avgShoulderTilt > 0.035) {
    suggestions.push('卧推动作中保持两侧肩胛对称收紧，减少下放时单侧肩部先松脱。');
  }

  if ((exercise === 'squat' || exercise === 'deadlift') && avgKneeTrack > 0.06) {
    suggestions.push('留意膝盖与脚尖方向一致，避免起身阶段膝线向内或向外偏移过大。');
  }

  return suggestions.slice(0, 4);
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

  if (scores.range <= 5) {
    risks.push('动作幅度不足时，容易用代偿完成动作，长期会限制技术形成。');
  }

  if (scores.alignment <= 5) {
    risks.push('路径偏移过大时，腰背和肩肘可能承受额外剪切压力。');
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
    const trajectory: TrackingPoint[] = [];
    const metricFrames: PoseMetricFrame[] = [];

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const time = SAMPLE_COUNT === 1 ? 0 : (index / (SAMPLE_COUNT - 1)) * duration;
      await seekVideo(video, time);

      const detection = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const landmarks = detection.landmarks?.[0] as Landmark[] | undefined;
      onProgress?.(Math.round(((index + 1) / SAMPLE_COUNT) * 100), '正在用 MediaPipe 识别动作');

      if (!landmarks || landmarks.length < 33) {
        continue;
      }

      const leftWrist = landmarks[15];
      const rightWrist = landmarks[16];
      const wristMid = midpoint(leftWrist, rightWrist);
      const wristPoint = toPixel(wristMid, width, height);

      trajectory.push({
        x: wristPoint.x,
        y: wristPoint.y,
        timestamp: time,
      });

      metricFrames.push(getMetricFrame(landmarks, time));
    }

    if (trajectory.length < 6 || metricFrames.length < 6) {
      throw new Error('MediaPipe 检测到的有效姿态帧太少，建议使用侧前方、全身入镜、光线更稳定的视频');
    }

    const velocityData = buildVelocityData(trajectory);
    const exercise = selectedExercise === 'auto' ? inferExercise(metricFrames, trajectory) : selectedExercise;
    const exerciseLabel = EXERCISE_LABELS[exercise];
    const minKneeAngle = Math.min(...metricFrames.map((frame) => frame.kneeAngle));
    const minHipAngle = Math.min(...metricFrames.map((frame) => frame.hipAngle));
    const minElbowAngle = Math.min(...metricFrames.map((frame) => frame.elbowAngle));
    const avgShoulderTilt = average(metricFrames.map((frame) => frame.shoulderTilt));
    const avgHipTilt = average(metricFrames.map((frame) => frame.hipTilt));
    const avgKneeTrack = average(metricFrames.map((frame) => frame.kneeTrackOffset));
    const avgTorsoLean = average(metricFrames.map((frame) => frame.torsoLean));
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
      10 - avgShoulderTilt * 110 - avgHipTilt * 120 - Math.min(3, smoothness / 90),
      1,
      10
    );
    const rangeScore = clamp(
      exercise === 'bench_press'
        ? 10 - Math.max(0, minElbowAngle - 75) / 9
        : 10 - Math.max(0, minKneeAngle - 90) / 7,
      1,
      10
    );
    const alignmentScore = clamp(
      10 - horizontalDrift / 18 - avgKneeTrack * 42 - Math.max(0, avgTorsoLean - 15) / 5,
      1,
      10
    );
    const overallScore = round(stabilityScore * 0.34 + rangeScore * 0.33 + alignmentScore * 0.33, 1);
    const trajectoryNarrative = getTrajectoryNarrative(horizontalDrift, smoothness, exerciseLabel);
    const keyMoments = [
      `最低动作幅度出现在 ${round(metricFrames[metricFrames.findIndex((frame) => frame.kneeAngle === minKneeAngle)]?.timestamp ?? 0)} 秒附近`,
      `最快发力段在 ${round(velocityData.reduce((best, item) => item.velocity > best.velocity ? item : best, velocityData[0]).time)} 秒附近`,
      `本次共识别 ${metricFrames.length}/${SAMPLE_COUNT} 帧有效姿态`,
    ];

    const postureIssuesStability = [];
    const postureIssuesAlignment = [];

    if (stabilityScore < 7) {
      postureIssuesStability.push('左右侧发力节奏不够一致，动作过程中出现轻微晃动');
    }

    if (smoothness > 60) {
      postureIssuesStability.push('节奏波动较大，底部转换和完成阶段不够连贯');
    }

    if (alignmentScore < 7) {
      postureIssuesAlignment.push('主轨迹离中线偏远，说明发力路径还不够集中');
    }

    if (avgTorsoLean > 20) {
      postureIssuesAlignment.push('躯干角度波动偏大，说明核心稳定还可以继续加强');
    }

    if (avgKneeTrack > 0.06 && exercise !== 'bench_press') {
      postureIssuesAlignment.push('膝盖与脚尖方向的一致性不足，底部控制需要加强');
    }

    const suggestions = buildSuggestions(
      exercise,
      { stability: stabilityScore, range: rangeScore, alignment: alignmentScore },
      metricFrames
    );

    const result: VideoAnalysisResult = {
      exerciseType: exerciseLabel,
      analysisMode: 'MediaPipe 本地分析',
      trajectoryAnalysis: {
        barPath: trajectoryNarrative,
        keyPoints: keyMoments,
        deviations:
          horizontalDrift < 40
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
        sampleCount: SAMPLE_COUNT,
        detectedFrames: metricFrames.length,
        trajectoryLabel: exercise === 'bench_press' ? '杠铃手部中点轨迹' : '手部中点轨迹',
        highlights: buildTrackingHighlights(exercise, metricFrames, velocityData, SAMPLE_COUNT, metricFrames.length),
        metricSummary: {
          peakVelocity,
          peakAcceleration,
          verticalRange,
          horizontalDrift,
          averageTorsoLean: avgTorsoLean,
        },
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
