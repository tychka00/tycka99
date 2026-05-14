import { useEffect, useState } from 'react';
import { SessionUser } from '../types';

type Props = {
  user: SessionUser;
  onBack: () => void;
};

type Report = {
  id: string;
  user: string;
  reason: string;
  status: 'new' | 'reviewed';
};

export default function AdminPanel({ user, onBack }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [newReport, setNewReport] = useState('');

  useEffect(() => {
    setReports([
      { id: 'r1', user: 'user123', reason: 'Нарушение правил', status: 'new' },
      { id: 'r2', user: 'guest77', reason: 'Спам в чате', status: 'reviewed' },
    ]);
  }, []);

  if (!user.isAdmin) {
    return (
      <div className="card">
        <h2>Доступ запрещён</h2>
        <p>У вас нет прав администратора.</p>
        <button onClick={onBack}>Назад</button>
      </div>
    );
  }

  function handleBan(userName: string) {
    alert(`Пользователь ${userName} забанен`);
  }

  function handleReview(id: string) {
    setReports((prev) => prev.map((item) => item.id === id ? { ...item, status: 'reviewed' } : item));
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Админ-панель</h2>
          <p>Привет, {user.name}. Управляйте жалобами и пользователями.</p>
        </div>
        <button className="secondary" onClick={onBack}>Назад</button>
      </div>

      <div className="form-group">
        <label>Оставить примечание для модерации</label>
        <textarea value={newReport} onChange={(event) => setNewReport(event.target.value)} rows={4} placeholder="Причина или комментарий" />
      </div>
      <button onClick={() => { if (newReport.trim()) { alert('Жалоба сохранена'); setNewReport(''); } }}>Сохранить</button>

      <div className="card" style={{ marginTop: '18px' }}>
        <h3>Жалобы</h3>
        {reports.map((report) => (
          <div key={report.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <p><strong>{report.user}</strong> — {report.reason}</p>
            <div className="admin-actions">
              <button className="secondary" onClick={() => handleReview(report.id)}>{report.status === 'new' ? 'Отметить изученной' : 'Уже изучено'}</button>
              <button onClick={() => handleBan(report.user)}>Забанить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
