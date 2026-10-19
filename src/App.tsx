/**
 * Router.
 *
 * HashRouter rather than BrowserRouter: the built site is served as static files
 * (GitHub Pages, or opened straight from disk), neither of which can rewrite
 * deep links to index.html. Hash routing keeps every route refreshable, which is
 * a hard requirement here — a mid-session refresh has to land back on the same
 * page with the session intact.
 */
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './components/AppShell';
import Home from './pages/Home';
import Practice from './pages/Practice';
import Session from './pages/Session';
import Study from './pages/Study';
import Wordbook from './pages/Wordbook';
import PhoneticsChart from './pages/english/PhoneticsChart';
import KeyboardLab from './pages/KeyboardLab';
import Japanese from './pages/Japanese';
import KanaChart from './pages/japanese/KanaChart';
import WordList from './pages/japanese/WordList';
import Stats from './pages/Stats';
import KeyStats from './pages/stats/KeyStats';
import SessionHistory from './pages/stats/SessionHistory';
import Settings from './pages/Settings';

const App = () => (
  <HashRouter>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="practice" element={<Practice />} />
        <Route path="practice/session" element={<Session />} />
        <Route path="study" element={<Study />} />
        <Route path="wordbook" element={<Wordbook />} />
        <Route path="wordbook/phonetics" element={<PhoneticsChart />} />
        <Route path="keyboard" element={<KeyboardLab />} />
        <Route path="japanese" element={<Japanese />} />
        <Route path="japanese/kana" element={<KanaChart />} />
        <Route path="japanese/words" element={<WordList />} />
        <Route path="stats" element={<Stats />} />
        <Route path="stats/keys" element={<KeyStats />} />
        <Route path="stats/history" element={<SessionHistory />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </HashRouter>
);

export default App;
