import Script from 'next/script'

/**
 * Яндекс.Метрика. Включается только когда задан номер счётчика: без него
 * компонент не отдаёт ничего, и в разработке страница не шлёт запросов
 * на сторонний домен. Номер приходит переменной окружения, чтобы счётчик
 * можно было поменять без правки кода.
 */
export function Metrika() {
  const id = process.env.NEXT_PUBLIC_METRIKA_ID
  if (!id) return null

  return (
    <>
      <Script id="metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${Number(id)}, "init", { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true });`}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${Number(id)}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}
