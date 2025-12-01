// src/screens/DailyTasks.js
// Günlük Görevler Sayfası

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Image,
  ImageBackground,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Animatable from 'react-native-animatable';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GlassmorphismView from '../components/GlassmorphismView';

// Icon mapping fonksiyonu
const getIconSource = (iconName) => {
  const iconMap = {
    whatsapp: require('../assets/images/icons/whatsapp.png'),
    fizbo: require('../assets/images/icons/fizbo.png'),
    portfoy: require('../assets/images/icons/portfoy.png'),
    sign: require('../assets/images/icons/sign.png'),
    useralt: require('../assets/images/icons/useralt.png'),
    tasks: require('../assets/images/icons/tasks.png'),
  };
  return iconMap[iconName] || null;
};

// Günlük görevler listesi
const DAILY_TASKS = [
  {
    id: 'whatsapp_stories',
    title: 'WhatsApp Hikaye Paylaşımı',
    description: 'Günlük 5 adet WhatsApp hikaye paylaş',
    target: 5,
    current: 0,
    icon: 'whatsapp',
    points: 10,
  },
  {
    id: 'fizbo_search',
    title: 'Fizbo Araması',
    description: '10 adet Fizbo araması yap',
    target: 10,
    current: 0,
    icon: 'fizbo',
    points: 15,
  },
  {
    id: 'portfolio_review',
    title: 'Portföy İnceleme',
    description: 'Elindeki portföylere göz at',
    target: 1,
    current: 0,
    icon: 'portfoy',
    points: 20,
  },
  {
    id: 'advertisement_check',
    title: 'Afişe Kontrol',
    description: 'Afişenecek portföyler var mı kontrol et',
    target: 1,
    current: 0,
    icon: 'sign',
    points: 15,
  },
  {
    id: 'client_calls',
    title: 'Müşteri Araması',
    description: 'Müşterilerle iletişim kur',
    target: 3,
    current: 0,
    icon: 'useralt',
    points: 25,
  },
];

