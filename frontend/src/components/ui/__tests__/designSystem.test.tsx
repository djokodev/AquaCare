import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { Button, Card, EmptyState, ErrorState, IconButton, InteractiveCard, SelectionModal, TextField } from '..';
import { colors } from '@/theme';
import tokens from '@/theme/tokens.json';

const tailwindConfig = require('../../../../tailwind.config.js');

describe('shared design system components', () => {
  it('keeps Tailwind aliases aligned with the primitive token source', () => {
    const tailwindColors = tailwindConfig.theme.extend.colors;

    expect(tailwindColors['aquacare-primary']).toBe(tokens.colors.brand.primary);
    expect(tailwindColors['aquacare-selected']).toBe(tokens.colors.surface.selected);
    expect(tailwindColors.error).toBe(tokens.colors.status.error);
    expect(tailwindConfig.theme.extend.borderRadius.xl).toBe(`${tokens.radii.xl}px`);
  });

  it('renders button variants and invokes its action', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(<><Button label="Save" onPress={onPress} iconLeft="checkmark" /><Button label="Delete" onPress={onPress} variant="danger" /><Button label="Loading" onPress={onPress} loading /></>);
    fireEvent.press(getByLabelText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(getByText('Delete')).toBeTruthy();
    expect(getByLabelText('Loading').props.accessibilityState.busy).toBe(true);
  });

  it('provides an accessible icon button and respects disabled state', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(<IconButton icon="settings-outline" accessibilityLabel="Settings" onPress={onPress} disabled />);
    fireEvent.press(getByLabelText('Settings'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses the inverse tone for icons on a brand surface', () => {
    const { UNSAFE_getByType } = render(
      <IconButton
        icon="arrow-back"
        accessibilityLabel="Back"
        onPress={jest.fn()}
        variant="ghost"
        tone="inverse"
      />,
    );

    expect(UNSAFE_getByType(Ionicons).props.color).toBe(colors.text.inverse);
  });

  it('renders form feedback, selectable cards, states, and a selection modal', () => {
    jest.useFakeTimers();
    const onSelect = jest.fn(); const onClose = jest.fn(); const onRetry = jest.fn();
    const { getByLabelText, getByText } = render(<><TextField label="Farm name" required hint="Hint" error="Error" value="" onChangeText={jest.fn()} /><Card variant="selected"><TextField label="Nested" value="" onChangeText={jest.fn()} /></Card><EmptyState title="Empty" actionLabel="Create" onAction={onRetry} /><ErrorState title="Error state" actionLabel="Retry" onAction={onRetry} /><SelectionModal visible title="Choose" closeLabel="Close" emptyLabel="Empty options" options={[{ value: 'one', label: 'One' }]} onSelect={onSelect} onClose={onClose} /></>);
    expect(getByText('Error')).toBeTruthy();
    fireEvent.press(getByText('Create')); fireEvent.press(getByText('Retry')); fireEvent.press(getByLabelText('One'));
    act(() => jest.advanceTimersByTime(280));
    expect(onRetry).toHaveBeenCalledTimes(2); expect(onSelect).toHaveBeenCalledWith('one');
    jest.useRealTimers();
  });

  it('applies the outlined visual surface to interactive cards', () => {
    const { getByTestId } = render(
      <InteractiveCard
        testID="dashboard-action"
        accessibilityLabel="Open dashboard action"
        primaryBorder
        onPress={jest.fn()}
      >
        <Button label="Open" onPress={jest.fn()} />
      </InteractiveCard>,
    );

    const style = StyleSheet.flatten(
      getByTestId('dashboard-action-surface').props.style,
    );

    expect(style.borderWidth).toBe(1);
    expect(style.borderColor).toBe(colors.brand.primary);
    expect(style.backgroundColor).toBe(colors.surface.card);
    expect(style.flexDirection).toBe('row');
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('space-between');
    expect(style.minHeight).toBeGreaterThanOrEqual(56);
  });
});
