import type { SolutionStep } from '@/lib/solutions'
import styles from './elaya/content-pages.module.css'

/** A short daily workflow, shared with template-specific preparation steps. */
export function WorkSteps({ steps }: { steps: readonly SolutionStep[] }) {
  return <ol className={styles.workSteps}>
    {steps.map((step, index) => <li key={step.actor}>
      <span className={styles.stepNumber} aria-hidden>{String(index + 1).padStart(2, '0')}</span>
      <h3>{step.actor}</h3>
      <p>{step.text}</p>
    </li>)}
  </ol>
}
