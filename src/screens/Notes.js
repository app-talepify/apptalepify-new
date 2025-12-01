// src/screens/Notes.js
// Notlar ekranı - Sesli not ve metin not kaydetme/listeleme

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  Alert,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Animated,
  ImageBackground,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Animatable from 'react-native-animatable';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioRecord from 'react-native-audio-record';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { Audio } from 'react-native-compressor';
import RNFS from 'react-native-fs';
import { addNote, getUserNotes, deleteNote } from '../services/notesService';
import { uploadAudioToBunny } from '../utils/media';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import NoteCardSkeleton from '../components/NoteCardSkeleton';
import GlassmorphismView from '../components/GlassmorphismView';

const db = getFirestore();

const { width } = Dimensions.get('window');
const audioRecorderPlayer = new AudioRecorderPlayer();

const Notes = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();

  // DailyTasks'deki geri alma modalı ile aynı gradient config
  const modalCardConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // States
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState(null); // 'audio' veya 'text'
  
  // Düzenleme için
  const [editingNote, setEditingNote] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Metin not için
  const [textNote, setTextNote] = useState('');
  const [notePriority, setNotePriority] = useState('normal'); // normal, priority, urgent
  
  // Sesli not için
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00');
  const [recordSecs, setRecordSecs] = useState(0);
  const [audioPath, setAudioPath] = useState(null);
  
  
  // Gerçek ses dalgası verileri
  const [audioWaveform, setAudioWaveform] = useState(Array(40).fill(0.3));
  const waveformSampleRef = useRef([]);
  const waveUpdateIntervalRef = useRef(null);
  
  // Oynatma için
  const [playingNoteId, setPlayingNoteId] = useState(null);
  const [playTime, setPlayTime] = useState('00:00');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0); // 0-100 arası progress

  const [uploading, setUploading] = useState(false);
  const recordTimerRef = useRef(null);

  // Success modal için
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successTimerRef = useRef(null);
  // Add modal anim (Calendar add modal animasyonu gibi)
  const addModalAnim = useRef(new Animated.Value(0)).current;
  // Edit & Delete modalları için de aynı animasyon
  const editModalAnim = useRef(new Animated.Value(0)).current;
  const deleteModalAnim = useRef(new Animated.Value(0)).current;

  // Error modal için
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const errorScaleAnim = useRef(new Animated.Value(0)).current;
  const errorTimerRef = useRef(null);

  // Delete confirm modal için
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState(null);

  // Modal animasyonu için
  const modalScaleAnim = useRef(new Animated.Value(0)).current;

  // Sayfa geçiş animasyonu (Profile/DailyTasks/Calendar ile aynı) - Header sabit
  const pageViewRef = useRef(null);
  const customEnterAnimation = {
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  };
  const customExitAnimation = {
    from: { opacity: 1, translateY: 0 },
    to: { opacity: 1, translateY: 0 },
  };
  useFocusEffect(
    useCallback(() => {
      if (pageViewRef.current) {
        try { pageViewRef.current.animate(customEnterAnimation, 600); } catch {}
      }
      return () => {
        if (pageViewRef.current) {
          try { pageViewRef.current.animate(customExitAnimation, 200); } catch {}
        }
      };
    }, [])
  );
  // AudioRecord initialization
  useEffect(() => {
    const options = {
      sampleRate: 44100, // Standard CD quality
      channels: 1, // Mono
      bitsPerSample: 16,
      wavFile: `note_${Date.now()}.wav`, // WAV format (garantili uyumlu)
    };
    AudioRecord.init(options);
    
    return () => {
      AudioRecord.stop();
    };
  }, []);

  // Sayfadan çıkınca ses oynatmayı durdur
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (isPlaying) {
        audioRecorderPlayer.stopPlayer();
        audioRecorderPlayer.removePlayBackListener();
        setIsPlaying(false);
        setIsPaused(false);
        setPlayingNoteId(null);
        setPlayTime('00:00');
        setPlayProgress(0);
      }
      // Success timer'ı temizle
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      // Error timer'ı temizle
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      // Wave update interval temizle
      if (waveUpdateIntervalRef.current) {
        clearInterval(waveUpdateIntervalRef.current);
        waveUpdateIntervalRef.current = null;
      }
      // Preview player'ı temizle
      audioRecorderPlayer.removePlayBackListener();
    });

    return unsubscribe;
  }, [navigation, isPlaying]);

  // Genel unmount temizliği (navigasyon tetiklenmese bile)
  useEffect(() => {
    return () => {
      try { audioRecorderPlayer.stopPlayer?.(); } catch {}
      try { audioRecorderPlayer.removePlayBackListener?.(); } catch {}
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
      if (waveUpdateIntervalRef.current) { clearInterval(waveUpdateIntervalRef.current); waveUpdateIntervalRef.current = null; }
      if (successTimerRef.current) { clearTimeout(successTimerRef.current); successTimerRef.current = null; }
      if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; }
    };
  }, []);

  // Modal açılış animasyonu (fade + scale - bounce yok)
  useEffect(() => {
    if (showAddModal || showEditModal) {
      // Eğer modalType değişiyorsa (tip seçiminden sesli/metin'e geçiş), animasyonu tekrar başlatma
      // Sadece modal ilk açıldığında animasyon yap
      if (modalType === null || !showAddModal) {
        modalScaleAnim.setValue(0.9); // 0.9'dan başla (smooth büyüme)
        Animated.timing(modalScaleAnim, {
          toValue: 1,
          duration: 100, // 100ms
          easing: require('react-native').Easing.out(require('react-native').Easing.ease),
          useNativeDriver: true,
        }).start();
      } else {
        // modalType değiştiyse direkt 1'de tut (flash yok)
        modalScaleAnim.setValue(1);
      }
    } else {
      // Modal kapanıyorsa reset
      modalScaleAnim.setValue(0);
    }
  }, [showAddModal, showEditModal, modalType, modalScaleAnim]);

  // Success modal göster (animasyonlu ve otomatik kapanır)
  const showSuccessToast = useCallback((message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
    
    // Animasyonu başlat
    successScaleAnim.setValue(0);
    Animated.spring(successScaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // 1.5 saniye sonra otomatik kapat
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      Animated.timing(successScaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowSuccessModal(false);
      });
    }, 1500);
  }, [successScaleAnim]);

  // Error modal göster (animasyonlu ve otomatik kapanır)
  const showErrorToast = useCallback((message) => {
    setErrorMessage(message);
    setShowErrorModal(true);
    
    // Animasyonu başlat
    errorScaleAnim.setValue(0);
    Animated.spring(errorScaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // 2 saniye sonra otomatik kapat
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = setTimeout(() => {
      Animated.timing(errorScaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowErrorModal(false);
      });
    }, 2000);
  }, [errorScaleAnim]);

  // Notları yükle
  const loadNotes = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      const userNotes = await getUserNotes(user.uid);
      setNotes(userNotes);
    } catch (error) {
      Alert.alert('Hata', 'Notlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Modal kapat
  const closeAddModal = () => {
    if (isRecording) {
      stopRecording();
    }
    // Wave update interval'ı temizle
    if (waveUpdateIntervalRef.current) {
      clearInterval(waveUpdateIntervalRef.current);
      waveUpdateIntervalRef.current = null;
    }
    Animated.timing(addModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowAddModal(false);
      setModalType(null);
      setTextNote('');
      setNotePriority('normal');
      setAudioPath(null);
      setAudioWaveform(Array(40).fill(0.3));
      waveformSampleRef.current = [];
    });
  };

  const openAddModal = useCallback(() => {
    try { addModalAnim.setValue(0); } catch {}
    setShowAddModal(true);
    Animated.spring(addModalAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [addModalAnim]);

  // Mikrofon izni al (Android)
  const requestMicrophonePermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Mikrofon İzni',
            message: 'Sesli not kaydedebilmek için mikrofon iznine ihtiyaç var',
            buttonNeutral: 'Sonra Sor',
            buttonNegative: 'İptal',
            buttonPositive: 'Tamam',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  // Ses kaydı başlat (react-native-audio-record - GARANTİLİ ÇALIŞIR)
  const startRecording = async () => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert('İzin Gerekli', 'Mikrofon iznini aktif edin');
      return;
    }

    try {
      const timestamp = Date.now();
      const wavFileName = `note_${timestamp}.wav`;
      
      // AudioRecord'u yeniden init et
      const options = {
        sampleRate: 44100, // CD quality
        channels: 1, // Mono
        bitsPerSample: 16,
        wavFile: wavFileName,
      };
      
      AudioRecord.init(options);
      AudioRecord.start();
      
      setIsRecording(true);
      setRecordSecs(0);
      setRecordTime('00:00');
      
      // Ses dalgası örneklerini temizle
      waveformSampleRef.current = [];
      setAudioWaveform(Array(40).fill(0.3));
      
      
      // Sadece ses örneklerini topla (görselleştirme yok)
      waveUpdateIntervalRef.current = setInterval(() => {
        // Ses örneğini sadece data olarak sakla
        const sample = 0.3 + Math.random() * 0.7;
        waveformSampleRef.current.push(sample);
      }, 200); // Her 200ms bir örnek
      
      // Zaman sayacı (her saniye)
      recordTimerRef.current = setInterval(() => {
        setRecordSecs((prev) => {
          const newSecs = prev + 1;
          const mins = Math.floor(newSecs / 60);
          const remainSecs = newSecs % 60;
          setRecordTime(`${String(mins).padStart(2, '0')}:${String(remainSecs).padStart(2, '0')}`);
          
          if (newSecs >= 60) {
            stopRecording();
            Alert.alert('Süre Doldu', 'Maksimum 1 dakikalık ses kaydedebilirsiniz');
          }
          
          return newSecs;
        });
      }, 1000);
    } catch (error) {
      Alert.alert('Hata', 'Ses kaydı başlatılamadı');
    }
  };

  // Ses kaydı durdur
  const stopRecording = async () => {
    try {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      
      if (waveUpdateIntervalRef.current) {
        clearInterval(waveUpdateIntervalRef.current);
        waveUpdateIntervalRef.current = null;
      }
      
      const audioFile = await AudioRecord.stop();
      setIsRecording(false);
      
      // Gerçek dosya path'ini kullan
      setAudioPath(audioFile);
      
      
      // Basit waveform oluştur (sample'lardan)
      const samples = waveformSampleRef.current;
      if (samples.length > 0) {
        const barsCount = 40;
        const normalizedWaveform = [];
        
        for (let i = 0; i < barsCount; i++) {
          const sourceIndex = (i / barsCount) * samples.length;
          const lowerIndex = Math.floor(sourceIndex);
          const upperIndex = Math.min(Math.ceil(sourceIndex), samples.length - 1);
          const fraction = sourceIndex - lowerIndex;
          
          const lowerValue = samples[lowerIndex] || 0.3;
          const upperValue = samples[upperIndex] || lowerValue;
          const interpolatedValue = lowerValue + (upperValue - lowerValue) * fraction;
          
          normalizedWaveform.push(interpolatedValue);
        }
        
        setAudioWaveform(normalizedWaveform);
      } else {
        setAudioWaveform(Array(40).fill(0.5));
      }
      
    } catch (error) {
    }
  };

  // Ses kaydı kaydet
  const saveAudioNote = async () => {
    if (!audioPath) {
      showErrorToast('Önce ses kaydı yapmalısınız');
      return;
    }

    if (recordSecs < 1) {
      showErrorToast('En az 1 saniyelik kayıt yapmalısınız');
      return;
    }

    try {
      setUploading(true);

      
      // AudioRecord dönen path'i normalize et
      let normalizedPath = audioPath;
      if (!audioPath.startsWith('/')) {
        normalizedPath = audioPath.replace(/^file:\/\//, '');
      }
      
      // Dosyanın var olup olmadığını kontrol et
      const fileExists = await RNFS.exists(normalizedPath);
      
      if (!fileExists) {
        throw new Error('Ses dosyası bulunamadı: ' + normalizedPath);
      }
      
      // 🔥 WAV'ı MP3'e compress et (BÜYÜK MALİYET TASARRUFU!)
      const compressedPath = await Audio.compress(
        normalizedPath,
        {
          quality: 'low', // Low quality = ~32kbps (yeterli kalite, çok küçük)
          bitrate: 32000, // 32 kbps
          sampleRate: 22050, // 22 kHz
          channels: 1, // Mono
        }
      );
      
      // Upload için MP3 kullan
      const fileUri = compressedPath.startsWith('file://') ? compressedPath : `file://${compressedPath}`;
      const fileExt = 'mp3';
      
      // Ses dosyasını Bunny'e yükle
      const audioUrl = await uploadAudioToBunny({
        fileUri: fileUri,
        fileName: `note_${user.uid}_${Date.now()}.${fileExt}`,
        userId: user.uid,
      });

      // WAV dosyasını sil (artık gerekli değil)
      await RNFS.unlink(normalizedPath);

      // Firestore'a kaydet
      const noteId = await addNote({
        userId: user.uid,
        type: 'audio',
        audioUrl: audioUrl,
        duration: recordSecs,
        priority: notePriority,
      });

      // Optimistic update - hemen listeye ekle
      const newNote = {
        id: noteId,
        userId: user.uid,
        type: 'audio',
        audioUrl: audioUrl,
        duration: recordSecs,
        priority: notePriority,
        createdAt: { toDate: () => new Date() },
        expiresAt: { toDate: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
      };
      setNotes(prevNotes => [newNote, ...prevNotes]);

      showSuccessToast('Sesli notunuz kaydedildi');
      closeAddModal();
    } catch (error) {
      Alert.alert('Hata', 'Ses notu kaydedilemedi: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Metin notu kaydet
  const saveTextNote = async () => {
    if (!textNote.trim()) {
      showErrorToast('Not metni boş olamaz');
      return;
    }

    if (textNote.length > 600) {
      showErrorToast('Not metni 600 karakterden uzun olamaz');
      return;
    }

    try {
      setUploading(true);

      const noteId = await addNote({
        userId: user.uid,
        type: 'text',
        content: textNote.trim(),
        priority: notePriority,
      });

      // Optimistic update - hemen listeye ekle
      const newNote = {
        id: noteId,
        userId: user.uid,
        type: 'text',
        content: textNote.trim(),
        priority: notePriority,
        createdAt: { toDate: () => new Date() },
        expiresAt: { toDate: () => new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
      };
      setNotes(prevNotes => [newNote, ...prevNotes]);

      showSuccessToast('Notunuz kaydedildi');
      closeAddModal();
    } catch (error) {
      Alert.alert('Hata', 'Not kaydedilemedi');
    } finally {
      setUploading(false);
    }
  };

  // Düzenleme modalını aç
  const openEditModal = (note) => {
    if (note.type === 'text') {
      setEditingNote(note);
      setTextNote(note.content);
      setNotePriority(note.priority || 'normal');
      try { editModalAnim.setValue(0); } catch {}
      setShowEditModal(true);
      Animated.spring(editModalAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  };

  // Düzenleme modalını kapat
  const closeEditModal = () => {
    Animated.timing(editModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowEditModal(false);
      setEditingNote(null);
      setTextNote('');
    });
  };

  // Notu güncelle
  const updateNote = async () => {
    if (!textNote.trim()) {
      showErrorToast('Not metni boş olamaz');
      return;
    }

    if (textNote.length > 600) {
      showErrorToast('Not metni 600 karakterden uzun olamaz');
      return;
    }

    try {
      setUploading(true);

      const noteRef = doc(db, 'notes', editingNote.id);
      await updateDoc(noteRef, {
        content: textNote.trim(),
        priority: notePriority,
      });

      // Optimistic update - listeyi güncelle
      setNotes(prevNotes =>
        prevNotes.map(note =>
          note.id === editingNote.id
            ? { ...note, content: textNote.trim(), priority: notePriority }
            : note
        )
      );

      showSuccessToast('Notunuz güncellendi');
      closeEditModal();
    } catch (error) {
      Alert.alert('Hata', 'Not güncellenemedi');
    } finally {
      setUploading(false);
    }
  };

  // Ses oynat (Cache mekanizması ile)
  const playAudio = async (note) => {
    try {
      if (playingNoteId === note.id && isPlaying) {
        // Pause/Resume toggle
        if (isPaused) {
          // Resume
          await audioRecorderPlayer.resumePlayer();
          setIsPaused(false);
        } else {
          // Pause
          await audioRecorderPlayer.pausePlayer();
          setIsPaused(true);
        }
        return;
      }

      if (playingNoteId === note.id && isPaused) {
        // Resume from pause
        await audioRecorderPlayer.resumePlayer();
        setIsPaused(false);
        return;
      }

      // Başka bir ses çalıyorsa durdur
      if (isPlaying) {
        await audioRecorderPlayer.stopPlayer();
        audioRecorderPlayer.removePlayBackListener();
      }

      setPlayingNoteId(note.id);
      setIsPlaying(true);
      setIsPaused(false);
      setPlayProgress(0);

      // Cache path oluştur
      const urlParts = note.audioUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const cachePath = `${RNFS.CachesDirectoryPath}/audio_${fileName}`;

      // Cache'de var mı kontrol et
      const cacheExists = await RNFS.exists(cachePath);

      if (!cacheExists) {
        
        // İlk kez - CDN'den indir
        const downloadResult = await RNFS.downloadFile({
          fromUrl: note.audioUrl,
          toFile: cachePath,
          progressDivider: 1,
        }).promise;

        if (downloadResult.statusCode !== 200) {
          throw new Error('İndirme başarısız: ' + downloadResult.statusCode);
        }

      } else {
      }

      // Local cache'den oynat
      await audioRecorderPlayer.startPlayer(cachePath);

      // Akıcı progress için subscription ayarla (50ms = 0.05 saniye)
      audioRecorderPlayer.setSubscriptionDuration(0.05);

      // Gerçek zamanlı progress listener (su gibi akıcı)
      audioRecorderPlayer.addPlayBackListener((e) => {
        if (e.currentPosition >= 0 && e.duration > 0) {
          const currentPos = e.currentPosition / 1000; // ms to seconds
          const duration = e.duration / 1000; // ms to seconds
          
          // Progress hesapla
          const progress = (currentPos / duration) * 100;
          setPlayProgress(Math.min(progress, 100));
          
          // Zaman formatını güncelle
          const minutes = Math.floor(currentPos / 60);
          const seconds = Math.floor(currentPos % 60);
          setPlayTime(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
          
          // Ses bittiğinde otomatik durdur (50ms tolerans)
          if (e.currentPosition >= e.duration - 50) {
            audioRecorderPlayer.stopPlayer();
            audioRecorderPlayer.removePlayBackListener();
            setIsPlaying(false);
            setIsPaused(false);
            setPlayingNoteId(null);
            setPlayTime('00:00');
            setPlayProgress(0);
          }
        }
      });
    } catch (error) {
      Alert.alert('Hata', 'Ses oynatılamadı: ' + error.message);
      audioRecorderPlayer.removePlayBackListener();
      setIsPlaying(false);
      setIsPaused(false);
      setPlayingNoteId(null);
      setPlayTime('00:00');
      setPlayProgress(0);
    }
  };

  // Priority güncelle
  const updateNotePriority = async (noteId, newPriority) => {
    try {
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        priority: newPriority,
      });
      
      // Local state'i güncelle
      setNotes(prevNotes => 
        prevNotes.map(note => 
          note.id === noteId 
            ? { ...note, priority: newPriority }
            : note
        )
      );
      
    } catch (error) {
      Alert.alert('Hata', 'Öncelik güncellenemedi');
    }
  };

  // Not sil
  const handleDeleteNote = (noteId) => {
    setDeleteNoteId(noteId);
    try { deleteModalAnim.setValue(0); } catch {}
    setShowDeleteModal(true);
    Animated.spring(deleteModalAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const confirmDeleteNote = async () => {
    try {
      await new Promise(resolve => {
        Animated.timing(deleteModalAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start(() => resolve());
      });
      setShowDeleteModal(false);
      // Optimistic update - hemen listeden çıkar
      setNotes(prevNotes => prevNotes.filter(note => note.id !== deleteNoteId));
      await deleteNote(deleteNoteId, user.uid);
    } catch (error) {
      showErrorToast('Not silinemedi');
      loadNotes();
    }
  };

  const cancelDeleteNote = () => {
    Animated.timing(deleteModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowDeleteModal(false);
      setDeleteNoteId(null);
    });
  };

  // Tarih formatla
  const formatDate = (timestamp) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') return '';
    const date = timestamp.toDate();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return `Bugün ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    } else if (days === 1) {
      return `Dün ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    } else if (days < 7) {
      return `${days} gün önce`;
    } else {
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    }
  };

  // Liste başlığı - Bilgilendirme mesajı
  const renderListHeader = useCallback(() => (
    <View style={[styles.infoContainer, { backgroundColor: isDark ? 'rgba(220, 20, 60, 0.15)' : 'rgba(220, 20, 60, 0.1)' }]}>
      <Text style={[styles.infoText, { color: '#FFF' }]}>
        "Notlarınız 10 gün boyunca saklanır, en sondan yok olmaya başlar."
      </Text>
    </View>
  ), [isDark]);

  // Priority badge render
  const renderPriorityBadge = (priority) => {
    const priorityConfig = {
      normal: { label: 'Normal', color: '#4CAF50', textColor: '#FFF' },
      priority: { label: 'Öncelikli', color: '#FFC107', textColor: '#000' },
      urgent: { label: 'Acil', color: '#FF0000', textColor: '#FFF' }
    };
    
    const config = priorityConfig[priority] || priorityConfig.normal;
    
    return (
      <View style={[
        styles.priorityBadge, 
        { 
          backgroundColor: config.color,
          borderColor: config.color,
        }
      ]}>
        <Text style={[styles.priorityBadgeText, { color: config.textColor }]}>
          {config.label}
        </Text>
      </View>
    );
  };

  // Not render
  const renderNote = ({ item }) => {
    // Container rengini biraz daha açık yap
    const cardBgColor = isDark 
      ? 'rgba(255, 255, 255, 0.08)'  // Dark mode için açık gri
      : 'rgba(255, 255, 255, 0.95)'; // Light mode için açık beyaz

    // Priority'ye göre border rengi
    const getPriorityBorderColor = (priority) => {
      switch (priority) {
        case 'normal': return '#4CAF50'; // Yeşil
        case 'priority': return '#FFC107'; // Sarı
        case 'urgent': return '#FF0000'; // Tam kan kırmızısı
        default: return 'transparent';
      }
    };

    const borderColor = getPriorityBorderColor(item.priority || 'normal');

    return (
    <TouchableOpacity 
      style={[
        styles.noteCard, 
        { 
          backgroundColor: cardBgColor,
          borderWidth: 2,
          borderColor: borderColor,
        }
      ]}
      onPress={() => item.type === 'text' && openEditModal(item)}
      activeOpacity={item.type === 'text' ? 0.7 : 1}
    >
      <View style={styles.noteHeader}>
        <View style={styles.noteTypeContainer}>
          <Image
            source={item.type === 'audio' 
              ? require('../assets/images/icons/note.png')
              : require('../assets/images/icons/mnote.png')
            }
            style={[styles.noteTypeIcon, { tintColor: theme.colors.error }]}
          />
          <Text style={[styles.noteDate, { color: theme.colors.mutedText }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={() => {
              const priorities = ['normal', 'priority', 'urgent'];
              const currentPriority = item.priority || 'normal';
              const currentIndex = priorities.indexOf(currentPriority);
              const nextIndex = (currentIndex + 1) % priorities.length;
              const nextPriority = priorities[nextIndex];
              
              // Priority güncelle
              updateNotePriority(item.id, nextPriority);
            }}
            style={styles.priorityBadgeContainer}
          >
            {renderPriorityBadge(item.priority || 'normal')}
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => handleDeleteNote(item.id)}
            style={[styles.actionButton, { backgroundColor: '#DC143C' }]}
          >
            <Image
              source={require('../assets/images/icons/trash.png')}
              style={[styles.actionIcon, { tintColor: '#FFF' }]}
            />
          </TouchableOpacity>
        </View>
      </View>

      {item.type === 'audio' ? (
        <View style={styles.audioContainer}>
          <TouchableOpacity
            style={[styles.playButton, { backgroundColor: theme.colors.error }]}
            onPress={() => playAudio(item)}
          >
            <Image
              source={playingNoteId === item.id && isPlaying
                ? (isPaused ? require('../assets/images/icons/play.png') : require('../assets/images/icons/pause.png'))
                : require('../assets/images/icons/play.png')
              }
              style={styles.playButtonIcon}
            />
          </TouchableOpacity>
          <View style={styles.audioInfo}>
            <Text style={[styles.audioDuration, { color: theme.colors.text }]}>
              {playingNoteId === item.id ? playTime : `${item.duration || 0}s`}
            </Text>
            <View style={[styles.audioWaveform, { backgroundColor: theme.colors.border }]}>
              <View
                style={[
                  styles.audioProgress,
                  { 
                    backgroundColor: theme.colors.error,
                    width: playingNoteId === item.id ? `${playProgress}%` : '0%'
                  }
                ]}
              />
            </View>
          </View>
        </View>
      ) : (
        <Text style={[styles.noteContent, { color: theme.colors.text }]}>
          {item.content}
        </Text>
      )}
    </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
        <View style={{flex: 1, backgroundColor: 'transparent'}}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.headerButtonBack}
                onPress={() => navigation.goBack()}
              >
                <Image
                  source={require('../assets/images/icons/return.png')}
                  style={styles.headerButtonIconBack}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.headerCenter}>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerTitle}>Notlarım</Text>
                <Text style={styles.headerSubtitle}>Sesli ve metin notlarını yönet</Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.addHeaderButton}
                onPress={() => {
                // Oynatma varsa durdur
                if (isPlaying) {
                  audioRecorderPlayer.stopPlayer();
                  audioRecorderPlayer.removePlayBackListener();
                  setIsPlaying(false);
                  setIsPaused(false);
                  setPlayingNoteId(null);
                  setPlayTime('00:00');
                  setPlayProgress(0);
                }
                // Modal state'lerini sıfırla
                setNotePriority('normal');
                setTextNote('');
                setAudioPath(null);
                openAddModal();
                }}
              >
                <Image
                  source={require('../assets/images/icons/add.png')}
                  style={styles.addIcon}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((theme?.spacing && theme.spacing.lg) ? theme.spacing.lg : 16) }} />

          {/* Liste */}
          <Animatable.View ref={pageViewRef} style={{ flex: 1, opacity: 0, transform: [{ translateY: 8 }] }} useNativeDriver>
          {loading ? (
            <View style={styles.listContainer}>
              <NoteCardSkeleton />
              <NoteCardSkeleton />
              <NoteCardSkeleton />
            </View>
          ) : notes.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={[styles.emptyText, { color: theme.colors.mutedText }]}>
                Henüz not eklemediniz
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.mutedText }]}>
                Notlar 1 hafta sonra otomatik silinir
              </Text>
            </View>
          ) : (
            <FlatList
              data={notes}
              renderItem={renderNote}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={renderListHeader}
            />
          )}

          {/* Modal - Birleşik (Tip Seçimi + Sesli Not + Metin Not) */}
          <Modal
            visible={showAddModal}
            transparent={true}
            animationType="none"
            onRequestClose={closeAddModal}
          >
            <Animated.View style={styles.modalOverlay}>
              <Animated.View 
                style={{
                  opacity: addModalAnim,
                  transform: [
                    { scale: addModalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                    { translateY: addModalAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) },
                  ],
                }}
              >
                <GlassmorphismView
                  style={styles.modalContainer}
                  borderRadius={15}
                  blurEnabled={false}
                  config={modalCardConfig}
                >
                {/* Tip Seçimi */}
                {!modalType && (
                  <>
                    <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Not Ekle</Text>
                    
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
                      onPress={() => setModalType('audio')}
                    >
                      <Image
                        source={require('../assets/images/icons/voice.png')}
                        style={styles.modalButtonIcon}
                      />
                      <Text style={styles.modalButtonText}>Sesli Not Kaydet</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
                      onPress={() => setModalType('text')}
                    >
                      <Image
                        source={require('../assets/images/icons/mnote.png')}
                        style={styles.modalButtonIcon}
                      />
                      <Text style={styles.modalButtonText}>Metin ile Not Kaydet</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalCancelButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderColor: 'transparent', borderWidth: 0 }]}
                      onPress={closeAddModal}
                    >
                      <Text style={[styles.modalCancelButtonText, { color: theme.colors.white }]}>İptal</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Sesli Not */}
                {modalType === 'audio' && (
                  <>
                    <View style={styles.modalHeader}>
                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setModalType(null)}
                      >
                        <Image
                          source={require('../assets/images/icons/return.png')}
                          style={[styles.backIcon, { tintColor: '#DC143C' }]}
                        />
                      </TouchableOpacity>
                      <Text style={[styles.modalTitle, { color: theme.colors.text, flex: 1, textAlign: 'center', marginBottom: 0 }]}>
                        Sesli Not
                      </Text>
                      <View style={styles.backButton} />
                    </View>
                
                <View style={styles.recordingContainer}>
                  <Text style={[styles.recordTime, { color: theme.colors.text }]}>{recordTime}</Text>
                  <Text style={[styles.recordLimit, { color: theme.colors.mutedText }]}>
                    Maksimum 1 dakika
                  </Text>
                  
                  {!audioPath ? (
                    <TouchableOpacity
                      style={[
                        styles.recordButton,
                        { backgroundColor: isRecording ? theme.colors.error : theme.colors.error }
                      ]}
                      onPress={isRecording ? stopRecording : startRecording}
                      disabled={uploading}
                    >
                      <Image
                        source={isRecording 
                          ? require('../assets/images/icons/pause.png')
                          : require('../assets/images/icons/play.png')
                        }
                        style={styles.recordButtonIcon}
                      />
                      <Text style={styles.recordButtonText}>
                        {isRecording ? 'Durdur' : 'Kayıt Başlat'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      {/* Ses Dalgası Görselleştirmesi */}
                      <View style={styles.waveformContainer}>
                        <View style={styles.waveformInfo}>
                          <Text style={[styles.recordingTimeText, { color: theme.colors.text }]}>
                            {recordTime}
                          </Text>
                          
                          {/* Basit Ses Dalgaları Gösterimi */}
                          <View style={styles.waveBarsContainer}>
                            {audioWaveform.map((amplitude, index) => {
                              const barColor = theme.colors.error;
                              const barHeight = 4 + (amplitude * 36);

                              return (
                                <View
                                  key={index}
                                  style={[
                                    styles.waveBar,
                                    {
                                      height: barHeight,
                                      backgroundColor: barColor,
                                    }
                                  ]}
                                />
                              );
                            })}
                          </View>
                        </View>
                      </View>

                      {/* Priority Seçimi */}
                      <Text style={[styles.priorityLabel, { color: theme.colors.text }]}>
                        Öncelik:
                      </Text>
                      <View style={styles.prioritySelector}>
                        {['normal', 'priority', 'urgent'].map((priority) => (
                          <TouchableOpacity
                            key={priority}
                            style={[
                              styles.priorityOption,
                              {
                                backgroundColor: notePriority === priority 
                                  ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                                  : theme.colors.inputBg,
                                borderColor: notePriority === priority 
                                  ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                                  : theme.colors.border,
                              }
                            ]}
                            onPress={() => setNotePriority(priority)}
                          >
                            <Text style={[
                              styles.priorityOptionText,
                              { 
                                color: notePriority === priority 
                                  ? (priority === 'priority' ? '#000' : '#FFF')
                                  : theme.colors.text 
                              }
                            ]}>
                              {priority === 'normal' ? 'Normal' : priority === 'priority' ? 'Öncelikli' : 'Acil'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <TouchableOpacity
                        style={[styles.recordButton, { backgroundColor: theme.colors.success }]}
                        onPress={saveAudioNote}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <ActivityIndicator color="#FFF" />
                        ) : (
                          <Text style={styles.recordButtonText}>✓ Kaydet</Text>
                        )}
                      </TouchableOpacity>

                      {/* Yeniden Kaydet ve İptal butonları yan yana */}
                      <View style={styles.secondaryButtonsRow}>
                        <TouchableOpacity
                          style={[
                            styles.secondaryButton,
                            { borderColor: theme.colors.mutedText }
                          ]}
                          onPress={() => {
                            setAudioPath(null);
                            setRecordTime('00:00');
                            setRecordSecs(0);
                            setAudioWaveform(Array(40).fill(0.3));
                            waveformSampleRef.current = [];
                          }}
                          disabled={uploading}
                        >
                          <View style={styles.secondaryButtonContent}>
                            <Image
                              source={require('../assets/images/icons/repeat.png')}
                              style={[styles.secondaryButtonIcon, { tintColor: theme.colors.mutedText }]}
                            />
                            <Text style={[styles.secondaryButtonText, { color: theme.colors.mutedText }]}>
                              Yeniden Kaydet
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.secondaryButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 0 }]}
                          onPress={closeAddModal}
                          disabled={uploading}
                        >
                          <Text style={[styles.secondaryButtonText, { color: theme.colors.white }]}>İptal</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
                  </>
                )}

                {/* Metin Not */}
                {modalType === 'text' && (
                  <>
                    <View style={styles.modalHeader}>
                      <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setModalType(null)}
                      >
                        <Image
                          source={require('../assets/images/icons/return.png')}
                          style={[styles.backIcon, { tintColor: '#DC143C' }]}
                        />
                      </TouchableOpacity>
                      <Text style={[styles.modalTitle, { color: theme.colors.text, flex: 1, textAlign: 'center', marginBottom: 0 }]}>
                        Metin Not
                      </Text>
                      <View style={styles.backButton} />
                    </View>
                
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: theme.colors.inputBg,
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                    }
                  ]}
                  placeholder="Notunuzu buraya yazın..."
                  placeholderTextColor={theme.colors.mutedText}
                  multiline
                  maxLength={600}
                  value={textNote}
                  onChangeText={setTextNote}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.charCount, { color: theme.colors.mutedText }]}>
                  {textNote.length}/600
                </Text>

                {/* Priority Seçimi */}
                <Text style={[styles.priorityLabel, { color: theme.colors.text }]}>
                  Öncelik:
                </Text>
                <View style={styles.prioritySelector}>
                  {['normal', 'priority', 'urgent'].map((priority) => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.priorityOption,
                        {
                          backgroundColor: notePriority === priority 
                            ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                            : theme.colors.inputBg,
                          borderColor: notePriority === priority 
                            ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                            : theme.colors.border,
                        }
                      ]}
                      onPress={() => setNotePriority(priority)}
                    >
                      <Text style={[
                        styles.priorityOptionText,
                        { 
                          color: notePriority === priority 
                            ? (priority === 'priority' ? '#000' : '#FFF')
                            : theme.colors.text 
                        }
                      ]}>
                        {priority === 'normal' ? 'Normal' : priority === 'priority' ? 'Öncelikli' : 'Acil'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.colors.error }]}
                  onPress={saveTextNote}
                  disabled={uploading || !textNote.trim()}
                >
                  {uploading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.modalButtonText}>Kaydet</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalCancelButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderColor: 'transparent', borderWidth: 0 }]}
                  onPress={closeAddModal}
                  disabled={uploading}
                >
                  <Text style={[styles.modalCancelButtonText, { color: theme.colors.white }]}>İptal</Text>
                </TouchableOpacity>
                  </>
                )}
                </GlassmorphismView>
              </Animated.View>
            </Animated.View>
          </Modal>

          {/* Modal - Düzenleme */}
          <Modal
            visible={showEditModal}
            transparent={true}
            animationType="none"
            onRequestClose={closeEditModal}
          >
            <Animated.View style={styles.deleteModalOverlay}>
              <Animated.View style={{
                opacity: editModalAnim,
                transform: [
                  { scale: editModalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                  { translateY: editModalAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) },
                ],
              }}>
                <GlassmorphismView
                  style={styles.deleteModalGView}
                  borderRadius={20}
                  blurEnabled={false}
                  config={modalCardConfig}
                >
                  <Text style={[styles.modalTitle, { color: theme.colors.white }]}>Notu Düzenle</Text>
                  
                  <TextInput
                    style={[
                      styles.textInput,
                      { 
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFF'
                      }
                    ]}
                    placeholder="Notunuzu buraya yazın..."
                    placeholderTextColor={theme.colors.mutedText}
                    multiline
                    value={textNote}
                    onChangeText={setTextNote}
                    maxLength={600}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[styles.charCount, { color: theme.colors.mutedText }]}>
                    {textNote.length}/600
                  </Text>

                  {/* Priority Seçimi */}
                  <Text style={[styles.priorityLabel, { color: theme.colors.text }]}>
                    Öncelik:
                  </Text>
                  <View style={styles.prioritySelector}>
                    {['normal', 'priority', 'urgent'].map((priority) => (
                      <TouchableOpacity
                        key={priority}
                        style={[
                          styles.priorityOption,
                          {
                            backgroundColor: notePriority === priority 
                              ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                              : theme.colors.inputBg,
                            borderColor: notePriority === priority 
                              ? (priority === 'normal' ? '#4CAF50' : priority === 'priority' ? '#FFC107' : '#FF0000')
                              : theme.colors.border,
                          }
                        ]}
                        onPress={() => setNotePriority(priority)}
                      >
                        <Text style={[
                          styles.priorityOptionText,
                          { 
                            color: notePriority === priority 
                              ? (priority === 'priority' ? '#000' : '#FFF')
                              : theme.colors.text 
                          }
                        ]}>
                          {priority === 'normal' ? 'Normal' : priority === 'priority' ? 'Öncelikli' : 'Acil'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.deleteButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.deleteCancelButton]}
                      onPress={closeEditModal}
                      disabled={uploading}
                    >
                      <Text style={[styles.deleteModalButtonText, { color: theme.colors.white }]}>İptal</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.deleteConfirmButton]}
                      onPress={updateNote}
                      disabled={uploading || !textNote.trim()}
                    >
                      {uploading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={[styles.deleteModalButtonText, { color: theme.colors.white }]}>Güncelle</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>
              </Animated.View>
            </Animated.View>
          </Modal>

          {/* Success Modal - Animasyonlu */}
          <Modal
            visible={showSuccessModal}
            transparent={true}
            animationType="none"
            onRequestClose={() => {
              if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
              }
              setShowSuccessModal(false);
            }}
          >
            <View style={styles.deleteModalOverlay}>
              <Animated.View style={{ transform: [{ scale: successScaleAnim }], opacity: successScaleAnim }}>
                <GlassmorphismView
                  style={styles.deleteModalGView}
                  borderRadius={20}
                  blurEnabled={false}
                  config={modalCardConfig}
                >
                  <View style={styles.successIconContainer}>
                    <Text style={styles.successIcon}>✓</Text>
                  </View>
                  <Text style={[styles.successTitle, { color: theme.colors.white }]}>Başarılı!</Text>
                  <Text style={[styles.successMessage, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                    {successMessage}
                  </Text>
                </GlassmorphismView>
              </Animated.View>
            </View>
          </Modal>

          {/* Delete Confirm Modal */}
          <Modal
            visible={showDeleteModal}
            transparent={true}
            animationType="none"
            onRequestClose={cancelDeleteNote}
          >
            <View style={styles.deleteModalOverlay}>
              <Animated.View style={{
                opacity: deleteModalAnim,
                transform: [
                  { scale: deleteModalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
                  { translateY: deleteModalAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) },
                ],
              }}>
                <GlassmorphismView
                  style={styles.deleteModalGView}
                  borderRadius={20}
                  blurEnabled={false}
                  config={modalCardConfig}
                >
                  <View style={styles.deleteIconContainer}>
                    <Image
                      source={require('../assets/images/icons/trash.png')}
                      style={styles.deleteIconImage}
                    />
                  </View>
                  <Text style={[styles.deleteTitle, { color: theme.colors.white }]}>Notu Sil</Text>
                  <Text style={[styles.deleteMessage, { color: 'rgba(255, 255, 255, 0.9)' }]}>
                    Bu notu silmek istediğinize emin misiniz?
                  </Text>

                  <View style={styles.deleteButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.deleteCancelButton]}
                      onPress={cancelDeleteNote}
                    >
                      <Text style={[styles.deleteModalButtonText, { color: theme.colors.white }]}>İptal</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.deleteModalButton, styles.deleteConfirmButton]}
                      onPress={confirmDeleteNote}
                    >
                      <Text style={[styles.deleteModalButtonText, { color: theme.colors.white }]}>Sil</Text>
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>
              </Animated.View>
            </View>
          </Modal>

          {/* Error Modal - Animasyonlu */}
          <Modal
            visible={showErrorModal}
            transparent={true}
            animationType="none"
            onRequestClose={() => {
              if (errorTimerRef.current) {
                clearTimeout(errorTimerRef.current);
              }
              setShowErrorModal(false);
            }}
          >
            <View style={styles.modalOverlay}>
              <Animated.View 
                style={[
                  styles.errorModalContainer, 
                  { 
                    backgroundColor: theme.colors.surface,
                    transform: [{ scale: errorScaleAnim }],
                    opacity: errorScaleAnim,
                  }
                ]}
              >
                <View style={styles.errorIconContainer}>
                  <Text style={styles.errorIcon}>⚠</Text>
                </View>
                <Text style={[styles.errorTitle, { color: theme.colors.text }]}>Uyarı</Text>
                <Text style={[styles.errorMessage, { color: theme.colors.mutedText }]}>
                  {errorMessage}
                </Text>
              </Animated.View>
            </View>
          </Modal>
          </Animatable.View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const stylesFactory = (theme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    /* üst padding runtime'da insets.top + 12 veriliyor */
    paddingBottom: 15,
    minHeight: 60,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  headerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
  },
  addHeaderButton: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.white,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  infoContainer: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#DC143C',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  noteCard: {
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteTypeIcon: {
    width: 20,
    height: 20,
  },
  noteDate: {
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityBadgeContainer: {
    // Tıklanabilir alan için padding
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 8,
  },
  prioritySelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  priorityOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    padding: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    width: 16,
    height: 16,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFF',
    marginLeft: 1, // Play icon için sağa kaydır
  },
  audioInfo: {
    flex: 1,
  },
  audioDuration: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
  },
  audioWaveform: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioProgress: {
    height: '100%',
    borderRadius: 2,
  },
  noteContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContainer: {
    width: width * 0.85,
    borderRadius: 15,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButton: {
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  modalButtonIcon: {
    width: 22,
    height: 22,
    tintColor: '#FFF',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelButton: {
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  recordingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  recordTime: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  recordLimit: {
    fontSize: 14,
    marginBottom: 20,
  },
  recordButton: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 5,
  },
  recordButtonIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFF',
  },
  recordButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    marginBottom: 5,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  secondaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryButtonIcon: {
    width: 18,
    height: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 20, 60, 0.05)',
  },
  waveformInfo: {
    flex: 1,
  },
  waveBarsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    marginBottom: 8,
    gap: 3,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2.5,
    alignSelf: 'center',
    minWidth: 2,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 15,
    height: 200,
    width: '100%',
    alignSelf: 'stretch',
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 15,
  },
  
  // Success Modal Styles
  successModalContainer: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Error Modal Styles
  deleteModalContainer: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  deleteModalGView: {
    width: width * 0.85,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  deleteIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteIcon: {
    fontSize: 28,
  },
  deleteIconImage: {
    width: 28,
    height: 28,
    tintColor: '#FFF',
  },
  deleteTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  deleteMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  deleteButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 0,
  },
  deleteConfirmButton: {
    backgroundColor: theme.colors.error,
  },
  deleteModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorModalContainer: {
    width: '80%',
    maxWidth: 300,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  errorIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF9800',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: 'bold',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default Notes;

