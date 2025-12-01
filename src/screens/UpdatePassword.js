import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const UpdatePassword = () => {
  const navigation = useNavigation();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = password && password.length >= 6 && password === password2 && !loading;

  const validatePasswords = () => {
    if (!password || password.length < 6) {
      setError('Şifre en az 6 karakter olmalı');
      return false;
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor');
      return false;
    }
    return true;
  };

  const handleUpdatePassword = async () => {
    setError('');
    
    if (!validatePasswords()) {
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(password);
      if (result.success) {
        Alert.alert(
          'Başarılı',
          'Şifreniz başarıyla oluşturuldu! Artık şifrenizle giriş yapabilirsiniz.',
          [
            {
              text: 'Tamam',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (error) {
      setError('Şifre güncellenirken bir hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Şifre Oluştur</Text>
          <Text style={styles.subtitle}>
            Hesabınız için güvenli bir şifre oluşturun
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Yeni Şifre</Text>
            <TextInput
              style={styles.textInput}
              placeholder="En az 6 karakter"
              value={password}
              onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
              secureTextEntry
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoCapitalize="none"
              autoCorrect={false}
              autoCompleteType="off"
              textContentType="newPassword"
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Şifre Tekrar</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Şifrenizi tekrar girin"
              value={password2}
              onChangeText={(t) => { setPassword2(t); if (error) setError(''); }}
              secureTextEntry
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoCapitalize="none"
              autoCorrect={false}
              autoCompleteType="off"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={() => { if (password && password.length >= 6 && password === password2 && !loading) { handleUpdatePassword(); } }}
            />
          </View>

          <TouchableOpacity
            style={[styles.updateButton, !canSubmit && styles.buttonDisabled]}
            onPress={handleUpdatePassword}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Şifreyi güncelle"
          >
            <Text style={styles.updateButtonText}>
              {loading ? 'Güncelleniyor...' : 'Şifre Oluştur'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="İptal"
          >
            <Text style={styles.cancelButtonText}>İptal</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC143C',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    marginTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  updateButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default UpdatePassword;
