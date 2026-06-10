export type PainLevel = 1 | 2 | 3 | 4;

export interface PlayerProfile {
  handedness: "右利き" | "左利き";
  forehand: "片手打ち" | "両手打ち";
  forehandGrip?: "順手（利き手が上）" | "逆手（非利き手が上）";
  backhand: "片手打ち" | "両手打ち";
  painAreas: string[];
  painLevels: Record<string, PainLevel>;
}

export interface AIReport {
  formScore: number;         // 0-100
  injuryRisk: "低" | "中" | "中〜高" | "高";
  swingSpeed: number;        // km/h (estimated)
  elbowAngle: number;        // degrees
  footworkScore: number;     // 0-100
  takebackDepth: number;     // cm relative to average
  impactOffset: number;      // cm (+ = late, - = early)
  sections: {
    formAnalysis: string;
    impactCheck: string;
    footwork: string;
    injuryCare: string;
  };
}

export interface DiagnosisRecord {
  id: string;
  created_at: string;
  handedness: string;
  forehand: string;
  forehand_grip?: string;
  backhand: string;
  pain_areas: string[];
  pain_levels: Record<string, number>;
  ai_report: AIReport | null;
  ai_text: string | null;
  video_path?: string;
  thumbnail_path?: string;
}
