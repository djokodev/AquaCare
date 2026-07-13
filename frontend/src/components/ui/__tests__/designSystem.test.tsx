import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Button, Card, EmptyState, ErrorState, IconButton, SelectionModal, TextField } from '..';

describe('shared design system components', () => {
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

  it('renders form feedback, selectable cards, states, and a selection modal', () => {
    const onSelect = jest.fn(); const onClose = jest.fn(); const onRetry = jest.fn();
    const { getByLabelText, getByText } = render(<><TextField label="Farm name" required hint="Hint" error="Error" value="" onChangeText={jest.fn()} /><Card variant="selected"><TextField label="Nested" value="" onChangeText={jest.fn()} /></Card><EmptyState title="Empty" actionLabel="Create" onAction={onRetry} /><ErrorState title="Error state" actionLabel="Retry" onAction={onRetry} /><SelectionModal visible title="Choose" closeLabel="Close" emptyLabel="Empty options" options={[{ value: 'one', label: 'One' }]} onSelect={onSelect} onClose={onClose} /></>);
    expect(getByText('Error')).toBeTruthy();
    fireEvent.press(getByText('Create')); fireEvent.press(getByText('Retry')); fireEvent.press(getByLabelText('One'));
    expect(onRetry).toHaveBeenCalledTimes(2); expect(onSelect).toHaveBeenCalledWith('one');
  });
});
