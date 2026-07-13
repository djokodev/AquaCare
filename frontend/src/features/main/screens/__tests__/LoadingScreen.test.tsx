import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingScreen from '../LoadingScreen';

describe('features/main/screens/LoadingScreen', () => {
  it('affiche le branding et le texte de chargement', () => {
    const { getByLabelText, getByText } = render(<LoadingScreen />);

    expect(getByLabelText('appName')).toBeTruthy();
    expect(getByText('loading')).toBeTruthy();
  });
});
