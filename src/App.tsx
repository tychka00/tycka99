import { useState } from 'react';
import AuthPage from './components/AuthPage';
import ChatRoom from './components/ChatRoom';
import AdminPanel from './components/AdminPanel';
import { SessionUser } from './types';

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<'auth' | 'chat' | 'admin'>('auth');

  return (
    <div className="app-shell">
      <header>
        <h1>Тычка</h1>
        {user && (
          <div className="user-badge">
            <span>{user.name}</span>
            <button onClick={() => { setUser(null); setMode('auth'); }}>Выйти</button>
          </div>
        )}
      </header>

      <main>
        {mode === 'auth' && <AuthPage onLogin={(userData) => { setUser(userData); setMode('chat'); }} />}
        {mode === 'chat' && user && <ChatRoom user={user} onOpenAdmin={() => setMode('admin')} />}
        {mode === 'admin' && user && <AdminPanel user={user} onBack={() => setMode('chat')} />}
      </main>
    </div>
  );
}

export default App;
