import React from 'react';
import Seo from '../../components/seo/Seo';
import JsonLd from '../../components/seo/JsonLd';
import { breadcrumbSchema } from '../../config/schema';
import { usePrerenderReady } from '../../hooks/usePrerenderReady';
import { legalPage, contactValue } from '../../content/legalContent';
import { SITE_URL } from '../../config/site';

// One layout for all four legal pages. The copy comes from
// src/content/legalContent.js, which the four page functions in api/render.js
// render from as well, so the server HTML and this page cannot disagree.
//
// The visual design is the one the site's legal pages already used — sticky
// numbered contents, numbered section headings, the same cards and dark-mode
// classes — so nothing about these pages looks new except the words.

const Para = ({ value }) => {
  if (typeof value === 'string') {
    return <p className="text-gray-600 dark:text-zinc-400 text-sm leading-7">{value}</p>;
  }
  // { text, linkText, href } — one phrase inside the sentence is a link, and
  // the sentence itself is never reordered to accommodate it.
  const at = value.text.indexOf(value.linkText);
  if (at < 0) return <p className="text-gray-600 dark:text-zinc-400 text-sm leading-7">{value.text}</p>;
  return (
    <p className="text-gray-600 dark:text-zinc-400 text-sm leading-7">
      {value.text.slice(0, at)}
      <a href={value.href} className="text-accent hover:underline font-semibold">{value.linkText}</a>
      {value.text.slice(at + value.linkText.length)}
    </p>
  );
};

const List = ({ items, type }) => {
  const Tag = type === 'ol' ? 'ol' : 'ul';
  return (
    <Tag className={`${type === 'ol' ? 'list-decimal' : 'list-disc'} pl-5 space-y-2 text-gray-600 dark:text-zinc-400 text-sm leading-7 marker:text-accent`}>
      {items.map((item) => <li key={item.slice(0, 48)}>{item}</li>)}
    </Tag>
  );
};

const ContactRows = ({ rows }) => (
  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
    {rows.map((row) => {
      const value = row.key ? contactValue(row.key, SITE_URL) : { text: row.text };
      return (
        <React.Fragment key={row.label}>
          <dt className="text-gray-900 dark:text-zinc-100 font-semibold">{row.label}</dt>
          <dd className="text-gray-600 dark:text-zinc-400 break-words">
            {value.href
              ? <a href={value.href} className="text-accent hover:underline">{value.text}</a>
              : value.text}
          </dd>
        </React.Fragment>
      );
    })}
  </dl>
);

const Block = ({ node }) => (
  <>
    {(node.body ?? []).map((p, i) => <Para key={i} value={p} />)}
    {node.list && <List items={node.list} type={node.listType} />}
    {node.contactRows && <ContactRows rows={node.contactRows} />}
    {(node.after ?? []).map((p, i) => <Para key={`a${i}`} value={p} />)}
  </>
);

const LegalPage = ({ slug }) => {
  const page = legalPage(slug, SITE_URL);
  usePrerenderReady();

  const trail = [{ name: 'Home', path: '/' }, { name: page.title, path: `/${page.slug}` }];

  return (
    <div className="bg-gray-50 dark:bg-zinc-950 min-h-screen">
      <Seo title={page.title} description={page.description} canonical={`/${page.slug}`}>
        <JsonLd data={breadcrumbSchema(trail)} />
      </Seo>

      {/* Header */}
      <div className="border-b border-gray-200 dark:border-white/5 bg-white dark:bg-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-3xl font-black text-gray-900 dark:text-zinc-100">{page.title}</h1>
          <p className="text-gray-400 dark:text-zinc-500 text-sm mt-2">Last updated: {page.lastUpdated}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 flex gap-10 items-start">

        {/* Sticky contents */}
        <aside className="hidden lg:block w-56 shrink-0 sticky top-24">
          <p className="text-gray-400 dark:text-zinc-500 text-xs font-black uppercase tracking-widest mb-4">Contents</p>
          <nav className="space-y-1">
            {page.sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`}
                className="flex items-start gap-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors py-1">
                <span className="text-accent font-bold text-xs w-4 shrink-0">{i + 1}.</span>
                {s.heading}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 space-y-10">
          {page.intro.map((p, i) => (
            <p key={i} className="text-gray-600 dark:text-zinc-400 text-sm leading-7 !mt-0 first:mt-0">{p}</p>
          ))}

          {page.sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 space-y-3">
              <h2 className="text-gray-900 dark:text-zinc-100 text-lg font-bold flex items-start gap-2">
                <span className="text-accent text-sm font-black mt-0.5">{i + 1}.</span>
                {section.heading}
              </h2>
              <Block node={section} />
              {(section.subsections ?? []).map((sub) => (
                <section key={sub.id} id={sub.id} className="scroll-mt-28 space-y-3 pt-2">
                  <h3 className="text-gray-900 dark:text-zinc-100 text-base font-bold">{sub.heading}</h3>
                  <Block node={sub} />
                </section>
              ))}
            </section>
          ))}

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
            {page.closing.map((line) => (
              <p key={line} className="text-gray-600 dark:text-zinc-400 text-sm leading-7">{line}</p>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default LegalPage;
