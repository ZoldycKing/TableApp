import { writeFileSync } from 'node:fs'
import { SOLUTIONS } from '../../apps/web/src/lib/solutions'
import { STARTER_TEMPLATES, STARTER_GROUPS } from '../../apps/web/src/lib/templates/catalog'
import { PLANS, PLAN_ORDER } from '../../packages/schema/src/plans'

const templates = STARTER_TEMPLATES.map(({ id, name, tagline, audience, gives, limits, kin, internalOnly }) => ({ id, name, tagline, audience, gives, limits, kin, internalOnly: !!internalOnly }))
writeFileSync(new URL('./source-data.json', import.meta.url), JSON.stringify({ templates, groups: STARTER_GROUPS, solutions: SOLUTIONS, plans: PLAN_ORDER.map(id => PLANS[id]) }, null, 2))
console.log(JSON.stringify({ templates: templates.length, solutions: SOLUTIONS.length, plans: PLAN_ORDER.length }))
