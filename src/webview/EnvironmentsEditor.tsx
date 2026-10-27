import {
  Add01Icon, CheckmarkCircle02Icon, Copy01Icon, Delete02Icon, Edit02Icon, FloppyDiskIcon, InformationCircleIcon, Layers01Icon,
  MoreVerticalIcon, Undo02Icon,
} from '@hugeicons/core-free-icons';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Environment, EnvironmentsDraft, HostToWebviewMessage, KeyValue } from '../shared/types';
import { Icon } from './Icon';
import { IconButton } from './components/IconButton';
import { Alert } from './components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Input } from './components/ui/input';
import { EnvironmentVariablesTable } from './EnvironmentVariablesTable';
import { postToHost } from './vscodeApi';

const BASE_SELECTION = 'base';

function newEnvironmentId(): string {
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSaveShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
}

export function EnvironmentsEditor() {
  const [collectionName, setCollectionName] = useState('');
  const [draft, setDraft] = useState<EnvironmentsDraft>();
  const [selectedId, setSelectedId] = useState(BASE_SELECTION);
  const [dirty, setDirty] = useState(false);
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string>();
  const baselineRef = useRef<EnvironmentsDraft>();
  const pendingSaveRef = useRef<EnvironmentsDraft>();

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (message.type === 'environmentsLoad') {
        setCollectionName(message.collectionName);
        setDraft((current) => current ?? message.draft);
        baselineRef.current ??= message.draft;
      } else if (message.type === 'saved') {
        baselineRef.current = pendingSaveRef.current ?? baselineRef.current;
        setDirty(false);
      }
    };
    window.addEventListener('message', onMessage);
    postToHost({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const save = useCallback(() => {
    if (draft) {
      pendingSaveRef.current = draft;
      postToHost({ type: 'saveEnvironments', ...draft });
    }
  }, [draft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSaveShortcut(event)) {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  if (!draft) {
    return <div className="placeholder">Loading…</div>;
  }

  const update = (patch: Partial<EnvironmentsDraft>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const updateEnvironment = (id: string, patch: Partial<Environment>) =>
    update({ environments: draft.environments.map((environment) => (environment.id === id ? { ...environment, ...patch } : environment)) });
  const addEnvironment = () => {
    const environment: Environment = { id: newEnvironmentId(), name: `Environment ${draft.environments.length + 1}`, variables: [] };
    update({ environments: [...draft.environments, environment] });
    setSelectedId(environment.id);
  };
  const duplicateEnvironment = (source: Environment) => {
    const copy: Environment = {
      id: newEnvironmentId(),
      name: `${source.name} copy`,
      variables: source.variables.map((variable) => ({ ...variable })),
    };
    update({ environments: [...draft.environments, copy] });
    setSelectedId(copy.id);
  };
  const discard = () => {
    if (baselineRef.current) {
      setDraft(baselineRef.current);
      if (!baselineRef.current.environments.some((environment) => environment.id === selectedId)) {
        setSelectedId(BASE_SELECTION);
      }
      setDirty(false);
    }
  };
  const openRename = (environment: Environment) => {
    setRenamingId(environment.id);
    setRenameValue(environment.name);
  };
  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (renamingId && name) {
      updateEnvironment(renamingId, { name });
      setRenamingId(undefined);
    }
  };
  const deleteEnvironment = (id: string) => {
    const remaining = draft.environments.filter((environment) => environment.id !== id);
    update({ environments: remaining, activeEnvironmentId: draft.activeEnvironmentId === id ? undefined : draft.activeEnvironmentId });
    setSelectedId(BASE_SELECTION);
  };

  const selected = draft.environments.find((environment) => environment.id === selectedId);
  const variables: KeyValue[] = selected ? selected.variables : draft.variables;
  const setVariables = (next: KeyValue[]) =>
    selected ? updateEnvironment(selected.id, { variables: next }) : update({ variables: next });

  const renaming = draft.environments.find((environment) => environment.id === renamingId);
  const deleting = draft.environments.find((environment) => environment.id === deletingId);

  const renderEnvironmentItem = (environment: Environment) => {
    const isActive = environment.id === draft.activeEnvironmentId;
    return (
      <li key={environment.id} className="env-item" data-selected={environment.id === selectedId}>
        <button
          type="button"
          className="env-item-button"
          aria-current={environment.id === selectedId ? 'true' : undefined}
          onClick={() => setSelectedId(environment.id)}
        >
          <span className="env-item-name">{environment.name}</span>
          {isActive && (
            <Badge variant="success">
              <Icon icon={CheckmarkCircle02Icon} size={12} />
              Active
            </Badge>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="env-item-menu" aria-label={`Actions for ${environment.name}`}>
              <Icon icon={MoreVerticalIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled={isActive} onSelect={() => update({ activeEnvironmentId: environment.id })}>
              <Icon icon={CheckmarkCircle02Icon} />
              Set active
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openRename(environment)}>
              <Icon icon={Edit02Icon} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicateEnvironment(environment)}>
              <Icon icon={Copy01Icon} />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDeletingId(environment.id)}>
              <Icon icon={Delete02Icon} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  };

  return (
    <div className="app environments-app">
      <header className="env-header">
        <div className="env-breadcrumb">
          <Icon icon={Layers01Icon} />
          <span className="env-breadcrumb-collection">{collectionName}</span>
          <span className="env-breadcrumb-separator">/</span>
          <span className="env-breadcrumb-current">Environments</span>
          {dirty && (
            <Badge variant="outline" className="env-unsaved">
              <span className="env-unsaved-dot" aria-hidden="true" />
              Unsaved changes
            </Badge>
          )}
        </div>
        <div className="env-header-actions">
          <Button variant="secondary" onClick={discard} disabled={!dirty}>
            <Icon icon={Undo02Icon} />
            Discard
          </Button>
          <Button onClick={save} disabled={!dirty}>
            <Icon icon={FloppyDiskIcon} />
            Save
          </Button>
        </div>
      </header>
      <div className="environments-layout">
        <nav className="env-sidebar" aria-label="Environments">
          <ul className="env-list">
            <li className="env-item" data-selected={selectedId === BASE_SELECTION}>
              <button
                type="button"
                className="env-item-button"
                aria-current={selectedId === BASE_SELECTION ? 'true' : undefined}
                onClick={() => setSelectedId(BASE_SELECTION)}
              >
                <span className="env-item-name">Base variables</span>
              </button>
            </li>
            {draft.environments.map(renderEnvironmentItem)}
          </ul>
          <div className="env-sidebar-footer">
            <Button variant="ghost" onClick={addEnvironment}>
              <Icon icon={Add01Icon} />
              Add environment
            </Button>
          </div>
        </nav>
        <section className="environment-detail">
          <h2 className="env-title">{selected ? selected.name : 'Base variables'}</h2>
          <Alert className="env-hint">
            <Icon icon={InformationCircleIcon} />
            <div className="ui-alert-body">
              {selected
                ? 'Variables here override the base variables while this environment is active. Secret values live in VS Code SecretStorage, not in the collection file.'
                : 'Base variables apply to every request. The active environment overrides them. Secret values live in VS Code SecretStorage, not in the collection file.'}
            </div>
          </Alert>
          <EnvironmentVariablesTable rows={variables} onChange={setVariables} />
        </section>
      </div>
      <Dialog open={renaming !== undefined} onOpenChange={(open) => !open && setRenamingId(undefined)}>
        <DialogContent>
          <form className="env-rename-form" onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>Rename environment</DialogTitle>
              <DialogDescription>Choose a new name for this environment.</DialogDescription>
            </DialogHeader>
            <Input
              value={renameValue}
              aria-label="Environment name"
              autoFocus
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRenamingId(undefined)}>
                Cancel
              </Button>
              <Button type="submit" disabled={renameValue.trim() === ''}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleting !== undefined} onOpenChange={(open) => !open && setDeletingId(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleting?.name ?? ''}?`}</AlertDialogTitle>
            <AlertDialogDescription>The environment and its variables are removed once you save.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteEnvironment(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
