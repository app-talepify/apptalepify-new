import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { db as firestore } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { handleRevokePermission } from '../services/permissionNotificationHandlers';

const PermissionManagementModal = ({ 
  visible, 
  onClose, 
  portfolioId, 
  portfolioTitle, 
  ownerId 
}) => {
  const { theme: currentTheme } = useTheme();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // İzinleri yükle
  const loadPermissions = useCallback(async () => {
    if (!portfolioId || !ownerId) return;

    try {
      setLoading(true);
      
      const permissionsQuery = query(
        collection(firestore, 'permissionRequests'),
        where('portfolioOwnerId', '==', ownerId),
        where('portfolioId', '==', portfolioId),
        where('status', '==', 'approved')
      );
      const permissionsSnapshot = await getDocs(permissionsQuery);

      const permissionsList = permissionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        approvedDate: doc.data().updatedAt?.toDate?.() || new Date(),
      }));

      setPermissions(permissionsList);
    } catch (error) {
      console.error('İzinler yüklenirken hata:', error);
      Alert.alert('Hata', 'İzinler yüklenemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [portfolioId, ownerId]);

  // Refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPermissions();
    setRefreshing(false);
  }, [loadPermissions]);

  // İzin iptal etme
  const handleRemovePermission = useCallback(async (permissionId, requesterName) => {
    Alert.alert(
      'İzni İptal Et',
      `${requesterName} kullanıcısının bu portföyü paylaşma iznini iptal etmek istediğinizden emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İzni İptal Et',
          style: 'destructive',
          onPress: async () => {
            try {
              await handleRevokePermission(permissionId, ownerId);
              
              // Listeyi güncelle
              setPermissions(prev => prev.filter(p => p.id !== permissionId));
              
              Alert.alert('Başarılı', 'İzin başarıyla iptal edildi ve kullanıcıya bildirildi.');
            } catch (error) {
              console.error('İzin iptal edilirken hata:', error);
              Alert.alert('Hata', 'İzin iptal edilemedi. Lütfen tekrar deneyin.');
            }
          }
        }
      ]
    );
  }, [ownerId]);

  // Modal açıldığında izinleri yükle
  useEffect(() => {
    if (visible) {
      loadPermissions();
    }
  }, [visible, loadPermissions]);

  const styles = useMemo(() => createStyles(currentTheme), [currentTheme]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Verilen İzinler</Text>
            <Text style={styles.headerSubtitle}>{portfolioTitle}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={currentTheme.colors.primary} />
              <Text style={styles.loadingText}>İzinler yükleniyor...</Text>
            </View>
          ) : permissions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔒</Text>
              <Text style={styles.emptyTitle}>Henüz İzin Verilmemiş</Text>
              <Text style={styles.emptyDescription}>
                Bu portföy için henüz kimseye paylaşım izni vermediniz.
              </Text>
            </View>
          ) : (
            <View style={styles.permissionsList}>
              <Text style={styles.listHeader}>
                {permissions.length} kullanıcıya izin verildi
              </Text>
              
              {permissions.map((permission) => (
                <View key={permission.id} style={styles.permissionCard}>
                  <View style={styles.permissionInfo}>
                    <View style={styles.permissionUserIcon}>
                      <Text style={styles.permissionUserIconText}>👤</Text>
                    </View>
                    
                    <View style={styles.permissionDetails}>
                      <Text style={styles.permissionUserName}>
                        {permission.requesterName}
                      </Text>
                      <Text style={styles.permissionUserContact}>
                        📞 {permission.requesterPhone}
                      </Text>
                      <Text style={styles.permissionUserEmail}>
                        ✉️ {permission.requesterEmail}
                      </Text>
                      <Text style={styles.permissionDate}>
                        📅 İzin tarihi: {permission.approvedDate.toLocaleDateString('tr-TR')}
                      </Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemovePermission(permission.id, permission.requesterName)}
                  >
                    <Text style={styles.removeButtonIcon}>🗑️</Text>
                    <Text style={styles.removeButtonText}>İzni İptal Et</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ℹ️ İzin iptal edildiğinde, kullanıcının oluşturduğu özel paylaşım linkleri deaktive olur.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 50, // Safe area için
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionsList: {
    padding: 20,
  },
  listHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  permissionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  permissionUserIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  permissionUserIconText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  permissionDetails: {
    flex: 1,
  },
  permissionUserName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 6,
  },
  permissionUserContact: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  permissionUserEmail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  permissionDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  removeButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default PermissionManagementModal;
