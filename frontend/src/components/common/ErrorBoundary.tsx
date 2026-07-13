import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radii, shadows, spacing } from '@/theme';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>!</Text>
        <Text style={styles.title}>{t('errorBoundaryTitle')}</Text>
        <Text style={styles.message}>{t('errorBoundaryMessage')}</Text>
        {__DEV__ && error && (
          <ScrollView style={styles.detailsContainer}>
            <Text style={styles.details}>{error.message}</Text>
          </ScrollView>
        )}
        <TouchableOpacity style={styles.button} onPress={onReset}>
          <Text style={styles.buttonText}>{t('errorBoundaryRetry')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps & { fallbackRenderer: (error: Error | null, onReset: () => void) => ReactNode }, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps & { fallbackRenderer: (error: Error | null, onReset: () => void) => ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return this.props.fallbackRenderer(this.state.error, this.handleReset);
    }

    return this.props.children;
  }
}

export default function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  return (
    <ErrorBoundaryInner
      fallback={fallback}
      fallbackRenderer={(error, onReset) => (
        <ErrorFallback error={error} onReset={onReset} />
      )}
    >
      {children}
    </ErrorBoundaryInner>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.page,
    padding: spacing[6],
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    ...shadows.medium,
  },
  icon: {
    fontSize: 48,
    color: colors.status.error,
    marginBottom: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  detailsContainer: {
    maxHeight: 120,
    width: '100%',
    backgroundColor: colors.status.errorSurface,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 20,
  },
  details: {
    fontSize: 12,
    color: colors.status.error,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: colors.brand.primary,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: '600',
  },
});
