import { Lead, AnalyticsEvent, ScoreRule, EventType } from "@prisma/client";

export interface ScoreBreakdown {
  demographic: number;
  firmographic: number;
  engagement: number;
  recency: number;
}

export interface ScoredResult {
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

// ─── HARDCODED DEFAULTS (used when no ScoreRule records exist) ────────────────

const DEFAULT_RULES: ScoreRule[] = [
  // Demographic
  {
    id: "default-1",
    name: "Director/VP title",
    category: "demographic",
    condition: { field: "jobTitle", operator: "contains_any", value: ["director", "vp", "vice president"] },
    points: 15,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "default-2",
    name: "C-level title",
    category: "demographic",
    condition: { field: "jobTitle", operator: "contains_any", value: ["ceo", "cto", "coo", "cmo", "cfo", "chief"] },
    points: 20,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "default-3",
    name: "Manager title",
    category: "demographic",
    condition: { field: "jobTitle", operator: "contains_any", value: ["manager", "head of", "lead"] },
    points: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Firmographic
  {
    id: "default-4",
    name: "Has company name",
    category: "firmographic",
    condition: { field: "company", operator: "present", value: null },
    points: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "default-5",
    name: "Has website",
    category: "firmographic",
    condition: { field: "website", operator: "present", value: null },
    points: 8,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ─── CONDITION EVALUATOR ──────────────────────────────────────────────────────

type Condition = {
  field: string;
  operator: "contains" | "contains_any" | "equals" | "present" | "absent";
  value: string | string[] | null;
};

function evaluateCondition(lead: Lead, condition: Condition): boolean {
  const raw = (lead as Record<string, unknown>)[condition.field];
  const fieldValue = typeof raw === "string" ? raw.toLowerCase() : null;

  switch (condition.operator) {
    case "present":
      return fieldValue !== null && fieldValue.trim() !== "";
    case "absent":
      return fieldValue === null || fieldValue.trim() === "";
    case "equals":
      return fieldValue === String(condition.value).toLowerCase();
    case "contains":
      return fieldValue !== null && fieldValue.includes(String(condition.value).toLowerCase());
    case "contains_any":
      if (!Array.isArray(condition.value)) return false;
      return fieldValue !== null && condition.value.some((v) => fieldValue.includes(v.toLowerCase()));
    default:
      return false;
  }
}

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

export function scoreLead(
  lead: Lead,
  events: AnalyticsEvent[],
  rules: ScoreRule[] = DEFAULT_RULES
): ScoredResult {
  const activeRules = rules.filter((r) => r.isActive);

  // 1. Demographic score (max 30)
  const demographicRules = activeRules.filter((r) => r.category === "demographic");
  let demographic = 0;
  for (const rule of demographicRules) {
    if (evaluateCondition(lead, rule.condition as unknown as Condition)) {
      demographic += rule.points;
    }
  }
  demographic = Math.min(demographic, 30);

  // 2. Firmographic score (max 25)
  const firmographicRules = activeRules.filter((r) => r.category === "firmographic");
  let firmographic = 0;
  for (const rule of firmographicRules) {
    if (evaluateCondition(lead, rule.condition as unknown as Condition)) {
      firmographic += rule.points;
    }
  }
  firmographic = Math.min(firmographic, 25);

  // 3. Engagement score (max 35)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const recentEvents = events.filter((e) => e.occurredAt >= cutoff);

  const countByType = (type: EventType) =>
    recentEvents.filter((e) => e.type === type).length;

  const pageViews = Math.min(countByType(EventType.PAGE_VIEW), 10) * 1;
  const emailOpens = Math.min(countByType(EventType.EMAIL_OPEN), 4) * 3;
  const emailClicks = Math.min(countByType(EventType.EMAIL_CLICK), 3) * 5;
  const formSubmits = countByType(EventType.FORM_SUBMIT) > 0 ? 8 : 0;
  const engagement = Math.min(pageViews + emailOpens + emailClicks + formSubmits, 35);

  // 4. Recency score (max 10)
  let recency = 0;
  if (lead.lastActivityAt) {
    const daysSince = (Date.now() - lead.lastActivityAt.getTime()) / 86_400_000;
    if (daysSince <= 7) recency = 10;
    else if (daysSince <= 30) recency = 5;
    else if (daysSince <= 90) recency = 2;
  }

  const total = Math.min(demographic + firmographic + engagement + recency, 100);

  return {
    score: total,
    scoreBreakdown: { demographic, firmographic, engagement, recency },
  };
}
