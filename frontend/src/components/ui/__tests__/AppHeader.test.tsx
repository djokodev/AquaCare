import React from 'react';
import { View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppHeader } from '..';

describe('AppHeader', () => {
  it('renders a long brand title, back action, and a right action', () => {
    const onBack = jest.fn();
    const { getByLabelText, getByText } = render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}><AppHeader title="A very long header title that remains readable" subtitle="Context" onBack={onBack} backLabel="Go back" rightAction={<View testID="right-action" />} /></SafeAreaProvider>);
    expect(getByText('A very long header title that remains readable')).toBeTruthy();
    fireEvent.press(getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the surface variant without a navigation header dependency', () => {
    const { getByText } = render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 640 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
        <AppHeader title="Surface header" variant="surface" />
      </SafeAreaProvider>,
    );

    expect(getByText('Surface header')).toBeTruthy();
  });
});
