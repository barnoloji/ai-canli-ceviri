import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Users, MessageSquare, Settings, LogIn, LogOut } from 'lucide-react';

export default function ConferenceTranslation() {
  // Kullanıcı durumu
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  
  // Konferans durumu
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [users, setUsers] = useState([]);
  const [translations, setTranslations] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  
  // WebSocket ve ses
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // WebSocket bağlantısı
  const connectWebSocket = () => {
    // HTTP kullanıyoruz, WS kullan
    const wsUrl = 'ws://localhost:3002';
    console.log('WebSocket bağlantısı kuruluyor:', wsUrl);
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log('WebSocket bağlantısı kuruldu');
      setIsConnected(true);
      
      // Odaya katıl
      wsRef.current.send(JSON.stringify({
        type: 'join_room',
        roomId: roomId,
        userName: userName
      }));
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket mesajı alındı:', data);
      
      switch (data.type) {
        case 'room_joined':
          setUsers(data.users);
          setTranslations(data.recentTranslations || []);
          break;
          
        case 'user_joined':
          setUsers(prev => [...prev, data.user]);
          break;
          
        case 'user_left':
          setUsers(prev => prev.filter(u => u.id !== data.userId));
          break;
          
        case 'new_translation':
          setTranslations(prev => [...prev, data.translation]);
          setCurrentTranslation(data.translation.translatedText);
          break;
          
        case 'user_speaking':
          // Kullanıcı konuşuyor göstergesi
          break;
          
        case 'user_stopped_speaking':
          // Kullanıcı konuşmayı bitirdi
          break;
          
        case 'error':
          console.error('WebSocket hatası:', data.message);
          break;
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('WebSocket bağlantısı kapandı');
      setIsConnected(false);
    };
    
    wsRef.current.onerror = (error) => {
      console.error('WebSocket hatası:', error);
      console.error('WebSocket durumu:', wsRef.current?.readyState);
    };
  };

  // Ses kaydetme başlat
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.start(1000); // Her 1 saniyede bir chunk
      
      // Konuşmaya başladığını bildir
      wsRef.current?.send(JSON.stringify({
        type: 'start_speaking'
      }));
      
      setIsSpeaking(true);
      
      // Ses parçalarını gönder
      intervalRef.current = setInterval(() => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];
          
          console.log('Ses parçası gönderiliyor, boyut:', audioBlob.size);
          
          // Base64'e çevir
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            console.log('Base64 ses verisi hazır, boyut:', base64.length);
            
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'audio_chunk',
                audioData: base64,
                roomId: roomId
              }));
              console.log('Ses verisi WebSocket ile gönderildi');
            } else {
              console.error('WebSocket bağlantısı yok!');
            }
          };
          reader.readAsDataURL(audioBlob);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Mikrofon erişim hatası:', error);
      alert('Mikrofon erişimi gerekli!');
    }
  };

  // Ses kaydetmeyi durdur
  const stopRecording = () => {
    if (mediaRecorderRef.current && isSpeaking) {
      mediaRecorderRef.current.stop();
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Konuşmayı bitirdiğini bildir
      wsRef.current?.send(JSON.stringify({
        type: 'stop_speaking'
      }));
      
      setIsSpeaking(false);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Kullanıcı girişi
  const handleLogin = () => {
    if (userName.trim() && roomId.trim()) {
      setIsLoggedIn(true);
      connectWebSocket();
    } else {
      alert('Lütfen adınızı ve oda ID\'sini girin!');
    }
  };

  // Çıkış
  const handleLogout = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsLoggedIn(false);
    setIsConnected(false);
    setUsers([]);
    setTranslations([]);
    setCurrentTranslation('');
  };

  // Mikrofon toggle
  const toggleMicrophone = () => {
    if (isSpeaking) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Konferans Çeviri</h1>
            <p className="text-gray-600">Odaya katılın ve anlık çeviri yapın</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adınız
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Adınızı girin"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Oda ID
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Oda ID'sini girin"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={20} />
              Odaya Katıl
            </button>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">💡 Nasıl Çalışır?</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Aynı oda ID'sini kullanan herkes aynı çeviriyi görür</li>
              <li>• Mikrofon butonuna basıp konuşun</li>
              <li>• Anlık çeviri tüm katılımcılara gönderilir</li>
              <li>• Çeviri geçmişi altta görünür</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Konferans Çeviri</h1>
              <p className="text-gray-600">Oda: {roomId} • Kullanıcı: {userName}</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                {isConnected ? 'Bağlı' : 'Bağlantı Yok'}
              </div>
              <div className="text-xs text-gray-500">
                WS: {wsRef.current?.readyState === WebSocket.OPEN ? 'Açık' : 'Kapalı'}
              </div>
              
              <button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <LogOut size={16} />
                Çıkış
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Kullanıcılar ve Mikrofon */}
          <div className="lg:col-span-1 space-y-6">
            {/* Kullanıcılar */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={20} className="text-blue-500" />
                <h3 className="font-semibold text-gray-800">Katılımcılar ({users.length})</h3>
              </div>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-gray-700">{user.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mikrofon Kontrolü */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="text-center">
                <button
                  onClick={toggleMicrophone}
                  disabled={!isConnected}
                  className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    isSpeaking
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSpeaking ? <MicOff size={32} /> : <Mic size={32} />}
                </button>
                <p className="mt-3 text-sm text-gray-600">
                  {isSpeaking ? 'Konuşuyorsunuz...' : 'Konuşmak için tıklayın'}
                </p>
              </div>
            </div>
          </div>

          {/* Orta Panel - Anlık Çeviri */}
          <div className="lg:col-span-2 space-y-6">
            {/* Anlık Çeviri */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={20} className="text-green-500" />
                <h3 className="font-semibold text-gray-800">Anlık Çeviri</h3>
              </div>
              <div className="bg-green-50 rounded-lg p-4 min-h-[120px] flex items-center justify-center">
                {currentTranslation ? (
                  <p className="text-lg text-gray-800 text-center">{currentTranslation}</p>
                ) : (
                  <p className="text-gray-500 text-center">Çeviri burada görünecek...</p>
                )}
              </div>
            </div>

            {/* Çeviri Geçmişi */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={20} className="text-blue-500" />
                <h3 className="font-semibold text-gray-800">Çeviri Geçmişi</h3>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {translations.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Henüz çeviri yok</p>
                ) : (
                  translations.slice().reverse().map((translation) => (
                    <div key={translation.id} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-blue-600">{translation.userName}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(translation.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">{translation.originalText}</p>
                      <p className="text-sm font-medium text-gray-800">{translation.translatedText}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-2xl">🎤</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-1">Ses Yakalama</h4>
              <p className="text-sm text-gray-600">Gerçek zamanlı ses akışı</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-2xl">🔄</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-1">Anlık Çeviri</h4>
              <p className="text-sm text-gray-600">Whisper + GPT-4 ile</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-2xl">📡</span>
              </div>
              <h4 className="font-semibold text-gray-800 mb-1">Canlı Paylaşım</h4>
              <p className="text-sm text-gray-600">WebSocket ile anlık</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}