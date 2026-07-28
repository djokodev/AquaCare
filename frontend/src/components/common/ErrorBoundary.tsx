import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card } from '@/components/ui';
import { colors, radii, sizing, spacing } from '@/theme';

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
      <Card variant="elevated" style={styles.card}>
        <AppText variant="display" color="error" style={styles.icon}>!</AppText>
        <AppText variant="sectionTitle" style={styles.title}>{t('errorBoundaryTitle')}</AppText>
        <AppText variant="helper" color="muted" style={styles.message}>{t('errorBoundaryMessage')}</AppText>
        {__DEV__ && error && (
          <ScrollView style={styles.detailsContainer}>
            <AppText variant="caption" color="error" style={styles.details}>{error.message}</AppText>
          </ScrollView>
        )}
        <Button label={t('errorBoundaryRetry')} onPress={onReset} fullWidth={false} />
      </Card>
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
    padding: spacing[8],
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  icon: {
    marginBottom: spacing[4],
  },
  title: {
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  detailsContainer: {
    maxHeight: sizing.avatarLarge * 2,
    width: '100%',
    backgroundColor: colors.status.errorSurface,
    borderRadius: radii.md,
    padding: spacing[3],
    marginBottom: spacing[5],
  },
  details: {
    fontFamily: 'monospace',
  },
});
