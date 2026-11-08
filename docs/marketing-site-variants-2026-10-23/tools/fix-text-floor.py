from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
for path in [root/'base.css', *sorted((root/'variants').glob('*.css'))]:
    before = path.read_text(encoding='utf-8')
    def floor(match):
        prefix, value, unit = match.groups()
        minimum = 13 if unit == 'px' else .8125
        return prefix + (f'{minimum:g}' if float(value) < minimum else value) + unit
    after = re.sub(r'(font-size\s*:\s*)(\d*\.?\d+)(px|rem)\b', floor, before)
    if path.name == 'product.css':
        after = re.sub(r'(?<![-\w])color\s*:\s*#618769\b', 'color:var(--accent)', after)
    path.write_text(after, encoding='utf-8')
    print(path.name, 'updated' if after != before else 'unchanged')
