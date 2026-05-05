import React from "react";

const STYLES = {
  basic: { color: "#8B8BA0", bg: "rgba(139,139,160,0.12)", border: "rgba(139,139,160,0.45)" },
  pro: { color: "#0EA5E9", bg: "rgba(14,165,233,0.12)", border: "rgba(14,165,233,0.45)" },
  enterprise: { color: "#FFD166", bg: "rgba(255,209,102,0.10)", border: "rgba(255,209,102,0.45)" },
};

export default function PlanBadge({ plan }) {
  const key = (plan || "basic").toLowerCase();
  const s = STYLES[key] || STYLES.basic;
  return (
    <span
      className="inline-flex items-center text-[0.65rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
      data-testid={`plan-${key}`}
    >
      {key}
    </span>
  );
}
