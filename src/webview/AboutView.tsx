import { ReactNode } from 'react';
import { Copy01Icon, FolderOpenIcon } from '@hugeicons/core-free-icons';
import { AboutInfo } from '../core/infoMessages';
import { AppLogo } from './AppLogo';
import { CREDITS } from './aboutCredits';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Icon } from './Icon';
import { useInfoHost } from './useInfoHost';
import { postInfoMessage } from './vscodeApi';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DeveloperCredit({ about }: { about: AboutInfo }) {
  if (!about.authorName) {
    return null;
  }
  return (
    <p className="info-developer">
      Developed by <strong>{about.authorName}</strong>
      {about.authorEmail && (
        <>
          {' · '}
          <button type="button" className="info-link" onClick={() => postInfoMessage({ type: 'contactAuthor' })}>
            {about.authorEmail}
          </button>
        </>
      )}
    </p>
  );
}

function Identity({ about }: { about: AboutInfo }) {
  return (
    <header className="info-identity">
      <AppLogo />
      <div>
        <h1>{about.displayName}</h1>
        <p>{about.description}</p>
        <DeveloperCredit about={about} />
      </div>
    </header>
  );
}

function StorageCard({ about }: { about: AboutInfo }) {
  return (
    <Card role="region" aria-label="Storage">
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>Where your collections are saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <code className="info-path">{about.storageDirectory}</code>
        <div className="info-actions">
          <Button variant="secondary" onClick={() => postInfoMessage({ type: 'revealStorage' })}>
            <Icon icon={FolderOpenIcon} />
            {about.revealLabel}
          </Button>
          <Button variant="secondary" onClick={() => postInfoMessage({ type: 'copyStoragePath' })}>
            <Icon icon={Copy01Icon} />
            Copy path
          </Button>
        </div>
        <dl className="info-list">
          <InfoRow label="Collections">{about.collectionCount}</InfoRow>
          <InfoRow label="Requests">{about.requestCount}</InfoRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function VersionCard({ about }: { about: AboutInfo }) {
  return (
    <Card role="region" aria-label="Version">
      <CardHeader>
        <CardTitle>Version</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="info-list">
          <InfoRow label="Version">{about.version}</InfoRow>
          <InfoRow label="Publisher">{about.publisher}</InfoRow>
          <InfoRow label="License">{about.license || 'Not specified'}</InfoRow>
          <InfoRow label="VS Code">{about.vscodeVersion}</InfoRow>
          <InfoRow label="Electron">{about.electronVersion}</InfoRow>
          <InfoRow label="Node.js">{about.nodeVersion}</InfoRow>
        </dl>
        <div className="info-actions">
          <Button variant="secondary" onClick={() => postInfoMessage({ type: 'copyDiagnostics' })}>
            <Icon icon={Copy01Icon} />
            Copy diagnostics
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditsCard() {
  return (
    <Card role="region" aria-label="Credits">
      <CardHeader>
        <CardTitle>Credits</CardTitle>
        <CardDescription>Routiq is built on these open-source projects.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Library</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead>License</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CREDITS.map((credit) => (
              <TableRow key={credit.name}>
                <TableCell>{credit.name}</TableCell>
                <TableCell>{credit.purpose}</TableCell>
                <TableCell>{credit.license}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AboutView() {
  const { about, links } = useInfoHost();
  if (!about) {
    return <main className="info-page" />;
  }
  return (
    <main className="info-page">
      <Identity about={about} />
      <VersionCard about={about} />
      <StorageCard about={about} />
      <div className="info-actions">
        <Button variant="secondary" onClick={() => postInfoMessage({ type: 'openReadme' })}>
          Open README
        </Button>
        {about.authorEmail && <Button onClick={() => postInfoMessage({ type: 'contactAuthor' })}>Contact / Send feedback</Button>}
        {links.map((link) => (
          <Button key={link.url} variant="secondary" onClick={() => postInfoMessage({ type: 'openLink', url: link.url })}>
            {link.label}
          </Button>
        ))}
      </div>
      <CreditsCard />
      {about.authorName && <footer className="info-copyright">© {new Date().getFullYear()} {about.authorName}</footer>}
    </main>
  );
}
