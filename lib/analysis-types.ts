export type ExerciseProfile = 'auto' | 'squat' | 'bench_press' | 'clean' | 'deadlift' | 'other';

export interface TrackingPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface VelocityPoint {
  time: number;
  velocity: number;
  acceleration: number;
}

export interface TrackingHighlight {
  title: string;
  timestamp: number;
  detail: string;
}

export interface TrackingMetricSummary {
  peakVelocity: number;
  peakAcceleration: number;
  verticalRange: number;
  horizontalDrift: number;
  averageTorsoLean: number;
}

export interface CaptureAssessment {
  angleLabel: string;
  clarityLabel: string;
  resolutionLabel: string;
  confidenceLabel: string;
  detectedFrameRatio: number;
  visibilityScore: number;
  coverageScore: number;
  warnings: string[];
}

export interface PoseMetricFrame {
  timestamp: number;
  kneeAngle: number;
  hipAngle: number;
  elbowAngle: number;
  torsoLean: number;
  shoulderTilt: number;
  hipTilt: number;
  kneeTrackOffset: number;
  visibilityScore: number;
  coverageScore: number;
  viewRatio: number;
  faceVisibility: number;
  centerOffset: number;
  kneeWidthRatio: number;
}

export interface TrackingData {
  trajectory: TrackingPoint[];
  velocityData: VelocityPoint[];
  poseMetrics: PoseMetricFrame[];
  sampleCount: number;
  detectedFrames: number;
  trajectoryLabel: string;
  highlights: TrackingHighlight[];
  metricSummary: TrackingMetricSummary;
  captureAssessment: CaptureAssessment;
}

export interface VideoAnalysisResult {
  exerciseType: string;
  analysisMode: string;
  captureAssessment: CaptureAssessment;
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

export interface HistoryItem {
  id: string;
  createdAt: string;
  videoFileName: string;
  exerciseType: string;
  overallScore: number;
  analysisMode: string;
  suggestions: string[];
}
