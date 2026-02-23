import * as chatApi from '../chatApi';
import { apiService } from '@/services/api';

jest.mock('@/services/api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

class MockFormData {
  append = jest.fn();
}

describe('features/chat/services/api/chatApi', () => {
  const mockApi = apiService as jest.Mocked<typeof apiService>;
  const globalAny = global as any;
  let originalFormData: any;

  beforeAll(() => {
    originalFormData = globalAny.FormData;
    globalAny.FormData = MockFormData;
  });

  afterAll(() => {
    globalAny.FormData = originalFormData;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchConversation et fetchConversationById utilisent les bons endpoints', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { id: 'conv-me' } } as any)
      .mockResolvedValueOnce({ data: { id: 'conv-1' } } as any);

    const me = await chatApi.fetchConversation();
    const byId = await chatApi.fetchConversationById('conv-1');

    expect(me.id).toBe('conv-me');
    expect(byId.id).toBe('conv-1');
    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/support/conversations/me/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/support/conversations/conv-1/');
  });

  it('fetchMessages envoie le param page', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { results: [], next: null, previous: null, count: 0 } } as any);

    const result = await chatApi.fetchMessages('conv-1', 3);

    expect(result.count).toBe(0);
    expect(mockApi.get).toHaveBeenCalledWith('/support/conversations/conv-1/messages/', {
      params: { page: 3 },
    });
  });

  it('sendMessage construit FormData avec champs optionnels', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'msg-1' } } as any);

    await chatApi.sendMessage('conv-1', {
      content: 'Bonjour',
      media_type: 'image',
      media_file: { uri: 'file://pic.jpg', type: 'image/jpeg', name: 'pic.jpg' } as any,
      client_uuid: 'uuid-1',
      created_offline: true,
    });

    const [url, formDataArg, config] = mockApi.post.mock.calls[0];
    const fd = formDataArg as unknown as MockFormData;

    expect(url).toBe('/support/conversations/conv-1/send_message/');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    expect(fd.append).toHaveBeenCalledWith('content', 'Bonjour');
    expect(fd.append).toHaveBeenCalledWith('media_type', 'image');
    expect(fd.append).toHaveBeenCalledWith('media_file', {
      uri: 'file://pic.jpg',
      type: 'image/jpeg',
      name: 'pic.jpg',
    });
    expect(fd.append).toHaveBeenCalledWith('client_uuid', 'uuid-1');
    expect(fd.append).toHaveBeenCalledWith('created_offline', 'true');
  });

  it('sendMessageWithMedia delegue vers sendMessage', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'msg-2' } } as any);

    const result = await chatApi.sendMessageWithMedia(
      'conv-2',
      'Photo',
      { uri: 'file://x.jpg', type: 'image/jpeg', name: 'x.jpg' },
      'image',
      'uuid-2'
    );

    expect(result.id).toBe('msg-2');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/support/conversations/conv-2/send_message/',
      expect.any(MockFormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('markMessagesAsRead et refreshConversation', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'conv-1', unread_count_user: 0 } } as any);
    mockApi.get.mockResolvedValueOnce({ data: { id: 'conv-1' } } as any);

    const marked = await chatApi.markMessagesAsRead('conv-1');
    const refreshed = await chatApi.refreshConversation('conv-1');

    expect(marked.unread_count_user).toBe(0);
    expect(refreshed.id).toBe('conv-1');
    expect(mockApi.post).toHaveBeenCalledWith('/support/conversations/conv-1/mark_read/');
    expect(mockApi.get).toHaveBeenCalledWith('/support/conversations/conv-1/');
  });

  it('conversationExists retourne true puis false selon fetchConversation', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { id: 'conv-ok' } } as any);
    await expect(chatApi.conversationExists()).resolves.toBe(true);

    mockApi.get.mockRejectedValueOnce(new Error('not found'));
    await expect(chatApi.conversationExists()).resolves.toBe(false);
  });
});
