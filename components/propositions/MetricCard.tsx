import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'green' | 'orange' | 'blue';
}

export function MetricCard({ title, value, subtitle, icon: Icon, trend, color = 'blue' }: MetricCardProps) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    blue: 'bg-blue-50 border-blue-200',
  };

  const iconClasses = {
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    blue: 'bg-blue-100 text-blue-600',
  };

  const valueColorClasses = {
    green: 'text-green-700',
    orange: 'text-orange-700',
    blue: 'text-blue-700',
  };

  return (
    <div className={`p-6 rounded-xl border ${colorClasses[color]} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className={`p-2 rounded-lg ${iconClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-baseline space-x-2">
        <span className={`text-2xl font-bold ${valueColorClasses[color]}`}>{value}</span>
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}
