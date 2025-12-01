import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Image,
  ImageBackground,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { makePhoneCall, sendWhatsAppMessage } from '../utils/contactUtils';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import { app } from '../firebase';
import notificationService from '../services/notificationService';
import GlassmorphismView from '../components/GlassmorphismView';
import LinearGradient from 'react-native-linear-gradient';
import { TimePickerModal } from 'react-native-paper-dates';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Animatable from 'react-native-animatable';

const Calendar = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);
  const { user } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const timeScrollViewRef = useRef(null);
  const db = getFirestore(app);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showMonthModal, setShowMonthModal] = useState(false);
  const monthModalAnim = useRef(new Animated.Value(0)).current;
  const [showAddModal, setShowAddModal] = useState(false);
  const addModalAnim = useRef(new Animated.Value(0)).current;
  const [showDetailModal, setShowDetailModal] = useState(false);
  const detailModalAnim = useRef(new Animated.Value(0)).current;
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successOpacityAnim = useRef(new Animated.Value(0)).current;
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [newAppointment, setNewAppointment] = useState({
    title: '',
    description: '',
    date: new Date(),
    time: new Date().toTimeString().slice(0, 5), // Şu anki saat (HH:MM formatında)
    type: 'meeting',
    clientName: '',
    phone: '',
  });
  const [contentReady, setContentReady] = useState(true);

  const cardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const detailModalConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.89)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const modalCardConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 255, 255, 0.8)',
    startColor: 'rgba(255, 255, 255, 0.2)',
    endColor: 'rgba(255, 255, 255, 0.1)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Production ready - randevular gerçek verilerden gelecek

  // Ay değiştiğinde bugünkü güne scroll et
  useEffect(() => {
    const scrollToToday = () => {
      const today = new Date();
      const monthDates = generateMonthDates();
      const todayIndex = monthDates.findIndex(date => 
        date.toDateString() === today.toDateString()
      );
      
      if (todayIndex !== -1 && scrollViewRef.current) {
        setTimeout(() => {
          const scrollX = Math.max(0, (todayIndex - 2) * 70);
          scrollViewRef.current.scrollTo({ x: scrollX, animated: true });
        }, 100);
      }
    };

    scrollToToday();
  }, [currentMonth, generateMonthDates]);

  // Saat modalı açıldığında seçili saate scroll et (sadece modal açılışında)
  useEffect(() => {
    if (showTimeModal && timeScrollViewRef.current) {
      const timeOptions = Array.from({ length: 24 }, (_, hour) => {
        return ['00', '30'].map(minute => {
          return `${hour.toString().padStart(2, '0')}:${minute}`;
        });
      }).flat();
      
      const selectedIndex = timeOptions.findIndex(time => time === newAppointment.time);
      
      if (selectedIndex !== -1) {
        setTimeout(() => {
          const scrollY = Math.max(0, (selectedIndex - 3) * 60);
          timeScrollViewRef.current.scrollTo({ y: scrollY, animated: true });
        }, 300); // Modal animasyonu bitsin diye biraz daha bekle
      }
    }
  }, [showTimeModal]); // newAppointment.time'ı kaldırdık

  // Firestore'dan randevuları yükle
  useEffect(() => {
    if (!user?.uid) return;

    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('userId', '==', user.uid)
      // orderBy kaldırıldı - client tarafında sıralayacağız
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const appointmentsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        appointmentsList.push({
          id: doc.id,
          ...data,
          date: data.date.toDate(), // Firestore timestamp'i Date'e çevir
        });
      });
      
      // Client tarafında tarihe göre sırala
      appointmentsList.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      setAppointments(appointmentsList);
    });

    return () => unsubscribe();
  }, [user?.uid, db]);

  const openDetailModal = (item) => {
    setSelectedAppointment(item);
    setShowDetailModal(true);
    Animated.spring(detailModalAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const closeDetailModal = useCallback(() => {
    Animated.timing(detailModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowDetailModal(false);
      setSelectedAppointment(null);
    });
  }, [detailModalAnim]);

  const handleEditPress = (appointment) => {
    const appointmentToEdit = { ...appointment };

    closeDetailModal();

    setTimeout(() => {
      setNewAppointment(appointmentToEdit);
      openAddModal();
    }, 250); // Delay to ensure modal animation completes
  };

  const openAddModal = () => {
    setShowAddModal(true);
    Animated.spring(addModalAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const closeAddModal = useCallback((onClose) => {
    Animated.timing(addModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowAddModal(false);
      // Formu temizle
      setNewAppointment({
        title: '',
        description: '',
        date: new Date(),
        time: new Date().toTimeString().slice(0, 5),
        type: 'meeting',
        clientName: '',
        phone: '',
      });
      if (onClose) {
        onClose();
      }
    });
  }, [addModalAnim]);

  const onConfirmTime = useCallback(
    ({ hours, minutes }) => {
      setShowTimeModal(false);
      const formattedHours = String(hours).padStart(2, '0');
      const formattedMinutes = String(minutes).padStart(2, '0');
      setNewAppointment(prev => ({ ...prev, time: `${formattedHours}:${formattedMinutes}` }));
    },
    [setShowTimeModal, setNewAppointment]
  );
  
  const openMonthModal = () => {
    setShowMonthModal(true);
    Animated.spring(monthModalAnim, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const closeMonthModal = useCallback(() => {
    Animated.timing(monthModalAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowMonthModal(false);
    });
  }, [monthModalAnim]);

  // Eski randevuları temizle (10 gün geçmiş)
  const cleanupOldAppointments = useCallback(async () => {
    if (!user?.uid) return;

    try {
      // 10 gün öncesinin tarihi
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const appointmentsRef = collection(db, 'appointments');
      // Sadece userId ile sorgula, tarihi client tarafında kontrol et
      const userAppointmentsQuery = query(
        appointmentsRef,
        where('userId', '==', user.uid)
      );

      const querySnapshot = await getDocs(userAppointmentsQuery);
      
      // Eski randevuları filtrele ve sil
      const deletePromises = [];
      querySnapshot.forEach((document) => {
        const data = document.data();
        const appointmentDate = data.date.toDate();
        
        // 10 gün geçmişse sil
        if (appointmentDate < tenDaysAgo) {
          deletePromises.push(deleteDoc(doc(db, 'appointments', document.id)));
        }
      });

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        // Production: Eski randevular sessizce temizlenir
      }
    } catch (error) {
      // Production: Hata sessizce loglanır, kullanıcıya gösterilmez
    }
  }, [user?.uid, db]);

  // Uygulama açıldığında eski randevuları temizle
  useEffect(() => {
    if (user?.uid) {
      cleanupOldAppointments();
    }
  }, [user?.uid, cleanupOldAppointments]);

  const showSuccessModalWithAnimation = (message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
    Animated.parallel([
      Animated.spring(successScaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(successScaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSuccessModal(false);
      });
    }, 1500);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'meeting': return require('../assets/images/icons/handshake.png');
      case 'inspection': return '🔍';
      case 'contract': return '📋';
      case 'phone': return '📞';
      default: return '📅';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'meeting': return 'Görüşme';
      case 'inspection': return 'İnceleme';
      case 'contract': return 'Sözleşme';
      case 'phone': return 'Telefon';
      default: return 'Diğer';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return theme.colors.success;
      case 'pending': return theme.colors.info;
      case 'cancelled': return theme.colors.primary;
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Onaylandı';
      case 'pending': return 'Bekliyor';
      case 'cancelled': return 'İptal';
      default: return 'Bilinmiyor';
    }
  };

  const filteredAppointments = useMemo(() => {
    return appointments.filter(appointment => {
      const appointmentDate = new Date(appointment.date);
      const selectedDateOnly = new Date(selectedDate);

      return appointmentDate.toDateString() === selectedDateOnly.toDateString();
    });
  }, [selectedDate, appointments]);

  const renderAppointmentCard = ({ item }) => (
    <TouchableOpacity
      style={styles.cardTouchable}
      onPress={() => openDetailModal(item)}
    >
      <GlassmorphismView
        style={styles.appointmentCard}
        borderRadius={theme.borderRadius.lg}
        config={cardConfig}
        blurEnabled={false}
      >
        <View style={styles.cardHeader}>
          <View style={styles.typeContainer}>
            {item.type === 'meeting' ? (
              <Image source={getTypeIcon(item.type)} style={styles.typeIconImage} />
            ) : (
              <Text style={styles.typeIcon}>{getTypeIcon(item.type)}</Text>
            )}
            <Text style={styles.typeLabel}>{getTypeLabel(item.type)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.appointmentTitle} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.appointmentDescription} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.appointmentDetails}>
          <View style={styles.cardDetailRow}>
            <Text style={styles.detailLabel}>Müşteri:</Text>
            <Text style={styles.detailValue}>{item.clientName}</Text>
          </View>

          <View style={styles.cardDetailRow}>
            <Text style={styles.detailLabel}>Saat:</Text>
            <Text style={styles.detailValue}>{item.time}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.phoneButton}
            onPress={() => makePhoneCall(item.phone)}
          >
            <Image source={require('../assets/images/icons/phonefill.png')} style={styles.buttonIcon} />
            <Text style={styles.phoneButtonText}>Ara</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.whatsappButton}
            onPress={() => sendWhatsAppMessage(item.phone, `Merhaba, ${item.title} randevusu hakkında bilgi almak istiyorum.`)}
          >
            <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.buttonIcon} />
            <Text style={styles.whatsappButtonText}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </GlassmorphismView>
    </TouchableOpacity>
  );

  const renderDateButton = (date, isSelected = false) => {
    const dayName = new Date(date).toLocaleDateString('tr-TR', { weekday: 'short' });
    const dayNumber = new Date(date).getDate();

    return (
      <TouchableOpacity
        style={[styles.dateButton, isSelected && styles.dateButtonActive]}
        onPress={() => setSelectedDate(date)}
      >
        <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>
          {dayName}
        </Text>
        <Text style={[styles.dayNumber, isSelected && styles.dayNumberActive]}>
          {dayNumber}
        </Text>
      </TouchableOpacity>
    );
  };

  const generateMonthDates = useCallback(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const dates = [];

    // Ayın tüm günlerini ekle (30-31 gün)
    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
      dates.push(new Date(date));
    }

    return dates;
  }, [currentMonth]);

  const formatMonthYear = (date) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
    });
  };

  const handleSaveAppointment = async () => {
    // Gerekli alanları kontrol et
    if (!newAppointment.title.trim() || !newAppointment.clientName.trim()) {
      Alert.alert('Uyarı', 'Lütfen randevu başlığı ve müşteri adını girin.');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Hata', 'Kullanıcı bilgisi bulunamadı.');
      return;
    }

    try {
      if (newAppointment.id) {
        // UPDATE EXISTING APPOINTMENT
        const appointmentRef = doc(db, 'appointments', newAppointment.id);
        
        const updatedAppointmentObj = {
          title: newAppointment.title.trim(),
          description: newAppointment.description.trim(),
          date: newAppointment.date,
          time: newAppointment.time,
          type: newAppointment.type,
          clientName: newAppointment.clientName.trim(),
          phone: newAppointment.phone.trim(),
          updatedAt: serverTimestamp(),
        };

        await updateDoc(appointmentRef, updatedAppointmentObj);

        if (notificationService.cancelAppointmentReminder) {
            notificationService.cancelAppointmentReminder(newAppointment.id);
        }
        const notificationResult = notificationService.scheduleAppointmentReminder({
          id: newAppointment.id,
          ...updatedAppointmentObj
        });
        if (notificationResult.success) {
          console.log('Randevu bildirimi güncellendi:', notificationResult.scheduledTime);
        }

        closeAddModal(() => {
          showSuccessModalWithAnimation('Randevu başarıyla güncellendi.');
        });
        
      } else {
        // CREATE NEW APPOINTMENT
        const newAppointmentObj = {
          userId: user.uid,
          title: newAppointment.title.trim(),
          description: newAppointment.description.trim(),
          date: selectedDate, // Use selectedDate for new appointments
          time: newAppointment.time,
          type: newAppointment.type,
          clientName: newAppointment.clientName.trim(),
          phone: newAppointment.phone.trim(),
          status: 'confirmed',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, 'appointments'), newAppointmentObj);

        const appointmentForNotification = {
          id: docRef.id,
          title: newAppointmentObj.title,
          clientName: newAppointmentObj.clientName,
          date: selectedDate,
          time: newAppointmentObj.time,
        };
        
        const notificationResult = notificationService.scheduleAppointmentReminder(appointmentForNotification);
        if (notificationResult.success) {
          console.log('Randevu bildirimi zamanlandı:', notificationResult.scheduledTime);
          
          try {
            await notificationService.sendNotification(user.uid, {
              title: '🗓️ Yeni Randevu Oluşturuldu',
              body: `${newAppointmentObj.clientName} ile randevunuz oluşturuldu`,
              data: {
                type: 'appointment_created',
                appointmentId: docRef.id,
                appointmentTitle: newAppointmentObj.title,
                clientName: newAppointmentObj.clientName,
              }
            }, 'appointment-reminders');
          } catch (error) {
            console.error('Home bildirimi gönderilemedi:', error);
          }
        }

        closeAddModal(() => {
          showSuccessModalWithAnimation('Randevu başarıyla eklendi.');
        });
      }
    } catch (error) {
      console.error("Save appointment error: ", error);
      Alert.alert('Hata', 'Randevu kaydedilirken bir hata oluştu.');
    }
  };

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.safeArea, { backgroundColor: 'transparent' }]}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
        <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        {/* Header (static, not animated) */}
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
              <Text style={styles.headerTitle}>Takvim</Text>
              <Text style={styles.headerSubtitle}>Ajandandaki randevuları yönet</Text>
            </View>
          </View>
          
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.monthBadge}
              onPress={openMonthModal}
            >
              <Text style={styles.monthBadgeText}>{formatMonthYear(currentMonth)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        <Animatable.View animation="fadeIn" duration={350} useNativeDriver style={{ flex: 1 }}>
        <FlatList
          ListHeaderComponent={
            <>
              <View style={styles.dateSelector}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  ref={scrollViewRef}
                  contentContainerStyle={styles.dateSelectorContent}
                  onContentSizeChange={() => {
                    // Bugünkü güne scroll et
                    const today = new Date();
                    const monthDates = generateMonthDates();
                    const todayIndex = monthDates.findIndex(date => 
                      date.toDateString() === today.toDateString()
                    );
                    
                    if (todayIndex !== -1 && scrollViewRef.current) {
                      // Her buton yaklaşık 70px genişliğinde, bugünkü güne scroll et
                      const scrollX = Math.max(0, (todayIndex - 2) * 70);
                      // Animasyon kapalı: açılışta kaydırma görünmesin
                      scrollViewRef.current.scrollTo({ x: scrollX, animated: false });
                    }
                  }}
                >
                  {generateMonthDates().map((date, index) => (
                    <View key={index} style={styles.dateButtonContainer}>
                      {renderDateButton(date, date.toDateString() === selectedDate.toDateString())}
                    </View>
                  ))}
                </ScrollView>
                <LinearGradient
                  colors={['#142331', 'rgba(20, 35, 49, 0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.fadeOverlayLeft}
                />
                <LinearGradient
                  colors={['rgba(20, 35, 49, 0)', '#142331']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.fadeOverlayRight}
                />
              </View>

              <View style={styles.selectedDateContainer}>
                <Text style={styles.selectedDateText}>
                  {formatDate(selectedDate)}
                </Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={openAddModal}
                >
                  <Text style={styles.addButtonText}>+ Yeni Randevu</Text>
                </TouchableOpacity>
              </View>
            </>
          }
          data={contentReady ? filteredAppointments : []}
          renderItem={({ item }) => (
            <View style={styles.appointmentItem}>
              {renderAppointmentCard({ item })}
            </View>
          )}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>Bu tarihte randevu yok</Text>
              <Text style={styles.emptySubtext}>
                Yeni randevu eklemek için + butonuna tıklayın
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContentContainer}
          initialNumToRender={6}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews
          scrollEventThrottle={16}
        />

        {/* Add Appointment Modal */}
        <Modal
          visible={showAddModal}
          animationType="none"
          transparent={true}
          onRequestClose={closeAddModal}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={[
              styles.modalAnimatedContainer,
              {
                transform: [
                  {
                    scale: addModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: addModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [100, 0],
                    }),
                  },
                ],
                opacity: addModalAnim,
              }
            ]}>
              <GlassmorphismView
                style={styles.modalContent}
                borderRadius={theme.borderRadius.lg}
                config={detailModalConfig}
                blurEnabled={false}
              >
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleContainer}>
                    <Image source={require('../assets/images/icons/handshake.png')} style={styles.modalTitleIcon} />
                    <Text style={styles.modalTitle}>{newAppointment.id ? 'Randevuyu Düzenle' : 'Yeni Randevu'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.timeBadge}
                    onPress={() => setShowTimeModal(true)}
                  >
                    <Image source={require('../assets/images/icons/time.png')} style={styles.timeBadgeIcon} />
                    <Text style={styles.timeBadgeText}>{newAppointment.time}</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="Randevu başlığı"
                    placeholderTextColor={'rgba(255, 255, 255, 0.5)'}
                    value={newAppointment.title}
                    onChangeText={(text) => setNewAppointment({...newAppointment, title: text})}
                  />

                  <TextInput
                    style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                    placeholder="Açıklama"
                    placeholderTextColor={'rgba(255, 255, 255, 0.5)'}
                    value={newAppointment.description}
                    onChangeText={(text) => setNewAppointment({...newAppointment, description: text})}
                    multiline
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Müşteri adı"
                    placeholderTextColor={'rgba(255, 255, 255, 0.5)'}
                    value={newAppointment.clientName}
                    onChangeText={(text) => setNewAppointment({...newAppointment, clientName: text})}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Telefon"
                    placeholderTextColor={'rgba(255, 255, 255, 0.5)'}
                    value={newAppointment.phone}
                    onChangeText={(text) => setNewAppointment({...newAppointment, phone: text})}
                    keyboardType="phone-pad"
                  />
                </ScrollView>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => closeAddModal()}
                  >
                    <Text style={styles.cancelButtonText}>İptal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveAppointment}
                  >
                    <Text style={styles.saveButtonText}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </GlassmorphismView>
            </Animated.View>
          </View>
        </Modal>

        {/* Time Selection Modal using react-native-paper-dates */}
        <SafeAreaProvider>
          <TimePickerModal
            visible={showTimeModal}
            onDismiss={() => setShowTimeModal(false)}
            onConfirm={onConfirmTime}
            hours={parseInt(newAppointment.time.split(':')[0], 10)}
            minutes={parseInt(newAppointment.time.split(':')[1], 10)}
            label="Saat Seçin"
            cancelLabel="İptal"
            confirmLabel="Tamam"
            animationType="fade"
            locale="tr"
            use24HourClock={true}
          />
        </SafeAreaProvider>

        {/* Appointment Detail Modal */}
        <Modal
          visible={showDetailModal}
          animationType="none"
          transparent={true}
          onRequestClose={closeDetailModal}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={[
              styles.modalAnimatedContainer,
              {
                transform: [
                  {
                    scale: detailModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: detailModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [100, 0],
                    }),
                  },
                ],
                opacity: detailModalAnim,
              }
            ]}>
              <GlassmorphismView
                style={styles.modalContent}
                borderRadius={theme.borderRadius.lg}
                config={detailModalConfig}
                blurEnabled={false}
              >
                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={closeDetailModal}
                >
                  <Image source={require('../assets/images/icons/deletephoto.png')} style={styles.closeModalButtonIcon} />
                </TouchableOpacity>

              {selectedAppointment && (
                <>
                  <View style={styles.detailModalTitleContainer}>
                    <Image source={require('../assets/images/icons/handshake.png')} style={styles.modalTitleIcon} />
                    <Text style={styles.modalTitle}>Randevu Detayı</Text>
                  </View>
                  <ScrollView style={styles.detailContent}>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Başlık:</Text>
                      <Text style={styles.detailValue}>{selectedAppointment.title}</Text>
                    </View>

                    {selectedAppointment.description ? (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.detailLabel}>Açıklama:</Text>
                        <Text style={styles.detailValue}>{selectedAppointment.description}</Text>
                      </View>
                    ) : null}

                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Müşteri:</Text>
                      <Text style={styles.detailValue}>{selectedAppointment.clientName}</Text>
                    </View>

                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Telefon:</Text>
                      <Text style={styles.detailValue}>{selectedAppointment.phone}</Text>
                    </View>

                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Tarih:</Text>
                      <Text style={styles.detailValue}>{formatDate(selectedAppointment.date)}</Text>
                    </View>

                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Saat:</Text>
                      <Text style={styles.detailValue}>{selectedAppointment.time}</Text>
                    </View>

                    <View style={styles.modalDetailRow}>
                      <Text style={styles.detailLabel}>Tür:</Text>
                      <Text style={styles.detailValue}>{getTypeLabel(selectedAppointment.type)}</Text>
                    </View>

                    <View style={[styles.modalDetailRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.detailLabel}>Durum:</Text>
                      <Text style={[styles.detailValue, { color: getStatusColor(selectedAppointment.status) }]}>
                        {getStatusLabel(selectedAppointment.status)}
                      </Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.detailActions}>
                      <TouchableOpacity
                        style={styles.phoneButton}
                        onPress={() => {
                          closeDetailModal();
                          makePhoneCall(selectedAppointment.phone);
                        }}
                      >
                        <Image source={require('../assets/images/icons/phonefill.png')} style={styles.buttonIcon} />
                        <Text style={styles.phoneButtonText}>Ara</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.whatsappButton}
                        onPress={() => {
                          closeDetailModal();
                          sendWhatsAppMessage(selectedAppointment.phone, `Merhaba, ${selectedAppointment.title} randevusu hakkında bilgi almak istiyorum.`);
                        }}
                      >
                        <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.buttonIcon} />
                        <Text style={styles.whatsappButtonText}>WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => handleEditPress(selectedAppointment)}
                >
                  <Text style={styles.saveButtonText}>Düzenle</Text>
                </TouchableOpacity>
              </View>
              </GlassmorphismView>
            </Animated.View>
          </View>
        </Modal>

        {/* Month Selection Modal */}
        <Modal
          visible={showMonthModal}
          animationType="none"
          transparent={true}
          onRequestClose={closeMonthModal}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={[
              styles.modalAnimatedContainer,
              {
                transform: [
                  {
                    scale: monthModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: monthModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [100, 0],
                    }),
                  },
                ],
                opacity: monthModalAnim,
              }
            ]}>
              <GlassmorphismView
                style={styles.modalContent}
                borderRadius={theme.borderRadius.lg}
                config={detailModalConfig}
                blurEnabled={false}
              >
                <Text style={styles.modalTitle}>Ay Seçin</Text>

                <ScrollView style={styles.monthSelector}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthDate = new Date(currentMonth.getFullYear(), i, 1);
                    const isCurrentMonth = i === currentMonth.getMonth();
                    const isToday = i === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear();
                    
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.monthOption,
                          isCurrentMonth && styles.monthOptionSelected,
                          isToday && styles.monthOptionToday
                        ]}
                        onPress={() => {
                          setCurrentMonth(monthDate);
                          // Seçili tarihi yeni ayın ilk günü yap
                          setSelectedDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
                          closeMonthModal();
                        }}
                      >
                        <Text style={[
                          styles.monthOptionText,
                          isCurrentMonth && styles.monthOptionTextSelected,
                          isToday && styles.monthOptionTextToday
                        ]}>
                          {monthDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                        </Text>
                        {isToday && <Text style={styles.todayBadge}>Bugün</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={closeMonthModal}
                  >
                    <Text style={styles.cancelButtonText}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </GlassmorphismView>
            </Animated.View>
          </View>
        </Modal>

        {/* Success Modal */}
        <Modal
          visible={showSuccessModal}
          animationType="none"
          transparent={true}
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={{
              opacity: successOpacityAnim,
              transform: [{ scale: successScaleAnim }]
            }}>
              <GlassmorphismView
                style={styles.successModalContainer}
                borderRadius={20}
                config={detailModalConfig}
                blurEnabled={false}
              >
                <View style={styles.successIcon}>
                  <Text style={styles.successIconText}>✓</Text>
                </View>
                <Text style={[styles.modalTitle, { fontSize: 22, marginBottom: 16 }]}>Başarılı!</Text>
                <Text style={styles.modalTaskText}>{successMessage}</Text>
              </GlassmorphismView>
            </Animated.View>
          </View>
        </Modal>
        </Animatable.View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const stylesFactory = (currentTheme, isDark) => StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },

  container: {
    flex: 1,
  },

  header: {
    paddingHorizontal: theme.spacing.lg,
    // Üst padding runtime'da insets.top + 12 ile veriliyor
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerButtonBack: {
    backgroundColor: currentTheme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.white,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: currentTheme.colors.white,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: currentTheme.colors.mutedText,
  },

  content: {
    flex: 1,
    paddingTop: theme.spacing.md,
  },

  contentContainer: {
    flexGrow: 1,
  },

  listContentContainer: {
    paddingBottom: 100, // Add padding to the bottom so last item is not hidden by tab bar
  },

  dateSelector: {
    backgroundColor: '#142331',
    paddingVertical: theme.spacing.md,
    position: 'relative',
  },

  dateSelectorContent: {
    paddingHorizontal: theme.spacing.lg,
  },

  fadeOverlayLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 100,
  },

  fadeOverlayRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 50,
  },

  dateButtonContainer: {
    marginRight: theme.spacing.sm,
  },

  dateButton: {
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 60,
  },

  dateButtonActive: {
    backgroundColor: currentTheme.colors.error,
    borderColor: currentTheme.colors.error,
  },

  dayName: {
    fontSize: theme.fontSizes.md,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },

  dayNameActive: {
    color: currentTheme.colors.white,
  },

  dayNumber: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: currentTheme.colors.white,
  },

  dayNumberActive: {
    color: currentTheme.colors.white,
  },

  selectedDateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    marginTop: theme.spacing.lg, // Add some top margin for spacing
    marginBottom: theme.spacing.md, // Add bottom margin for spacing
  },

  // Seçili tarih yazısı - beyaz
  selectedDateText: {
    color: currentTheme.colors.white,
  },

  addButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },

  addButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  appointmentsList: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },

  appointmentItem: {
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },

  cardTouchable: {
    borderRadius: theme.borderRadius.lg,
  },

  appointmentCard: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },

  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  typeIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },

  typeIconImage: {
    width: 20,
    height: 20,
    marginRight: theme.spacing.sm,
    tintColor: currentTheme.colors.white,
  },

  typeLabel: {
    fontSize: theme.fontSizes.xl,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: theme.fontWeights.medium,
  },

  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },

  statusText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  appointmentTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: currentTheme.colors.white,
    marginBottom: theme.spacing.sm,
  },

  appointmentDescription: {
    fontSize: theme.fontSizes.xl,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },

  appointmentDetails: {
    marginBottom: theme.spacing.md,
  },

  cardDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  detailLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: 'rgba(255, 255, 255, 0.7)',
    width: 80,
    marginRight: theme.spacing.md,
  },

  detailValue: {
    fontSize: theme.fontSizes.xl,
    color: currentTheme.colors.white,
    flex: 1,
    flexWrap: 'wrap',
  },

  cardFooter: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },

  phoneButton: {
    flex: 1,
    backgroundColor: theme.colors.info, // Changed to blue
    paddingVertical: theme.spacing.md, // Increased height
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },

  phoneButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  whatsappButton: {
    flex: 1,
    backgroundColor: theme.colors.success, // Changed to green
    paddingVertical: theme.spacing.md, // Increased height
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },

  whatsappButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  buttonIcon: {
    width: 16,
    height: 16,
    marginRight: theme.spacing.xs,
    tintColor: theme.colors.white,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },

  emptyText: {
    fontSize: theme.fontSizes.xxl,
    color: isDark ? currentTheme.colors.white : currentTheme.colors.text,
    marginBottom: 8,
    fontWeight: theme.fontWeights.semibold,
  },

  emptySubtext: {
    fontSize: theme.fontSizes.xl,
    color: isDark ? 'rgba(255, 255, 255, 0.7)' : currentTheme.colors.textSecondary,
    textAlign: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalAnimatedContainer: {
    width: '90%',
  },

  modalContent: {
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },

  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Allow container to take space
  },

  detailModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingTop: theme.spacing.md, // To avoid overlap with close button
  },

  modalTitleIcon: {
    width: 24,
    height: 24,
    tintColor: currentTheme.colors.error,
    marginRight: theme.spacing.sm,
  },

  modalTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: currentTheme.colors.white,
  },

  modalForm: {
    marginBottom: theme.spacing.lg,
  },

  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.xl,
    marginBottom: theme.spacing.md,
  },

  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },

  cancelButtonText: {
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  saveButton: {
    flex: 1,
    backgroundColor: currentTheme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },

  saveButtonText: {
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  detailContent: {
    marginVertical: theme.spacing.md,
  },

  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },

  detailLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: 'rgba(255, 255, 255, 0.7)',
    width: 80,
    marginRight: theme.spacing.md,
  },

  detailValue: {
    fontSize: theme.fontSizes.xl,
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
    flexWrap: 'wrap',
  },

  closeModalButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md, // Make it a bit more rounded for the larger size
    backgroundColor: currentTheme.colors.error, // Crimson background
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  closeModalButtonIcon: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.white,
  },

  detailActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },

  monthBadge: {
    backgroundColor: currentTheme.colors.error,
    paddingHorizontal: theme.spacing.md,
    height: 37,
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    minWidth: 100,
    alignItems: 'center',
  },

  monthBadgeText: {
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },

  monthSelector: {
    maxHeight: 400,
    marginVertical: theme.spacing.md,
  },

  monthOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },

  monthOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  monthOptionToday: {
    backgroundColor: currentTheme.colors.success + '20',
  },

  monthOptionText: {
    fontSize: theme.fontSizes.xl,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: theme.fontWeights.medium,
  },

  monthOptionTextSelected: {
    color: currentTheme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },

  monthOptionTextToday: {
    color: currentTheme.colors.success,
    fontWeight: theme.fontWeights.bold,
  },

  todayBadge: {
    backgroundColor: currentTheme.colors.success,
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },

  timeBadge: {
    backgroundColor: currentTheme.colors.error,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    minWidth: 60,
    flexDirection: 'row', // Align icon and text
    alignItems: 'center', // Align icon and text
    justifyContent: 'space-between', // Space between text and icon
  },

  timeBadgeText: {
    color: currentTheme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },

  timeBadgeIcon: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.white,
    marginRight: theme.spacing.sm,
  },

  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },

  picker: {
    flex: 1,
  },

  pickerItem: {
    color: currentTheme.colors.white,
    fontSize: 24,
  },

  pickerSeparator: {
    color: currentTheme.colors.white,
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },

  timeModalSelector: {
    maxHeight: 400,
    marginVertical: theme.spacing.md,
  },

  timeModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },

  timeModalOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  timeModalOptionText: {
    fontSize: theme.fontSizes.xl,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: theme.fontWeights.medium,
  },

  timeModalOptionTextSelected: {
    color: currentTheme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },

  timeSelectedIcon: {
    fontSize: theme.fontSizes.lg,
    color: currentTheme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },

  successModalContainer: {
    width: '85%',
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },

  modalTaskText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },

  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },

  successIconText: {
    fontSize: 30,
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },

  timePickerModalContent: {
    borderRadius: 16,
    padding: theme.spacing.lg,
    width: '100%',
    overflow: 'hidden',
  },
});

export default Calendar;
