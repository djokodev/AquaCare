import React from 'react';
import { render } from '@testing-library/react-native';

import AuthErrorBlock from '../AuthErrorBlock';

describe('components/common/AuthErrorBlock', () => {
  it('does not render when there is no global authentication error', () => {
    const { toJSON } = render(<AuthErrorBlock error={null} />);
    expect(toJSON()).toBeNull();
  });

  it('presents the translated account error through the shared alert', () => {
    const { getByText } = render(<AuthErrorBlock error="invalid_credentials" />);
    expect(getByText('invalid_credentials')).toBeTruthy();
  });
});
