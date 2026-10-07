import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

function DescriptionImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src) return <span>{alt}</span>;
  return (
    <span className="description-image">
      {loaded && !failed ? (
        <img
          src={src}
          alt={alt ?? ''}
          title={title}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : !failed ? (
        <button type="button" onClick={() => setLoaded(true)}>
          Load image{alt ? `: ${alt}` : ''}
        </button>
      ) : (
        <span>This image could not load. It may require GitHub sign-in.</span>
      )}
      <a href={src} target="_blank" rel="noopener noreferrer">
        Open image ↗
      </a>
      {!loaded && <small>Loading contacts the image host.</small>}
    </span>
  );
}

const components: Components = {
  h1: ({ children }) => <h4>{children}</h4>,
  h2: ({ children, id }) => <h5 id={id}>{children}</h5>,
  h3: ({ children }) => <h6>{children}</h6>,
  h4: ({ children }) => <h6>{children}</h6>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
  a: ({ children, href, title, id }) =>
    href ? (
      <a
        id={id}
        href={href}
        title={title}
        target={href.startsWith('#') ? undefined : '_blank'}
        rel={href.startsWith('#') ? undefined : 'noopener noreferrer'}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt, title }) => <DescriptionImage key={src} src={src} alt={alt} title={title} />,
  table: ({ children }) => (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll wide tables.
    <section className="markdown-table" aria-label="Description table" tabIndex={0}>
      <table>{children}</table>
    </section>
  ),
};

export default function PullRequestDescription({
  body,
  url,
  truncated,
  offline = false,
}: {
  body: string;
  url?: string;
  truncated?: boolean;
  offline?: boolean;
}) {
  return (
    <div className="pr-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={
          offline
            ? {
                ...components,
                img: ({ src, alt }) => (
                  <span className="description-image">
                    <span>{alt}</span>
                    {src && (
                      <a href={src} target="_blank" rel="noopener noreferrer">
                        Open image ↗
                      </a>
                    )}
                    <small>Images are not included in this snapshot.</small>
                  </span>
                ),
              }
            : components
        }
        skipHtml
        urlTransform={(value, key) => {
          const safe = defaultUrlTransform(value);
          if (!safe) return '';
          if (key === 'href' && safe.startsWith('#user-content-fn')) return safe;
          // Keep links and images from resolving against Brocante's authenticated routes.
          try {
            const resolved = new URL(safe, url || 'https://github.com/');
            if (key === 'src' && !['http:', 'https:'].includes(resolved.protocol)) return '';
            return resolved.href;
          } catch {
            return '';
          }
        }}
      >
        {body.trim() || 'No description was provided.'}
      </Markdown>
      {truncated && (
        <p className="description-truncated">
          Description shortened.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer">
            Read the full description on GitHub ↗
          </a>
        </p>
      )}
    </div>
  );
}
