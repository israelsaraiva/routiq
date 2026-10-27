import { createRoot } from 'react-dom/client';
import { AboutView } from './AboutView';
import { App } from './App';
import { EnvironmentsEditor } from './EnvironmentsEditor';
import { HelpView } from './HelpView';
import { RunnerView } from './RunnerView';
import './theme.css';
import './ui.css';
import './styles.css';
import './info.css';

const scriptNonce = document.currentScript instanceof HTMLScriptElement ? document.currentScript.nonce : '';
if (scriptNonce) {
  Object.assign(window, { __webpack_nonce__: scriptNonce });
}

const root = document.getElementById('root')!;
const VIEWS: Record<string, () => JSX.Element> = { environments: EnvironmentsEditor, runner: RunnerView, help: HelpView, about: AboutView };
const View = VIEWS[root.dataset.view ?? ''] ?? App;

createRoot(root).render(<View />);
