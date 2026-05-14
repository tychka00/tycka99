import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ChatMessage, SessionUser } from '../types';

type Props = {
  user: SessionUser;
  onOpenAdmin: () => void;
};

const SERVER_URL = 'https://tychka-backend-production.up.railway.app';

type PartnerInfo = {
  name: string;
  id: string;
};

type WebRTCOffer = {
  target: string;
  sdp: RTCSessionDescriptionInit;
};

type WebRTCAnswer = {
  target: string;
  sdp: RTCSessionDescriptionInit;
};

type WebRTCIce = {
  target: string;
  candidate: RTCIceCandidateInit;
};

export default function ChatRoom({ user, onOpenAdmin }: Props) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [partner, setPartner] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [status, setStatus] = useState('Ищем собеседника...');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [mediaRequested, setMediaRequested] = useState(false);
  const [mediaAvailable, setMediaAvailable] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [remoteStreamReady, setRemoteStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isInitiatorRef = useRef(false);

  const isAdmin = user.isAdmin;
  const messagesByUser = useMemo(() => messages.slice(-30), [messages]);

  async function getLocalMedia() {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    try {
      setCameraError(null);
      setStatus('Запрашиваю доступ к камере и микрофону...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: audioEnabled });
      localStreamRef.current = stream;
      setMediaAvailable(true);
      setStatus('Камера и микрофон подключены. Продолжайте чат.');
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch((playError) => {
          console.warn('Local video play failed:', playError);
        });
      }
      return stream;
    } catch (error: unknown) {
      console.warn('Primary getUserMedia failed, trying video-only fallback', error);

      if (audioEnabled) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          localStreamRef.current = fallbackStream;
          setMediaAvailable(true);
          setStatus('Микрофон недоступен, работает только видео.');
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = fallbackStream;
            localVideoRef.current.playsInline = true;
            localVideoRef.current.muted = true;
            localVideoRef.current.play().catch((playError) => {
              console.warn('Local video play failed after fallback:', playError);
            });
          }
          return fallbackStream;
        } catch (videoOnlyError) {
          console.error('Video-only fallback failed', videoOnlyError);
        }
      }

      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setCameraError(message);
      setStatus('Не удалось получить доступ к камере или микрофону. Проверьте разрешения.');
      setMediaAvailable(false);
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          console.log('Media devices:', devices.map((device) => ({ kind: device.kind, label: device.label, deviceId: device.deviceId })));
        } catch (listError) {
          console.error('Ошибка перечисления устройств', listError);
        }
      }
      return null;
    }
  }

  async function requestMedia() {
    setMediaRequested(true);
    const stream = await getLocalMedia();
    if (stream) {
      setStatus('Камера готова. Продолжите чат.');
      if (partnerId && isInitiatorRef.current) {
        console.log('🎥 Локальная медиа готова после запроса, повторный вызов для отправки треков.');
        startCall(partnerId);
      }
    }
  }

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!mediaRequested) return;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setMediaAvailable(false);
    }

    getLocalMedia();
  }, [audioEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = remoteMuted;
    }
  }, [remoteMuted]);

  useEffect(() => {
    const socket = io(SERVER_URL, { auth: { userId: user.id, name: user.name }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Подключено к серверу');
      setConnected(true);
      setStatus('Подключено, ищем партнёра...');
      socket.emit('join');
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Ошибка подключения:', error);
      setConnected(false);
      setStatus(`Ошибка подключения: ${error.message}`);
    });

    socket.on('disconnect', () => {
      console.log('❌ Отключено от сервера');
      setConnected(false);
    });

    socket.on('partnerFound', ({ name, id }: PartnerInfo) => {
      console.log('✅ Партнер найден:', name, id);
      setPartner(name);
      setPartnerId(id);
      setRemoteStreamReady(false);
      isInitiatorRef.current = user.id < id;
      if (isInitiatorRef.current) {
        if (localStreamRef.current) {
          console.log('🎥 Инициирую WebRTC вызов');
          startCall(id);
        } else {
          setStatus('Найден собеседник. Нажмите «Разрешить камеру и микрофон», чтобы начать.');
        }
      } else {
        setStatus(`Собеседник: ${name}`);
      }
    });

    socket.on('chatMessage', (message: ChatMessage) => {
      console.log('💬 Сообщение от партнёра:', message);
      setMessages((prev) => [...prev, message]);
    });

    socket.on('status', (message: string) => {
      console.log('📢 Статус:', message);
      setStatus(message);
      if (message.includes('отключил') || message.includes('вышел') || message.includes('пропустил')) {
        cleanupPeer();
        setPartner(null);
        setPartnerId(null);
        setRemoteStreamReady(false);
      }
    });

    socket.on('webrtc-offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('🎥 Получен offer от', from);
      setPartnerId(from);
      const pc = await ensurePeerConnection();
      const stream = localStreamRef.current || await getLocalMedia();
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
          console.log('🎥 Added local track (receiver):', track.kind, track.readyState);
        });
      }
      console.log('🎥 Receiver, local tracks added:', pc.getSenders().length);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { target: from, sdp: answer });
    });

    socket.on('webrtc-answer', async ({ sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      console.log('🎥 Получен answer');
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('🎥 Set remote description (answer), connection state:', pc.connectionState);
    });

    socket.on('webrtc-ice', async ({ candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      console.log('🧊 Получен ICE candidate', candidate);
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('🧊 Added ICE candidate, connection state:', pc.connectionState);
    });

    socket.on('onlineCount', (count: number) => {
      setOnlineCount(count);
    });

    return () => {
      socket.disconnect();
      cleanupPeer();
    };
  }, [user.id, user.name]);

  async function ensurePeerConnection() {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:turn.anyfirewall.com:443',
          username: 'webrtc',
          credential: 'webrtc',
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && partnerId) {
        console.log('🧊 Sending ICE candidate:', event.candidate.type);
        socketRef.current.emit('webrtc-ice', { target: partnerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('🧩 Connection state changed:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state changed:', pc.iceConnectionState);
    };

    pc.ontrack = (event) => {
      console.log('🎥 ontrack fired, streams:', event.streams.length, 'track:', event.track.kind);
      let remoteStream = event.streams[0];
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }
      if (event.track && !remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      console.log('🎥 Remote stream tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`));
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = remoteMuted;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.oncanplay = () => {
          remoteVideoRef.current?.play().catch((playError) => {
            console.warn('Remote video play failed oncanplay:', playError);
          });
        };
        remoteVideoRef.current.play().catch((playError) => {
          console.warn('Remote video play failed:', playError);
        });
        console.log('🎥 Set remote video srcObject');
        setRemoteStreamReady(true);
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function startCall(targetId: string) {
    const socket = socketRef.current;
    if (!socket) return;
    const pc = await ensurePeerConnection();
    const stream = localStreamRef.current || await getLocalMedia();
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
        console.log('🎥 Added local track:', track.kind, track.readyState);
      });
    }
    console.log('🎥 Starting call, local tracks added:', pc.getSenders().length);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc-offer', { target: targetId, sdp: offer });
  }

  function cleanupPeer() {
    pcRef.current?.close();
    pcRef.current = null;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setRemoteStreamReady(false);
  }

  function handleSend() {
    if (!input.trim() || !socketRef.current) return;
    const message: ChatMessage = {
      id: `${Date.now()}`,
      sender: user.name,
      text: input.trim(),
      createdAt: new Date().toISOString(),
    };
    socketRef.current.emit('chatMessage', message);
    setMessages((prev) => [...prev, message]);
    setInput('');
  }

  function handleSkip() {
    socketRef.current?.emit('skip');
    setStatus('Ищем нового собеседника...');
    setPartner(null);
    setPartnerId(null);
    setMessages([]);
    cleanupPeer();
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
        <div>
          <div className="badge">{connected ? 'Онлайн' : 'Оффлайн'}</div>
          <p style={{ margin: '10px 0 0' }}>{status}</p>
          <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#666' }}>👥 Онлайн: {onlineCount}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="secondary" onClick={() => setAudioEnabled((prev) => !prev)}>{audioEnabled ? 'Микрофон вкл' : 'Микрофон выкл'}</button>
          <button className="secondary" onClick={handleSkip}>Пропустить</button>
          {isAdmin && <button onClick={onOpenAdmin}>Админ</button>}
        </div>
      </div>

      <div className="video-grid">
        <div className="video-panel">
          <h3>Ваше видео</h3>
          <video ref={localVideoRef} playsInline autoPlay muted />
          {cameraError && (
            <div style={{ marginTop: '10px', color: '#ff7777', fontSize: '14px' }}>
              Ошибка: {cameraError}
            </div>
          )}
          {!mediaAvailable && (
            <button className="secondary" onClick={requestMedia} style={{ marginTop: '10px' }}>
              Разрешить камеру и микрофон
            </button>
          )}
        </div>
        <div className="video-panel">
          <h3>Собеседник</h3>
          <video ref={remoteVideoRef} playsInline autoPlay muted={remoteMuted} />
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              className="secondary"
              onClick={() => setRemoteMuted((prev) => !prev)}
            >
              {remoteMuted ? 'Включить звук собеседника' : 'Отключить звук собеседника'}
            </button>
            {!remoteStreamReady && partner && (
              <div style={{ fontSize: '14px', color: '#999' }}>
                Ожидаем видео партнёра...
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-messages">
          {messagesByUser.map((message) => (
            <div key={message.id} className="chat-message">
              <span>{message.sender}:</span> {message.text}
            </div>
          ))}
        </div>

        <div className="chat-input-row">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Написать сообщение..." />
          <button onClick={handleSend}>Отправить</button>
        </div>
      </div>
    </div>
  );
}
