import React from "react";

interface MethodBadgeProps {
  method: string;
  size?: "sm" | "md";
}

export const MethodBadge: React.FC<MethodBadgeProps> = ({
  method,
  size = "sm",
}) => {
  const m = (method || "GET").toUpperCase();
  const colorClass =
    m === "GET"
      ? "method-get"
      : m === "POST"
      ? "method-post"
      : m === "PUT"
      ? "method-put"
      : m === "PATCH"
      ? "method-patch"
      : m === "DELETE"
      ? "method-delete"
      : m === "HEAD" || m === "OPTIONS"
      ? "method-meta"
      : "method-custom";

  return (
    <span className={`method-badge ${colorClass} method-badge-${size}`}>
      {m}
    </span>
  );
};

