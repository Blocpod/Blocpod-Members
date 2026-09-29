import Markdown from 'react-markdown';
function embedUrl(href?: string) {
  try {
    const url = new URL(href || '');
    if (url.protocol !== 'https:') return null;
    if (['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) {
      const id =
        url.hostname === 'youtu.be'
          ? url.pathname.slice(1)
          : url.searchParams.get('v');
      return id && /^[\w-]{11}$/.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : null;
    }
    if (
      ['vimeo.com', 'www.vimeo.com'].includes(url.hostname) &&
      /^\/\d+$/.test(url.pathname)
    )
      return `https://player.vimeo.com/video${url.pathname}`;
  } catch {
    /* Unsupported links remain ordinary links. */
  }
  return null;
}
export default function RichContent({ children }: { children: string }) {
  return (
    <Markdown skipHtml
      components={{
        a: ({ href, title, children }) => {
          const embed = title === 'embed' ? embedUrl(href) : null;
          return embed ? (
            <iframe
              className="resource-video"
              src={embed}
              title={typeof children === 'string' ? children : 'Resource video'}
              loading="lazy"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <a href={href} title={title} rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {children}
    </Markdown>
  );
}
