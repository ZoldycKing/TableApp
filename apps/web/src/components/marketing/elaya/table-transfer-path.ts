type Point = { x: number; y: number }

/** Only the connector between the two outside edges is drawn; the lead-in is invisible. */
export function transferPaths(source: Point, start: Point, end: Point, vertical = false) {
  const span = Math.max(1, vertical ? end.y - start.y : end.x - start.x)
  const point = (along: number, across: number) => vertical
    ? `${start.x + (end.x - start.x) * along + across * span} ${start.y + along * span}`
    : `${start.x + along * span} ${start.y + across * span}`
  const segments = vertical
    ? span < 140
      ? `C${start.x} ${start.y + span * .5} ${Math.max(16, end.x - 32)} ${end.y} ${end.x} ${end.y}`
      : `C${point(.2, -.22)} ${point(.48, -.26)} ${point(.5, -.03)} C${point(.53, .2)} ${point(.25, .06)} ${point(.38, -.04)} C${point(.68, -.16)} ${Math.max(16, end.x - 48)} ${end.y} ${end.x} ${end.y}`
    : span < 140
      ? `C${point(.35, -.15)} ${point(.7, .15)} ${point(1, 0)}`
      : `C${point(.2, -.22)} ${point(.48, -.26)} ${point(.5, -.03)} C${point(.53, .2)} ${point(.25, .06)} ${point(.38, -.04)} C${point(.58, -.16)} ${point(.82, .24)} ${point(1, 0)}`
  return {
    arrow: `M${start.x} ${start.y} ${segments}`,
    flight: `M${source.x} ${source.y} L${start.x} ${start.y} ${segments}`,
    lead: Math.hypot(start.x - source.x, start.y - source.y),
  }
}
