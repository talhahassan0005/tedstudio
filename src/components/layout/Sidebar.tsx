'use client';

import { useState } from 'react';
import { ChevronLeft, PanelLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  disabled?: boolean;
}

export interface SidebarProps {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title?: string;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Left tool rail. Collapses to an icon strip on desktop and to a sheet that
 * slides in from the left on mobile.
 */
export function Sidebar({
  items,
  activeId,
  onSelect,
  title = 'Tools',
  footer,
  className,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const list = (
    <>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            title={collapsed ? item.label : item.hint}
            onClick={() => {
              onSelect(item.id);
              setMobileOpen(false);
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <span className="flex-1 truncate">
                {item.label}
                {item.hint && (
                  <span className="block text-[11px] leading-tight text-muted-foreground/70">
                    {item.hint}
                  </span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 left-4 z-30 shadow-lg lg:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <PanelLeft />
        {title}
      </Button>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close tools"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-1 border-r border-border bg-slate-900 p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(false)}>
                <ChevronLeft />
              </Button>
            </div>
            <Separator className="mb-2" />
            {list}
            {footer && (
              <>
                <Separator className="my-2" />
                {footer}
              </>
            )}
          </aside>
        </div>
      )}

      {/* Desktop rail */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col gap-1 border-r border-border bg-slate-900/50 p-2 transition-[width] lg:flex',
          collapsed ? 'w-14' : 'w-56',
          className,
        )}
      >
        <div className={cn('flex items-center px-1 pb-1', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && (
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft /> : <ChevronLeft />}
          </Button>
        </div>

        <Separator className="mb-1" />
        {list}

        {footer && !collapsed && (
          <>
            <Separator className="my-2" />
            {footer}
          </>
        )}
      </aside>
    </>
  );
}
