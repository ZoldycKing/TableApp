'use client'
import { ProjectsDemo } from './projects-demo'

export function ProjectsShot({ view, scheme }: { view: string; scheme?: 'light' | 'dark' }) {
  return <ProjectsDemo view={view} bare scheme={scheme} />
}
