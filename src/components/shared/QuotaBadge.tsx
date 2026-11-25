'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

interface KindStats {
  today: number;
  thisMonth: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

interface QuotaStats {
  image: KindStats;
  video: KindStats;
}

interface QuotaBadgeProps {
  kind?: 'image' | 'video';
}

function color(count: number, limit: number | null) {
  if (!limit) return 'text-sky-400'; // paid/unlimited — neutral info color
  const pct = (count / limit) * 100;
  if (pct >= 90) return 'text-destructive';
  if (pct >= 70) return 'text-amber-400';
  return 'text-emerald-400';
}

export function QuotaBadge({ kind = 'image' }: QuotaBadgeProps) {
  const [stats, setStats] = useState<QuotaStats | null>(null);

  const refresh = () => {
    fetch('/api/ai/quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: QuotaStats | null) => { if (data) setStats(data); })
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    window.addEventListener('quota:refresh', refresh);
    return () => window.removeEventListener('quota:refresh', refresh);
  }, []);

  if (!stats) return null;

  const s = stats[kind];
  const isUnlimited = s.dailyLimit === null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />

      {isUnlimited ? (
        // Video — paid, no hard limit, just show usage
        <div className="flex items-center gap-2 divide-x divide-border">
          <span className="pr-2">
            Today:{' '}
            <span className={`font-semibold tabular-nums ${color(s.today, null)}`}>
              {s.today}
            </span>
            <span className="text-muted-foreground"> runs</span>
          </span>
          <span className="pl-2">
            This month:{' '}
            <span className={`font-semibold tabular-nums ${color(s.thisMonth, null)}`}>
              {s.thisMonth}
            </span>
            <span className="text-muted-foreground"> runs</span>
          </span>
          <span className="pl-2 text-muted-foreground">Paid per run</span>
        </div>
      ) : (
        // Image — free quota with limits
        <div className="flex items-center gap-2 divide-x divide-border">
          <span className="pr-2">
            Today:{' '}
            <span className={`font-semibold tabular-nums ${color(s.today, s.dailyLimit)}`}>
              {s.today}
            </span>
            <span className="text-muted-foreground">/{s.dailyLimit}</span>
          </span>
          <span className="pl-2">
            This month:{' '}
            <span className={`font-semibold tabular-nums ${color(s.thisMonth, s.monthlyLimit)}`}>
              {s.thisMonth}
            </span>
            <span className="text-muted-foreground">/{s.monthlyLimit}</span>
          </span>
        </div>
      )}
    </div>
  );
}
