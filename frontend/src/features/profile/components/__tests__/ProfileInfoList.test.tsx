import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ProfileInfoList, ProfileInfoRow } from '../ProfileInfoRow';

const rowBorder = (label: string, screen: ReturnType<typeof render>) => {
  let node = screen.getByText(label).parent;
  while (node && StyleSheet.flatten(node.props.style)?.minHeight === undefined) {
    node = node.parent;
  }
  return StyleSheet.flatten(node?.props.style)?.borderBottomWidth;
};

describe('ProfileInfoList', () => {
  it('removes the divider under the last row only, even inside fragments', () => {
    const screen = render(
      <ProfileInfoList>
        <ProfileInfoRow label="first" value="1" />
        <>
          <ProfileInfoRow label="middle" value="2" />
          {null}
          <ProfileInfoRow label="last" value="3" />
        </>
      </ProfileInfoList>
    );

    expect(rowBorder('first', screen)).not.toBe(0);
    expect(rowBorder('middle', screen)).not.toBe(0);
    expect(rowBorder('last', screen)).toBe(0);
  });

  it('does not produce duplicate React keys when rows come from several fragments', () => {
    const consoleError = console.error as jest.Mock;
    consoleError.mockClear();

    render(
      <ProfileInfoList>
        <ProfileInfoRow label="a" value="1" />
        <>
          <ProfileInfoRow label="b" value="2" />
          <ProfileInfoRow label="c" value="3" />
        </>
      </ProfileInfoList>
    );

    const duplicateKeyErrors = consoleError.mock.calls.filter((args) =>
      String(args[0]).includes('same key')
    );
    expect(duplicateKeyErrors).toHaveLength(0);
  });
});
