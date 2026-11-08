import { permanentRedirect } from 'next/navigation'

/** Combined salon and shop examples are previewed from the template catalogue. */
export default function ModularDemoRedirectPage() {
  permanentRedirect('/templates')
}
