/* One illustrative planner model; all coordinates are proportional model units. */
(function (root) {
  const MODEL = Object.freeze({ width: 145, height: 210, depth: 18, cover: 2, inset: 3, rotation: -25 });
  const PARTS = [{ id: 'cover', name: 'Обложка' }, { id: 'paper', name: 'Бумажный блок' }];
  const radians = MODEL.rotation * Math.PI / 180;
  function project([x, y, z]) {
    const rx = x * Math.cos(radians) - y * Math.sin(radians);
    const ry = x * Math.sin(radians) + y * Math.cos(radians);
    return [Math.sqrt(3) / 2 * (rx - ry), .5 * (rx + ry) - z];
  }
  const point = coordinates => project(coordinates);
  const face = (id, coordinates, fill, role = 'edge') => ({ id, points: coordinates.map(point), fill, role });
  const line = (id, coordinates, role = 'detail') => ({ id, points: coordinates.map(point), fill: 'none', role, open: true });

  function parts({ isolated = null, explosion = 0 } = {}) {
    const { width: w, height: h, depth: d, cover: c, inset: n } = MODEL;
    const offset = explosion * 160;
    const px = x => x + offset;
    const paper = [
      face('paper-top', [[px(n),c,h-n],[px(w-n),c,h-n],[px(w-n),d-c,h-n],[px(n),d-c,h-n]], 'white'),
      face('paper-fore-edge', [[px(w-n),c,n],[px(w-n),d-c,n],[px(w-n),d-c,h-n],[px(w-n),c,h-n]], 'white'),
      face('paper-front', [[px(n),d-c,n],[px(w-n),d-c,n],[px(w-n),d-c,h-n],[px(n),d-c,h-n]], 'white'),
      line('page-top-1', [[px(n),6,h-n+.05],[px(w-n),6,h-n+.05]]),
      line('page-top-2', [[px(n),11,h-n+.05],[px(w-n),11,h-n+.05]]),
      line('page-edge-1', [[px(w-n+.05),6,n],[px(w-n+.05),6,h-n]]),
      line('page-edge-2', [[px(w-n+.05),11,n],[px(w-n+.05),11,h-n]])
    ];
    const cover = [
      face('back-cover-top', [[0,0,h],[w,0,h],[w,c,h],[0,c,h]], 'white'),
      face('back-cover-edge', [[w,0,0],[w,c,0],[w,c,h],[w,0,h]], 'white'),
      face('spine-top', [[0,c,h],[n,c,h],[n,d-c,h],[0,d-c,h]], 'white'),
      face('front-cover-top', [[0,d-c,h],[w,d-c,h],[w,d,h],[0,d,h]], 'white'),
      face('front-cover-edge', [[w,d-c,0],[w,d,0],[w,d,h],[w,d-c,h]], 'white'),
      face('front-cover', [[0,d,0],[w,d,0],[w,d,h],[0,d,h]], 'white', 'outline'),
      line('binding-fold', [[11,d+.05,0],[11,d+.05,h]], 'edge'),
      line('elastic-band-left', [[128,d+.1,0],[128,d+.1,h]], 'detail'),
      line('elastic-band-right', [[132,d+.1,0],[132,d+.1,h]], 'detail')
    ];
    return [
      { ...PARTS[1], surfaces: paper },
      { ...PARTS[0], surfaces: cover }
    ].filter(part => !isolated || isolated === part.id);
  }

  function render(options = {}) {
    const chosen = parts(options);
    const coordinates = chosen.flatMap(part => part.surfaces.flatMap(surface => surface.points));
    const minX = Math.min(...coordinates.map(p => p[0])), maxX = Math.max(...coordinates.map(p => p[0]));
    const minY = Math.min(...coordinates.map(p => p[1])), maxY = Math.max(...coordinates.map(p => p[1]));
    const width = options.width || 420, height = options.height || 297, margin = options.margin || 30;
    const scale = Math.min((width - margin * 2) / (maxX - minX), (height - margin * 2) / (maxY - minY));
    const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
    const format = p => `${(ox + p[0] * scale).toFixed(3)},${(oy + p[1] * scale).toFixed(3)}`;
    const markup = chosen.map(part => `<g id="planner-${part.id}" data-item="${part.id}"><title>${part.name}</title>${part.surfaces.map(surface => {
      const fill = options.sage && surface.id === 'front-cover' ? '#e8f0e4' : surface.fill;
      return `<${surface.open ? 'polyline' : 'polygon'} id="${surface.id}" points="${surface.points.map(format).join(' ')}" fill="${fill}" data-line-role="${surface.role}"/>`;
    }).join('')}</g>`).join('');
    return { markup, scale, model: MODEL };
  }

  root.PlannerDrawing = { MODEL, PARTS, render, parts, project };
  root.DrawingModels ??= {};
  root.DrawingModels.notebook = (parameters, options) => render(options);
  if (typeof module !== 'undefined') module.exports = root.PlannerDrawing;
})(typeof self !== 'undefined' ? self : globalThis);
