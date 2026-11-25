'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, CalendarDays, ImageIcon, Pencil, Plus, Search, Trash2, Video } from 'lucide-react';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { clearProjects, loadProjects, removeProject } from '@/lib/projects';
import type { ProjectSummary } from '@/lib/types';

type KindFilter = 'all' | 'image' | 'video';
type SortOrder = 'newest' | 'oldest';
type DateFilter = 'all' | 'today' | 'week' | 'month';

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  useEffect(() => {
    let cancelled = false;
    loadProjects().then((loaded) => {
      if (cancelled) return;
      setProjects(loaded);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = projects;

    if (kindFilter !== 'all') list = list.filter((p) => p.kind === kindFilter);

    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date(
        dateFilter === 'today'
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
          : dateFilter === 'week'
            ? now.getTime() - 7 * 24 * 60 * 60 * 1000
            : new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      );
      list = list.filter((p) => new Date(p.updatedAt) >= cutoff);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    list = [...list].sort((a, b) => {
      const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return sortOrder === 'newest' ? diff : -diff;
    });
    return list;
  }, [projects, kindFilter, dateFilter, search, sortOrder]);

  // Optimistic removal — the list snaps back only if the API call fails.
  const remove = async (id: string) => {
    const previous = projects;
    setProjects(previous.filter((project) => project.id !== id));
    if (!(await removeProject(id))) setProjects(previous);
  };

  const clearAll = async () => {
    const previous = projects;
    setProjects([]);
    if (!(await clearProjects())) setProjects(previous);
  };

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your recent projects, straight from the database.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/editor/image">
              <Plus />
              New image
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/editor/video">
              <Plus />
              New video
            </Link>
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      {/* Quick start */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/editor/image" className="group">
          <Card className="liftable h-full border-border/60 bg-card/50 group-hover:border-primary/50">
            <CardContent className="flex items-start gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ImageIcon className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Image editor</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Erase, inpaint, cut out backgrounds, merge and adjust.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/editor/video" className="group">
          <Card className="liftable h-full border-border/60 bg-card/50 group-hover:border-primary/50">
            <CardContent className="flex items-start gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Video className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Video editor</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trim, join, build from stills, add music, erase with AI.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recents */}
      <div className="mt-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </h2>
          {projects.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClearOpen(true)}>
              <Trash2 />
              Clear
            </Button>
          )}
        </div>

        {hydrated && projects.length > 0 && (
          <div className="space-y-2">
            {/* Row 1: search + sort + count */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs"
                onClick={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              >
                <ArrowUpDown className="h-3 w-3" />
                {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
              </Button>
              {(search || kindFilter !== 'all' || dateFilter !== 'all') && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {filtered.length}/{projects.length}
                </span>
              )}
            </div>

            {/* Row 2: type + date filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Kind */}
              <div className="flex rounded-md border border-border text-xs">
                {(['all', 'image', 'video'] as KindFilter[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setKindFilter(kind)}
                    className={`flex items-center gap-1 px-2.5 py-1 font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                      kindFilter === kind
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {kind === 'image' && <ImageIcon className="h-3 w-3" />}
                    {kind === 'video' && <Video className="h-3 w-3" />}
                    {kind.charAt(0).toUpperCase() + kind.slice(1)}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <span className="h-4 w-px bg-border" />

              {/* Date */}
              <div className="flex items-center gap-1 text-xs">
                <CalendarDays className="h-3 w-3 text-muted-foreground" />
                {([
                  { value: 'all', label: 'All' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: '7 days' },
                  { value: 'month', label: 'Month' },
                ] as { value: DateFilter; label: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDateFilter(opt.value)}
                    className={`rounded px-2 py-1 font-medium transition-colors ${
                      dateFilter === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Clear filters */}
              {(search || kindFilter !== 'all' || dateFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setKindFilter('all'); setDateFilter('all'); }}
                  className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {!hydrated ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-40 rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-transparent">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-medium">Nothing here yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Projects you start in either editor are saved here automatically.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/editor/image">Start with an image</Link>
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No results</p>
            <p className="text-xs text-muted-foreground">
              Try a different search term or filter.
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setKindFilter('all'); setDateFilter('all'); }}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((project) => (
              <Card key={project.id} className="liftable group overflow-hidden border-border/60">
                <div className="relative aspect-video bg-slate-950 bg-checkerboard">
                  {project.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={project.thumbnailUrl}
                      alt={project.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {project.kind === 'video' ? (
                        <Video className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                  )}

                  {/* Action buttons — visible on hover */}
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      asChild
                      aria-label={`Edit ${project.name}`}
                    >
                      <Link
                        href={`/editor/${project.kind}?projectId=${encodeURIComponent(project.id)}&url=${encodeURIComponent(project.thumbnailUrl ?? '')}&name=${encodeURIComponent(project.name)}&publicId=${encodeURIComponent(project.publicId ?? '')}`}
                      >
                        <Pencil />
                      </Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => setConfirmDeleteId(project.id)}
                      aria-label={`Remove ${project.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <CardContent className="space-y-1.5 p-3">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="capitalize">
                      {project.kind}
                    </Badge>
                    <time className="text-[11px] text-muted-foreground">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </time>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Single project delete confirmation */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete this project?"
        description="The project and its file will be permanently deleted from Cloudinary. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDeleteId) void remove(confirmDeleteId); }}
      />

      {/* Clear all confirmation */}
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear all projects?"
        description="Every project and its Cloudinary file will be permanently deleted. This cannot be undone."
        confirmLabel="Clear all"
        destructive
        onConfirm={() => void clearAll()}
      />
    </div>
  );
}
