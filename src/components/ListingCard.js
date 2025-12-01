// src/components/ListingCard.js
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { theme } from '../theme/theme';
import { sanitizeImageUrl } from '../utils/media';
import { useTheme } from '../theme/ThemeContext';
import PropTypes from 'prop-types';
import GlassmorphismView from './GlassmorphismView';

// Constants
const CARD_CONSTANTS = {
  IMAGE_HEIGHT: 180,
  ACTION_BUTTON_SIZE: 36,
  ACTION_BUTTON_RADIUS: 18,
  ICON_SIZE: 18,
  PLACEHOLDER_FONT_SIZE: 48,
  DOT_SIZE: 8,
  DOT_RADIUS: 4,
  ACTIVE_OPACITY: 1,
  SHADOW_OPACITY: 0.1,
  SHADOW_RADIUS: 4,
  ELEVATION: 3,
};

/**
 * ListingCard Component
 * Reusable listing card component for displaying property listings
 * @param {Object} listing - The listing data object
 * @param {function} onPress - Function to call when card is pressed
 * @param {function} onEdit - Function to call when edit button is pressed
 * @param {function} onDelete - Function to call when delete button is pressed
 * @param {function} onTogglePublish - Function to call when publish toggle is pressed
 * @param {boolean} isEditable - Whether the card is in editable mode
 */
