interface StatCardProps {
  icon: string
  label: string
  value: number | string
  color: string
  sub?: string
}

export default function StatCard({ icon, label, value, color, sub }: StatCardProps) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 24, flexShrink: 0
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: '1.7rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  )
}