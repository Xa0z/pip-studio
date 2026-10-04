import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

const tg = (window as unknown as {Telegram?: {WebApp?: TelegramWebApp}}).Telegram?.WebApp;
tg?.ready();
tg?.expand();
const dark = tg?.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = dark ? 'dark' : 'light';

export type TelegramWebApp = {
  initData: string;
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  openLink?: (url: string) => void;
  HapticFeedback?: {selectionChanged: () => void};
};

createRoot(document.getElementById('root')!).render(<App tg={tg} />);
