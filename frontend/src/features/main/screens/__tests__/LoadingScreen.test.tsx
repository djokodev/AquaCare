import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingScreen from '../LoadingScreen';

describe('features/main/screens/LoadingScreen', () => {
  it('affiche le branding et le texte de chargement', () => {
    const { getAllByText, getByText } = render(<LoadingScreen />);

    expect(getAllByText('AquaCare').length).toBeGreaterThanOrEqual(1);
    expect(getByText('loading')).toBeTruthy();
  });
});
