'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, HardDrive } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UsageData {
  used_percent: number;
  storage_used_gb: number;
  storage_limit_gb: number;
}

const WARN_AT = 80;   // show warning
const CRIT_AT = 95;   // show critical (red)
// Check once per session, not on every render
const SESSION_KEY = 'ts_storage_check';

export function StorageWarningDialog() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    // Only check once per browser session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    fetch('/api/cloudinary/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: UsageData | null) => {
        if (!data) return;
        sessionStorage.setItem(SESSION_KEY, '1');
        if (data.used_percent >= WARN_AT) {
          setUsage(data);
          setOpen(true);
        }
      })
      .catch(() => {/* silent — storage check is non-critical */});
  }, []);

  if (!usage) return null;

  const isCritical = usage.used_percent >= CRIT_AT;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className={`h-4 w-4 ${isCritical ? 'text-destructive' : 'text-amber-400'}`}
            />
            {isCritical ? 'Storage almost full' : 'Storage running low'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-slate-900/60 px-3 py-2">
                <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Cloudinary storage</span>
                    <span className={`font-semibold tabular-nums ${isCritical ? 'text-destructive' : 'text-amber-400'}`}>
                      {usage.used_percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full rounded-full transition-all ${isCritical ? 'bg-destructive' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(usage.used_percent, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {usage.storage_used_gb} GB used of {usage.storage_limit_gb} GB
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {isCritical
                  ? 'Your Cloudinary storage is almost full. New images and videos will fail to save until you free up space.'
                  : 'Your Cloudinary storage is getting full. Delete old images and videos to keep saving new ones.'}
              </p>

              <p className="text-xs text-muted-foreground">
                Go to your Cloudinary Media Library, delete files you no longer need, then come back and continue editing.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Dismiss
          </Button>
          <Button
            size="sm"
            variant={isCritical ? 'destructive' : 'default'}
            onClick={() => {
              window.open('https://console.cloudinary.com/console/media_library', '_blank');
              setOpen(false);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Media Library
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
