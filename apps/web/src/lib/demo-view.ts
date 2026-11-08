/** Frame sizes shared by template previews. The standalone /demo page no longer chooses a role. */
export const DEVICES = ['desktop', 'mobile'] as const
export type Device = (typeof DEVICES)[number]
