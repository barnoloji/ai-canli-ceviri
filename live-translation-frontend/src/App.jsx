import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Users, MessageSquare, Settings, LogIn, LogOut } from 'lucide-react';
import './App.css';

export default function ConferenceTranslation() {
  // URL'den room parametresini oku
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room') || '';
  
  // Kullanıcı durumu
  const [isLoggedIn, setIsLoggedIn] = useState(!!roomFromUrl); // Eğer URL'de room varsa otomatik giriş
  const [userName, setUserName] = useState(roomFromUrl ? 'Misafir' : '');
  const [roomId, setRoomId] = useState(roomFromUrl || '1');
  
  // Konferans durumu
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [users, setUsers] = useState([]);
  const [translations, setTranslations] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // WebSocket ve ses
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const recognitionRef = useRef(null);

  // Ses seviyesi kontrolü
  const checkAudioLevel = () => {
    if (!analyserRef.current || !dataArrayRef.current) return false;
    
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const average = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
    
    // Audio level'ı güncelle (görsel gösterim için)
    setAudioLevel(Math.min(average, 100));
    
    // Debug için ses seviyesini logla
    console.log('🔊 Ses seviyesi:', average);
    
    // Eşik değeri düşürüldü - daha hassas algılama
    const threshold = 5;
    return average > threshold;
  };

  // WebSocket bağlantısı
  const connectWebSocket = () => {
    // Production'da wss://, development'ta ws:// kullan
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
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
          console.log('Yeni çeviri alındı:', data.translation);
          setTranslations(prev => [...prev, data.translation]);
          setCurrentTranslation(data.translation.translatedText);
          break;
          
        case 'transcription_result':
          console.log('Transkripsiyon sonucu:', data);
          break;
          
        case 'translation_result':
          console.log('Çeviri sonucu:', data);
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

  // Web Speech API ile gerçek zamanlı ses tanıma
  const startSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Bu tarayıcı ses tanımayı desteklemiyor!');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'tr-TR'; // Türkçe
    recognitionRef.current.maxAlternatives = 1;
    
    let interimTranscript = '';
    let finalTranscript = '';
    let lastTranslationTime = 0;
    let lastTranslatedText = ''; // Son çevrilen metni takip et
    const TRANSLATION_DELAY = 200; // 0.2 saniye bekleme süresi - çok agresif çeviri
    
    recognitionRef.current.onstart = () => {
      console.log('🎤 Gerçek zamanlı ses tanıma başladı');
      setIsSpeaking(true);
      interimTranscript = '';
      finalTranscript = '';
    };
    
    recognitionRef.current.onresult = (event) => {
      interimTranscript = '';
      let hasNewFinal = false;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          hasNewFinal = true;
          console.log('📝 Final metin:', transcript);
        } else {
          interimTranscript += transcript;
          console.log('🔄 Interim metin:', transcript);
        }
      }
      
      // Anlık çeviri için interim sonuçları göster
      if (interimTranscript) {
        setCurrentTranslation(`[Çevriliyor...] ${interimTranscript}`);
        
        // Interim sonuçlar da çevrilebilir (çok kısa süre için)
        if (interimTranscript.split(' ').length >= 3 && interimTranscript !== lastTranslatedText) {
          const now = Date.now();
          if (now - lastTranslationTime > 100) { // 0.1 saniye
            console.log('🔄 Interim çeviri tetikleniyor:', interimTranscript);
            translateText(interimTranscript);
            lastTranslationTime = now;
            lastTranslatedText = interimTranscript;
          }
        }
      }
      
      // Final sonuçlar için çeviri yap
      if (hasNewFinal && finalTranscript.trim()) {
        const now = Date.now();
        
        // Ultra agresif çeviri tetikleme - cümle tamamlandığında hemen çevir
        const wordCount = finalTranscript.trim().split(' ').length;
        const hasPunctuation = finalTranscript.includes('.') || 
                              finalTranscript.includes('!') || 
                              finalTranscript.includes('?') ||
                              finalTranscript.includes(',') ||
                              finalTranscript.includes(';');
        
        const shouldTranslate = 
          (hasPunctuation || // Noktalama işareti varsa hemen çevir
          wordCount >= 4 || // 4 kelime olduğunda çevir
          now - lastTranslationTime > TRANSLATION_DELAY) && // 0.2 saniye geçtiyse çevir
          finalTranscript.trim() !== lastTranslatedText; // Aynı metin değilse çevir
        
        if (shouldTranslate) {
          console.log('🔄 Çeviri tetikleniyor:', finalTranscript.trim());
          translateText(finalTranscript.trim());
          lastTranslationTime = now;
          lastTranslatedText = finalTranscript.trim();
          finalTranscript = ''; // Çevirilen metni temizle
        }
      }
    };
    
    recognitionRef.current.onerror = (event) => {
      console.error('Ses tanıma hatası:', event.error);
      if (event.error === 'no-speech') {
        // Sessizlik durumunda yeniden başlat
        setTimeout(() => {
          if (isSpeaking) {
            recognitionRef.current.start();
          }
        }, 1000);
      }
    };
    
    recognitionRef.current.onend = () => {
      console.log('🎤 Ses tanıma bitti');
      setIsSpeaking(false);
      
      // Eğer hala konuşma modundaysa yeniden başlat
      if (isSpeaking) {
        setTimeout(() => {
          recognitionRef.current.start();
        }, 100);
      }
    };
    
    recognitionRef.current.start();
  };

  // Hızlı çeviri fonksiyonu
  const translateText = async (text) => {
    try {
      console.log('🔄 Çeviri başlıyor:', text);
      setIsTranslating(true);
      
      // Önce anlık çeviri göster
      setCurrentTranslation(`[Çevriliyor...] ${text}`);
      
      // Google Translate API kullanarak çeviri
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=en&dt=t&q=${encodeURIComponent(text)}`);
      const data = await response.json();
      const translation = data[0][0][0];
      
      console.log('✅ Çeviri tamamlandı:', translation);
      
      // Çeviriyi anında göster
      setCurrentTranslation(translation);
      setIsTranslating(false);
      
      // Çeviriyi WebSocket ile gönder
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const translationRecord = {
          id: 'trans_' + Date.now(),
          userId: 'user_' + Math.random().toString(36).substr(2, 9),
          userName: userName,
          originalText: text,
          translatedText: translation,
          timestamp: new Date().toISOString(),
          language: 'tr'
        };
        
        wsRef.current.send(JSON.stringify({
          type: 'new_translation',
          translation: translationRecord
        }));
        
        // Local state'e ekleme - WebSocket'ten gelecek
        // setTranslations(prev => [...prev, translationRecord]);
      }
    } catch (error) {
      console.error('Çeviri hatası:', error);
      setCurrentTranslation(`[Çeviri hatası] ${text}`);
      setIsTranslating(false);
    }
  };

  // Eski ses kaydetme fonksiyonu (artık kullanılmıyor)
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
      
      // Audio context ve analyser oluştur
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
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
      
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      
      // Ses parçalarını kontrol et ve gönder
      intervalRef.current = setInterval(() => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const hasAudio = checkAudioLevel();
          
          console.log('Ses kontrolü - Seviye:', audioLevel, 'Boyut:', audioBlob.size, 'Ses var mı:', hasAudio);
          
          // Sadece ses seviyesi yeterliyse gönder
          if (hasAudio) { // Minimum boyut kontrolü kaldırıldı
            console.log('✅ Ses algılandı, parça gönderiliyor, boyut:', audioBlob.size);
            
            // Konuşmaya başladığını bildir (sadece ilk kez)
            if (!isSpeakingRef.current) {
              wsRef.current?.send(JSON.stringify({
                type: 'start_speaking'
              }));
              isSpeakingRef.current = true;
            }
            
            // Base64'e çevir
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result.split(',')[1];
              
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
          } else {
            console.log('❌ Ses yetersiz veya boyut küçük, gönderilmiyor');
          }
          
          // Her durumda chunk'ları temizle
          audioChunksRef.current = [];
        }
      }, 1000);
      
    } catch (error) {
      console.error('Mikrofon erişim hatası:', error);
      alert('Mikrofon erişimi gerekli!');
    }
  };

  // Ses tanımayı durdur
  const stopRecording = () => {
    if (recognitionRef.current && isSpeaking) {
      recognitionRef.current.stop();
      setIsSpeaking(false);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
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
      startSpeechRecognition();
    }
  };

  // Tam ekran toggle
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">🎤 Canlı Çeviri</h1>
          <p className="login-subtitle">Odaya katılın ve anlık çeviri yapın</p>

          <div className="input-group">
            <label className="input-label">Adınız</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Adınızı girin"
              className="input-field"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Oda ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Oda ID'sini girin"
              className="input-field"
            />
          </div>

          <button onClick={handleLogin} className="btn-primary">
            <LogIn size={20} />
            Odaya Katıl
          </button>

          <div className="info-card">
            <h4 className="info-title">💡 Nasıl Çalışır?</h4>
            <ul className="info-list">
              <li>Aynı oda ID'sini kullanan herkes aynı çeviriyi görür</li>
              <li>Mikrofon butonuna basıp konuşun</li>
              <li>Anlık çeviri tüm katılımcılara gönderilir</li>
              <li>Çeviri geçmişi altta görünür</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Davet linkini kopyala
  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      alert('Davet linki kopyalandı! 📋');
    }).catch(err => {
      console.error('Link kopyalama hatası:', err);
    });
  };

  return (
    <div className="main-container">
      {/* Meeting Info */}
      <div className="meeting-info">
        <div className="meeting-details">
          <h1 className="meeting-title">🎤 Canlı Çeviri</h1>
          <p className="meeting-room">Oda: <strong>{roomId}</strong></p>
        </div>
        
        <div className="meeting-actions">
          <div className={`status-badge ${
            isConnected ? 'connected' : 'disconnected'
          }`}>
            <span className="status-dot"></span>
            {isConnected ? 'Bağlı' : 'Bağlantı Yok'}
          </div>
          
          <button onClick={copyInviteLink} className="btn-invite">
            📋 Davet Linki Kopyala
          </button>
          
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={16} />
            Çıkış
          </button>
        </div>
      </div>

      {/* Participants - Yatay Liste */}
      <div className="participants-section">
        <div className="participants-header">
          <Users size={20} />
          <h3>Katılımcılar ({users.length})</h3>
        </div>
        <div className="participants-list">
          {users.map((user) => (
            <div key={user.id} className="participant-item">
              <div className="participant-avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="participant-name">{user.name}</span>
            </div>
          ))}
          {users.length === 0 && (
            <p className="no-participants">Henüz katılımcı yok</p>
          )}
        </div>
      </div>

      {/* Speaker Text - Konuşmacının Söyledikleri */}
      <div className="speaker-section">
        <div className="speaker-header">
          <button
            onClick={toggleMicrophone}
            disabled={!isConnected}
            className={`mic-button-inline ${
              isSpeaking ? 'speaking' : 'not-speaking'
            } ${!isConnected ? 'disabled' : ''}`}
          >
            {isSpeaking ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <h3>Konuşmacı</h3>
        </div>
        <div className="speaker-text">
          {currentTranslation ? (
            <p>{currentTranslation}</p>
          ) : (
            <p className="placeholder">Konuşma başladığında burada görünecek...</p>
          )}
        </div>
      </div>

      {/* Live Translation Info */}
      <div className="live-info">
        <div className="live-badge">
          <span className="live-dot"></span>
          LIVE
        </div>
        <div className="language-info">
          <span className="lang-label">Konuşulan Dil:</span>
          <span className="lang-value">Türkçe 🇹🇷</span>
        </div>
        <div className="language-info">
          <span className="lang-label">Çevrilen Dil:</span>
          <span className="lang-value">English 🇬🇧</span>
        </div>
      </div>

      {/* Chat History - Çeviri Geçmişi */}
      <div className="chat-history-section">
        <div className="chat-header">
          <MessageSquare size={20} />
          <h3>Çeviri Geçmişi</h3>
          <button 
            onClick={toggleFullscreen}
            className="btn-fullscreen"
            title="Tam Ekran"
          >
            ⤢ Tam Ekran
          </button>
        </div>
        <div className="chat-content">
          {translations.length === 0 ? (
            <p className="no-messages">Henüz çeviri yok. Konuşmaya başlayın!</p>
          ) : (
            translations.slice().reverse().map((translation) => (
              <div key={translation.id} className="chat-message">
                <div className="message-header">
                  <span className="message-user">{translation.userName}</span>
                  <span className="message-time">
                    {new Date(translation.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="message-original">{translation.originalText}</p>
                <p className="message-translation">{translation.translatedText}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tam Ekran Overlay */}
      {isFullscreen && (
        <div className="fullscreen-overlay">
          <div className="fullscreen-header">
            <h2 className="fullscreen-title">🎤 Çeviri Geçmişi</h2>
            <button onClick={toggleFullscreen} className="fullscreen-close">
              ✕ Kapat
            </button>
          </div>
          <div className="fullscreen-content">
            {translations.length === 0 ? (
              <p className="translation-placeholder" style={{ textAlign: 'center', padding: '4rem' }}>
                Henüz çeviri yok
              </p>
            ) : (
              translations.slice().reverse().map((translation) => (
                <div key={translation.id} className="chat-message">
                  <div className="message-header">
                    <span className="message-user">{translation.userName}</span>
                    <span className="message-time">
                      {new Date(translation.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="message-original">{translation.originalText}</p>
                  <p className="message-translation">{translation.translatedText}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}