import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import FeedingTimesField from '../FeedingTimesField';

describe('features/aquaculture/components/FeedingTimesField', () => {
  it('ajoute, trie et supprime des heures choisies sans saisie libre', () => {
    const onChange = jest.fn();
    const { getAllByLabelText, getByTestId, getByText, rerender } = render(
      <FeedingTimesField value={['16:00']} onChange={onChange} />,
    );

    fireEvent.press(getByText('addFeedingTime'));
    fireEvent(getByTestId('feeding-hour-picker'), 'valueChange', '08');
    fireEvent(getByTestId('feeding-minute-picker'), 'valueChange', '30');
    fireEvent.press(getByText('add'));

    expect(onChange).toHaveBeenLastCalledWith(['08:30', '16:00']);

    rerender(<FeedingTimesField value={['08:30', '16:00']} onChange={onChange} />);
    fireEvent.press(getAllByLabelText('removeFeedingTime')[0]);
    expect(onChange).toHaveBeenLastCalledWith(['16:00']);
  });
});
