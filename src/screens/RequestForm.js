import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Animated,
  Modal,
  Switch,
  PanResponder,
  FlatList,
  Image,
  ActivityIndicator,
  ImageBackground,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
// Removed legacy static theme import; using dynamic theme via useTheme
import { useTheme } from '../theme/ThemeContext';
import { addRequest } from '../services/firestore';
import reminderScheduler from '../services/reminderScheduler';
import { getNeighborhoodsForDistricts } from '../services/neighborhoodService';
import { selectContact } from 'react-native-select-contact';
import Contacts from 'react-native-contacts';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const RangeSlider = ({ label, field, min, max, step, formatValue, formData, handleSliderChange, styles }) => {
  const currentValues = formData[field];
  const minValue = currentValues[0];
  const maxValue = currentValues[1];

  const [trackWidth, setTrackWidth] = useState(280);
  const [activeThumb, setActiveThumb] = useState(null);
  const lastUpdateRef = useRef(0);
  const updateTimeoutRef = useRef(null);
  const trackRef = useRef(null);

  // Animated label scales and slight translate to center
  const minLabelScale = useRef(new Animated.Value(1)).current;
  const maxLabelScale = useRef(new Animated.Value(1)).current;
  const minLabelTranslate = useRef(new Animated.Value(0)).current;
  const maxLabelTranslate = useRef(new Animated.Value(0)).current;

  const minPercentage = Math.max(0, Math.min(100, ((minValue - min) / (max - min)) * 100));
  const maxPercentage = Math.max(0, Math.min(100, ((maxValue - min) / (max - min)) * 100));

  const calculateValueFromPosition = useCallback((x) => {
    // Thumb genişliği kadar padding bırak
    const thumbPadding = 14; // 28px thumb width / 2
    const effectiveWidth = trackWidth - (thumbPadding * 2);
    const percentage = Math.max(0, Math.min(1, (x - thumbPadding) / effectiveWidth));
    const newValue = Math.round((percentage * (max - min) + min) / step) * step;
    return newValue;
  }, [trackWidth, min, max, step]);

  const debouncedSliderChange = useCallback((fieldParam, values) => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 16) { // ~60fps
      lastUpdateRef.current = now;
      handleSliderChange(fieldParam, values);
    } else {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        handleSliderChange(fieldParam, values);
      }, 16);
    }
  }, [handleSliderChange]);

  const handleTrackPress = useCallback((event) => {
    const { locationX } = event.nativeEvent;
    const newValue = calculateValueFromPosition(locationX);

    // Calculate actual thumb positions (accounting for thumb width)
    const minThumbPosition = Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28)));
    const maxThumbPosition = Math.max(0, Math.min(trackWidth - 28, (maxPercentage / 100) * (trackWidth - 28)));

    // Determine which thumb is closer to the press point
    const minDistance = Math.abs(locationX - minThumbPosition);
    const maxDistance = Math.abs(locationX - maxThumbPosition);

    if (minDistance <= maxDistance) {
      // Move min thumb
      const newMinValue = Math.min(newValue, maxValue - step);
      debouncedSliderChange(field, [newMinValue, maxValue]);
    } else {
      // Move max thumb
      const newMaxValue = Math.max(newValue, minValue + step);
      debouncedSliderChange(field, [minValue, newMaxValue]);
    }
  }, [calculateValueFromPosition, minPercentage, maxPercentage, trackWidth, minValue, maxValue, step, field, debouncedSliderChange]);

  const createPanResponder = useCallback((thumbType) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      setActiveThumb(thumbType);
    },
    onPanResponderMove: (event, gestureState) => {
      const { moveX } = gestureState;
      // Get the container position and calculate relative position
      if (trackRef.current) {
        trackRef.current.measure((x, y, width, height, pageX, pageY) => {
          const relativeX = moveX - pageX;
          const newValue = calculateValueFromPosition(relativeX);

          if (thumbType === 'min') {
            const newMinValue = Math.min(Math.max(newValue, min), maxValue - step);
            if (newMinValue !== minValue) {
              debouncedSliderChange(field, [newMinValue, maxValue]);
            }
          } else {
            const newMaxValue = Math.max(Math.min(newValue, max), minValue + step);
            if (newMaxValue !== maxValue) {
              debouncedSliderChange(field, [minValue, newMaxValue]);
            }
          }
        });
      }
    },
    onPanResponderRelease: () => {
      setActiveThumb(null);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    },
  }), [min, max, step, minValue, maxValue, field, debouncedSliderChange]);

  const minPanResponder = createPanResponder('min');
  const maxPanResponder = createPanResponder('max');

  const handleTrackLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
  }, []);

  // Animate labels like in RequestDetail when dragging
  useEffect(() => {
    if (activeThumb === 'min') {
      Animated.spring(minLabelScale, { toValue: 1.3, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.timing(minLabelTranslate, { toValue: 10, duration: 120, useNativeDriver: true }).start();
      Animated.spring(maxLabelScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.timing(maxLabelTranslate, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    } else if (activeThumb === 'max') {
      Animated.spring(maxLabelScale, { toValue: 1.3, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.timing(maxLabelTranslate, { toValue: -10, duration: 120, useNativeDriver: true }).start();
      Animated.spring(minLabelScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.timing(minLabelTranslate, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    } else {
      // neutral
      Animated.spring(minLabelScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.spring(maxLabelScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 }).start();
      Animated.timing(minLabelTranslate, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      Animated.timing(maxLabelTranslate, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
  }, [activeThumb, minLabelScale, maxLabelScale, minLabelTranslate, maxLabelTranslate]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <View style={styles.rangeLabels}>
        <Animated.Text style={[styles.rangeLabel, { transform: [{ scale: minLabelScale }, { translateX: minLabelTranslate }] }]}>
          {formatValue(minValue)}
        </Animated.Text>
        <Animated.Text style={[styles.rangeLabel, { transform: [{ scale: maxLabelScale }, { translateX: maxLabelTranslate }] }]}>
          {formatValue(maxValue)}
        </Animated.Text>
      </View>
      <TouchableOpacity
        ref={trackRef}
        style={styles.sliderTrack}
        onPress={handleTrackPress}
        activeOpacity={1}
        onLayout={handleTrackLayout}
      >
        <View
          style={[
            styles.sliderProgress,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28))) + 14,
              width: Math.max(0, ((maxPercentage - minPercentage) / 100) * (trackWidth - 28)),
            },
          ]}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28))),
            },
            activeThumb === 'min' && styles.sliderThumbActive,
          ]}
          {...minPanResponder.panHandlers}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (maxPercentage / 100) * (trackWidth - 28))),
            },
            activeThumb === 'max' && styles.sliderThumbActive,
          ]}
          {...maxPanResponder.panHandlers}
        />
      </TouchableOpacity>
    </View>
  );
};

