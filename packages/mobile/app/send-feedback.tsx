import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';
import { useCustomAlert } from '../hooks/useCustomAlert';
import { CustomAlert } from '../components/CustomAlert';
import { api } from '../services/api';
import { FontAwesome } from '@expo/vector-icons';
import Constants from 'expo-constants';

export default function SendFeedbackScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { alertState, showSuccess, showError, hideAlert } = useCustomAlert();

  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      showError('Please enter your feedback');
      return;
    }

    if (feedback.trim().length < 10) {
      showError('Please provide more detailed feedback (at least 10 characters)');
      return;
    }

    setIsSubmitting(true);

    try {
      const platform = Platform.OS;
      const appVersion = Constants.expoConfig?.version || 'unknown';

      await api.submitFeedback(feedback.trim(), platform, appVersion);

      showSuccess('Thank you for your feedback!');

      // Clear the form and go back after a short delay
      setTimeout(() => {
        setFeedback('');
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      // Show more detailed error message for debugging
      const errorMessage = error?.error || error?.message || 'Failed to submit feedback. Please try again.';
      const errorCode = error?.code ? ` (${error.code})` : '';
      showError(`${errorMessage}${errorCode}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const styles = createStyles(colors);
  const charCount = feedback.length;
  const maxChars = 5000;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Send Feedback',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitleVisible: false,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          <View style={styles.header}>
            <FontAwesome name="comments" size={48} color={colors.primary} />
            <Text style={[styles.headerText, { color: colors.text }]}>
              We'd love to hear from you!
            </Text>
            <Text style={[styles.subHeaderText, { color: colors.textSecondary }]}>
              Share your thoughts, suggestions, or report issues
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>Your Feedback</Text>
              <TextInput
                ref={textInputRef}
                style={[
                  styles.textArea,
                  {
                    color: colors.text,
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Tell us what you think..."
                placeholderTextColor={colors.textSecondary}
                value={feedback}
                onChangeText={setFeedback}
                onFocus={() => {
                  // Scroll to input when keyboard opens
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 150, animated: true });
                  }, 100);
                }}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                maxLength={maxChars}
              />
              <Text style={[styles.charCount, { color: colors.textSecondary }]}>
                {charCount} / {maxChars} characters
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: colors.primary },
                (!feedback.trim() || isSubmitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!feedback.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <>
                  <FontAwesome name="paper-plane" size={18} color={colors.textOnAccent} />
                  <Text style={[styles.submitButtonText, { color: colors.textOnAccent }]}>
                    Submit Feedback
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => router.back()}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Your feedback helps us improve the app for everyone. Thank you!
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <CustomAlert {...alertState} onDismiss={hideAlert} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: 80,
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
    },
    headerText: {
      fontSize: 24,
      fontWeight: 'bold',
      marginTop: 16,
      textAlign: 'center',
    },
    subHeaderText: {
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    form: {
      marginBottom: 24,
    },
    inputContainer: {
      marginBottom: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    textArea: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      minHeight: 200,
    },
    charCount: {
      fontSize: 12,
      marginTop: 4,
      textAlign: 'right',
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 8,
      marginBottom: 12,
      gap: 8,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      padding: 16,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    footer: {
      marginTop: 16,
      paddingHorizontal: 16,
    },
    footerText: {
      fontSize: 12,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
