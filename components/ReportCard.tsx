import { ReactNode } from "react";

interface Props {
  icon: string;
  title: string;
  children: ReactNode;
  premium?: boolean;
}

export default function ReportCard({ icon, title, children, premium = false }: Props) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0",
      borderRadius: 16, padding: "16px 18px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", lineHeight: 1.3 }}>{title}</span>
        </div>
        {premium && (
          <span style={{
            fontSize: 10, padding: "3px 9px", borderRadius: 99,
            background: "#fef3c7", color: "#d97706", fontWeight: 700,
            flexShrink: 0, whiteSpace: "nowrap",
          }}>🔑 Premium</span>
        )}
      </div>
      {premium
        ? <div style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}>{children}</div>
        : children}
    </div>
  );
}
