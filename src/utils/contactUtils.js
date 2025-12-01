import { Linking, Alert } from 'react-native';

// Error messages
const ERROR_MESSAGES = {
  INVALID_PHONE: 'Geçerli bir telefon numarası bulunamadı.',
  INVALID_WHATSAPP: 'Geçerli bir WhatsApp numarası bulunamadı.',
  INVALID_EMAIL: 'Geçerli bir e-posta adresi bulunamadı.',
  INVALID_URL: 'Geçerli bir link bulunamadı.',
  PHONE_APP_ERROR: 'Telefon uygulaması açılamadı.',
  EMAIL_APP_ERROR: 'E-posta uygulaması açılamadı.',
  SOCIAL_APP_ERROR: 'Uygulama açılamadı.',
  PHONE_CALL_ERROR: 'Telefon arama başlatılamadı.',
  WHATSAPP_ERROR: 'WhatsApp mesajı gönderilemedi.',
  EMAIL_ERROR: 'E-posta gönderilemedi.',
  SOCIAL_ERROR: 'Açılamadı.',
};

/**
 * Telefon numarasını temizle (sadece rakamları al)
 * @param {string} phone - Temizlenecek telefon numarası
 * @returns {string} - Temizlenmiş telefon numarası
 */
export const cleanPhoneNumber = (phone = '') => {
  return String(phone).replace(/\D+/g, '');
};

/**
 * WhatsApp için telefon numarasını formatla
 * @param {string} phone - Formatlanacak telefon numarası
 * @returns {string} - Formatlanmış WhatsApp numarası
 */
export const formatWhatsAppNumber = (phone) => {
  const cleaned = cleanPhoneNumber(phone);
  if (!cleaned) {
    return '';
  }

  // Türkiye formatı için
  if (cleaned.startsWith('90') && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `9${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `90${cleaned}`;
  }

  return cleaned;
};

/**
 * Telefon arama fonksiyonu
 * @param {string} phoneNumber - Aranacak telefon numarası
 */
export const makePhoneCall = async (phoneNumber) => {
  try {
    const cleanedNumber = cleanPhoneNumber(phoneNumber);
    if (!cleanedNumber) {
      Alert.alert('Hata', ERROR_MESSAGES.INVALID_PHONE);
      return;
    }

    const phoneUrl = `tel:${cleanedNumber}`;
    const canOpen = await Linking.canOpenURL(phoneUrl);

    if (canOpen) {
      await Linking.openURL(phoneUrl);
    } else {
      Alert.alert('Hata', ERROR_MESSAGES.PHONE_APP_ERROR);
    }
  } catch (error) {
    Alert.alert('Hata', ERROR_MESSAGES.PHONE_CALL_ERROR);
  }
};

/**
 * WhatsApp mesajı gönderme fonksiyonu
 * @param {string} phoneNumber - WhatsApp numarası
 * @param {string} message - Gönderilecek mesaj
 */
export const sendWhatsAppMessage = async (phoneNumber, message = '') => {
  try {
    const whatsappNumber = formatWhatsAppNumber(phoneNumber);
    if (!whatsappNumber) {
      Alert.alert('Hata', ERROR_MESSAGES.INVALID_WHATSAPP);
      return;
    }

    const whatsappUrl = `whatsapp://send?phone=${whatsappNumber}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
    const canOpen = await Linking.canOpenURL(whatsappUrl);

    if (canOpen) {
      await Linking.openURL(whatsappUrl);
    } else {
      // WhatsApp yüklü değilse web versiyonunu aç
      const webUrl = `https://wa.me/${whatsappNumber}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
      await Linking.openURL(webUrl);
    }
  } catch (error) {
    Alert.alert('Hata', ERROR_MESSAGES.WHATSAPP_ERROR);
  }
};

/**
 * E-posta gönderme fonksiyonu
 * @param {string} email - E-posta adresi
 * @param {string} subject - E-posta konusu
 * @param {string} body - E-posta içeriği
 */
export const sendEmail = async (email, subject = '', body = '') => {
  try {
    if (!email) {
      Alert.alert('Hata', ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    const mailUrl = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}${body ? `${subject ? '&' : '?'}body=${encodeURIComponent(body)}` : ''}`;
    const canOpen = await Linking.canOpenURL(mailUrl);

    if (canOpen) {
      await Linking.openURL(mailUrl);
    } else {
      Alert.alert('Hata', ERROR_MESSAGES.EMAIL_APP_ERROR);
    }
  } catch (error) {
    Alert.alert('Hata', ERROR_MESSAGES.EMAIL_ERROR);
  }
};

/**
 * Sosyal medya linklerini açma
 * @param {string} url - Açılacak URL
 * @param {string} platform - Platform adı
 */
export const openSocialMedia = async (url, platform) => {
  try {
    if (!url) {
      Alert.alert('Hata', `${platform} ${ERROR_MESSAGES.INVALID_URL.toLowerCase()}`);
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Hata', `${platform} ${ERROR_MESSAGES.SOCIAL_APP_ERROR.toLowerCase()}`);
    }
  } catch (error) {
    Alert.alert('Hata', `${platform} ${ERROR_MESSAGES.SOCIAL_ERROR.toLowerCase()}`);
  }
};

/**
 * İletişim seçenekleri menüsü oluştur
 * @param {Object} contactInfo - İletişim bilgileri
 * @param {string} contactInfo.phone - Telefon numarası
 * @param {string} contactInfo.email - E-posta adresi
 * @param {string} contactInfo.whatsapp - WhatsApp numarası
 * @param {string} contactInfo.instagram - Instagram linki
 * @param {string} contactInfo.facebook - Facebook linki
 * @param {string} contactInfo.youtube - YouTube linki
 * @returns {Array} - İletişim seçenekleri dizisi
 */
export const showContactOptions = (contactInfo = {}) => {
  const {
    phone = '',
    email = '',
    whatsapp = '',
    instagram = '',
    facebook = '',
    youtube = '',
  } = contactInfo || {};

  const options = [];

  if (phone) {
    options.push({ title: '📞 Ara', onPress: () => makePhoneCall(phone) });
  }

  if (whatsapp || phone) {
    options.push({
      title: '💬 WhatsApp',
      onPress: () => sendWhatsAppMessage(whatsapp || phone),
    });
  }

  if (email) {
    options.push({ title: '📧 E-posta', onPress: () => sendEmail(email) });
  }

  if (instagram) {
    options.push({
      title: '📷 Instagram',
      onPress: () => openSocialMedia(instagram, 'Instagram'),
    });
  }

  if (facebook) {
    options.push({
      title: '👥 Facebook',
      onPress: () => openSocialMedia(facebook, 'Facebook'),
    });
  }

  if (youtube) {
    options.push({
      title: '📺 YouTube',
      onPress: () => openSocialMedia(youtube, 'YouTube'),
    });
  }

  return options;
};
