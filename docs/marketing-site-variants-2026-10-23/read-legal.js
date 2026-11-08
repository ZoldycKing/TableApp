async (page) => {
  const result = {};
  for (const slug of ['privacy','terms','offer']) {
    await page.goto('http://127.0.0.1:3101/legal/' + slug);
    await page.locator('article').waitFor();
    result[slug] = await page.locator('article').evaluate(article => {
      const clone = article.cloneNode(true);
      for (const node of clone.querySelectorAll('*')) {
        for (const attr of [...node.attributes]) {
          if (!['href','id'].includes(attr.name)) node.removeAttribute(attr.name);
        }
      }
      return clone.innerHTML;
    });
  }
  return result;
}
