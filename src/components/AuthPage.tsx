import { useState } from 'react';
import { SessionUser } from '../types';

const ADMINS = ['admin', 'moderator'];

type Props = {
  onLogin: (user: SessionUser) => void;
};

export default function AuthPage({ onLogin }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleLogin() {
    if (!name.trim()) {
      setError('Введите имя');
      return;
    }

    onLogin({
      id: String(Date.now()),
      name: name.trim(),
      isAdmin: ADMINS.includes(name.trim().toLowerCase()),
    });
  }

  return (
    <div className="card">
      <h2>Добро пожаловать в Тычку</h2>
      <div className="form-group">
        <label>Имя</label>
        <input value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Ваш ник" />
      </div>
      {error && <p style={{ color: '#ff7a7a' }}>{error}</p>}
      <button onClick={handleLogin}>Войти</button>
      <p style={{ marginTop: '16px', color: '#bbb' }}>
        Чтобы открыть админку, введите имя <strong></strong> или <strong></strong>.
      </p>
    </div>
  );
}
