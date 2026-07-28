import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import PhoneInputField from '../PhoneInputField';

describe('components/common/PhoneInputField', () => {
  it('shows the Cameroon prefix, field feedback and formats the nine-digit value', () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = render(
      <PhoneInputField
        value=""
        onChange={onChange}
        required
        hint="whatsAppHint"
        error="validationRequiredMessage"
      />
    );

    expect(getByText('+237')).toBeTruthy();
    expect(getByText('*')).toBeTruthy();
    expect(getByText('validationRequiredMessage')).toBeTruthy();
    fireEvent.changeText(getByLabelText('phoneNumber'), '699123456');
    expect(onChange).toHaveBeenCalledWith('+237699123456');
  });
});
