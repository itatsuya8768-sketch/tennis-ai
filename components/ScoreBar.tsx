interface Props {
  label: string;
  value: number;
  max?: number;
  color?: string;
  unit?: string;
}

export default function ScoreBar({ label, value, max = 100, color = "#3ddc97", unit = "" }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#aeb2b8" }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 800 }}>{value}{unit}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "#2a2d33" }}>
        <div style={{
          height: "100%", borderRadius: 99, background: color,
          width: `${Math.min((value / max) * 100, 100)}%`,
          transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
    </div>
  );
}
