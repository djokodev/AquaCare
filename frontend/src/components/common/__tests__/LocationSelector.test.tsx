import React from 'react';
import { render } from '@testing-library/react-native';

import LocationSelector from '../LocationSelector';

describe('LocationSelector', () => {
  it('préserve une localisation déjà renseignée pendant son hydratation', () => {
    const onChange = jest.fn();

    render(
      <LocationSelector
        value={{
          region: 'littoral',
          department: 'Wouri',
          arrondissement: 'Douala 2ème',
          city: 'Douala',
          neighborhood: 'New-Bell',
        }}
        onChange={onChange}
      />
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
