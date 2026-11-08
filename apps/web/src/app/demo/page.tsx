import { permanentRedirect } from 'next/navigation'

/** The standalone demo is retired. Interactive examples live on the template pages. */
export default function DemoRedirectPage() {
  permanentRedirect('/templates')
}