const ListingCard = memo(({
  listing,
  onPress,
  onEdit,
  onDelete,
  onTogglePublish,
  isEditable = false,
  publishAlignRight = false,
  showPublishBadge = true,
  isOwnerCard = false,
}) => {
  // --- BU KONTROL PANELİ İLE KARTIN GÖRÜNÜMÜNÜ YÖNETEBİLİRSİNİZ ---
  const cardConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.45)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 5.0,
  };

  // Güvenlik kontrolü: Hooks sırasını bozmayacak şekilde default alanlar
  const safeListing = listing || {};
  const {
    id,
    price,
    listingStatus,
    roomCount,
    bathroomCount,
    floor,
    neighborhood,
    district,
    city,
    isPublished,
    images = [],
  } = safeListing;

  const formattedPrice = useMemo(() => {
    if (!price && price !== 0) {return 'Fiyat belirtilmemiş';}
    const tr = new Intl.NumberFormat('tr-TR').format(Number(price) || 0);
    return `${tr}₺`;
  }, [price]);

  // Mahalle etiketini standartla (sonunda 'Mh.' olsun)
  const neighborhoodLabel = useMemo(() => {
    // Veri yoksa district/city fallback
    const raw = neighborhood || district || city || '';
    if (!raw) {return '';} 
    try {
      let n = String(raw).trim();
      const lower = n.toLowerCase();
      if (!(lower.includes('mh') || lower.includes('mah'))) {
        n = `${n} Mh.`;
      }
      return n;
    } catch {
      return String(raw);
    }
  }, [neighborhood, district, city]);

  // Kart içi ayar menüsü kaldırıldı; detay sayfasının header'ına taşındı

  const { isDark } = useTheme();
  const textColor = isDark ? theme.colors.white : theme.colors.navy;

  const roomCountText = useMemo(() => {
    if (Array.isArray(roomCount) && roomCount.length > 0) {
      return roomCount.join(', ');
    }
    if (roomCount) {
      return roomCount;
    }
    return '—';
  }, [roomCount]);

  return (
    <GlassmorphismView
      style={[
        styles.wrapper,
        styles.container,
        !isPublished && styles.containerHidden,
        isOwnerCard && styles.ownerCardBorder,
      ]}
      borderRadius={20}
      blurEnabled={false} // Kartlarda blur kapalı olsun
      config={cardConfig}
      borderWidth={0.4}
      borderColor={'rgba(255, 255, 255, 0.25)'}
    >
      {/* Content wrapper */}
      <View style={styles.cardContent}>
        <TouchableOpacity
          style={styles.touchableContent}
          onPress={onPress}
          activeOpacity={CARD_CONSTANTS.ACTIVE_OPACITY}
        >
        <View style={styles.imageContainer}>
          {(() => {
            const sanitizedImages = Array.isArray(images) ? images.map(sanitizeImageUrl) : [];
            const firstValid = sanitizedImages.find(Boolean);
            
            
            if (firstValid) {
              return (
                <Image
                  source={{ uri: firstValid }}
                  style={styles.image}
                  resizeMode="cover"
                />
              );
            }
            return (
              <View style={styles.placeholderImage}>
                <Text style={styles.placeholderText}>🏠</Text>
              </View>
            );
          })()}

          {/* Yayın durumu butonu - sadece showPublishBadge true ise göster */}
          {showPublishBadge && (
            <View style={publishAlignRight ? styles.rightActionButtons : styles.leftActionButtons}>
              <TouchableOpacity
                style={[
                  styles.publishButton,
                  isPublished ? styles.publishButtonActive : styles.publishButtonInactive,
                ]}
                onPress={() => onTogglePublish && onTogglePublish(id)}
              >
                <View style={styles.publishButtonContent}>
                  <View style={[
                    styles.publishDot,
                    isPublished ? styles.publishDotActive : styles.publishDotInactive,
                  ]} />
                  <Text style={[
                    styles.publishButtonText,
                    isPublished ? styles.publishButtonTextActive : styles.publishButtonTextInactive,
                  ]}>
                    {isPublished ? 'Yayında' : 'Gizli'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Kart üzerindeki ayar menüsü kaldırıldı (portföy detay header'ına taşındı) */}
        </View>

        <View style={styles.content}>
          <View>
            <View style={styles.header}>
              <View style={styles.roomBadge}>
                <Text style={styles.roomBadgeText}>{roomCountText}</Text>
              </View>
              {!!neighborhoodLabel && (
                <View style={styles.neighborhoodPill}>
                  <Text
                    style={[styles.neighborhoodText, { color: textColor }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {neighborhoodLabel}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.details}>
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Image source={require('../assets/images/icons/bathroom.png')} style={styles.detailIconImage} />
                  <Text style={[styles.detailText, { color: textColor } ]}>: {bathroomCount || '—'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Image source={require('../assets/images/icons/vieverlist.png')} style={styles.detailIconImage} />
                  <Text style={[styles.detailText, { color: textColor } ]}>: {floor || '—'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Image source={require('../assets/images/icons/binayas.png')} style={styles.detailIconImage} />
                  <Text style={[styles.detailText, { color: textColor } ]}>: {listing.buildingAge || '—'}</Text>
                </View>
              </View>

              {/* Diğer detaylar kaldırıldı / sadeleştirildi */}
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.listingStatus}>
              <Text style={styles.listingStatusText}>
                {listingStatus}
              </Text>
            </View>
            <Text style={[styles.footerPrice, { color: textColor }]}>{formattedPrice}</Text>
          </View>
        </View>
        </TouchableOpacity>
      </View>
    </GlassmorphismView>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: theme.spacing.xs,
    borderRadius: 20, // Kart ile aynı radius
  },
  container: {
    borderRadius: 12,
    // Tüm görsel stiller (border, shadow, bg) kaldırıldı.
    // Artık GlassmorphismView tarafından yönetiliyor.
    marginBottom: 0,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 260, // Kartın minimum yüksekliğini artır
  },
  cardGradient: {
    // Bu stil artık kullanılmıyor ve silindi.
  },
  cardContent: {
    position: 'relative',
    zIndex: 1,
    flex: 1, // Bu satır, içeriğin tüm yüksekliği doldurmasını sağlar
  },
  touchableContent: {
    flex: 1,
  },
  containerHidden: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  ownerCardBorder: {
    borderWidth: 2,
    borderColor: theme.colors.error + '40', // Soluk kırmızı çerçeve
  },

  imageContainer: {
    position: 'relative',
    width: '100%', // Tam genişlik
    aspectRatio: 1.5, // Oranı biraz daha geniş yap (1.5:1)
    // marginTop, marginHorizontal, alignSelf kaldırıldı
  },
  image: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 12, // 20'den 12'ye düşürüldü
    borderTopRightRadius: 12, // 20'den 12'ye düşürüldü
    borderBottomLeftRadius: 0, // Alt köşeler düz
    borderBottomRightRadius: 0, // Alt köşeler düz
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12, // 20'den 12'ye düşürüldü
    borderTopRightRadius: 12, // 20'den 12'ye düşürüldü
    borderBottomLeftRadius: 0, // Alt köşeler düz
    borderBottomRightRadius: 0, // Alt köşeler düz
  },
  placeholderText: {
    fontSize: CARD_CONSTANTS.PLACEHOLDER_FONT_SIZE,
    color: theme.colors.textSecondary,
  },

  leftActionButtons: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    zIndex: 10,
  },
  rightActionButtons: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 10,
  },
  publishButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  publishButtonActive: {
    backgroundColor: 'rgba(20, 35, 49, 0.5)', // Koyu renk (navy) %50 şeffaflık (her iki modda aynı)
    borderColor: theme.colors.navy,
  },
  publishButtonInactive: {
    backgroundColor: 'rgba(20, 35, 49, 0.5)', // Koyu renk (navy) %50 şeffaflık (her iki modda aynı)
    borderColor: theme.colors.navy,
  },
  publishButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  publishDot: {
    width: CARD_CONSTANTS.DOT_SIZE,
    height: CARD_CONSTANTS.DOT_SIZE,
    borderRadius: CARD_CONSTANTS.DOT_RADIUS,
    marginRight: theme.spacing.sm,
  },
  publishDotActive: {
    backgroundColor: theme.colors.success,
  },
  publishDotInactive: {
    backgroundColor: theme.colors.error,
  },
  publishButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.white, // Beyaz metin için daha iyi görünürlük
  },
  publishButtonTextActive: {
    color: theme.colors.white, // Beyaz metin
  },
  publishButtonTextInactive: {
    color: theme.colors.white, // Beyaz metin
  },
  actionButtons: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    flexDirection: 'column', // Dikey sıralama
    gap: theme.spacing.xs,
    alignItems: 'flex-end',
    zIndex: 20,
  },
  speedDialButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 19,
  },
  actionButton: {
    width: CARD_CONSTANTS.ACTION_BUTTON_SIZE,
    height: CARD_CONSTANTS.ACTION_BUTTON_SIZE,
    borderRadius: CARD_CONSTANTS.ACTION_BUTTON_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: CARD_CONSTANTS.SHADOW_RADIUS,
    elevation: 6,
  },
  editButton: {
    backgroundColor: '#051a24', // Koyu arka plan
  },
  deleteButton: {
    backgroundColor: theme.colors.primary,
  },
  settingsButton: {
    backgroundColor: theme.colors.navy,
  },
  actionButtonText: {
    fontSize: 16,
  },
  actionButtonIcon: {
    width: CARD_CONSTANTS.ICON_SIZE,
    height: CARD_CONSTANTS.ICON_SIZE,
    tintColor: '#FFFFFF', // Beyaz ikon
  },
  content: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md, // Üst padding azaltıldı çünkü resimle birleşiyor
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg, // sm'den lg'ye çıkarıldı
  },
  neighborhoodPill: {
    maxWidth: '65%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  neighborhoodText: {
    marginLeft: theme.spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  details: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Ortalamak için değiştirildi
  },
  roomBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  roomBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.white,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.sm, // İkon grupları arasına boşluk eklendi
    // flex: 1, kaldırıldı
  },
  detailIcon: {
    fontSize: 14,
    marginRight: theme.spacing.sm,
    width: 16,
  },
  detailIconImage: {
    width: 16,
    height: 16,
    tintColor: theme.colors.primary, // Krimson renk yapıldı
    marginRight: theme.spacing.sm,
  },
  detailText: {
    fontSize: 13,
    color: theme.colors.white, // Beyaz olarak kalıyor
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.lg, // md'den lg'ye çıkarıldı
    borderTopWidth: 1,
    borderTopColor: theme.colors.primary,
  },
  listingStatus: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  listingStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  footerPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
});

// PropTypes
ListingCard.propTypes = {
  listing: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string,
    city: PropTypes.string,
    district: PropTypes.string,
    neighborhood: PropTypes.string,
    price: PropTypes.number,
    listingStatus: PropTypes.string,
    propertyType: PropTypes.string,
    squareMeters: PropTypes.number,
    roomCount: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.arrayOf(PropTypes.string),
    ]),
    buildingAge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    floor: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    parking: PropTypes.bool,
    isPublished: PropTypes.bool,
    images: PropTypes.array,
  }).isRequired,
  onPress: PropTypes.func.isRequired,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onTogglePublish: PropTypes.func,
  isEditable: PropTypes.bool,
};

export default ListingCard;