const DailyTasks = () => {
  const navigation = useNavigation();
  const { theme: currentTheme, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState(DAILY_TASKS);
  const [weeklyProgress, setWeeklyProgress] = useState([]);
  const [isUndoModalVisible, setIsUndoModalVisible] = useState(false);
  const [selectedTaskForUndo, setSelectedTaskForUndo] = useState(null);
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  const [infoModalAnim] = useState(new Animated.Value(0));

  // Sayfa açılışında animasyon KALDIRILDI

  // Profil sayfasından alınan gradient config
  const taskCardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Bugünkü ilerleme container'ı için ayrı config
  const totalProgressCardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(13, 29, 39)',
    endColor: 'rgba(17, 36, 49, 0.82)', // Görev kartlarından farklı
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Modal için ayrı config
  const modalCardConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const closeModalWithAnimation = useCallback(() => {
    Animated.timing(infoModalAnim, {
      toValue: 0,
      duration: 200, // Kapanma hızını artırdık
      useNativeDriver: true,
    }).start(() => {
      setIsInfoModalVisible(false);
    });
  }, [infoModalAnim]);

  // İçerik fade'i kaldırıldı; profil ile birebir sayfa-level animasyon kullanılıyor

  useEffect(() => {
    if (isInfoModalVisible) {
      // Animasyonla modalı göster
      Animated.spring(infoModalAnim, {
        toValue: 1,
        friction: 7,
        tension: 80, // Açılış animasyonunu hızlandırdık
        useNativeDriver: true,
      }).start();

      // Belirli bir süre sonra animasyonla kapat
      const timer = setTimeout(() => {
        Animated.timing(infoModalAnim, {
          toValue: 0,
          duration: 200, // Kapanış animasyonunu hızlandırdık
          useNativeDriver: true,
        }).start(() => {
          setIsInfoModalVisible(false);
        });
      }, 1200); // Modal 1.2 saniye görünür kalacak

      return () => clearTimeout(timer);
    }
  }, [isInfoModalVisible, infoModalAnim]);

  // Günlük görevleri yükle
  const loadDailyTasks = useCallback(async () => {
    try {
      const today = new Date().toDateString();
      const taskKey = `daily_tasks_${user?.uid}_${today}`;
      const savedTasks = await AsyncStorage.getItem(taskKey);
      if (savedTasks) {
        const parsedTasks = JSON.parse(savedTasks);
        // Eski emoji iconları yeni string iconlarla değiştir
        const updatedTasks = parsedTasks.map((savedTask, index) => {
          const defaultTask = DAILY_TASKS[index];
          if (defaultTask) {
            return {
              ...defaultTask,
              current: savedTask.current || 0, // Sadece progress'i koru
            };
          }
          return savedTask;
        });
        setTasks(updatedTasks);
      } else {
        // Yeni gün, görevleri sıfırla
        const todayStr = new Date().toDateString();
        const taskKeyStr = `daily_tasks_${user?.uid}_${todayStr}`;
        const resetTasks = DAILY_TASKS.map(task => ({ ...task, current: 0 }));
        setTasks(resetTasks);
        await AsyncStorage.setItem(taskKeyStr, JSON.stringify(resetTasks));
      }
    } catch (error) {
      // console.error('Load daily tasks error:', error);
    }
  }, [user?.uid]);

  // Haftalık ilerlemeyi yükle
  const loadWeeklyProgress = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(`weekly_progress_${user?.uid}`);
      if (saved) {
        setWeeklyProgress(JSON.parse(saved));
      } else {
        const weekData = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          weekData.push({
            date: date.toDateString(),
            day: date.getDay(),
            percentage: 0,
            completedTasks: 0,
          });
        }
        setWeeklyProgress(weekData);
        await AsyncStorage.setItem(`weekly_progress_${user?.uid}`, JSON.stringify(weekData));
      }
    } catch (error) {
      // console.error('Load weekly progress error:', error);
    }
  }, [user?.uid]);

  // Bugün weekly pencerede yoksa 7 günlük pencereyi güncelle (var olan günleri koru)
  const ensureWeeklyWindowCurrent = useCallback(async () => {
    try {
      if (!user?.uid) return;
      const today = new Date();
      const todayStr = today.toDateString();

      // Eğer state boşsa, önce storage'dan hydrate et ve hiçbir şeyi ezme
      if (!weeklyProgress || weeklyProgress.length === 0) {
        const saved = await AsyncStorage.getItem(`weekly_progress_${user?.uid}`);
        if (saved) {
          setWeeklyProgress(JSON.parse(saved));
        }
        return;
      }

      const hasToday = weeklyProgress.some(d => d.date === todayStr);
      if (hasToday) return;

      const prev = weeklyProgress;
      const weekData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const str = d.toDateString();
        const prevDay = prev.find(x => x.date === str);
        weekData.push({
          date: str,
          day: d.getDay(),
          percentage: prevDay ? prevDay.percentage : 0,
          completedTasks: prevDay ? prevDay.completedTasks : 0,
        });
      }
      setWeeklyProgress(weekData);
      await AsyncStorage.setItem(`weekly_progress_${user?.uid}`, JSON.stringify(weekData));
    } catch {}
  }, [weeklyProgress, user?.uid]);

  // Görev progress'ini kaydet (ortak fonksiyon)
  const saveTaskProgress = useCallback(async (updatedTasks) => {
    try {
      const today = new Date().toDateString();
      const taskKey = `daily_tasks_${user?.uid}_${today}`;
      await AsyncStorage.setItem(taskKey, JSON.stringify(updatedTasks));

      // Haftalık ilerlemeyi güncelle
      const completedTasks = updatedTasks.filter(task => task.current >= task.target).length;
      const percentage = Math.round((completedTasks / DAILY_TASKS.length) * 100);
      // Eğer weekly'de bugün yoksa pencereyi hemen güncelle ve sonra yaz
      let baseWeekly = weeklyProgress;
      if (!baseWeekly.some(d => d.date === today)) {
        const now = new Date();
        const rebuilt = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          const str = d.toDateString();
          const prevDay = baseWeekly.find(x => x.date === str);
          rebuilt.push({
            date: str,
            day: d.getDay(),
            percentage: prevDay ? prevDay.percentage : 0,
            completedTasks: prevDay ? prevDay.completedTasks : 0,
          });
        }
        baseWeekly = rebuilt;
        setWeeklyProgress(rebuilt);
      }
      const updatedWeekly = baseWeekly.map(day => day.date === today ? { ...day, percentage, completedTasks } : day);
      setWeeklyProgress(updatedWeekly);
      await AsyncStorage.setItem(`weekly_progress_${user?.uid}`, JSON.stringify(updatedWeekly));
    } catch (error) {
      // console.error('Save task progress error:', error);
    }
  }, [user?.uid, weeklyProgress]);

  useEffect(() => {
    if (user?.uid) {
      loadDailyTasks();
      loadWeeklyProgress();
    }
  }, [user?.uid, loadDailyTasks, loadWeeklyProgress]);

  // Odağa gelince weekly pencereyi yenile (uygulama gün değiştirince doğru gün gözüksün)
  useFocusEffect(useCallback(() => {
    ensureWeeklyWindowCurrent();
  }, [ensureWeeklyWindowCurrent]));

  // İlk yüklemede haftalık progress'i başlat
  useEffect(() => {
    if (user?.uid && weeklyProgress.length === 0) {
      loadWeeklyProgress();
    }
  }, [user?.uid, weeklyProgress.length, loadWeeklyProgress]);

  // Görev tamamlama
  const completeTask = useCallback(async (taskId) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId && task.current < task.target) {
        return { ...task, current: task.current + 1 };
      }
      return task;
    });

    setTasks(updatedTasks);
    await saveTaskProgress(updatedTasks);
  }, [tasks, saveTaskProgress]);

  // Görev geri alma (uzun basma ile)
  const undoTask = useCallback(async (taskId) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId && task.current > 0) {
        return { ...task, current: task.current - 1 };
      }
      return task;
    });

    setTasks(updatedTasks);
    await saveTaskProgress(updatedTasks);
    // Modal kullanıldığı için Alert'e gerek kalmadı.
    // Alert.alert('✅', 'Görev geri alındı!');
  }, [tasks, saveTaskProgress]);

  // Toplam ilerleme hesapla
  const calculateTotalProgress = useCallback(() => {
    const completedTasks = tasks.filter(task => task.current >= task.target).length;
    return Math.round((completedTasks / tasks.length) * 100);
  }, [tasks]);

  // Progress animasyonunu güncelle
  useEffect(() => {
    const newProgress = calculateTotalProgress();
    // Animated.timing(progressAnim, { // Removed progressAnim
    //   toValue: newProgress,
    //   duration: 800,
    //   useNativeDriver: false,
    // }).start();
  }, [tasks, calculateTotalProgress]);

  // Görev kartı render et
  const renderTaskCard = useCallback((task) => {
    const isCompleted = task.current >= task.target;
    const progress = Math.min((task.current / task.target) * 100, 100);

    return (
      <TouchableOpacity
        key={task.id}
        onPress={() => completeTask(task.id)}
        onLongPress={() => {
          if (task.current > 0) {
            setSelectedTaskForUndo(task);
            setIsUndoModalVisible(true);
          } else {
            setIsInfoModalVisible(true);
          }
        }}
        activeOpacity={0.8}
        style={styles.touchableTaskCard}
      >
        <GlassmorphismView
          style={[
            styles.taskCard,
            isCompleted && styles.completedTaskCard,
          ]}
          borderRadius={12}
          blurEnabled={false}
          config={taskCardConfig}
        >
          <View style={styles.taskHeader}>
            <Image source={getIconSource(task.icon)} style={[styles.taskIcon, { tintColor: isCompleted ? theme.colors.white : theme.colors.error }]} />
            <View style={styles.taskInfo}>
              <Text style={[
                styles.taskTitle,
                { color: theme.colors.white }, // Her zaman beyaz
                isCompleted && styles.completedTaskTitle,
              ]}>
                {task.title}
              </Text>
              <Text style={styles.taskDescriptionText}>
                {task.description}
              </Text>
            </View>
            <View style={styles.taskProgress}>
              <Text style={[
                styles.progressText,
                { color: theme.colors.white },
                isCompleted && styles.completedProgressText,
              ]}>
                {task.current}/{task.target}
              </Text>
              <Text style={styles.pointsText}>{task.points} puan</Text>
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  isCompleted && styles.completedProgressBar,
                  { width: `${progress}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressPercentage, { color: theme.colors.white }]}>
              %{Math.round(progress)}
            </Text>
          </View>
        </GlassmorphismView>
      </TouchableOpacity>
    );
  }, [completeTask, taskCardConfig]);

  // Haftalık ilerleme render et
  const renderWeeklyProgress = useCallback(() => {
    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    // Eğer weeklyProgress boşsa, son 7 gün için 0 değerli geçici veri üret
    const displayData = weeklyProgress.length > 0 ? weeklyProgress : (() => {
      const today = new Date();
      const arr = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        arr.push({
          date: d.toDateString(),
          day: d.getDay(),
          percentage: 0,
          completedTasks: 0,
        });
      }
      return arr;
    })();
    return (
      <GlassmorphismView
        style={styles.weeklyContainer}
        borderRadius={16}
        blurEnabled={false}
        config={taskCardConfig}
      >
        <Text style={[styles.weeklyTitle, { color: theme.colors.white }]}>
          Son 1 Hafta İlerleme
        </Text>
        <View style={styles.weeklyChart}>
          {displayData.map((day, index) => {
            const dayName = dayNames[day.day];
            const barHeight = Math.max((day.percentage / 100) * 100, 8);
            return (
              <View key={index} style={styles.weeklyDay}>
                <View style={styles.weeklyBar}>
                  <View
                    style={[
                      styles.weeklyBarFill,
                      { height: barHeight },
                    ]}
                  />
                </View>
                <Text style={[styles.weeklyDayText, { color: theme.colors.white }]}>
                  {dayName}
                </Text>
                <Text style={[styles.weeklyPercentage, { color: theme.colors.white }]}>
                  %{day.percentage}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassmorphismView>
    );
  }, [weeklyProgress, taskCardConfig]);

  // Geri Alma Modalı
  const renderUndoModal = () => {
    // Removed modalAnim and its interpolation
    return (
      <Modal
        animationType="none"
        transparent={true}
        visible={isUndoModalVisible}
        onRequestClose={() => setIsUndoModalVisible(false)} // Removed closeModalWithAnimation
      >
        <View style={styles.modalOverlay}>
          {/* Removed Animated.View */}
            <GlassmorphismView
              style={styles.modalContainer}
              borderRadius={20}
              config={modalCardConfig}
              blurEnabled={false}
            >
              <Text style={styles.modalTitle}>Onay</Text>
              {selectedTaskForUndo && (
                <Text style={styles.modalTaskText}>
                  "{selectedTaskForUndo.title}" görevinde bir adımı geri almak istediğinizden emin misiniz?
                </Text>
              )}
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setIsUndoModalVisible(false)} // Removed closeModalWithAnimation
                >
                  <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    if (selectedTaskForUndo) {
                      undoTask(selectedTaskForUndo.id);
                    }
                    setIsUndoModalVisible(false); // Removed closeModalWithAnimation
                  }}
                >
                  <Text style={styles.modalButtonText}>Geri Al</Text>
                </TouchableOpacity>
              </View>
            </GlassmorphismView>
          {/* Removed Animated.View */}
        </View>
      </Modal>
    );
  };

  // Bilgi Modalı (Geri alınacak görev yok)
  const renderInfoModal = () => {
    // Removed modalAnim and its interpolation
    return (
      <Modal
        animationType="none"
        transparent={true}
        visible={isInfoModalVisible}
        onRequestClose={() => setIsInfoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {/* Removed Animated.View */}
            <GlassmorphismView
              style={styles.modalContainer}
              borderRadius={20}
              config={modalCardConfig}
              blurEnabled={false}
            >
              <Text style={styles.modalTitle}>Bilgi</Text>
              <Text style={styles.modalTaskText}>
                Bu görevde geri alınacak ilerleme yok.
              </Text>
            </GlassmorphismView>
          {/* Removed Animated.View */}
        </View>
      </Modal>
    );
  };

  // Arka plan görselini önceden belirle (PNG kullan) ve fade'i kapat
  const bgSource = isDark
    ? require('../assets/images/dark-bg2.png')
    : require('../assets/images/light-bg.jpg');

  return (
    <ImageBackground
      source={bgSource}
      defaultSource={bgSource}
      fadeDuration={0}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: 'transparent' }]}>
        <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        {/* Header (sabit, animasyona dahil değil) */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Günlük Görevler</Text>
              <Text style={styles.headerSubtitle}>Bugünkü görev ilerlemeni takip et</Text>
            </View>
          </View>

          <View style={styles.headerRight} />
        </View>

        {/* Header yüksekliği kadar spacer: top inset + header padding + button + bottom padding */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

      <Animatable.View animation="fadeIn" duration={350} useNativeDriver style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          {/* Toplam İlerleme */}
          <View>
            <GlassmorphismView
              style={styles.totalProgressCard}
              borderRadius={16}
              blurEnabled={false}
              config={totalProgressCardConfig}
            >
              <View style={styles.totalProgressHeader}>
                <View style={styles.totalProgressTitleContainer}>
                  <Image source={getIconSource('tasks')} style={styles.totalProgressIcon} />
                  <Text style={[styles.totalProgressTitle, { color: theme.colors.white }]}>
                    Bugünkü İlerleme
                  </Text>
                </View>

                {/* Home.js Tarzı Progress Bar */}
                <View style={styles.homeStyleProgressContainer}>
                  <View style={styles.homeStyleProgressTextContainer}>
                    <Text style={styles.homeStyleProgressText}>
                      %{calculateTotalProgress()}
                    </Text>
                  </View>
                  <View style={styles.homeStyleProgressArc}>
                    {/* Removed Animated.View */}
                    <View
                      style={[
                        styles.homeStyleProgressFill,
                        {
                        width: `${calculateTotalProgress()}%`,
                        },
                      ]}
                    />
                    {/* Removed Animated.View */}
                  </View>
                </View>
              </View>

              <View style={styles.totalProgressCircle}>
                <Text style={styles.totalProgressPercentage}>%{calculateTotalProgress()}</Text>
                <Text style={styles.totalProgressSubtitle}>
                  tamamlandı
                </Text>
                <Text style={styles.totalProgressHint}>
                  💡 Geri almak için göreve uzun basın
                </Text>
              </View>
            </GlassmorphismView>
          </View>

          {/* Görevler */}
          <View>
            <View style={styles.tasksContainer}>
              <Text style={[styles.sectionTitle, { color: isDark ? theme.colors.white : theme.colors.text }]}>
                Günlük Görevler
              </Text>
              {tasks.map(renderTaskCard)}
            </View>
          </View>

          {/* Haftalık İlerleme */}
          <View>
            {renderWeeklyProgress()}
          </View>
        </ScrollView>
        {renderUndoModal()}
        {renderInfoModal()}
      </Animatable.View>
      </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },

  // Arka Plan
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
    paddingHorizontal: theme.spacing.lg,
    // Üst padding dinamik olarak inline veriliyor (insets.top + 12)
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  headerButtonIconBack: {
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
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  totalProgressCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  totalProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  totalProgressTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalProgressIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
    tintColor: theme.colors.error,
    resizeMode: 'contain',
  },
  totalProgressTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  homeStyleProgressContainer: {
    alignItems: 'center',
    marginLeft: 20,
  },
  homeStyleProgressTextContainer: {
    marginBottom: 8,
  },
  homeStyleProgressText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  homeStyleProgressArc: {
    width: 50,
    height: 25,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'flex-start',
  },
  homeStyleProgressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '67%',
    height: '100%',
    backgroundColor: theme.colors.white,
    borderRadius: 25,
  },
  totalProgressCircle: {
    alignItems: 'center',
  },
  totalProgressPercentage: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.colors.white,
    marginBottom: 4,
  },
  totalProgressSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  totalProgressHint: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  tasksContainer: {
    marginBottom: 24,
  },
  touchableTaskCard: {
    marginBottom: 12,
  },
  taskCard: {
    borderRadius: 12,
    padding: 16,
    // marginBottom: 12, // TouchableOpacity'ye taşındı
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden', // GlassmorphismView için önemli
  },
  completedTaskCard: {
    borderColor: 'transparent',
    borderWidth: 0,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    resizeMode: 'contain',
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  completedTaskTitle: {
    color: theme.colors.error,
    textDecorationLine: 'line-through', // Üstü çizili
  },
  taskDescriptionText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  taskProgress: {
    alignItems: 'flex-end',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
  },
  completedProgressText: {
    color: theme.colors.error,
  },
  pointsText: {
    fontSize: 12,
    color: theme.colors.error,
    fontWeight: '600',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    marginRight: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.white,
    borderRadius: 3,
  },
  completedProgressBar: {
    backgroundColor: theme.colors.error,
  },
  progressPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    minWidth: 30,
  },
  weeklyContainer: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 80,
  },
  weeklyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    paddingHorizontal: 10,
  },
  weeklyDay: {
    alignItems: 'center',
    flex: 1,
  },
  weeklyBar: {
    width: 32,
    height: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 16,
    justifyContent: 'flex-end',
    marginBottom: 12,
    overflow: 'hidden',
  },
  weeklyBarFill: {
    backgroundColor: theme.colors.error,
    borderRadius: 16,
    minHeight: 8,
    width: '100%',
  },
  weeklyDayText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  weeklyPercentage: {
    fontSize: 10,
    fontWeight: '700',
  },
  // Modal Stilleri
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContainer: {
    width: '85%',
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.white,
    marginBottom: 16,
  },
  modalTaskText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  confirmButton: {
    backgroundColor: theme.colors.error,
  },
  modalButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DailyTasks;