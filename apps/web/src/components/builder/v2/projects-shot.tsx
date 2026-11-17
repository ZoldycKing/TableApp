'use client'
import { ProjectsDemo } from './projects-demo'

export function ProjectsShot({ view }: { view: string }) {
  return <ProjectsDemo view={view} bare />
}
