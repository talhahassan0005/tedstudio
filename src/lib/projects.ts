'use client';

import type { ProjectSummary } from '@/lib/types';
import { parseJsonResponse } from '@/lib/utils';

/**
 * Recent-projects client, backed by the SQLite database behind /api/projects.
 *
 * Every call is best-effort from the caller's point of view: an editor must
 * keep working even if the history write fails, so `saveProject` resolves to
 * null instead of throwing.
 */

export async function loadProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch('/api/projects', { cache: 'no-store' });
    return await parseJsonResponse<ProjectSummary[]>(res);
  } catch {
    return [];
  }
}

/** Create, or upsert when `id` is set. Resolves to the stored row, or null. */
export async function saveProject(
  project: Omit<ProjectSummary, 'updatedAt'> & { updatedAt?: string },
): Promise<ProjectSummary | null> {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    return await parseJsonResponse<ProjectSummary>(res);
  } catch (error) {
    console.error('[projects] save failed', error);
    return null;
  }
}

export async function removeProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearProjects(): Promise<boolean> {
  try {
    const res = await fetch('/api/projects', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
