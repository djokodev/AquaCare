import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

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
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  icon: {
    fontSize: 48,
    color: '#dc2626',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  detailsContainer: {
    maxHeight: 120,
    width: '100%',
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  details: {
    fontSize: 12,
    color: '#991b1b',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
