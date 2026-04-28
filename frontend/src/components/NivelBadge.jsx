import React from "react";

export default function NivelBadge({ nivel }) {
  const n = (nivel || "basico").toLowerCase();
  return (
    <span className={`nivel-pill nivel-${n}`} data-testid={`nivel-${n}`}>
      {n}
    </span>
  );
}
