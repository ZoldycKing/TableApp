const ICONS: Record<string, string> = {
  zakazy: 'shop', katalog: 'shop', salon: 'salon', service: 'service', zayavki: 'field', podderzhka: 'service',
  nedvizhimost: 'estate', dostavka: 'delivery', crm: 'crm', proekty: 'projects', sklad: 'warehouse', proizvodstvo: 'production', portal: 'crm',
}

/** Authored in the approved prototype; these are decorative alongside template names. */
export function TemplateIcon({ id, className = 'size-14' }: { id: string; className?: string }) {
  return <img src={`/template-icons/${ICONS[id] ?? 'crm'}.svg`} width={64} height={64} alt="" aria-hidden="true" className={`shrink-0 ${className}`} />
}
