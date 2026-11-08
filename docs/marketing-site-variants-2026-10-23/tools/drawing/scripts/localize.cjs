const fs = require('node:fs'), path = require('node:path');
const translations = {
  'Drawing. Use arrow keys to scroll, plus or minus to zoom, and zero to fit.':'Чертёж. Стрелки — прокрутка, плюс и минус — масштаб, ноль — вписать.',
  'Dark mode lightens preview ink. Exports keep the chosen colors.':'Тёмная тема осветляет линии только при просмотре. Экспорт сохраняет выбранные цвета.',
  'Select here or click a part in the drawing. Isolating reveals its complete geometry.':'Выберите часть здесь или на рисунке. Отдельный вид показывает её целиком.',
  'Concept dimensions. Changes update matching parts in every view.':'Условные пропорции. Изменения обновляют соответствующие части во всех видах.',
  'Saves this view, linework and colors.':'Сохраняет выбранный вид, линии и цвета.',
  'Could not update the drawing. Restore the settings and try again.':'Не удалось обновить рисунок. Сбросьте настройки и попробуйте снова.',
  'JavaScript is needed for this drawing viewer.':'Для просмотра чертежа нужен JavaScript.',
  'Zoom relative to fit':'Масштаб относительно вписанного вида','Switch to light mode':'Включить светлую тему','Switch to dark mode':'Включить тёмную тему',
  'Close drawing settings':'Закрыть настройки чертежа','Close download controls':'Закрыть скачивание','Close color controls':'Закрыть выбор цвета','Close part controls':'Закрыть выбор части',
  'Drawing controls':'Управление чертежом','Download formats':'Форматы скачивания','Drawing settings':'Настройки чертежа','Drawing colors':'Цвет линий','Part controls':'Выбор части',
  'Download drawing':'Скачать чертёж','Custom line color':'Свой цвет линий','Change colors':'Изменить цвета','Select a part':'Выбрать часть','Selected part':'Выбранная часть',
  'Reset dimensions':'Сбросить пропорции','Transparent background':'Прозрачный фон','Illustrative concept.':'Условная иллюстрация, NTS.',
  'Updating drawing':'Рисунок обновляется','Drawing updated':'Рисунок обновлён','Mixed colors':'Разные цвета','Isolated component:':'Отдельная часть:',
  'Color by part':'Раскрасить части','Reset colors':'Сбросить цвета','Color part':'Цвет части','Save part SVG':'Скачать часть SVG','Crop to drawing':'Обрезать по рисунку',
  'Technical drawing':'Рисунок предмета','Editable vector':'Редактируемый вектор','Cropped vector':'Вектор с обрезкой','A3 vector':'Вектор A3',
  'All parts':'Все части','Part spacing':'Разнос частей','Line color':'Цвет линий','Color presets':'Готовые цвета','Hex color':'Цвет HEX',
  'Download SVG':'Скачать SVG','Download PNG':'Скачать PNG','Download PDF':'Скачать PDF','Zoom out':'Уменьшить','Zoom in':'Увеличить',
  'Fine patent':'Тонкие линии','Service manual':'Чёткие линии','Technical':'Технические','Linework':'Линии',
  'Dark mode':'Тёмная тема','Appearance':'Тема','System':'Системная','Light':'Светлая','Dark':'Тёмная',
  'Isolated':'Отдельно','Isolate':'Отделить','Show all':'Показать всё','Exploded':'Разнесённый','Assembled':'Собранный',
  'Drawing':'Рисунок','Download':'Скачать','Apply to':'Применить к','Parts':'Части','View':'Вид','Color':'Цвет','Fit':'Вписать'
};
for(const file of ['viewer.html','viewer.js']){
 const target=path.resolve(__dirname,'../assets',file);
 let source=fs.readFileSync(target,'utf8');
 // Translate text and string values, never script identifiers such as DrawingExport.
 for(const [from,to] of Object.entries(translations).sort((a,b)=>b[0].length-a[0].length)){
   const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   source=source.replace(new RegExp(`(?<=[>"'\\s])${escaped}(?=[<"'\\s.])`,'g'),to);
 }
 source=source.replace('lang="en"','lang="ru"');
 fs.writeFileSync(target,source);
}
console.log('Localized drawing viewer controls.');
