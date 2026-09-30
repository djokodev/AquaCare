import reducer, { refreshSupportUnread, selectUnreadCount } from '../chatSlice';

describe('badge onglet Support', () => {
  it('met a jour le nombre de reponses non lues sans creer de conversation', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, { type: refreshSupportUnread.fulfilled.type, payload: { id: 'c1', unread_count_user: 2 } });
    expect(selectUnreadCount({ chat: state } as never)).toBe(2);

    state = reducer(state, { type: refreshSupportUnread.fulfilled.type, payload: null });
    expect(selectUnreadCount({ chat: state } as never)).toBe(2);

    state = reducer(state, { type: refreshSupportUnread.fulfilled.type, payload: { id: 'c1', unread_count_user: 0 } });
    expect(selectUnreadCount({ chat: state } as never)).toBe(0);
  });
});