const RequestForm = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { theme: currentTheme, isDark } = useTheme();
  const pageViewRef = useRef(null);
  const insets = useSafeAreaInsets();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [isContactsModalVisible, setIsContactsModalVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const modalAnimation = useRef(new Animated.Value(0)).current;
  
  const glassmorphismConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const modalGlassmorphismConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgb(5, 11, 15)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Neighborhood loading state
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState([]);
  const [lastLoadedDistricts, setLastLoadedDistricts] = useState([]);

  const cities = useMemo(() => [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
    'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
    'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane',
    'Hakkari', 'Hatay', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu',
    'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
    'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun',
    'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van',
    'Yalova', 'Yozgat', 'Zonguldak',
  ].sort(), []);

  // Portföy tipleri (PropertyDetail ile uyumlu)
  const propertyTypes = useMemo(() => ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Bina'], []);

  const cityDistricts = useMemo(() => ({
    'Adana': ['Aladağ', 'Ceyhan', 'Çukurova', 'Feke', 'İmamoğlu', 'Karaisalı', 'Karataş', 'Kozan', 'Pozantı', 'Saimbeyli', 'Sarıçam', 'Seyhan', 'Tufanbeyli', 'Yumurtalık', 'Yüreğir'],
    'Adıyaman': ['Adıyaman', 'Besni', 'Çelikhan', 'Gerger', 'Gölbaşı', 'Kahta', 'Samsat', 'Sincik', 'Tut'],
    'Afyonkarahisar': ['Afyonkarahisar', 'Başmakçı', 'Bayat', 'Bolvadin', 'Çay', 'Çobanlar', 'Dazkırı', 'Dinar', 'Emirdağ', 'Evciler', 'Hocalar', 'İhsaniye', 'İscehisar', 'Kızılören', 'Sandıklı', 'Sinanpaşa', 'Sultandağı', 'Şuhut'],
    'Ağrı': ['Ağrı', 'Diyadin', 'Doğubayazıt', 'Eleşkirt', 'Hamur', 'Patnos', 'Taşlıçay', 'Tutak'],
    'Amasya': ['Amasya', 'Göynücek', 'Gümüşhacıköy', 'Hamamözü', 'Merzifon', 'Suluova', 'Taşova'],
    'Ankara': ['Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk', 'Elmadağ', 'Etimesgut', 'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kalecik', 'Kahramankazan', 'Keçiören', 'Kızılcahamam', 'Mamak', 'Nallıhan', 'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle'],
    'Antalya': ['Akseki', 'Aksu', 'Alanya', 'Demre', 'Döşemealtı', 'Elmalı', 'Finike', 'Gazipaşa', 'Gündoğmuş', 'İbradı', 'Kaş', 'Kemer', 'Kepez', 'Konyaaltı', 'Korkuteli', 'Kumluca', 'Manavgat', 'Muratpaşa', 'Serik'],
    'Artvin': ['Artvin', 'Ardanuç', 'Arhavi', 'Borçka', 'Hopa', 'Kemalpaşa', 'Murgul', 'Şavşat', 'Yusufeli'],
    'Aydın': ['Bozdoğan', 'Buharkent', 'Çine', 'Didim', 'Efeler', 'Germencik', 'İncirliova', 'Karacasu', 'Karpuzlu', 'Koçarlı', 'Köşk', 'Kuşadası', 'Kuyucak', 'Nazilli', 'Söke', 'Sultanhisar', 'Yenipazar'],
    'Balıkesir': ['Ayvalık', 'Balya', 'Bandırma', 'Bigadiç', 'Burhaniye', 'Dursunbey', 'Edremit', 'Erdek', 'Gömeç', 'Gönen', 'Havran', 'İvrindi', 'Karesi', 'Kepsut', 'Manyas', 'Marmara', 'Savaştepe', 'Sındırgı', 'Susurluk'],
    'Bilecik': ['Bilecik', 'Bozüyük', 'Gölpazarı', 'İnhisar', 'Osmaneli', 'Pazaryeri', 'Söğüt', 'Yenipazar'],
    'Bingöl': ['Adaklı', 'Bingöl', 'Genç', 'Karlıova', 'Kiğı', 'Solhan', 'Yayladere', 'Yedisu'],
    'Bitlis': ['Adilcevaz', 'Ahlat', 'Bitlis', 'Güroymak', 'Hizan', 'Mutki', 'Tatvan'],
    'Bolu': ['Bolu', 'Dörtdivan', 'Gerede', 'Göynük', 'Kıbrıscık', 'Mengen', 'Mudurnu', 'Seben', 'Yeniçağa'],
    'Burdur': ['Ağlasun', 'Altınyayla', 'Bucak', 'Burdur', 'Çavdır', 'Çeltikçi', 'Gölhisar', 'Karamanlı', 'Kemer', 'Tefenni', 'Yeşilova'],
    'Bursa': ['Büyükorhan', 'Gemlik', 'Gürsu', 'Harmancık', 'İnegöl', 'İznik', 'Karacabey', 'Keles', 'Kestel', 'Mudanya', 'Mustafakemalpaşa', 'Nilüfer', 'Orhaneli', 'Orhangazi', 'Osmangazi', 'Yenişehir', 'Yıldırım'],
    'Çanakkale': ['Ayvacık', 'Bayramiç', 'Biga', 'Bozcaada', 'Çan', 'Çanakkale', 'Eceabat', 'Ezine', 'Gelibolu', 'Gökçeada', 'Lapseki', 'Merkez', 'Yenice'],
    'Çankırı': ['Atkaracalar', 'Bayramören', 'Çankırı', 'Çerkeş', 'Eldivan', 'Ilgaz', 'Kızılırmak', 'Korgun', 'Kurşunlu', 'Orta', 'Şabanözü', 'Yapraklı'],
    'Çorum': ['Alaca', 'Bayat', 'Boğazkale', 'Çorum', 'Dodurga', 'İskilip', 'Kargı', 'Laçin', 'Mecitözü', 'Oğuzlar', 'Ortaköy', 'Osmancık', 'Sungurlu', 'Uğurludağ'],
    'Denizli': ['Acıpayam', 'Babadağ', 'Baklan', 'Bekilli', 'Beyağaç', 'Bozkurt', 'Buldan', 'Çal', 'Çameli', 'Çardak', 'Çivril', 'Güney', 'Honaz', 'Kale', 'Merkezefendi', 'Pamukkale', 'Sarayköy', 'Serinhisar', 'Tavas'],
    'Diyarbakır': ['Bağlar', 'Bismil', 'Çermik', 'Çınar', 'Çüngüş', 'Dicle', 'Eğil', 'Ergani', 'Hani', 'Hazro', 'Kayapınar', 'Kocaköy', 'Kulp', 'Lice', 'Silvan', 'Sur', 'Yenişehir'],
    'Düzce': ['Akçakoca', 'Cumayeri', 'Çilimli', 'Düzce', 'Gölyaka', 'Gümüşova', 'Kaynaşlı', 'Yığılca'],
    'Edirne': ['Edirne', 'Enez', 'Havsa', 'İpsala', 'Keşan', 'Lalapaşa', 'Meriç', 'Merkez', 'Süloğlu', 'Uzunköprü'],
    'Elazığ': ['Ağın', 'Alacakaya', 'Arıcak', 'Baskil', 'Elazığ', 'Karakoçan', 'Keban', 'Kovancılar', 'Maden', 'Palu', 'Sivrice'],
    'Erzincan': ['Çayırlı', 'Erzincan', 'İliç', 'Kemah', 'Kemaliye', 'Otlukbeli', 'Refahiye', 'Tercan', 'Üzümlü'],
    'Erzurum': ['Aşkale', 'Aziziye', 'Çat', 'Hınıs', 'Horasan', 'İspir', 'Karaçoban', 'Karayazı', 'Köprüköy', 'Narman', 'Oltu', 'Olur', 'Palandöken', 'Pasinler', 'Pazaryolu', 'Şenkaya', 'Tekman', 'Tortum', 'Uzundere', 'Yakutiye'],
    'Eskişehir': ['Alpu', 'Beylikova', 'Çifteler', 'Günyüzü', 'Han', 'İnönü', 'Mahmudiye', 'Mihalgazi', 'Mihalıççık', 'Odunpazarı', 'Sarıcakaya', 'Seyitgazi', 'Sivrihisar', 'Tepebaşı'],
    'Gaziantep': ['Araban', 'İslahiye', 'Karkamış', 'Nizip', 'Nurdağı', 'Oğuzeli', 'Şahinbey', 'Şehitkamil', 'Yavuzeli'],
    'Giresun': ['Alucra', 'Bulancak', 'Çamoluk', 'Çanakçı', 'Dereli', 'Doğankent', 'Espiye', 'Eynesil', 'Giresun', 'Görele', 'Güce', 'Keşap', 'Piraziz', 'Şebinkarahisar', 'Tirebolu', 'Yağlıdere'],
    'Gümüşhane': ['Gümüşhane', 'Kelkit', 'Köse', 'Kürtün', 'Şiran', 'Torul'],
    'Hakkari': ['Çukurca', 'Derecik', 'Hakkari', 'Şemdinli', 'Yüksekova'],
    'Hatay': ['Altınözü', 'Antakya', 'Arsuz', 'Belen', 'Defne', 'Dörtyol', 'Erzin', 'Hassa', 'İskenderun', 'Kırıkhan', 'Kumlu', 'Payas', 'Reyhanlı', 'Samandağ', 'Yayladağı'],
    'Isparta': ['Aksu', 'Atabey', 'Eğirdir', 'Gelendost', 'Gönen', 'Isparta', 'Keçiborlu', 'Senirkent', 'Sütçüler', 'Şarkikaraağaç', 'Uluborlu', 'Yalvaç', 'Yenişarbademli'],
    'İstanbul': ['Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir', 'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy', 'Esenler', 'Esenyurt', 'Eyüp', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane', 'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Şile', 'Şişli', 'Sultanbeyli', 'Sultangazi', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'],
    'İzmir': ['Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca', 'Çeşme', 'Çiğli', 'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun', 'Karşıyaka', 'Kemalpaşa', 'Kınık', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla'],
    'Kahramanmaraş': ['Afşin', 'Andırın', 'Çağlayancerit', 'Dulkadiroğlu', 'Ekinözü', 'Elbistan', 'Göksun', 'Nurhak', 'Onikişubat', 'Pazarcık', 'Türkoğlu'],
    'Karabük': ['Eflani', 'Eskipazar', 'Karabük', 'Ovacık', 'Safranbolu', 'Yenice'],
    'Karaman': ['Ayrancı', 'Başyayla', 'Ermenek', 'Karaman', 'Kazımkarabekir', 'Sarıveliler'],
    'Kars': ['Akyaka', 'Arpaçay', 'Digor', 'Kağızman', 'Kars', 'Sarıkamış', 'Selim', 'Susuz'],
    'Kastamonu': ['Abana', 'Ağlı', 'Araç', 'Azdavay', 'Bozkurt', 'Cide', 'Çatalzeytin', 'Daday', 'Devrekani', 'Doğanyurt', 'Hanönü', 'İhsangazi', 'İnebolu', 'Kastamonu', 'Küre', 'Pınarbaşı', 'Şenpazar', 'Taşköprü', 'Tosya'],
    'Kayseri': ['Akkışla', 'Bünyan', 'Develi', 'Felahiye', 'Hacılar', 'İncesu', 'Kocasinan', 'Melikgazi', 'Özvatan', 'Pınarbaşı', 'Sarıoğlan', 'Sarız', 'Talas', 'Tomarza', 'Yahyalı', 'Yeşilhisar'],
    'Kırıkkale': ['Bahşılı', 'Balışeyh', 'Çelebi', 'Delice', 'Karakeçili', 'Keskin', 'Kırıkkale', 'Sulakyurt', 'Yahşihan'],
    'Kırklareli': ['Babaeski', 'Demirköy', 'Kırklareli', 'Kofçaz', 'Lüleburgaz', 'Pehlivanköy', 'Pınarhisar', 'Vize'],
    'Kırşehir': ['Akçakent', 'Akpınar', 'Boztepe', 'Çiçekdağı', 'Kaman', 'Kırşehir', 'Mucur'],
    'Kilis': ['Elbeyli', 'Kilis', 'Musabeyli', 'Polateli'],
    'Kocaeli': ['Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Dilovası', 'Gebze', 'Gölcük', 'İzmit', 'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez', 'Nilüfer'],
    'Konya': ['Ahırlı', 'Akören', 'Akşehir', 'Altınekin', 'Beyşehir', 'Bozkır', 'Cihanbeyli', 'Çeltik', 'Çumra', 'Derbent', 'Derebucak', 'Doğanhisar', 'Emirgazi', 'Ereğli', 'Güneysınır', 'Hadım', 'Halkapınar', 'Hüyük', 'Ilgın', 'Kadınhanı', 'Karapınar', 'Karatay', 'Kulu', 'Meram', 'Sarayönü', 'Selçuklu', 'Seydişehir', 'Taşkent', 'Tuzlukçu', 'Yalıhüyük', 'Yunak'],
    'Kütahya': ['Altıntaş', 'Aslanapa', 'Çavdarhisar', 'Domaniç', 'Dumlupınar', 'Emet', 'Gediz', 'Hisarcık', 'Kütahya', 'Pazarlar', 'Şaphane', 'Simav', 'Tavşanlı'],
    'Malatya': ['Akçadağ', 'Arapgir', 'Arguvan', 'Battalgazi', 'Darende', 'Doğanşehir', 'Doğanyol', 'Hekimhan', 'Kale', 'Kuluncak', 'Malatya', 'Pötürge', 'Yazıhan', 'Yeşilyurt'],
    'Manisa': ['Ahmetli', 'Akhisar', 'Alaşehir', 'Demirci', 'Gölmarmara', 'Gördes', 'Kırkağaç', 'Köprübaşı', 'Kula', 'Salihli', 'Sarıgöl', 'Saruhanlı', 'Selendi', 'Soma', 'Şehzadeler', 'Turgutlu', 'Yunusemre'],
    'Mardin': ['Artuklu', 'Dargeçit', 'Derik', 'Kızıltepe', 'Mazıdağı', 'Midyat', 'Nusaybin', 'Ömerli', 'Savur', 'Yeşilli'],
    'Mersin': ['Akdeniz', 'Anamur', 'Aydıncık', 'Bozyazı', 'Çamlıyayla', 'Erdemli', 'Gülnar', 'Mezitli', 'Mut', 'Silifke', 'Tarsus', 'Toroslar', 'Yenişehir'],
    'Muğla': ['Bodrum', 'Dalaman', 'Datça', 'Fethiye', 'Kavaklıdere', 'Köyceğiz', 'Marmaris', 'Menteşe', 'Milas', 'Ortaca', 'Sevkiler', 'Ula', 'Yatağan'],
    'Muş': ['Bulanık', 'Hasköy', 'Korkut', 'Malazgirt', 'Muş', 'Varto'],
    'Nevşehir': ['Acıgöl', 'Avanos', 'Derinkuyu', 'Gülşehir', 'Hacıbektaş', 'İhsangazi', 'Kozaklı', 'Nevşehir', 'Ürgüp'],
    'Niğde': ['Altunhisar', 'Bor', 'Çamardı', 'Çiftlik', 'Niğde', 'Ulukışla'],
    'Ordu': ['Akkuş', 'Altınordu', 'Aybastı', 'Çamaş', 'Çatalpınar', 'Çaybaşı', 'Fatsa', 'Gölköy', 'Gürgentepe', 'İkizce', 'Kabadüz', 'Kabataş', 'Korgan', 'Kumru', 'Mesudiye', 'Perşembe', 'Ulubey', 'Ünye'],
    'Osmaniye': ['Bahçe', 'Düziçi', 'Hasanbeyli', 'Kadirli', 'Osmaniye', 'Sumbas', 'Toprakkale'],
    'Rize': ['Ardeşen', 'Çamlıhemşin', 'Çayeli', 'Derepazarı', 'Fındıklı', 'Güneysu', 'Hemşin', 'İkizdere', 'İyidere', 'Kalkandere', 'Pazar', 'Rize'],
    'Sakarya': ['Adapazarı', 'Akyazı', 'Arifiye', 'Erenler', 'Ferizli', 'Geyve', 'Hendek', 'Karapürçek', 'Karasu', 'Kaynarca', 'Kocaali', 'Pamukova', 'Sapanca', 'Serdivan', 'Söğütlü', 'Taraklı'],
    'Samsun': ['Alaçam', 'Asarcık', 'Atakum', 'Ayvacık', 'Bafra', 'Canik', 'Çarşamba', 'Havza', 'İlkadım', 'Kavak', 'Ladik', 'Salıpazarı', 'Tekkeköy', 'Terme', 'Vezirköprü', 'Yakakent'],
    'Siirt': ['Baykan', 'Eruh', 'Kurtalan', 'Pervari', 'Siirt', 'Şirvan', 'Tillo'],
    'Sinop': ['Ayancık', 'Boyabat', 'Dikmen', 'Durağan', 'Erfelek', 'Gerze', 'Saraydüzü', 'Sinop', 'Türkeli'],
    'Sivas': ['Akıncılar', 'Altınyayla', 'Divriği', 'Doğanşar', 'Gemerek', 'Gölova', 'Hafik', 'İmranlı', 'Kangal', 'Koyulhisar', 'Sivas', 'Suşehri', 'Şarkışla', 'Ulaş', 'Yıldızeli', 'Zara'],
    'Şanlıurfa': ['Akçakale', 'Birecik', 'Bozova', 'Ceylanpınar', 'Eyyübiye', 'Halfeti', 'Haliliye', 'Harran', 'Hilvan', 'Karaköprü', 'Siverek', 'Suruç', 'Viranşehir'],
    'Şırnak': ['Beytüşşebap', 'Cizre', 'Güçlükonak', 'İdil', 'Silopi', 'Şırnak', 'Uludere'],
    'Tekirdağ': ['Çerkezköy', 'Çorlu', 'Ergene', 'Hayrabolu', 'Kapaklı', 'Malkara', 'Marmaraereğlisi', 'Muratlı', 'Saray', 'Süleymanpaşa', 'Şarköy'],
    'Tokat': ['Almus', 'Artova', 'Başçiftlik', 'Erbaa', 'Niksar', 'Pazar', 'Reşadiye', 'Sulusaray', 'Tokat', 'Turhal', 'Yeşilyurt', 'Zile'],
    'Trabzon': ['Akçaabat', 'Araklı', 'Arsin', 'Beşikdüzü', 'Çarşıbaşı', 'Çaykara', 'Dernekpazarı', 'Düzköy', 'Hayrat', 'Köprübaşı', 'Maçka', 'Of', 'Ortahisar', 'Şalpazarı', 'Sürmene', 'Tonya', 'Vakfıkebir', 'Yomra'],
    'Tunceli': ['Çemişgezek', 'Hozat', 'Mazgirt', 'Nazımiye', 'Ovacık', 'Pertek', 'Pülümür', 'Tunceli'],
    'Uşak': ['Banaz', 'Eşme', 'Karahallı', 'Sivaslı', 'Ulubey', 'Uşak'],
    'Van': ['Bahçesaray', 'Başkale', 'Çaldıran', 'Çatak', 'Edremit', 'Erciş', 'Gevaş', 'Gürpınar', 'İpekyolu', 'Muradiye', 'Özalp', 'Saray', 'Tuşba'],
    'Yalova': ['Altınova', 'Armutlu', 'Çiftlikköy', 'Çınarcık', 'Termal', 'Yalova'],
    'Yozgat': ['Akdağmadeni', 'Aydıncık', 'Boğazlıyan', 'Çandır', 'Çayıralan', 'Çekerek', 'Kadışehri', 'Saraykent', 'Sarıkaya', 'Sorgun', 'Şefaatli', 'Yenifakılı', 'Yerköy', 'Yozgat'],
    'Zonguldak': ['Alaplı', 'Çaycuma', 'Devrek', 'Ereğli', 'Gökçebey', 'Karadeniz Ereğli', 'Zonguldak'],
  }), []);

  // legacy inline districtNeighborhoods removed; neighborhoods are loaded from service
  /* const districtNeighborhoods = useMemo(() => ({
    // Samsun
    'Atakum': ['Aksu', 'Alanlı', 'Atakent', 'Balaç', 'Beypınar', 'Büyükkolpınar', 'Cumhuriyet', 'Çamlıyazı', 'Çatalçam', 'Denizevleri', 'Elmaçukuru', 'Erikli', 'Esenevler', 'Güzelyalı', 'İncesu', 'İstiklal', 'Karakavuk', 'Kamalı', 'Kesilli', 'Körfez', 'Küçükkolpınar', 'Mevlana', 'Mimar Sinan', 'Taflan', 'Yeni Mahalle', 'Yeşiltepe'],
    'İlkadım': ['19 Mayıs', 'Baruthane', 'Çiftlik', 'Gültepe', 'Hançerli', 'İlkadım Mahallesi', 'Kışla', 'Kurupelit', 'Mimar Sinan', 'Muratlı', 'Pazar', 'Reşatbey', 'Selahiye', 'Taşhan', 'Tekkeköy', 'Yeni Resatbey', 'Zafer'],
    'Canik': ['Canik', 'Çiftlikköy', 'Dereköy', 'İncesu', 'Kavaklık', 'Kurupelit', 'Mimar Sinan', 'Pazar', 'Reşatbey', 'Selahiye'],
    'Tekkeköy': ['Çiftlik', 'Dereköy', 'İncesu', 'Kavaklık', 'Kurupelit', 'Tekkeköy'],
    'Bafra': ['Bafra', 'Çetinkaya', 'Gökçe', 'İncesu', 'Kavaklık'],
    'Çarşamba': ['Çarşamba', 'Dereköy', 'İncesu', 'Kavaklık'],

    // İstanbul
    'Kadıköy': ['Acıbadem', 'Caddebostan', 'Erenköy', 'Fenerbahçe', 'Feneryolu', 'Göztepe', 'Hasanpaşa', 'Kadıköy', 'Koşuyolu', 'Kozyatağı', 'Merdivenköy', 'Osmanağa', 'Rasihbey', 'Sahrayıcedit', 'Selamiçeşme', 'Zühtüpaşa'],
    'Beşiktaş': ['Abbasağa', 'Arnavutköy', 'Beşiktaş', 'Bozdoğan', 'Cihannüma', 'Çırağan', 'Etiler', 'Gayrettepe', 'Kuruçeşme', 'Levent', 'Ortaköy', 'Sinanpaşa', 'Türkali', 'Ulus', 'Visnezade'],
    'Şişli': ['Bomonti', 'Esentepe', 'Fulya', 'Harbiye', 'Kurtuluş', 'Mecidiyeköy', 'Merkez', 'Teşvikiye', 'Yeniköy'],

    // Ankara
    'Çankaya': ['Bahçelievler', 'Çankaya', 'Gaziosmanpaşa', 'Kızılay', 'Kurtuluş', 'Maltepe', 'Sıhhiye', 'Tandoğan', 'Ümitköy', 'Yıldızevler'],
    'Keçiören': ['Etlik', 'Keçiören', 'Sincan', 'Yenimahalle'],
    'Mamak': ['Mamak', 'Sincan', 'Yenimahalle'],

    // İzmir
    'Konak': ['Alsancak', 'Göztepe', 'Güzelyalı', 'Karantina', 'Kemeraltı', 'Konak', 'Mersinli', 'Pasaport'],
    'Karşıyaka': ['Bahçelievler', 'Çarşı', 'Donanmacı', 'Mavişehir', 'Yalı'],
    'Bornova': ['Bornova', 'Çınarlı', 'Eğitim', 'Evka 3', 'Karacaoğlan'],

    // Antalya
    'Muratpaşa': ['Bahçelievler', 'Güzeloluk', 'Kepez', 'Kızıltoprak', 'Lara', 'Muratpaşa', 'Şirinyalı'],
    'Konyaaltı': ['Gürsu', 'Konyaaltı', 'Liman', 'Sarısu'],
    'Kepez': ['Akdeniz', 'Altınova', 'Kepez', 'Sinan'],

    // Bursa
    'Osmangazi': ['Çekirge', 'Demirtaş', 'Fatih', 'Gürsu', 'İhsaniye', 'Mimar Sinan', 'Osmangazi', 'Yıldırım'],
    'Nilüfer': ['Alaaddinbey', 'Çalı', 'Fethiye', 'İhsaniye', 'Nilüfer', 'Uludağ'],
    'Yıldırım': ['Bağlarbaşı', 'Barış', 'Çınarlı', 'Çirişhane', 'Fatih', 'Hürriyet', 'Küçükkumla', 'Yıldırım'],

    // Kocaeli
    'İzmit': ['Akçakoca', 'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Diliktaşı', 'Gölcük', 'İzmit', 'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez'],
    'Gebze': ['Gebze', 'Kavaklı', 'Tavşancıl', 'Yuvacık'],
    'Darıca': ['Darıca', 'Fatih', 'Yenikent'],

    // Konya
    'Selçuklu': ['Akyokuş', 'Beyhekim', 'Çarşı', 'Fatih', 'Ferhuniye', 'Karaman', 'Karatay', 'Meram', 'Selçuklu', 'Yunusemre'],
    'Karatay': ['Alaaddin', 'Aziziye', 'Fatih', 'Hacı Hasan', 'Karatay', 'Selçuklu'],
    'Meram': ['Aydınlıkevler', 'Çaybaşı', 'Fatih', 'Kazımkarabekir', 'Meram', 'Selçuklu'],

    // Diyarbakır
    'Sur': ['Dağkapı', 'Hançepek', 'Lalebey', 'Sur', 'Yenikapı'],
    'Yenişehir': ['Fatih', 'Hançepek', 'Yenişehir', 'Yeniköy'],
    'Bağlar': ['Bağcılar', 'Fatih', 'Gözlüce', 'Kocaköy'],

    // Gaziantep
    'Şehitkamil': ['Aktoprak', 'Burç', 'Çukur', 'Fatih', 'Güzelevler', 'İncilipınar', 'Karşıyaka', 'Şehitkamil'],
    'Şahinbey': ['Fatih', 'Gültepe', 'İncirli', 'Şahinbey', 'Yeşilce'],
    'Oğuzeli': ['Oğuzeli', 'Yeniyurt'],

    // Kayseri
    'Melikgazi': ['Fatih', 'Güneşli', 'Hunat', 'Melikgazi', 'Talas', 'Yakut'],
    'Kocasinan': ['Anbar', 'Fatih', 'Kocasinan', 'Mimarsinan', 'Yakut'],
    'Talas': ['Hisarcık', 'Mimarsinan', 'Talas', 'Yakut'],
  }), []); */

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    listingStatus: '',
    city: 'Samsun', // Varsayılan şehir
    districts: [], // Çoklu ilçe seçimi
    neighborhoods: [], // Çoklu mahalle seçimi
    budget: [0, 20000000],
    squareMeters: [0, 350],
    roomCount: [],
    buildingAge: [0, 40],
    floor: [0, 20],
    publishToPool: true, // Varsayılan olarak talep havuzuna yayınla
    isPublished: true, // Yayınlama durumu
  });

  const customEnterAnimation = useMemo(() => ({
    from: { opacity: 0, scale: 0.95 },
    to: { opacity: 1, scale: 1 },
  }), []);
  const customExitAnimation = useMemo(() => ({
    from: { opacity: 1, scale: 1 },
    to: { opacity: 0, scale: 0.95 },
  }), []);
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
    }, [customEnterAnimation, customExitAnimation])
  );

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      budget: prev.listingStatus === 'Kiralık' ? [0, 200000] : [0, 20000000],
    }));
  }, [formData.listingStatus]);

  // Şehir değiştiğinde ilçeleri ve mahalleleri sıfırla
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      districts: [],
      neighborhoods: [],
    }));
    setAvailableNeighborhoods([]);
  }, [formData.city]);

  // İlçeler değiştiğinde mahalleleri yükle
  useEffect(() => {
    if (formData.districts.length === 0) {
      setAvailableNeighborhoods([]);
      setLastLoadedDistricts([]);
      return;
    }

    // İlçeler değişmediyse yeniden yükleme
    const changed = JSON.stringify([...formData.districts].sort()) !== JSON.stringify([...lastLoadedDistricts].sort());
    if (changed) {
      loadNeighborhoods();
    }
  }, [formData.districts]);

  const loadNeighborhoods = async () => {
    try {
      if (__DEV__) console.log('[RequestForm] Mahalleler yükleniyor...');
      setLoadingNeighborhoods(true);

      // Neighborhood service'den mahalleleri çek
      const neighborhoods = await getNeighborhoodsForDistricts(formData.districts);
      
      if (__DEV__) console.log('[RequestForm] Yüklenen mahalle sayısı:', neighborhoods.length);
      setAvailableNeighborhoods(neighborhoods);
      setLastLoadedDistricts(formData.districts);
      setLoadingNeighborhoods(false);

    } catch (error) {
      if (__DEV__) console.error('[RequestForm] Mahalle yükleme hatası:', error);
      setAvailableNeighborhoods([]);
      setLoadingNeighborhoods(false);
    }
  };

  const handleInputChange = useCallback((field, value) => {
    // If districts unchanged vs lastLoadedDistricts, avoid re-triggering loadNeighborhoods indirectly
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleCitySelect = useCallback((city) => {
    setFormData(prev => ({
      ...prev,
      city: city,
    }));
    setShowCityPicker(false);
  }, []);

  const handleSliderChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleStatusClick = useCallback((status) => {
    setFormData(prev => ({
      ...prev,
      listingStatus: status,
    }));
  }, []);

  const formatPrice = useCallback((price) => {
    return new Intl.NumberFormat('tr-TR').format(price);
  }, []);

  const validateForm = useCallback(() => {
    if (!formData.name.trim()) {
      Alert.alert('Hata', 'Lütfen adınızı ve soyadınızı girin.');
      return false;
    }
    if (!formData.phone.trim()) {
      Alert.alert('Hata', 'Lütfen telefon numaranızı girin.');
      return false;
    }
    if (formData.districts.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir ilçe seçin.');
      return false;
    }
    return true;
  }, [formData.name, formData.phone, formData.districts.length]);

  const handleSubmit = async () => {
    if (!validateForm()) {return;}

    try {
      if (!user) {
        Alert.alert('Hata', 'Kullanıcı girişi yapılmamış.');
        return;
      }

      const roomLabel = (Array.isArray(formData.roomCount) ? formData.roomCount : (formData.roomCount ? [formData.roomCount] : [])).join(', ') || 'Daire';
      const requestData = {
        title: `${formData.listingStatus} ${roomLabel} Arıyorum`,
        description: `${roomLabel} arıyorum`,
        city: formData.city || 'Samsun',
        districts: formData.districts || [],
        neighborhoods: formData.neighborhoods || [],
        propertyType: formData.propertyType || 'Daire',
        listingStatus: formData.listingStatus || '',
        roomCount: Array.isArray(formData.roomCount) ? formData.roomCount : (formData.roomCount ? [formData.roomCount] : []),
        minPrice: formData.budget[0],
        maxPrice: formData.budget[1],
        minSquareMeters: formData.squareMeters[0],
        maxSquareMeters: formData.squareMeters[1],
        minBuildingAge: Array.isArray(formData.buildingAge) ? formData.buildingAge[0] : undefined,
        maxBuildingAge: Array.isArray(formData.buildingAge) ? formData.buildingAge[1] : undefined,
        minFloor: Array.isArray(formData.floor) ? formData.floor[0] : undefined,
        maxFloor: Array.isArray(formData.floor) ? formData.floor[1] : undefined,
        status: 'active',
        publishToPool: formData.publishToPool,
        isPublished: formData.isPublished, // Yayınlama durumu
        contactInfo: {
          name: formData.name,
          phone: formData.phone,
          email: user?.email || '',
        },
      };

      const result = await addRequest(requestData, user.uid);

      if (result.success) {
        // Bildirim sistemine talebi ekle
        const requestForReminder = {
          ...requestData,
          id: result.requestId || Date.now().toString(),
          userId: user.uid,
          userName: formData.name || user.displayName || user.email || 'Kullanıcı',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isPublished: formData.publishToPool,
          title: requestData.title,
        };

        await reminderScheduler.addRequest(requestForReminder);

        // Request submitted successfully
        setShowSuccessModal(true);

        // Formu sıfırla
        setFormData({
            name: '',
            phone: '',
            listingStatus: '',
            city: 'Samsun',
            districts: [],
            neighborhoods: [],
            budget: [0, 20000000],
            squareMeters: [0, 350],
            roomCount: [],
            buildingAge: [0, 40],
            floor: [0, 20],
            propertyType: 'Daire',
            description: '',
            title: '',
            publishToPool: true,
        });

        // 2 saniye sonra modalı kapat ve talep listesine git
        setTimeout(() => {
            setShowSuccessModal(false);
            // Talep havuzuna yayınlandıysa DemandPool'a, yoksa RequestList'e git
            if (formData.publishToPool && formData.isPublished) {
              navigation.navigate('Ana Sayfa', { screen: 'DemandPool' });
            } else {
              navigation.navigate('Taleplerim', { screen: 'RequestList' });
            }
        }, 2000);

      }

    } catch (error) {
      // Form submission error - silent handling
      Alert.alert('Hata', 'Talep gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  const renderSlider = (label, field, min, max, step, formatValue, rangeLabels) => (
    <RangeSlider
      label={label}
      field={field}
      min={min}
      max={max}
      step={step}
      formatValue={formatValue}
      formData={formData}
      handleSliderChange={handleSliderChange}
      styles={styles}
    />
  );

  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.modalTitle}>Talebiniz Alınmıştır!</Text>
          <Text style={styles.modalMessage}>
            {formData.publishToPool && formData.isPublished
              ? 'Talep havuzunda yayınlandı ve tüm kullanıcılar görebilir.'
              : 'Talep sadece sizin taleplerinizde görünür.'
            }
          </Text>
        </View>
      </View>
    </Modal>
  );

  const styles = useMemo(() => stylesFactory(currentTheme), [currentTheme]);

  const openContactPicker = async () => {
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Rehber İzni',
            message: 'Müşteri bilgilerini doldurmak için rehberinize erişmek istiyoruz.',
            buttonPositive: 'İzin Ver',
          }
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Hata', 'Rehber izni verilmedi.');
          return;
        }
      }
      
      const fetchedContacts = await Contacts.getAll();
      setContacts(fetchedContacts);
      setIsContactsModalVisible(true);
      Animated.timing(modalAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
      }).start();

    } catch (error) {
      Alert.alert('Hata', 'Rehber açılırken bir hata oluştu.');
      console.error(error);
    }
  };

  const onContactSelect = (contact) => {
    const fullName = [contact.givenName, contact.familyName].filter(Boolean).join(' ');
    const phoneNumber = contact.phoneNumbers.length > 0 ? contact.phoneNumbers[0].number : '';

    handleInputChange('name', fullName);
    handleInputChange('phone', phoneNumber);
    closeContactsModal();
  };

  const closeContactsModal = () => {
      Animated.timing(modalAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
      }).start(() => {
        setIsContactsModalVisible(false);
        setSearchTerm('');
      });
  };

  const renderContactsModal = () => {
    const filteredContacts = contacts.filter(contact => {
        const fullName = `${contact.givenName || ''} ${contact.familyName || ''}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
    });

    const modalStyle = {
        opacity: modalAnimation,
        transform: [
            {
                scale: modalAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                }),
            },
        ],
    };

    return (
        <Modal
            visible={isContactsModalVisible}
            transparent={true}
            animationType="none"
            onRequestClose={closeContactsModal}
        >
            <View style={styles.modalOverlay}>
                <Animated.View style={[styles.modalContainer, modalStyle]}>
                    <GlassmorphismView
                        style={StyleSheet.absoluteFill}
                        borderRadius={currentTheme.borderRadius.xl}
                        config={modalGlassmorphismConfig}
                        blurEnabled={false}
                    />
                    <View style={styles.modalHeader}>
                        <View style={styles.modalTitleContainer}>
                            <Image source={require('../assets/images/icons/fizbo.png')} style={styles.modalHeaderIcon} />
                            <Text style={styles.modalTitle}>Rehberden Seç</Text>
                        </View>
                        <TouchableOpacity style={styles.modalCloseButtonIcon} onPress={closeContactsModal}>
                            <Image source={require('../assets/images/icons/deletephoto.png')} style={styles.modalCloseIcon} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.searchInputContainer}>
                        <Image source={require('../assets/images/icons/search.png')} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Rehberde Ara..."
                            value={searchTerm}
                            onChangeText={setSearchTerm}
                            placeholderTextColor={currentTheme.colors.textSecondary}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                    <FlatList
                        data={filteredContacts}
                        keyExtractor={(item) => item.recordID}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.contactItem} onPress={() => onContactSelect(item)}>
                                <Text style={styles.contactName}>{`${item.givenName} ${item.familyName}`}</Text>
                                {item.phoneNumbers.length > 0 &&
                                    <Text style={styles.contactPhone}>{item.phoneNumbers[0].number}</Text>
                                }
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={styles.separator} />}
                    />
                </Animated.View>
            </View>
        </Modal>
    );
  };

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      fadeDuration={0}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView edges={['left','right','bottom']} style={{ flex: 1, backgroundColor: 'transparent' }}>
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12, paddingBottom: currentTheme.spacing.lg, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Geri"
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <View style={{alignItems: 'center'}}>
                <Text style={styles.headerTitle}>Yeni Talep Formu</Text>
                <Text style={styles.headerSubtitle}>Müşteri talepleriniz.</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerSaveButton} onPress={handleSubmit}>
              <Image source={require('../assets/images/icons/save.png')} style={styles.headerSaveIcon} />
              <Text style={styles.headerSaveText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
          </View>

          {/* Spacer: header yüksekliği kadar boşluk */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        <Animatable.View animation="fadeIn" duration={350} useNativeDriver style={{ flex: 1 }}>
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animatable.View ref={pageViewRef} style={styles.content} useNativeDriver>
            <GlassmorphismView
                style={styles.section}
                borderRadius={currentTheme.borderRadius.lg}
                config={glassmorphismConfig}
                blurEnabled={false}
            >
              <Text style={styles.sectionTitle}>Müşteri Talep Formu</Text>
              <Text style={styles.sectionDescription}>
                Müşteri Taleplerinizi ekledikten sonra Yapay zeka araçlarımız ile çok kısa sürede Talepinize uygun portföyleri listeleyip görebilirsiniz
              </Text>
            </GlassmorphismView>

            <GlassmorphismView
                style={styles.section}
                borderRadius={currentTheme.borderRadius.lg}
                config={glassmorphismConfig}
                blurEnabled={false}
            >
                <View style={styles.sectionTitleContainer}>
                    <Image source={require('../assets/images/icons/useralt.png')} style={styles.sectionTitleIcon} />
                    <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
                </View>

              <View style={{ marginBottom: currentTheme.spacing.lg }}>
                <Text style={styles.inputLabel}>Müşteri Adı Soyadı</Text>
                <View style={[styles.textInputWrapper, { marginTop: currentTheme.spacing.sm }]}>
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => handleInputChange('name', text)}
                    placeholder="Adı ve soyadı"
                    placeholderTextColor={currentTheme.colors.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              
              <View style={styles.phoneSectionContainer}>
                <Text style={styles.inputLabel}>Telefon Numarası</Text>
                <View style={styles.phoneRow}>
                  <View style={[styles.textInputWrapper, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      value={formData.phone}
                      onChangeText={(text) => handleInputChange('phone', text)}
                      placeholder="Telefon numarası"
                      placeholderTextColor={currentTheme.colors.textSecondary}
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity style={styles.contactButton} onPress={openContactPicker}>
                    <Text style={styles.contactButtonText}>Rehber</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </GlassmorphismView>


            <GlassmorphismView
                style={styles.section}
                borderRadius={currentTheme.borderRadius.lg}
                config={glassmorphismConfig}
                blurEnabled={false}
            >
                <View style={styles.sectionTitleContainer}>
                    <Image source={require('../assets/images/icons/talep.png')} style={styles.sectionTitleIcon} />
                    <Text style={styles.sectionTitle}>Talep Kriterleri</Text>
                </View>

              <View style={styles.statusToggleContainer}>
                <Text style={[styles.inputLabel, styles.inputLabelSpacing]}>İşlem Türü</Text>
                <View style={styles.statusToggleButtons}>
                  <TouchableOpacity
                    style={[
                      styles.statusButton,
                      styles.statusButtonFirst,
                      formData.listingStatus === 'Satılık' && styles.statusButtonActive,
                    ]}
                    onPress={() => handleStatusClick('Satılık')}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      formData.listingStatus === 'Satılık' && styles.statusButtonTextActive,
                    ]}>
                      Satılık
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusButton,
                      styles.statusButtonLast,
                      formData.listingStatus === 'Kiralık' && styles.statusButtonActive,
                    ]}
                    onPress={() => handleStatusClick('Kiralık')}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      formData.listingStatus === 'Kiralık' && styles.statusButtonTextActive,
                    ]}>
                      Kiralık
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Portföy Tipi - İşlem türünün altında */}
              <View style={styles.statusToggleContainer}>
                <Text style={[styles.inputLabel, styles.inputLabelSpacing]}>Portföy Tipi</Text>
                <View style={styles.statusToggleButtons}>
                  {propertyTypes.map((type, index) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.statusButton,
                        index === 0 && styles.statusButtonFirst,
                        index === propertyTypes.length - 1 && styles.statusButtonLast,
                        index > 0 && index < propertyTypes.length - 1 && styles.statusButtonMiddle,
                        formData.propertyType === type && styles.statusButtonActive,
                      ]}
                      onPress={() => handleInputChange('propertyType', type)}
                    >
                      <Text style={[
                        styles.statusButtonText,
                        formData.propertyType === type && styles.statusButtonTextActive,
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.checkboxContainer}>
                <Text style={[styles.inputLabel, styles.inputLabelSpacing]}>Oda Sayısı</Text>
                <View style={styles.checkboxGrid}>
                  {[
                    { label: '1+0', value: '1+0' },
                    { label: '1+1', value: '1+1' },
                    { label: '2+0', value: '2+0' },
                    { label: '2+1', value: '2+1' },
                    { label: '3+0', value: '3+0' },
                    { label: '3+1', value: '3+1' },
                    { label: '4+1', value: '4+1' },
                    { label: '5+1', value: '5+1' },
                    { label: '6+1', value: '6+1' },
                  ].map((option) => (
                  <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.checkboxItem,
                        (Array.isArray(formData.roomCount) ? formData.roomCount.includes(option.value) : formData.roomCount === option.value) && styles.checkboxItemSelected,
                      ]}
                      onPress={() => {
                        // Çoklu seçim: 'Hepsi' seçilirse boşalt; diğerlerinde toggle mantığı
                        if (option.value === '') {
                          handleInputChange('roomCount', []);
                          return;
                        }
                        const current = Array.isArray(formData.roomCount) ? formData.roomCount : (formData.roomCount ? [formData.roomCount] : []);
                        const exists = current.includes(option.value);
                        const next = exists ? current.filter(v => v !== option.value) : [...current, option.value];
                        handleInputChange('roomCount', next);
                      }}
                    >
                    <View style={[
                      styles.checkbox,
                      (Array.isArray(formData.roomCount) ? formData.roomCount.includes(option.value) : formData.roomCount === option.value) && styles.checkboxSelected,
                    ]}>
                      {(Array.isArray(formData.roomCount) ? formData.roomCount.includes(option.value) : formData.roomCount === option.value) && (
                        <Text style={styles.checkboxCheck}>✓</Text>
                      )}
                    </View>
                    <Text style={[
                      styles.checkboxLabel,
                      (Array.isArray(formData.roomCount) ? formData.roomCount.includes(option.value) : formData.roomCount === option.value) && styles.checkboxLabelSelected,
                    ]}>
                      {option.label}
                  </Text>
                </TouchableOpacity>
                ))}
                </View>
              </View>

              {renderSlider(
                'Bütçe Aralığınız (₺)',
                'budget',
                0,
                formData.listingStatus === 'Kiralık' ? 200000 : 20000000,
                formData.listingStatus === 'Kiralık' ? 1000 : 100000,
                (value) => `${formatPrice(value)} ₺`,
                ['Min', 'Max'],
              )}

              {renderSlider(
                'Metrekare Aralığı',
                'squareMeters',
                0,
                350,
                10,
                (value) => `${value} m²`,
                ['Min', 'Max'],
              )}

              {renderSlider(
                'Bina Yaşı Aralığı',
                'buildingAge',
                0,
                40,
                1,
                (value) => value === 0 ? 'Sıfır' : `${value} Yaş`,
                ['Min', 'Max'],
              )}

              {renderSlider(
                'Tercih Edilen Kat Aralığı',
                'floor',
                0,
                20,
                1,
                (value) => value === 0 ? 'Zemin' : `${value}. Kat`,
                ['Min', 'Max'],
              )}
            </GlassmorphismView>

            <GlassmorphismView
                style={styles.section}
                borderRadius={currentTheme.borderRadius.lg}
                config={glassmorphismConfig}
                blurEnabled={false}
            >
                <View style={styles.sectionTitleContainer}>
                    <Image source={require('../assets/images/icons/pinfill.png')} style={styles.sectionTitleIcon} />
                    <Text style={styles.sectionTitle}>Konum Bilgileri</Text>
                </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, {marginBottom: currentTheme.spacing.sm}]}>Şehir</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowCityPicker(true)}
                >
                  <Text style={[
                    styles.pickerButtonText,
                    !formData.city && styles.pickerButtonPlaceholder,
                  ]}>
                    {formData.city || 'Şehir seçin'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.labelWithClear}>
                  <Text style={styles.inputLabel}>İlçe Seçimi (Çoklu Seçim)</Text>
                  {formData.districts.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearButtonInline}
                      onPress={() => handleInputChange('districts', [])}
                    >
                      <Text style={styles.clearButtonTextInline}>Hepsini Temizle</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.checkboxGrid}>
                  {/* Bireysel ilçe seçenekleri */}
                  {(cityDistricts[formData.city] || []).map((district) => {
                    const isSelected = formData.districts.includes(district);
                    return (
                      <TouchableOpacity
                        key={district}
                        style={[
                          styles.checkboxItem,
                          isSelected && styles.checkboxItemSelected,
                        ]}
                        onPress={() => {
                          const newDistricts = isSelected
                            ? formData.districts.filter(d => d !== district)
                            : [...formData.districts, district];
                          handleInputChange('districts', newDistricts);
                        }}
                      >
                        <View style={[
                          styles.checkbox,
                          isSelected && styles.checkboxSelected,
                        ]}>
                          {isSelected && (
                            <Text style={styles.checkboxCheck}>✓</Text>
                          )}
                        </View>
                        <Text style={[
                          styles.checkboxLabel,
                          isSelected && styles.checkboxLabelSelected,
                        ]}>
                          {district}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.labelWithClear}>
                  <Text style={styles.inputLabel}>Mahalle Seçimi (Çoklu Seçim)</Text>
                  {formData.neighborhoods.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearButtonInline}
                      onPress={() => handleInputChange('neighborhoods', [])}
                    >
                      <Text style={styles.clearButtonTextInline}>Hepsini Temizle</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {loadingNeighborhoods ? (
                  <View style={styles.loadingContainerInline}>
                    <ActivityIndicator size="small" color={currentTheme.colors.primary} />
                    <Text style={styles.loadingTextInline}>Mahalleler yükleniyor...</Text>
                  </View>
                ) : (
                  <View style={styles.checkboxGrid}>
                    {(() => {
                      // availableNeighborhoods kullan
                      const uniqueNeighborhoods = availableNeighborhoods;

                      if (uniqueNeighborhoods.length === 0 && formData.districts.length > 0) {
                        return (
                          <Text style={styles.infoText}>
                            Seçili ilçeler için mahalleler yükleniyor...
                          </Text>
                        );
                      }

                      if (formData.districts.length === 0) {
                        return (
                          <Text style={styles.infoText}>
                            Önce en az bir ilçe seçmelisiniz
                          </Text>
                        );
                      }

                      // Hepsi seçeneği ekleme
                      const allSelected = uniqueNeighborhoods.length > 0 && uniqueNeighborhoods.every(neighborhood => formData.neighborhoods.includes(neighborhood));

                      return [
                        // Hepsi seçeneği
                        <TouchableOpacity
                          key="hepsi"
                          style={[
                            styles.checkboxItem,
                            allSelected && styles.checkboxItemSelected,
                          ]}
                          onPress={() => {
                            const newNeighborhoods = allSelected ? [] : uniqueNeighborhoods;
                            handleInputChange('neighborhoods', newNeighborhoods);
                          }}
                        >
                          <View style={[
                            styles.checkbox,
                            allSelected && styles.checkboxSelected,
                          ]}>
                            {allSelected && (
                              <Text style={styles.checkboxCheck}>✓</Text>
                            )}
                          </View>
                          <Text style={[
                            styles.checkboxLabel,
                            allSelected && styles.checkboxLabelSelected,
                          ]}>
                            Hepsi
                          </Text>
                        </TouchableOpacity>,

                        // Bireysel mahalle seçenekleri
                        ...uniqueNeighborhoods.map((neighborhood) => {
                          const isSelected = formData.neighborhoods.includes(neighborhood);
                          return (
                            <TouchableOpacity
                              key={neighborhood}
                              style={[
                                styles.checkboxItem,
                                isSelected && styles.checkboxItemSelected,
                              ]}
                              onPress={() => {
                                const newNeighborhoods = isSelected
                                  ? formData.neighborhoods.filter(n => n !== neighborhood)
                                  : [...formData.neighborhoods, neighborhood];
                                handleInputChange('neighborhoods', newNeighborhoods);
                              }}
                            >
                              <View style={[
                                styles.checkbox,
                                isSelected && styles.checkboxSelected,
                              ]}>
                                {isSelected && (
                                  <Text style={styles.checkboxCheck}>✓</Text>
                                )}
                              </View>
                              <Text style={[
                                styles.checkboxLabel,
                                isSelected && styles.checkboxLabelSelected,
                              ]}>
                                {neighborhood}
                              </Text>
                            </TouchableOpacity>
                          );
                        }),
                      ];
                    })()}
                  </View>
                )}
              </View>
            </GlassmorphismView>

            <GlassmorphismView
                style={styles.section}
                borderRadius={currentTheme.borderRadius.lg}
                config={glassmorphismConfig}
                blurEnabled={false}
            >
                <View style={styles.sectionTitleContainer}>
                    <Image source={require('../assets/images/icons/share.png')} style={styles.sectionTitleIcon} />
                    <Text style={styles.sectionTitle}>Talep Havuzu Yayın Ayarı</Text>
                </View>

              <View style={styles.switchContainer}>
                <View style={styles.switchHeader}>
                  <Text style={styles.switchLabel}>
                    Talep havuzunda yayınlansın
                  </Text>
                  <Switch
                    value={formData.publishToPool}
                    onValueChange={(value) => handleInputChange('publishToPool', value)}
                    trackColor={{ false: currentTheme.colors.borderLight, true: currentTheme.colors.primary }}
                    thumbColor={currentTheme.colors.textWhite}
                  />
                </View>
                <Text style={styles.switchDescription}>
                  {formData.publishToPool
                    ? 'Bu ayar açıkken tüm şehir bu talebi görüntüleyebilir'
                    : 'Bu ayar kapalıyken talep sadece sizin taleplerinizde görünür'
                  }
                </Text>
              </View>

            </GlassmorphismView>

          </Animatable.View>
        </ScrollView>
        </Animatable.View>

        {renderSuccessModal()}
        {renderContactsModal()}

        {/* Şehir Seçici Modal */}
        <Modal
          visible={showCityPicker}
          animationType="fade"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Şehir Seçin</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowCityPicker(false)}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={cities}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.neighborhoodItem,
                      formData.city === item && styles.neighborhoodItemActive,
                    ]}
                    onPress={() => handleCitySelect(item)}
                  >
                    <Text style={[
                      styles.neighborhoodText,
                      formData.city === item && styles.neighborhoodTextActive,
                    ]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>
        </Modal>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const stylesFactory = (theme) => StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    backgroundColor: 'transparent',
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
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.error,
    height: 37,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.md,
  },
  headerSaveIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.textWhite,
    marginRight: theme.spacing.sm,
  },
  headerSaveText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
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
    tintColor: theme.colors.textWhite,
  },
  backButton: {
    backgroundColor: theme.colors.error,
    width: 40,
    height: 40,
    borderRadius: 8, // Rounded square
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  backIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.textWhite,
  },
  headerTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textWhite,
  },
  headerSubtitle: {
    fontSize: theme.fontSizes.md,
    color: theme.opacity.white08,
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 0,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  section: {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  sectionTitleIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.text,
    marginRight: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.text,
  },
  sectionDescription: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  inputLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  inputLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    flex: 1,
  },
  inputLabelSpacing: {
    marginBottom: theme.spacing.sm,
  },
  clearButtonInline: {
    backgroundColor: theme.colors.error + '20',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginLeft: theme.spacing.sm,
  },
  clearButtonTextInline: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.xl,
    padding: 0,
  },
  statusToggleContainer: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statusToggleButtons: {
    flexDirection: 'row',
  },
  statusButton: {
    flex: 1,
    backgroundColor: 'rgba(20, 35, 49, 0.7)',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Unite adjacent buttons: remove inner radii to look connected
  statusButtonFirst: {
    borderTopLeftRadius: theme.borderRadius.md,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderRightWidth: 0,
  },
  statusButtonMiddle: {
    borderRadius: 0,
    borderRightWidth: 0,
  },
  statusButtonLast: {
    borderTopRightRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
  },
  statusButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  statusButtonText: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
  },
  statusButtonTextActive: {
    color: theme.colors.textWhite,
  },
  pickerContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: theme.borderRadius.md,
  },
  pickerButton: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  pickerButtonText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
  },
  checkboxContainer: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginVertical: 2,
    marginHorizontal: 2,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'transparent',
    minWidth: '30%',
    flex: 1,
  },
  checkboxItemSelected: {
    backgroundColor: theme.colors.primary + '20',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxCheck: {
    color: theme.colors.textWhite,
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  checkboxLabel: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  checkboxLabelSelected: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
  sliderContainer: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sliderLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  rangeLabel: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    position: 'relative',
  },
  sliderProgress: {
    position: 'absolute',
    height: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    left: '25%',
    right: '25%',
  },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    top: -10,
    borderWidth: 3,
    borderColor: theme.colors.white,
    shadowColor: theme.colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sliderThumbActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 4,
    borderColor: theme.colors.accent || '#FFD700',
    transform: [{ scale: 1.1 }],
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  addMoreButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  addMoreButtonText: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },
  switchContainer: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: theme.spacing.md,
  },

  switchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  switchLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    flex: 1,
  },
  switchDescription: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  loadingContainerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  loadingTextInline: {
    marginLeft: theme.spacing.md,
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
  },
  infoText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: theme.spacing.lg,
  },
  submitButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    minHeight: 50,
    justifyContent: 'center',
    borderWidth: 0,
    ...theme.shadows.medium,
  },
  submitButtonText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  successIconText: {
    fontSize: 40,
    color: theme.colors.textWhite,
    fontWeight: theme.fontWeights.bold,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.text,
    transform: [{ translateY: 1 }],
  },
  modalMessage: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.opacity.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.xl,
    width: '90%',
    maxHeight: '80%',
    ...theme.shadows.large,
    overflow: 'hidden',
  },
  modalContainerFull: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
  },
  contactItem: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  contactName: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
  },
  contactPhone: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  
  modalCloseButton: {
    padding: theme.spacing.sm,
  },
  modalCloseText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
  modalCloseButtonIcon: {
    backgroundColor: theme.colors.error,
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseIcon: {
    width: 14,
    height: 14,
    tintColor: theme.colors.textWhite,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.md,
  },
  searchIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
  },
  neighborhoodItem: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  neighborhoodItemActive: {
    backgroundColor: theme.colors.primary + '20',
  },
  neighborhoodText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
  },
  neighborhoodTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.bold,
  },
  pickerIcon: {
    display: 'none', // Üçgen oku kaldır
  },
  pickerButtonPlaceholder: {
    color: theme.colors.textSecondary,
  },
  contactButton: {
    backgroundColor: theme.colors.primary + 'D9', // ~85% opacity
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.md,
  },
  contactButtonText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  phoneInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.xl,
    padding: 0,
  },
  labelWithClear: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  textInputWrapper: {
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  phoneSectionContainer: {
    // This container just provides the margin bottom for the whole phone section
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  phoneInputContainer: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeaderIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
});

export default memo(RequestForm);
