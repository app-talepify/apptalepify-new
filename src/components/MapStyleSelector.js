import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { MAPBOX_STYLES, STYLE_CATEGORIES } from '../constants/mapStyles';

const CATEGORIES = [
  { key: 'STANDARD', label: 'Standart', icon: '🗺️' },
  { key: 'NAVIGATION', label: 'Navigasyon', icon: '🚗' },
  { key: 'OUTDOOR', label: 'Doğa', icon: '🏔️' },
  { key: 'MONOCHROME', label: 'Monokrom', icon: '⬜' },
];

/**
 * Harita Stil Seçici Component
 * Kullanıcının harita stilini değiştirmesini sağlar
 */
const MapStyleSelector = ({ currentStyle, onStyleChange, theme }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('STANDARD');

  const handleStyleSelect = (style) => {
    onStyleChange(style);
    setIsVisible(false);
  };

  const stylesForCategory = useMemo(() => {
    const styleIds = STYLE_CATEGORIES[selectedCategory] || [];
    return Object.values(MAPBOX_STYLES).filter(style => styleIds.includes(style.id));
  }, [selectedCategory]);

  return (
    <>
      {/* Stil değiştirme butonu */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => setIsVisible(true)}
      >
        <Image
          source={require('../assets/images/icons/mapvv.png')}
          style={styles.buttonIcon}
        />
      </TouchableOpacity>

      {/* Stil seçici modal */}
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme?.colors?.surface || '#fff' }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.headerTitle, { color: theme?.colors?.text || '#000' }]}>
                Harita Stili Seç
              </Text>
              <TouchableOpacity onPress={() => setIsVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Kategori seçici */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryContainer}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryButton,
                    selectedCategory === cat.key && styles.categoryButtonActive,
                    selectedCategory === cat.key && { backgroundColor: theme?.colors?.accent || '#007AFF' },
                  ]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text
                    style={[
                      styles.categoryLabel,
                      selectedCategory === cat.key && styles.categoryLabelActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Stil listesi */}
            <ScrollView style={styles.styleList}>
              {stylesForCategory.map((style) => (
                <TouchableOpacity
                  key={style.id}
                  style={[
                    styles.styleItem,
                    currentStyle === style.url && styles.styleItemActive,
                    currentStyle === style.url && { borderColor: theme?.colors?.accent || '#007AFF' },
                  ]}
                  onPress={() => handleStyleSelect(style.url)}
                >
                  <View style={styles.styleItemLeft}>
                    <Text style={styles.stylePreview}>{style.preview}</Text>
                    <View style={styles.styleInfo}>
                      <Text style={[styles.styleName, { color: theme?.colors?.text || '#000' }]}>
                        {style.name}
                      </Text>
                      <Text style={styles.styleDescription}>{style.description}</Text>
                    </View>
                  </View>
                  {currentStyle === style.url && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#142331',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: '#E31E24', // Krimson
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  closeButton: {
    fontSize: 28,
    color: '#999',
    paddingHorizontal: 10,
  },
  categoryContainer: {
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
  },
  categoryIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  styleList: {
    paddingHorizontal: 20,
  },
  styleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleItemActive: {
    backgroundColor: '#e6f2ff',
    borderColor: '#007AFF',
  },
  styleItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stylePreview: {
    fontSize: 32,
    marginRight: 15,
  },
  styleInfo: {
    flex: 1,
  },
  styleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  styleDescription: {
    fontSize: 12,
    color: '#666',
  },
  checkmark: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});

export default MapStyleSelector;
