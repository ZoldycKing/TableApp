const fs = require('node:fs'), path = require('node:path');
const { render, MODEL } = require('./model.js');
const result = render({ width: 200, height: 280, margin: 12, sage: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280" role="img" aria-labelledby="notebook-title notebook-desc">
<title id="notebook-title">Ежедневник А5</title><desc id="notebook-desc">Закрытый ежедневник: обложка, бумажный блок и резинка. Иллюстративная аксонометрическая геометрия, без производственных размеров.</desc>
<metadata>${JSON.stringify({ status: 'illustrative concept', units: 'proportional model units', model: MODEL })}</metadata>
<style>[data-line-role]{stroke:#25221d;stroke-linecap:butt;stroke-linejoin:round}[data-line-role="outline"]{stroke-width:2.8}[data-line-role="edge"]{stroke-width:1.7}[data-line-role="detail"]{stroke-width:1.15}</style>
<g id="notebook">${result.markup}</g></svg>`;
fs.writeFileSync(path.resolve(__dirname, '../../assets/notebook.svg'), svg);
console.log('Generated assets/notebook.svg from the shared planner model.');
