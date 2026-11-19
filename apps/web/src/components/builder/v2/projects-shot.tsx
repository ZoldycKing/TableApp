'use client'
import { ProjectsDemo } from './projects-demo'

export function ProjectsShot({ view, scheme, phone }: { view: string; scheme?: 'light' | 'dark'; phone?: boolean }) {
  return <ProjectsDemo view={view} bare scheme={scheme} phone={phone} />
}
