import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

const tg = (window as unknown as {Telegram?: {WebApp?: TelegramWebApp}}).Telegram?.WebApp;
tg?.ready();
tg?.expand();

export type TelegramWebApp = {
  initData: string;
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  openLink?: (url: string) => void;
  HapticFeedback?: {selectionChanged: () => void};
};

createRoot(document.getElementById('root')!).render(<App tg={tg} />);
