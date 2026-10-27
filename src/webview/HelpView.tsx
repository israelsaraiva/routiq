import { Search01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { HELP_SECTIONS, HelpItem, HelpSection, ShortcutEntry } from '../core/helpContent';
import { searchHelp } from '../core/helpSearch';
import { InfoLink } from '../core/infoMessages';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './components/ui/accordion';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Icon } from './Icon';
import { useInfoHost } from './useInfoHost';
import { postInfoMessage } from './vscodeApi';

function HelpItemBody({ item }: { item: HelpItem }) {
  return (
    <>
      {item.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {item.code && <pre className="info-code">{item.code}</pre>}
    </>
  );
}

function ShortcutsTable({ shortcuts }: { shortcuts: ShortcutEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shortcut</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Where</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shortcuts.map((shortcut) => (
          <TableRow key={`${shortcut.keys}-${shortcut.where}`}>
            <TableCell>
              <kbd className="info-kbd">{shortcut.keys}</kbd>
            </TableCell>
            <TableCell>{shortcut.action}</TableCell>
            <TableCell>{shortcut.where}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SectionCard({ section, searching }: { section: HelpSection; searching: boolean }) {
  const openItemIds = searching ? section.items.map((item) => item.id) : [];
  return (
    <Card id={section.id} role="region" aria-label={section.title} className="info-section">
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.summary}</CardDescription>
      </CardHeader>
      <CardContent>
        {section.shortcuts && <ShortcutsTable shortcuts={section.shortcuts} />}
        {section.items.length > 0 && (
          <Accordion key={searching ? 'searching' : 'browsing'} type="multiple" defaultValue={openItemIds}>
            {section.items.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger>{item.title}</AccordionTrigger>
                <AccordionContent>
                  <HelpItemBody item={item} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        {section.hasSettingsButton && (
          <Button variant="secondary" className="info-section-action" onClick={() => postInfoMessage({ type: 'openSettings' })}>
            Open settings
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function HelpActions({ links }: { links: InfoLink[] }) {
  return (
    <div className="info-actions">
      <Button variant="secondary" onClick={() => postInfoMessage({ type: 'openSettings' })}>
        Open settings
      </Button>
      <Button variant="secondary" onClick={() => postInfoMessage({ type: 'openReadme' })}>
        Open README
      </Button>
      {links.map((link) => (
        <Button key={link.url} variant="secondary" onClick={() => postInfoMessage({ type: 'openLink', url: link.url })}>
          {link.label}
        </Button>
      ))}
    </div>
  );
}

export function HelpView() {
  const [query, setQuery] = useState('');
  const { links } = useInfoHost();
  const sections = useMemo(() => searchHelp(HELP_SECTIONS, query), [query]);
  const searching = query.trim() !== '';

  return (
    <main className="info-page">
      <header className="info-header">
        <h1>Routiq Help</h1>
        <div className="search-group info-search">
          <Icon icon={Search01Icon} size={14} />
          <input
            className="search-input"
            type="search"
            placeholder="Search help"
            aria-label="Search help"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <HelpActions links={links} />
      </header>
      {sections.length === 0 && <p className="info-empty">No help topics match “{query.trim()}”.</p>}
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} searching={searching} />
      ))}
    </main>
  );
}
